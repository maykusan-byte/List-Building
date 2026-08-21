from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
BASE = ROOT / "clean-ocr"
OUTPUT = BASE / "columns-v3"


def find_column_split(image: Image.Image) -> int:
    sample = image.crop((0, round(image.height * 0.32), image.width, round(image.height * 0.96)))
    strip = sample.resize((image.width, 1), Image.Resampling.BOX)
    brightness = list(strip.getdata())
    radius = max(8, image.width // 120)
    low = round(image.width * 0.34)
    high = round(image.width * 0.66)
    scores = []
    for x in range(low, high):
        left = max(0, x - radius)
        right = min(image.width, x + radius + 1)
        scores.append((sum(brightness[left:right]) / (right - left), x))
    return max(scores)[1]


def main() -> None:
    inputs = json.loads((BASE / "inputs-v2.json").read_text(encoding="utf-8"))
    entries: list[dict[str, object]] = []
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for entry in inputs:
        if int(entry["slideNumber"]) == 1:
            continue
        source = ROOT / str(entry["inputFile"])
        with Image.open(source) as opened:
            image = opened.convert("L")
        split = find_column_split(image)
        overlap = max(8, round(image.width * 0.006))
        regions = [
            ("left-column", image.crop((0, 0, min(image.width, split + overlap), image.height))),
            ("right-column", image.crop((max(0, split - overlap), 0, image.width, image.height))),
        ]
        for column_number, (column_name, column) in enumerate(regions, start=1):
            stem = Path(str(entry["inputFile"])).stem
            output = OUTPUT / f"{stem}-column-{column_number:02d}.png"
            column.save(output, optimize=True)
            entries.append(
                {
                    **entry,
                    "columnNumber": column_number,
                    "columnName": column_name,
                    "columnFile": str(output.relative_to(ROOT)).replace("\\", "/"),
                    "width": column.width,
                    "height": column.height,
                }
            )
    (BASE / "columns-v3.json").write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(entries)} OCR columns")


if __name__ == "__main__":
    main()
