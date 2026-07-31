"""Normalise les sources déjà validées en miniatures locales WebP."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = ROOT / "data" / "unit-image-seeds.json"
SOURCE_DIR = ROOT / "data" / "unit-image-sources"
LEGACY_SOURCE_DIR = ROOT / "public" / "data" / "img"
OUTPUT_DIR = ROOT / "public" / "data" / "img" / "units"
TARGET_SIZE = 320
CONTENT_SIZE = 304


def prepare(source: Path, output: Path) -> None:
    with Image.open(source) as image:
        image = image.convert("RGBA")
        image.thumbnail((CONTENT_SIZE, CONTENT_SIZE), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (TARGET_SIZE, TARGET_SIZE), "white")
        position = ((TARGET_SIZE - image.width) // 2, (TARGET_SIZE - image.height) // 2)
        canvas.alpha_composite(image, position)
        output.parent.mkdir(parents=True, exist_ok=True)
        canvas.convert("RGB").save(output, "WEBP", quality=82, method=6)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="écrit les miniatures normalisées")
    args = parser.parse_args()
    seeds = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    failures: list[str] = []
    for seed in seeds["entries"]:
        source = SOURCE_DIR / seed["sourceAsset"]
        if not source.is_file():
            source = LEGACY_SOURCE_DIR / seed["sourceAsset"]
        output = OUTPUT_DIR / seed["asset"]
        if not source.is_file():
            failures.append(f"source absente : {source.name}")
            continue
        if args.write:
            prepare(source, output)
        if not output.is_file():
            failures.append(f"miniature absente : {output.name}")
            continue
        with Image.open(output) as image:
            if image.format != "WEBP" or image.size != (TARGET_SIZE, TARGET_SIZE):
                failures.append(f"miniature invalide : {output.name} ({image.format} {image.size})")
    if failures:
        print("\n".join(failures))
        return 1
    print(f"{len(seeds['entries'])} miniatures WebP prêtes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
