from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
BASE = ROOT / "clean-ocr"
OUTPUT = BASE / "datasheet-columns"


def main() -> None:
    inputs = json.loads((BASE / "datasheets.json").read_text(encoding="utf-8"))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, object]] = []
    for entry in inputs:
        source = ROOT / str(entry["sectionFile"])
        with Image.open(source) as opened:
            image = opened.convert("L")
        split = round(image.width * 0.59)
        overlap = max(12, round(image.width * 0.008))
        columns = [
            ("profiles", image.crop((0, 0, min(image.width, split + overlap), image.height))),
            ("abilities", image.crop((max(0, split - overlap), 0, image.width, image.height))),
        ]
        for column_number, (column_name, column) in enumerate(columns, start=1):
            if column.width < 1800:
                factor = min(2.0, 1800 / column.width)
                column = column.resize((round(column.width * factor), round(column.height * factor)), Image.Resampling.LANCZOS)
            stem = Path(str(entry["sectionFile"])).stem
            output = OUTPUT / f"{stem}-column-{column_number:02d}-{column_name}.png"
            column.save(output, optimize=True)
            entries.append(
                {
                    **entry,
                    "columnNumber": column_number,
                    "columnName": column_name,
                    "datasheetColumnFile": str(output.relative_to(ROOT)).replace("\\", "/"),
                    "width": column.width,
                    "height": column.height,
                }
            )
    (BASE / "datasheet-columns.json").write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(entries)} datasheet columns")


if __name__ == "__main__":
    main()
