"""Check every embedded public asset in a release APK (Python standard library)."""
from pathlib import Path
import hashlib
import json
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
apk = Path(sys.argv[1]) if len(sys.argv) > 1 else root / f"release/Warforge Layouts {version}.apk"
copied = root / "android/app/src/main/assets/public"
integrity = json.loads((root / "public/data/integrity.json").read_text(encoding="utf-8"))
with zipfile.ZipFile(apk) as archive:
    for name, expected in integrity["files"].items():
        content = archive.read("assets/public/" + name)
        actual = hashlib.sha256(content).hexdigest()
        assert actual == expected, f"Snapshot mismatch: {name}"
    for source in copied.rglob("*"):
        if source.is_file():
            name = source.relative_to(copied).as_posix()
            assert archive.read("assets/public/" + name) == source.read_bytes(), f"Web asset mismatch: {name}"
    config = json.loads(archive.read("assets/capacitor.config.json"))
    assert config["appId"] == "com.warforge.layouts"
    assert "url" not in config.get("server", {}), "Remote web server must not replace embedded app"
    assert config["android"]["webContentsDebuggingEnabled"] is False
    assert not any("private-signing" in name or name.endswith(".jks") for name in archive.namelist())
print(f"APK validated: {len(integrity['files'])} snapshot hashes, all embedded web files, release config.")
