"""Ephemeral Python 3.10 compatibility test for official WhAM embeddings."""

import modal


app = modal.App("whale-art-wham-compat")

WHAM_COMMIT = "00a8b787c040db23cd51ac4417481a09ac354985"
WEIGHTS_DIR = "/weights"
WEIGHTS = {
    "codec.pth": {
        "url": "https://zenodo.org/records/17633708/files/codec.pth?download=1",
        "md5": "478875644e1591ea771903c18e8b71c7",
    },
    "coarse.pth": {
        "url": "https://zenodo.org/records/17633708/files/coarse.pth?download=1",
        "md5": "0c1194ac517cd969aee295a362f60761",
    },
}
AUDIO_URL = "https://huggingface.co/datasets/orrp/DSWP/resolve/main/1.wav?download=true"

weights_volume = modal.Volume.from_name("whale-art-wham-weights", create_if_missing=True)

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


@app.function(image=image, volumes={WEIGHTS_DIR: weights_volume}, timeout=1800)
def download_weights() -> dict:
    """Download only the two official checkpoints into the Modal Volume."""
    import hashlib
    import os
    import urllib.request

    results = {}
    for filename, metadata in WEIGHTS.items():
        path = os.path.join(WEIGHTS_DIR, filename)
        if not os.path.exists(path):
            urllib.request.urlretrieve(metadata["url"], path)

        digest = hashlib.md5()
        with open(path, "rb") as checkpoint:
            for chunk in iter(lambda: checkpoint.read(8 * 1024 * 1024), b""):
                digest.update(chunk)

        actual_md5 = digest.hexdigest()
        if actual_md5 != metadata["md5"]:
            raise RuntimeError(
                f"Checksum mismatch for {filename}: {actual_md5} != {metadata['md5']}"
            )
        results[filename] = {
            "bytes": os.path.getsize(path),
            "md5": actual_md5,
        }

    weights_volume.commit()
    return results


@app.function(
    image=image,
    gpu="L4",
    volumes={WEIGHTS_DIR: weights_volume},
    timeout=1800,
)
def test_embedding() -> dict:
    """Load official WhAM code and run its embedding path on one DSWP coda."""
    import importlib.util
    import json
    import os
    import subprocess
    import time
    import urllib.request

    import torch
    from audiotools import AudioSignal
    from vampnet.interface import Interface

    started_at = time.perf_counter()
    torch.cuda.reset_peak_memory_stats()

    audio_path = "/tmp/dswp_1.wav"
    urllib.request.urlretrieve(AUDIO_URL, audio_path)

    interface = Interface(
        codec_ckpt=os.path.join(WEIGHTS_DIR, "codec.pth"),
        coarse_ckpt=os.path.join(WEIGHTS_DIR, "coarse.pth"),
        coarse2fine_ckpt=None,
        wavebeat_ckpt=None,
        device="cuda",
    )

    module_path = "/opt/wham/vampnet/scripts/utils/visualize_embeddings.py"
    spec = importlib.util.spec_from_file_location("official_wham_embeddings", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to import official embedding code from {module_path}")
    embedding_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(embedding_module)

    signal = AudioSignal(audio_path)
    all_layer_embeddings = embedding_module.vampnet_embed(signal, interface, layer=10)
    layer_10_embedding = all_layer_embeddings[10]
    torch.cuda.synchronize()

    result = {
        "cuda_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0),
        "python_version": subprocess.check_output(
            ["python", "--version"], text=True, stderr=subprocess.STDOUT
        ).strip(),
        "torch_version": str(torch.__version__),
        "wham_commit": subprocess.check_output(
            ["git", "-C", "/opt/wham", "rev-parse", "HEAD"], text=True
        ).strip(),
        "audio_bytes": os.path.getsize(audio_path),
        "audio_sample_rate": int(signal.sample_rate),
        "all_layers_embedding_shape": list(all_layer_embeddings.shape),
        "layer_10_embedding_shape": list(layer_10_embedding.shape),
        "peak_gpu_allocated_bytes": int(torch.cuda.max_memory_allocated()),
        "peak_gpu_reserved_bytes": int(torch.cuda.max_memory_reserved()),
        "execution_seconds": time.perf_counter() - started_at,
    }
    # Keep the Modal return payload independent of locally installed ML packages.
    return json.loads(json.dumps(result))


@app.local_entrypoint()
def main() -> None:
    print({"weights": download_weights.remote()})
    print({"embedding_test": test_embedding.remote()})
