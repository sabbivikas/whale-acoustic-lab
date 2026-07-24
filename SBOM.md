# Software bill of materials

Inventory date: 2026-07-23. This human-readable SBOM covers repository dependencies, the declared Modal image, pinned Git sources, system packages, and external runtime assets. It is not a substitute for a CycloneDX/SPDX export or a `pip freeze` captured from the deployed image.

## Production Python and system runtime

| Package/artifact | Version or commit | Source | Purpose | License when verified | Runtime location | Redistributed here? | Concern |
|---|---|---|---|---|---|---|---|
| Python | 3.10 | Modal Debian slim image | Backend runtime | PSF | Modal image | No | Debian base digest is not pinned by the current Modal declaration. |
| Cython | 3.2.8 | PyPI | Builds WhAM/VampNet dependencies | Apache-2.0 | Modal image | No | Direct version is locked; previously declared without an exact pin. |
| NumPy | 1.23.5 | PyPI | Numerical/audio dependency | BSD-3-Clause | Modal image | No | Compatibility-critical; do not upgrade without testing. |
| PyTorch | 2.1.2 | PyPI/official PyTorch wheels | WhAM inference | BSD-3-Clause | Modal image | No | Compatibility-critical. Exact CUDA wheel/runtime must be captured from the deployed image. |
| torchaudio | 2.1.2 | PyPI/official PyTorch wheels | Audio tensor operations | BSD-family; verify packaged notice | Modal image | No | Coupled to PyTorch. |
| torchvision | 0.16.2 | PyPI/official PyTorch wheels | Transitive WhAM dependency | BSD-3-Clause | Modal image | No | Coupled to PyTorch. |
| FastAPI | 0.115.11 | PyPI | ASGI API | MIT | Modal image | No | Locked. |
| python-multipart | 0.0.20 | PyPI | Multipart WAV uploads | Apache-2.0 | Modal image | No | Locked. |
| OpenAI Python SDK | 2.46.0 | PyPI | Optional evidence narration | Apache-2.0 | Modal image | No | Locked to the most recent release predating the proven image; revalidate on rebuild. |
| Pydantic | 2.10.6 | PyPI | VampNet declared runtime dependency | MIT | Modal image | No | Locked because VampNet declares this exact version. |
| Project CETI WhAM/VampNet | `00a8b787c040db23cd51ac4417481a09ac354985` | GitHub | Acoustic embeddings | MIT | `/opt/wham` in Modal image | Source fetched during image build; not vendored | VampNet has unpinned transitive declarations; the resolved Git roots are locked below. |
| wavebeat | `d8642da31a1256aa952b2753566fff0aab7d9e2d` | GitHub | Beat/click-related VampNet dependency | GPL-3.0 | Modal image | No | Copyleft obligations require review if containers/binaries are distributed. |
| lac | `7761206878d1fba79aad314a38f975e9589af0a4` | GitHub | Audio codec dependency | MIT | Modal image | No | Git source is now pinned in the lock. |
| descript-audiotools | `54eecf66f38af6a15bd8c42f44c9f3e1746892bb` (package 0.7.3) | GitHub | Audio decoding/signal handling | MIT | Modal image | No | Git source is now pinned in the lock. |
| FFmpeg | Debian image package; exact deployed version unresolved | Debian APT | Decode supported WAV variants | LGPL/GPL depending build options | Modal image; CI host | No | Capture `ffmpeg -version`, build configuration, and Debian package version from production before public launch. |
| `build-essential`, `git`, `libsndfile1` | Debian image packages; exact deployed versions unresolved | Debian APT | Build/source/audio support | Mixed | Modal image | No | Base image and APT snapshot are not immutable. |
| CUDA runtime/driver | Modal L4 environment; exact versions unresolved | NVIDIA/Modal | GPU execution | NVIDIA terms | Modal host/image | No | Capture the deployed driver, CUDA runtime, and torch CUDA build before public launch. |

`backend/requirements.lock` records the direct compatibility set. Because restrictions prohibit running or rebuilding the Modal image, exact transitive PyPI wheels, hashes, Debian versions, and CUDA versions remain a production-dashboard/image-inspection item.

## Development dependencies

| Package | Version | Source | Purpose | License | Location | Redistributed? | Concern |
|---|---:|---|---|---|---|---|---|
| Modal client | 1.5.2 | PyPI | Define/operate Modal application | Apache-2.0 | Developer environment | No | No Modal command is required by CI. |
| click | 8.4.2 | PyPI | Modal CLI dependency | BSD-3-Clause | Developer environment | No | Transitive. |
| grpclib | 0.4.9 | PyPI | Modal transport dependency | BSD-3-Clause | Developer environment | No | Transitive. |
| protobuf | 6.33.6 | PyPI | Modal protocol dependency | BSD-3-Clause | Developer environment | No | Transitive. |
| rich | 15.0.0 | PyPI | Modal CLI rendering | MIT | Developer environment | No | Transitive. |
| synchronicity | 0.12.5 | PyPI | Modal sync/async bridge | License metadata unresolved | Developer environment | No | Verify upstream license before redistribution. |
| toml | 0.10.2 | PyPI | Modal configuration | MIT | Developer environment | No | Transitive. |
| watchfiles | 1.2.0 | PyPI | Modal development watching | MIT | Developer environment | No | Transitive. |

## Frontend

Exact direct and transitive versions are locked in `frontend/package-lock.json`.

| Package | Version | Purpose | License |
|---|---:|---|---|
| Three.js | 0.185.1 | Homepage and Art View 3D | MIT |
| `@types/three` | 0.185.1 | Type definitions | MIT |
| Vite | 6.4.3 | Build tooling | MIT |
| TypeScript | 5.9.3 | Type checking | Apache-2.0 |
| tsx | 4.23.1 | Local TypeScript tests | MIT |
| `@types/node` | 22.20.1 | Node type definitions | MIT |

## External runtime assets and data

| Artifact | Version/source | Purpose | License | Runtime location | Redistributed? | Concern |
|---|---|---|---|---|---|---|
| WhAM `codec.pth` | Zenodo 17633708, MD5 `478875644e1591ea771903c18e8b71c7` | Codec checkpoint | CC BY-NC-ND 4.0 | Private Modal volume | No | Noncommercial/no-derivatives terms require independent review. |
| WhAM `coarse.pth` | Zenodo 17633708, MD5 `0c1194ac517cd969aee295a362f60761` | Coarse checkpoint | CC BY-NC-ND 4.0 | Private Modal volume | No | Same restriction; never include in Git. |
| DSWP sample | `frontend/public/samples/dswp-1.wav` | Attributed public sample | CC BY 4.0 | Git/frontend | Yes | Attribution retained in repository. |
| EC1 derived indexes | Zenodo 10817697-derived files | Rhythm, context, segmentation references | CC BY 4.0 | Git/backend mounts | Yes | Modified-material attribution and provenance are separate from MIT code. |
| Google Fonts | DM Sans, Manrope | Typography | SIL OFL 1.1 | Loaded from Google at runtime | No | Browser contacts Google; self-host before privacy-sensitive launch. |

## Unresolved release concerns

1. Capture an immutable deployed-image inventory: Debian base identity, APT package versions, `pip freeze`, wheel hashes, torch CUDA build, CUDA runtime, and driver.
2. Verify `synchronicity` license metadata and all transitive Python licenses.
3. Review GPL-3.0 wavebeat obligations for any distribution of the service container.
4. Complete legal review of WhAM model-weight use, especially the noncommercial/no-derivatives terms.
5. Run vulnerability scanning against the captured production image without changing compatibility-critical versions silently.
