"""Ephemeral Modal GPU health check."""

import modal
from typing import Any, Dict


app = modal.App("whale-art-gpu-health")

image = modal.Image.debian_slim(python_version="3.10").pip_install(
    "fastapi[standard]",
    "torch",
)


def _gpu_status() -> Dict[str, Any]:
    import torch

    cuda_available = torch.cuda.is_available()
    return {
        "cuda_available": cuda_available,
        "gpu_name": torch.cuda.get_device_name(0) if cuda_available else None,
    }


@app.function(image=image, gpu="L4")
@modal.fastapi_endpoint(method="GET")
def gpu_health() -> Dict[str, Any]:
    return _gpu_status()


@app.function(image=image, gpu="L4")
def test_gpu() -> Dict[str, Any]:
    return _gpu_status()


@app.local_entrypoint()
def main() -> None:
    print(test_gpu.remote())
