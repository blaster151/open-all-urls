"""Package only runtime files, with fixed metadata for byte-for-byte reproducibility."""
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile, ZipInfo
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
FILES = ("background.js", "manifest.json", "offscreen.html", "offscreen.js")
version = json.loads((ROOT / "manifest.json").read_text())["version"]
out = ROOT / "dist" / f"open-all-urls-{version}.zip"
out.parent.mkdir(exist_ok=True)
with ZipFile(out, "w", compression=ZIP_STORED) as archive:
    for filename in FILES:
        info = ZipInfo(filename, date_time=(1980, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (ROOT / filename).read_bytes())
with ZipFile(out) as archive:
    assert archive.namelist() == list(FILES)
    assert archive.testzip() is None
    for filename in FILES:
        assert archive.read(filename) == (ROOT / filename).read_bytes()
print(f"{out.relative_to(ROOT)}\nSHA-256: {hashlib.sha256(out.read_bytes()).hexdigest()}")
