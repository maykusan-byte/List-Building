from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
BASE = ROOT / "clean-ocr"
OUTPUT = BASE / "datasheets"
SPLIT_SLIDES = {10, 11, 13, 14, 15, 16, 19, 20, 21, 25, 26}
TOP_ONLY_SLIDES = {12, 17, 18, 22, 23}
FULL_SLIDES = {24, 27, 28, 29, 30, 31, 32, 33}


def main() -> None:
    inputs = json.loads((BASE / "inputs-v2.json").read_text(encoding="utf-8"))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, object]] = []
    for entry in inputs:
        slide = int(entry["slideNumber"])
        if slide < 10:
            continue
        source = ROOT / str(entry["inputFile"])
        with Image.open(source) as opened:
            image = opened.convert("L")
        if slide in SPLIT_SLIDES:
            split = round(image.height * 0.53)
            overlap = round(image.height * 0.025)
            sections = [
                ("top", image.crop((0, 0, image.width, min(image.height, split + overlap)))),
                ("bottom", image.crop((0, max(0, split - overlap), image.width, image.height))),
            ]
        elif slide in TOP_ONLY_SLIDES:
            sections = [("top", image.crop((0, 0, image.width, round(image.height * 0.72))))]
        elif slide in FULL_SLIDES:
            sections = [("full", image)]
        else:
            sections = [("full", image)]

        for section_number, (section_name, section) in enumerate(sections, start=1):
            if section.width < 2100:
                factor = min(2.0, 2100 / section.width)
                section = section.resize((round(section.width * factor), round(section.height * factor)), Image.Resampling.LANCZOS)
            stem = Path(str(entry["inputFile"])).stem
            output = OUTPUT / f"{stem}-section-{section_number:02d}-{section_name}.png"
            section.save(output, optimize=True)
            entries.append(
                {
                    **entry,
                    "sectionNumber": section_number,
                    "sectionName": section_name,
                    "sectionFile": str(output.relative_to(ROOT)).replace("\\", "/"),
                    "width": section.width,
                    "height": section.height,
                }
            )
    (BASE / "datasheets.json").write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(entries)} datasheet regions")


if __name__ == "__main__":
    main()
