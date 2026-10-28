"""Download the pinned InsightFace liveness add-on and verify its SHA-256."""
import hashlib
import os
import tempfile
import urllib.request
from pathlib import Path

URL = (
    "https://github.com/deepinsight/insightface-model-addons/"
    "releases/download/addons/liveness.onnx"
)
SHA256 = "87a9ac1dbb16a61eec212957e5095e62a8769c1e188af9b0198f253302c4afdb"
EXPECTED_SIZE = 1_484_006
DESTINATION = Path.home() / ".insightface" / "addons" / "liveness.onnx"


def main():
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    if DESTINATION.exists():
        digest = hashlib.sha256(DESTINATION.read_bytes()).hexdigest()
        if digest == SHA256:
            print(f"Liveness model already verified: {DESTINATION}")
            return
        raise SystemExit(f"Existing liveness model has an unexpected SHA-256: {DESTINATION}")

    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=DESTINATION.parent, prefix=".liveness-", suffix=".download", delete=False
        ) as output:
            temporary = Path(output.name)
            request = urllib.request.Request(URL, headers={"User-Agent": "BioBlockVote"})
            with urllib.request.urlopen(request, timeout=60) as response:
                size = 0
                digest = hashlib.sha256()
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > EXPECTED_SIZE:
                        raise RuntimeError("The liveness model download exceeded its expected size")
                    digest.update(chunk)
                    output.write(chunk)
        if size != EXPECTED_SIZE or digest.hexdigest() != SHA256:
            raise RuntimeError("The liveness model download failed its integrity check")
        os.replace(temporary, DESTINATION)
        temporary = None
        print(f"Installed verified liveness model: {DESTINATION}")
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
