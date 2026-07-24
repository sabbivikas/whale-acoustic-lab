"""Production API for Whale Acoustic Lab analysis."""

import modal
import hashlib
from pathlib import Path


app = modal.App("whale-acoustic-lab")

WHAM_COMMIT = "00a8b787c040db23cd51ac4417481a09ac354985"
WEIGHTS_DIR = "/weights"
MAX_WAV_BYTES = 25 * 1024 * 1024
PROJECT_DIR = Path(__file__).resolve().parents[1]
REFERENCE_INDEX_LOCAL_PATH = PROJECT_DIR / "references" / "reference_index.json"
REFERENCE_INDEX_REMOTE_PATH = "/references/reference_index.json"
SIMILARITY_MODULE_LOCAL_PATH = PROJECT_DIR / "backend" / "reference_similarity.py"
CODA_CODE_DIR = PROJECT_DIR / "references" / "coda_code"
CODA_RHYTHM_INDEX_REMOTE_PATH = "/references/coda_code/rhythm_reference_index.json"
CODA_CONTEXT_INDEX_REMOTE_PATH = "/references/coda_code/dialogue_context_index.json"
CODA_SEGMENTATION_REMOTE_PATH = "/references/coda_code/segmentation_thresholds.json"
NARRATION_CACHE_DIR = "/narration-cache"

weights_volume = modal.Volume.from_name("whale-art-wham-weights", create_if_missing=False)
narration_cache_volume = modal.Volume.from_name("whale-art-narration-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("build-essential", "ffmpeg", "git", "libsndfile1")
    .pip_install("Cython", "numpy<1.24", "torch==2.1.2")
    .run_commands(
        f"git clone --filter=blob:none https://github.com/Project-CETI/wham.git /opt/wham && "
        f"cd /opt/wham && git checkout {WHAM_COMMIT}",
        "sed -i '/wavebeat @ git+/d' /opt/wham/vampnet/setup.py",
        "python -m pip install --no-build-isolation -e /opt/wham/vampnet",
        "python -m pip install --force-reinstall torch==2.1.2 torchaudio==2.1.2 torchvision==0.16.2",
        "python -m pip install --force-reinstall 'numpy<1.24'",
        "python -m pip install fastapi==0.115.11 python-multipart==0.0.20 'openai>=2,<3'",
    )
    .add_local_file(
        REFERENCE_INDEX_LOCAL_PATH,
        remote_path=REFERENCE_INDEX_REMOTE_PATH,
        copy=True,
    )
    .add_local_file(
        SIMILARITY_MODULE_LOCAL_PATH,
        remote_path="/root/reference_similarity.py",
        copy=True,
    )
    .add_local_file(
        PROJECT_DIR / "backend" / "audio_analysis.py",
        remote_path="/root/audio_analysis.py",
        copy=True,
    )
    .add_local_file(
        PROJECT_DIR / "backend" / "audio_trimming.py",
        remote_path="/root/audio_trimming.py",
        copy=True,
    )
    .add_local_file(
        PROJECT_DIR / "backend" / "audio_decode.py",
        remote_path="/root/audio_decode.py",
        copy=True,
    )
    .add_local_file(
        PROJECT_DIR / "backend" / "coda_code.py",
        remote_path="/root/coda_code.py",
        copy=True,
    )
    .add_local_file(
        PROJECT_DIR / "backend" / "measured_rhythm.py",
        remote_path="/root/measured_rhythm.py",
        copy=True,
    )
    .add_local_file(
        PROJECT_DIR / "backend" / "evidence_narrator.py",
        remote_path="/root/evidence_narrator.py",
        copy=True,
    )
    .add_local_file(
        PROJECT_DIR / "backend" / "coda_segmentation.py",
        remote_path="/root/coda_segmentation.py",
        copy=True,
    )
    .add_local_file(
        CODA_CODE_DIR / "rhythm_reference_index.json",
        remote_path=CODA_RHYTHM_INDEX_REMOTE_PATH,
        copy=True,
    )
    .add_local_file(
        CODA_CODE_DIR / "dialogue_context_index.json",
        remote_path=CODA_CONTEXT_INDEX_REMOTE_PATH,
        copy=True,
    )
    .add_local_file(
        CODA_CODE_DIR / "segmentation_thresholds.json",
        remote_path=CODA_SEGMENTATION_REMOTE_PATH,
        copy=True,
    )
)


@app.cls(
    image=image,
    gpu="L4",
    volumes={WEIGHTS_DIR: weights_volume, NARRATION_CACHE_DIR: narration_cache_volume},
    secrets=[modal.Secret.from_name("whale-acoustic-lab-openai")],
    timeout=1800,
    scaledown_window=300,
)
class WhamEmbeddingAPI:
    @modal.enter()
    def load_model(self) -> None:
        import importlib.util
        import json
        import os

        import torch
        from vampnet.interface import Interface

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is unavailable in the L4 container")

        codec_path = os.path.join(WEIGHTS_DIR, "codec.pth")
        coarse_path = os.path.join(WEIGHTS_DIR, "coarse.pth")
        missing = [path for path in (codec_path, coarse_path) if not os.path.isfile(path)]
        if missing:
            raise RuntimeError(f"Required WhAM weights are missing: {missing}")

        self.interface = Interface(
            codec_ckpt=codec_path,
            coarse_ckpt=coarse_path,
            coarse2fine_ckpt=None,
            device="cuda",
        )

        module_path = "/opt/wham/vampnet/scripts/utils/visualize_embeddings.py"
        spec = importlib.util.spec_from_file_location("official_wham_embeddings", module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Unable to import official embedding code from {module_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.vampnet_embed = module.vampnet_embed
        self.gpu_name = torch.cuda.get_device_name(0)
        with open(REFERENCE_INDEX_REMOTE_PATH, encoding="utf-8") as reference_file:
            self.reference_index = json.load(reference_file)
        with open(CODA_RHYTHM_INDEX_REMOTE_PATH, encoding="utf-8") as rhythm_file:
            self.coda_rhythm_index = json.load(rhythm_file)
        with open(CODA_CONTEXT_INDEX_REMOTE_PATH, encoding="utf-8") as context_file:
            self.coda_context_index = json.load(context_file)
        with open(CODA_SEGMENTATION_REMOTE_PATH, encoding="utf-8") as segmentation_file:
            self.coda_segmentation_thresholds = json.load(segmentation_file)
        from reference_similarity import reference_pair_scores

        self.reference_pair_scores = reference_pair_scores(self.reference_index)

    @modal.asgi_app()
    def fastapi_app(self):
        import os
        import tempfile
        import time

        import torch
        from audiotools import AudioSignal
        from fastapi import FastAPI, File, HTTPException, UploadFile
        from fastapi.middleware.cors import CORSMiddleware

        web_app = FastAPI(title="Whale Acoustic Lab API")
        web_app.add_middleware(
            CORSMiddleware,
            allow_origins=[
                "http://localhost:5173",
                "http://localhost:5174",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:5174",
                "http://localhost:5175",
                "http://127.0.0.1:5175",
                "http://localhost:5176",
                "http://127.0.0.1:5176",
            ],
            allow_methods=["POST"],
            allow_headers=["*"],
        )

        @web_app.post("/embed")
        async def embed(file: UploadFile = File(...)) -> dict:
            if file.content_type not in {
                "audio/wav",
                "audio/wave",
                "audio/x-wav",
                "application/octet-stream",
            }:
                raise HTTPException(status_code=415, detail="Upload must be a WAV file")

            payload = await file.read(MAX_WAV_BYTES + 1)
            if not payload:
                raise HTTPException(status_code=400, detail="Uploaded WAV is empty")
            if len(payload) > MAX_WAV_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"WAV exceeds the {MAX_WAV_BYTES}-byte limit",
                )
            if len(payload) < 12 or payload[:4] not in {b"RIFF", b"RIFX"} or payload[8:12] != b"WAVE":
                raise HTTPException(status_code=415, detail="Invalid WAV container")

            audio_path = None
            started_at = time.perf_counter()
            try:
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_file:
                    wav_file.write(payload)
                    audio_path = wav_file.name

                signal = AudioSignal(audio_path)
                if signal.duration <= 0:
                    raise ValueError("WAV contains no audio frames")

                with torch.inference_mode():
                    all_layers = self.vampnet_embed(signal, self.interface, layer=10)
                    embedding = all_layers[10]
                torch.cuda.synchronize()

                embedding_array = embedding.detach().cpu().float().numpy()
                return {
                    "embedding": embedding_array.tolist(),
                    "embedding_dimension": int(embedding_array.shape[-1]),
                    "execution_time_seconds": time.perf_counter() - started_at,
                    "gpu_name": self.gpu_name,
                }
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"WhAM embedding extraction failed: {type(exc).__name__}: {exc}",
                ) from exc
            finally:
                await file.close()
                if audio_path and os.path.exists(audio_path):
                    os.unlink(audio_path)

        @web_app.post("/analyze")
        async def analyze(file: UploadFile = File(...)) -> dict:
            import io
            import wave

            from reference_similarity import rank_references
            from audio_analysis import analyze_wav_bytes
            from audio_trimming import AudioTrimmingError, trim_wav_bytes
            from audio_decode import AudioDecodeError, decode_wav_to_pcm16_mono
            from coda_code import analyze_coda_code
            from coda_segmentation import segment_and_analyze_clicks
            from evidence_narrator import compact_evidence, narrate_evidence

            started_at = time.perf_counter()
            if file.content_type not in {
                "audio/wav",
                "audio/wave",
                "audio/x-wav",
                "application/octet-stream",
            }:
                raise HTTPException(status_code=415, detail="Upload must be a WAV file")

            payload = await file.read(MAX_WAV_BYTES + 1)
            if not payload:
                raise HTTPException(status_code=400, detail="Uploaded WAV is empty")
            if len(payload) > MAX_WAV_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"WAV exceeds the {MAX_WAV_BYTES}-byte limit",
                )
            try:
                decoded = decode_wav_to_pcm16_mono(payload)
                with wave.open(io.BytesIO(decoded.wav_bytes), "rb") as wav:
                    sample_rate = wav.getframerate()
                    channels = wav.getnchannels()
                    bit_depth = wav.getsampwidth() * 8
                    frame_count = wav.getnframes()
                    duration = frame_count / sample_rate if sample_rate else 0
                    if duration <= 0:
                        raise AudioDecodeError("decoded WAV contains no audio frames")
            except AudioDecodeError as exc:
                await file.close()
                raise HTTPException(status_code=400, detail=str(exc)) from exc

            audio_path = None
            try:
                trimmed = trim_wav_bytes(decoded.wav_bytes)
                call_structure = analyze_wav_bytes(trimmed.wav_bytes)
                coda_code_interpretation = analyze_coda_code(
                    call_structure["estimated_inter_click_intervals_seconds"],
                    self.coda_rhythm_index,
                    self.coda_context_index,
                    estimated_click_count=call_structure["estimated_click_count"],
                )
                coda_sequence = segment_and_analyze_clicks(
                    call_structure["estimated_click_onsets_seconds"],
                    self.coda_segmentation_thresholds,
                    self.coda_rhythm_index,
                    self.coda_context_index,
                )
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_file:
                    wav_file.write(trimmed.wav_bytes)
                    audio_path = wav_file.name

                signal = AudioSignal(audio_path)
                with torch.inference_mode():
                    all_layers = self.vampnet_embed(signal, self.interface, layer=10)
                    layer_embedding = all_layers[10]
                    pooled = layer_embedding.reshape(-1, layer_embedding.shape[-1]).mean(dim=0)
                torch.cuda.synchronize()
                embedding = pooled.detach().cpu().float().tolist()
                matches = rank_references(
                    embedding,
                    self.reference_index,
                    self.reference_pair_scores,
                )[:3]

                calculated = {"coda_sequence": coda_sequence}
                narration_cache_volume.reload()
                ai_evidence_narration = narrate_evidence(
                    hashlib.sha256(payload).hexdigest(),
                    compact_evidence(calculated),
                )
                if ai_evidence_narration["status"] == "generated":
                    narration_cache_volume.commit()

                return {
                    "uploaded_recording": {
                        "filename": file.filename,
                        "content_type": file.content_type,
                        "size_bytes": len(payload),
                        "duration_seconds": duration,
                        "original_duration_seconds": trimmed.original_duration_seconds,
                        "analyzed_duration_seconds": trimmed.analyzed_duration_seconds,
                        "trim_start_seconds": trimmed.trim_start_seconds,
                        "trim_end_seconds": trimmed.trim_end_seconds,
                        "trimming_applied": trimmed.trimming_applied,
                        "sample_rate_hz": sample_rate,
                        "channels": channels,
                        "bit_depth": bit_depth,
                    },
                    "embedding": embedding,
                    "embedding_dimension": len(embedding),
                    "gpu_name": self.gpu_name,
                    "processing_time_seconds": time.perf_counter() - started_at,
                    "matches": matches,
                    "call_structure": call_structure,
                    "coda_code_interpretation": coda_code_interpretation,
                    "coda_sequence": coda_sequence,
                    "ai_evidence_narration": ai_evidence_narration,
                    "reference_percentile_definition": (
                        "The percentage of measured reference-pair similarities less than or equal to this score."
                    ),
                    "similarity_statement": (
                        "Cosine similarity represents WhAM model-space acoustic similarity only; "
                        "it does not indicate shared meaning, identity, dialect, or biological category."
                    ),
                }
            except HTTPException:
                raise
            except AudioTrimmingError as exc:
                raise HTTPException(status_code=422, detail=f"Active-audio trimming failed: {exc}") from exc
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            except Exception as exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"WhAM reference analysis failed: {type(exc).__name__}: {exc}",
                ) from exc
            finally:
                await file.close()
                if audio_path and os.path.exists(audio_path):
                    os.unlink(audio_path)

        return web_app


cache_admin_image = (
    modal.Image.debian_slim(python_version="3.10")
    .add_local_file(
        PROJECT_DIR / "backend" / "evidence_narrator.py",
        remote_path="/root/evidence_narrator.py",
        copy=True,
    )
)


@app.function(
    image=cache_admin_image,
    volumes={NARRATION_CACHE_DIR: narration_cache_volume},
    timeout=60,
)
def delete_narration_cache_entry(audio_sha256: str) -> dict:
    """Operator-only Modal function; it is not exposed as an HTTP route."""
    from evidence_narrator import delete_cached_narration

    narration_cache_volume.reload()
    deleted = delete_cached_narration(audio_sha256)
    if deleted:
        narration_cache_volume.commit()
    return {"deleted": deleted}


@app.function(
    image=cache_admin_image,
    volumes={NARRATION_CACHE_DIR: narration_cache_volume},
    schedule=modal.Cron("0 4 * * *"),
    timeout=60,
)
def purge_expired_narration_cache() -> dict:
    """Scheduled operator-side cleanup; it is not exposed as an HTTP route."""
    from evidence_narrator import delete_expired_cached_narrations

    narration_cache_volume.reload()
    deleted_count = delete_expired_cached_narrations()
    if deleted_count:
        narration_cache_volume.commit()
    return {"deleted_count": deleted_count}
