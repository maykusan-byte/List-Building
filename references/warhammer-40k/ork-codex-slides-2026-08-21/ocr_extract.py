from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from PIL import Image
from rapidocr_onnxruntime import RapidOCR


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "source-images"
OCR_DIR = ROOT / "ocr"
MANIFEST = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
ENGINE = RapidOCR()


def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", path.name)]


def normalize_result(result: object) -> list[dict[str, object]]:
    if not result:
        return []
    rows = result[0] if isinstance(result, tuple) else result
    if not rows:
        return []
    normalized = []
    for box, text, score in rows:
        points = [[round(float(x), 2), round(float(y), 2)] for x, y in box]
        normalized.append(
            {
                "box": points,
                "text": str(text).strip(),
                "confidence": round(float(score), 5),
                "left": min(point[0] for point in points),
                "top": min(point[1] for point in points),
                "right": max(point[0] for point in points),
                "bottom": max(point[1] for point in points),
            }
        )
    return [row for row in normalized if row["text"]]


def score(rows: list[dict[str, object]]) -> float:
    return sum(len(re.sub(r"\W", "", str(row["text"]))) * float(row["confidence"]) for row in rows)


def choose_rotation(image: Image.Image) -> tuple[int, Image.Image, list[dict[str, object]], dict[str, float]]:
    sample = image.copy()
    sample.thumbnail((768, 768))
    candidates: dict[int, tuple[Image.Image, list[dict[str, object]]]] = {}
    scores: dict[str, float] = {}
    for angle in (0, 90, 180, 270):
        rotated = sample.rotate(angle, expand=True)
        rows = normalize_result(ENGINE(rotated))
        candidates[angle] = (rotated, rows)
        scores[str(angle)] = round(score(rows), 3)
    angle = max(candidates, key=lambda key: scores[str(key)])
    full = image.rotate(angle, expand=True)
    rows = normalize_result(ENGINE(full))
    return angle, full, rows, scores


def reading_order(rows: list[dict[str, object]], width: int, height: int) -> list[dict[str, object]]:
    # Preserve every OCR token. For wide photographed spreads, process left and right
    # pages separately; within each page, approximate multi-column order by x bands.
    if width > height * 1.18:
        groups = [
            [row for row in rows if (float(row["left"]) + float(row["right"])) / 2 < width / 2],
            [row for row in rows if (float(row["left"]) + float(row["right"])) / 2 >= width / 2],
        ]
    else:
        groups = [rows]
    ordered: list[dict[str, object]] = []
    for group in groups:
        if not group:
            continue
        group_width = max(float(row["right"]) for row in group) - min(float(row["left"]) for row in group)
        line_height = max(10.0, sum(float(row["bottom"]) - float(row["top"]) for row in group) / len(group))
        # Y-bucket sorting avoids random ordering of words on the same visual line.
        ordered.extend(sorted(group, key=lambda row: (round(float(row["top"]) / line_height), float(row["left"]))))
    return ordered


def input_images() -> list[tuple[int, int, Path]]:
    items: list[tuple[int, int, Path]] = [(1, 1, ROOT / "pages" / "page-01.png")]
    for path in sorted(SOURCE_DIR.iterdir(), key=natural_key):
        match = re.match(r"slide-(\d+)-image-(\d+)\.", path.name)
        if match:
            items.append((int(match.group(1)), int(match.group(2)), path))
    return items


def main() -> None:
    OCR_DIR.mkdir(parents=True, exist_ok=True)
    for index, (slide_number, image_number, path) in enumerate(input_images(), start=1):
        output = OCR_DIR / f"slide-{slide_number:02d}-image-{image_number:02d}.json"
        if output.exists():
            print(f"[{index:02d}/{len(input_images()):02d}] slide {slide_number:02d} image {image_number:02d}: already complete", flush=True)
            continue
        with Image.open(path) as opened:
            image = opened.convert("RGB")
        angle, rotated, rows, rotation_scores = choose_rotation(image)
        ordered = reading_order(rows, rotated.width, rotated.height)
        record = {
            "slideNumber": slide_number,
            "imageNumber": image_number,
            "sourceFile": str(path.relative_to(ROOT)),
            "rotationCounterClockwise": angle,
            "rotationScores": rotation_scores,
            "width": rotated.width,
            "height": rotated.height,
            "tokenCount": len(rows),
            "meanConfidence": round(sum(float(r["confidence"]) for r in rows) / max(1, len(rows)), 5),
            "tokens": ordered,
        }
        output.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[{index:02d}/{len(input_images()):02d}] slide {slide_number:02d} image {image_number:02d}: {len(rows)} tokens, rotation {angle}°", flush=True)

    records = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(OCR_DIR.glob("slide-*.json"), key=natural_key)]
    per_slide: dict[int, list[dict[str, object]]] = {}
    for record in records:
        per_slide.setdefault(int(record["slideNumber"]), []).append(record)
    summary = [
        {key: record[key] for key in ("slideNumber", "imageNumber", "sourceFile", "rotationCounterClockwise", "tokenCount", "meanConfidence")}
        for record in records
    ]

    md = [
        "# Ork Codex slide extraction — raw OCR",
        "",
        f"Source: {MANIFEST['sourceUrl']}",
        "",
        "> This is an automated, exhaustive token pass over every downloaded source image. It preserves all detected text, but it is not yet a rules-accuracy review. Consult the linked image for spelling, symbols, tables, and low-confidence text before importing game data.",
        "",
    ]
    for slide in MANIFEST["slides"]:
        number = int(slide["slideNumber"])
        md.extend([f"## Slide {number}", "", f"Rendered page: [page-{number:02d}.png](pages/page-{number:02d}.png)", ""])
        if slide.get("nativeText"):
            md.extend(["### Native slide text", "", str(slide["nativeText"]).strip(), ""])
        for record in per_slide.get(number, []):
            md.extend(
                [
                    f"### Image {record['imageNumber']} OCR",
                    "",
                    f"Source image: [{Path(str(record['sourceFile'])).name}]({str(record['sourceFile']).replace(chr(92), '/')})  ",
                    f"Applied rotation: {record['rotationCounterClockwise']}° counter-clockwise  ",
                    f"Detected tokens: {record['tokenCount']}; mean confidence: {record['meanConfidence']}",
                    "",
                ]
            )
            md.extend(str(row["text"]) for row in record["tokens"])
            md.append("")
    (ROOT / "transcription-raw.md").write_text("\n".join(md).rstrip() + "\n", encoding="utf-8")
    (ROOT / "ocr-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(summary)} OCR records and {ROOT / 'transcription-raw.md'}")


if __name__ == "__main__":
    sys.exit(main())
