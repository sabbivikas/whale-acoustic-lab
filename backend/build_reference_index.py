"""Build a resumable official DSWP WhAM reference index on Modal."""

import hashlib
import json
import tempfile
import urllib.request
import wave
from pathlib import Path

import modal


app = modal.App("whale-art-reference-index-test")

PROJECT_DIR = Path(__file__).resolve().parents[1]
REFERENCES_DIR = PROJECT_DIR / "references"
AUDIO_DIR = REFERENCES_DIR / "audio"
MANIFEST_PATH = REFERENCES_DIR / "manifest.json"
INDEX_PATH = REFERENCES_DIR / "reference_index.json"

WHAM_COMMIT = "00a8b787c040db23cd51ac4417481a09ac354985"
WEIGHTS_DIR = "/weights"
EXPECTED_DIMENSION = 1280
DEFAULT_COUNT = 3
MAX_COUNT = 1501
DSWP_URL_TEMPLATE = "https://huggingface.co/datasets/orrp/DSWP/resolve/main/{number}.wav"

weights_volume = modal.Volume.from_name("whale-art-wham-weights", create_if_missing=False)

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("build-essential", "ffmpeg", "git", "libsndfile1")
    .pip_install("Cython", "numpy<1.24", "torch==2.1.2")
    .run_commands(
        f"git clone --filter=blob:none https://github.com/Project-CETI/wham.git /opt/wham && "
        f"cd /opt/wham && git checkout {WHAM_COMMIT}",
        "python -m pip install --no-build-isolation -e /opt/wham/vampnet",
        "python -m pip install --force-reinstall torch==2.1.2 torchaudio==2.1.2 torchvision==0.16.2",
        "python -m pip install --force-reinstall 'numpy<1.24'",
    )
)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(path)


def verified_existing_ids(index: dict, manifest_by_id: dict) -> set[str]:
    verified = set()
    for record in index.get("recordings", []):
        source = manifest_by_id.get(record.get("id"))
        embedding = record.get("embedding")
        if (
            source
            and record.get("sha256") == source["sha256"]
            and isinstance(embedding, list)
            and len(embedding) == EXPECTED_DIMENSION
            and all(isinstance(value, (int, float)) for value in embedding)
        ):
            verified.add(record["id"])
    return verified


def ensure_local_recording(number: int) -> dict:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    audio_path = AUDIO_DIR / f"{number}.wav"
    source_url = DSWP_URL_TEMPLATE.format(number=number)
    if not audio_path.exists():
        with tempfile.NamedTemporaryFile(dir=AUDIO_DIR, suffix=".part", delete=False) as download:
            temporary_path = Path(download.name)
        try:
            urllib.request.urlretrieve(source_url, temporary_path)
            temporary_path.replace(audio_path)
        finally:
            temporary_path.unlink(missing_ok=True)

    with wave.open(str(audio_path), "rb") as wav:
        if wav.getcomptype() != "NONE":
            raise ValueError(f"{audio_path} is not uncompressed PCM WAV")
        sample_rate = wav.getframerate()
        channels = wav.getnchannels()
        bit_depth = wav.getsampwidth() * 8
        duration = wav.getnframes() / sample_rate

    return {
        "id": f"dswp-{number}",
        "file": f"audio/{number}.wav",
        "source_url": source_url,
        "sha256": file_sha256(audio_path),
        "duration_seconds": duration,
        "sample_rate_hz": sample_rate,
        "channels": channels,
        "bit_depth": bit_depth,
        "audio_codec": f"PCM signed {bit_depth}-bit little-endian",
        "license": "CC BY 4.0",
        "dataset_location": "Approximately 2,000 km² off the coast of Dominica",
        "collection_period": "2005–2018",
        "coda_or_rhythm_type": None,
        "click_timing": None,
        "social_unit": None,
        "whale_identity": None,
        "vocal_clan": None,
        "vowel_or_spectral_class": None,
        "recording_location": None,
        "recording_date": None,
        "recording_system": None,
    }


@app.cls(
    image=image,
    gpu="L4",
    volumes={WEIGHTS_DIR: weights_volume},
    timeout=1800,
    scaledown_window=300,
)
class ReferenceIndexer:
    @modal.enter()
    def load_model(self) -> None:
        import importlib.util
        import os

        import torch
        from vampnet.interface import Interface

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is unavailable in the L4 container")
        codec_path = os.path.join(WEIGHTS_DIR, "codec.pth")
        coarse_path = os.path.join(WEIGHTS_DIR, "coarse.pth")
        for weight_path in (codec_path, coarse_path):
            if not os.path.isfile(weight_path):
                raise RuntimeError(f"Required WhAM weight is missing: {weight_path}")

        self.interface = Interface(
            codec_ckpt=codec_path,
            coarse_ckpt=coarse_path,
            coarse2fine_ckpt=None,
            wavebeat_ckpt=None,
            device="cuda",
        )
        module_path = "/opt/wham/vampnet/scripts/utils/visualize_embeddings.py"
        spec = importlib.util.spec_from_file_location("official_wham_embeddings", module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Unable to import official embedding code: {module_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.vampnet_embed = module.vampnet_embed
        self.gpu_name = torch.cuda.get_device_name(0)

    @modal.method(is_generator=True)
    def build(self, recordings: list[dict]):
        import os
        import time
        import urllib.request

        import torch
        from audiotools import AudioSignal

        for metadata in recordings:
            started_at = time.perf_counter()
            audio_path = f"/tmp/{metadata['id']}.wav"
            try:
                urllib.request.urlretrieve(metadata["source_url"], audio_path)
                digest = hashlib.sha256()
                with open(audio_path, "rb") as source:
                    for chunk in iter(lambda: source.read(1024 * 1024), b""):
                        digest.update(chunk)
                if digest.hexdigest() != metadata["sha256"]:
                    raise RuntimeError(f"Remote checksum mismatch for {metadata['id']}")

                signal = AudioSignal(audio_path)
                with torch.inference_mode():
                    layers = self.vampnet_embed(signal, self.interface, layer=10)
                    layer_embedding = layers[10]
                    pooled = layer_embedding.reshape(-1, layer_embedding.shape[-1]).mean(dim=0)
                torch.cuda.synchronize()
                embedding = pooled.detach().cpu().float().tolist()
                if len(embedding) != EXPECTED_DIMENSION:
                    raise RuntimeError(
                        f"{metadata['id']} produced {len(embedding)} dimensions; expected {EXPECTED_DIMENSION}"
                    )
                yield json.loads(
                    json.dumps(
                        {
                            **metadata,
                            "embedding": embedding,
                            "embedding_dimension": len(embedding),
                            "embedding_layer": 10,
                            "pooling": "mean over all non-feature dimensions",
                            "gpu_name": self.gpu_name,
                            "inference_seconds": time.perf_counter() - started_at,
                        }
                    )
                )
            finally:
                if os.path.exists(audio_path):
                    os.unlink(audio_path)


@app.local_entrypoint()
def main(count: int = DEFAULT_COUNT) -> None:
    if count < 1 or count > MAX_COUNT:
        raise ValueError(f"--count must be between 1 and {MAX_COUNT}; received {count}")

    manifest = load_json(MANIFEST_PATH)
    manifest_by_id = {record["id"]: record for record in manifest.get("recordings", [])}
    targets = []
    for number in range(1, count + 1):
        verified_metadata = ensure_local_recording(number)
        manifest_by_id[verified_metadata["id"]] = verified_metadata
        targets.append(verified_metadata)
    manifest["recordings"] = sorted(
        manifest_by_id.values(), key=lambda record: int(record["id"].split("-")[-1])
    )
    write_json(MANIFEST_PATH, manifest)

    index = load_json(INDEX_PATH)
    verified = verified_existing_ids(index, manifest_by_id)
    pending = [record for record in targets if record["id"] not in verified]
    if not pending:
        print(json.dumps({"status": "already_complete", "count": count}))
        return

    records_by_id = {record["id"]: record for record in index.get("recordings", [])}
    processed = []
    for generated in ReferenceIndexer().build.remote_gen(pending):
        records_by_id[generated["id"]] = generated
        processed.append(generated["id"])
        index["recordings"] = sorted(
            records_by_id.values(), key=lambda record: int(record["id"].split("-")[-1])
        )
        write_json(INDEX_PATH, index)
        print(json.dumps({"saved": generated["id"], "completed_this_run": len(processed)}))

    print(
        json.dumps(
            {
                "status": "complete",
                "requested_count": count,
                "processed": processed,
                "skipped_verified": sorted(set(record["id"] for record in targets) & verified),
            }
        )
    )
