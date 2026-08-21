from __future__ import annotations

import json
import mimetypes
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "manifest.json"
PAGES = ROOT / "pages"
SOURCES = ROOT / "source-images"


def extension(content_type: str | None, payload: bytes) -> str:
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if payload.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if payload[:4] in (b"RIFF", b"WEBP") and b"WEBP" in payload[:16]:
        return ".webp"
    guessed = mimetypes.guess_extension((content_type or "").split(";", 1)[0].strip())
    return guessed or ".bin"


def fetch(item: tuple[str, Path, bool]) -> dict[str, object]:
    url, target, force_png_name = item
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = response.read()
        content_type = response.headers.get("Content-Type")
    if force_png_name:
        final = target.with_suffix(".png")
    else:
        final = target.with_suffix(extension(content_type, payload))
    final.parent.mkdir(parents=True, exist_ok=True)
    final.write_bytes(payload)
    return {"path": str(final.relative_to(ROOT)), "bytes": len(payload), "contentType": content_type}


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    jobs: list[tuple[str, Path, bool]] = []
    for slide in data["slides"]:
        number = int(slide["slideNumber"])
        jobs.append((slide["thumbnailUrl"], PAGES / f"page-{number:02d}", True))
        for index, image in enumerate(slide["images"], start=1):
            jobs.append((image["contentUrl"], SOURCES / f"slide-{number:02d}-image-{index:02d}", False))

    completed: list[dict[str, object]] = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(fetch, job) for job in jobs]
        for future in as_completed(futures):
            completed.append(future.result())

    completed.sort(key=lambda row: str(row["path"]))
    (ROOT / "download-report.json").write_text(
        json.dumps({"fileCount": len(completed), "files": completed}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Downloaded {len(completed)} images")


if __name__ == "__main__":
    main()
