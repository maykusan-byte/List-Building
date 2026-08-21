from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parent
RAW_OCR = ROOT / "ocr"
INPUT_DIR = ROOT / "clean-ocr" / "input-v2"


def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", path.name)]


def preprocess(image: Image.Image) -> Image.Image:
    grey = ImageOps.grayscale(image)
    grey = ImageOps.autocontrast(grey, cutoff=1)
    grey = ImageEnhance.Contrast(grey).enhance(1.15)
    grey = grey.filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=3))
    if grey.width < 1450:
        factor = min(2.0, 1450 / grey.width)
        grey = grey.resize((round(grey.width * factor), round(grey.height * factor)), Image.Resampling.LANCZOS)
    return grey


def main() -> None:
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, object]] = []
    for record_path in sorted(RAW_OCR.glob("slide-*.json"), key=natural_key):
        record = json.loads(record_path.read_text(encoding="utf-8"))
        source = ROOT / str(record["sourceFile"])
        with Image.open(source) as opened:
            oriented = opened.convert("RGB").rotate(int(record["rotationCounterClockwise"]), expand=True)

        regions: list[tuple[str, Image.Image]]
        if oriented.width > oriented.height * 1.18:
            split = oriented.width // 2
            overlap = max(24, round(oriented.width * 0.04))
            regions = [
                ("left", oriented.crop((0, 0, min(oriented.width, split + overlap), oriented.height))),
                ("right", oriented.crop((max(0, split - overlap), 0, oriented.width, oriented.height))),
            ]
        else:
            regions = [("full", oriented)]

        for region_number, (region_name, region) in enumerate(regions, start=1):
            processed = preprocess(region)
            output = INPUT_DIR / f"slide-{int(record['slideNumber']):02d}-image-{int(record['imageNumber']):02d}-region-{region_number:02d}-{region_name}.png"
            processed.save(output, optimize=True)
            entries.append(
                {
                    "slideNumber": int(record["slideNumber"]),
                    "imageNumber": int(record["imageNumber"]),
                    "regionNumber": region_number,
                    "regionName": region_name,
                    "sourceFile": str(source.relative_to(ROOT)).replace("\\", "/"),
                    "inputFile": str(output.relative_to(ROOT)).replace("\\", "/"),
                    "rotationCounterClockwise": int(record["rotationCounterClockwise"]),
                    "width": processed.width,
                    "height": processed.height,
                }
            )

    (ROOT / "clean-ocr" / "inputs-v2.json").write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(entries)} OCR regions")


if __name__ == "__main__":
    main()
