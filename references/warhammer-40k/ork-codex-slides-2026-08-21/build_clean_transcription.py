from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
OCR_DIR = ROOT / "clean-ocr" / "tesseract-columns-v3"
PAGE_OCR_DIR = ROOT / "clean-ocr" / "tesseract"
DATASHEET_OCR_DIR = ROOT / "clean-ocr" / "tesseract-datasheets"
DATASHEET_COLUMN_OCR_DIR = ROOT / "clean-ocr" / "tesseract-datasheet-columns"

SLIDE_TITLES = {
    1: "Contents",
    2: "Warhorde",
    3: "Green Tide & Bully Boyz",
    4: "Taktikal Brigade & Wreckas",
    5: "Da Big Hunt & Madcap Meks",
    6: "Dread Mob & Blitz Brigade",
    7: "Kult of Speed & Flyboyz",
    8: "Brute Bosses & Wurrband",
    9: "Runt Swarm & Shoota Boyz",
    10: "Ghazghkull Thraka, Nazdreg & Warboss",
    11: "Beastboss, Zodgrod Wortsnagga & Wazdakka Gutsmek",
    12: "Mogrog Skragbad & Beastboss on Squigasaur",
    13: "Weirdboy, Boss Snikrot, Bannernob & Bigboss",
    14: "Warboss in Mega Armour, Big Mek & Big Mek in Mega Armour",
    15: "Big Mek with Shokk Attack Gun, Big Mek Dakkarig, Mek & Deffkilla Wartrike",
    16: "Painboy, Painboss, Gretchin & Runtherd",
    17: "Beast Snagga Boyz & Squighog Boyz",
    18: "Meganobz",
    19: "Kommandos, Flash Gitz & Stormboyz",
    20: "Breaka Boyz, Mek Gunz & Tankbustas",
    21: "Trukk, Battlewagon & Gunwagon",
    22: "Hunta Rig & Kill Rig",
    23: "Gorkanaut & Morkanaut",
    24: "Deff Dread",
    25: "Warbiker, Wartrakk & Deffkoptas",
    26: "Blitza-bommer, Dakkajet, Burna-bommer & Wazbom Blastajet",
    27: "Warbuggies",
    28: "Rukkatrukk Squigbuggies",
    29: "Boyz (Warhammer Community)",
    30: "Stompa (Warhammer Community)",
    31: "Killa Kans (Warhammer Community)",
    32: "Nobz (Warhammer Community)",
    33: "Big’ed Bossbunka",
}


def natural_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", path.name)]


def repair_mojibake(value: str) -> str:
    replacements = {
        "â€™": "’",
        "â€˜": "‘",
        "â€œ": "“",
        "â€": "”",
        "â€“": "–",
        "â€”": "—",
        "Â": "",
    }
    for bad, good in replacements.items():
        value = value.replace(bad, good)
    word_repairs = {
        r"\bSTRATAGEN\b": "STRATAGEM",
        r"\bNAR HORDE\b": "WAR HORDE",
        r"\bVIR HORDE\b": "WAR HORDE",
        r"\bNALKER\b": "WALKER",
        r"\bTHFANTRY\b": "INFANTRY",
        r"\bNek-built\b": "Mek-built",
        r"\bunitis\b": "unit is",
        r"\bunits selected\b": "unit is selected",
        r"\bmode/ only\b": "model only",
        r"\bORKS mode only\b": "ORKS model only",
        r"\bSoetines\b": "Sometimes",
        r"\bJittle\b": "little",
        r"\bphysioloey\b": "physiology",
        r"\bff that\b": "if that",
        r"\bIfthat\b": "If that",
        r"\b\+1t0\b": "+1 to",
        r"\bone 06\b": "one D6",
        r"\broll one 06\b": "roll one D6",
        r"\bMOUNTED, VEHICLE\b": "MOUNTED/VEHICLE",
        r"\[CLEAVE1\]": "[CLEAVE 1]",
        r"\[RAPID FIREL": "[RAPID FIRE]",
        r"\bFRE\b": "FIRE",
        r"\bJoin\b": "join",
    }
    for pattern, replacement in word_repairs.items():
        value = re.sub(pattern, replacement, value, flags=re.I if pattern.startswith(r"\b") else 0)
    return value


def is_heading(text: str) -> bool:
    letters = [char for char in text if char.isalpha()]
    if not letters or len(text) > 110:
        return False
    uppercase_ratio = sum(char.isupper() for char in letters) / len(letters)
    return uppercase_ratio >= 0.82 and len(letters) >= 4


def clean_chunk(chunk: str) -> tuple[str | None, list[str]]:
    lines = [re.sub(r"\s+", " ", repair_mojibake(line)).strip() for line in chunk.splitlines()]
    lines = [line for line in lines if line]
    if not lines:
        return None, []
    useful: list[str] = []
    artifacts: list[str] = []
    for line in lines:
        alnum = sum(char.isalnum() for char in line)
        if alnum < 3 or (alnum / max(1, len(line)) < 0.28 and len(line) < 30):
            artifacts.append(line)
        else:
            useful.append(line)
    if not useful:
        return None, artifacts
    text = " ".join(useful)
    text = re.sub(r"(?<=\w)- (?=[a-z])", "", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\( ", "(", text)
    text = re.sub(r" \)", ")", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text, artifacts


def format_text(raw: str) -> tuple[list[str], list[str]]:
    paragraphs: list[str] = []
    artifacts: list[str] = []
    for chunk in re.split(r"\n\s*\n", repair_mojibake(raw)):
        clean, rejected = clean_chunk(chunk)
        artifacts.extend(rejected)
        if not clean:
            continue
        clean = re.sub(r"\s+(WHEN|TARGET|EFFECT|RESTRICTIONS?):\s+", r"\n\1: ", clean, flags=re.I)
        if is_heading(clean):
            paragraphs.extend([f"#### {clean}", ""])
        elif re.search(r"(^|\n)(WHEN|TARGET|EFFECT|RESTRICTIONS?|KEYWORDS?|COMPOSITION|WARGEAR OPTIONS?|LEADER):", clean, re.I):
            for line in clean.splitlines():
                match = re.match(r"^(WHEN|TARGET|EFFECT|RESTRICTIONS?|KEYWORDS?|COMPOSITION|WARGEAR OPTIONS?|LEADER):\s*(.*)$", line, re.I)
                if match:
                    paragraphs.extend([f"**{match.group(1).upper()}:** {match.group(2).strip()}", ""])
                elif line.strip():
                    paragraphs.extend([line.strip(), ""])
        else:
            paragraphs.extend([clean, ""])
    return paragraphs, artifacts


def main() -> None:
    column_records = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(OCR_DIR.glob("*.json"), key=natural_key)]
    page_records = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(PAGE_OCR_DIR.glob("*.json"), key=natural_key)]
    page_by_key = {
        (int(record["slideNumber"]), int(record["imageNumber"]), int(record["regionNumber"])): record
        for record in page_records
    }
    records: list[dict[str, object]] = []
    grouped_columns: dict[tuple[int, int, int], list[dict[str, object]]] = defaultdict(list)
    for record in column_records:
        grouped_columns[(int(record["slideNumber"]), int(record["imageNumber"]), int(record["regionNumber"]))].append(record)
    for key, columns in grouped_columns.items():
        columns.sort(key=lambda item: int(item["columnNumber"]))
        region_name = str(columns[0]["regionName"])
        if region_name in {"left", "full"} and key in page_by_key:
            page = dict(page_by_key[key])
            page["columnNumber"] = 0
            page["columnName"] = "full-page-reading"
            records.append(page)
        else:
            records.extend(columns)
    datasheet_records = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(DATASHEET_OCR_DIR.glob("*.json"), key=natural_key)]
    records = [record for record in records if int(record["slideNumber"]) < 10]
    for record in datasheet_records:
        if len(re.sub(r"\W", "", str(record.get("text") or ""))) < 25:
            continue
        record = dict(record)
        record["columnNumber"] = int(record["sectionNumber"])
        record["columnName"] = f"{record['sectionName']}-datasheet"
        records.append(record)
    by_slide: dict[int, list[dict[str, object]]] = defaultdict(list)
    for record in records:
        by_slide[int(record["slideNumber"])].append(record)
    for values in by_slide.values():
        values.sort(key=lambda item: (int(item["imageNumber"]), int(item["regionNumber"]), int(item.get("sectionNumber", 0)), int(item["columnNumber"])))

    out = [
        "# Ork Codex — cleaned slide transcription",
        "",
        f"Source deck: {MANIFEST['sourceUrl']}",
        "",
        "> Cleaned from the photographed pages using two independent OCR passes and direct image-oriented layout recovery. The untouched first-pass transcript remains in [transcription-raw.md](transcription-raw.md). Text marked as uncertain, and all numbers, weapon profiles, keywords, symbols, and timing clauses, must be checked against the linked page image before being imported as canonical game data.",
        "",
    ]
    summary: list[dict[str, object]] = []
    all_artifacts: dict[int, list[str]] = defaultdict(list)

    for slide in MANIFEST["slides"]:
        number = int(slide["slideNumber"])
        out.extend([f"## Slide {number} — {SLIDE_TITLES.get(number, 'Untitled')}", "", f"[Rendered slide](pages/page-{number:02d}.png)", ""])
        sources = [image for image in slide.get("images", [])]
        for image_index, _ in enumerate(sources, start=1):
            matches = sorted((ROOT / "source-images").glob(f"slide-{number:02d}-image-{image_index:02d}.*"))
            if matches:
                rel = matches[0].relative_to(ROOT).as_posix()
                out.extend([f"[High-resolution source image {image_index}]({rel})", ""])

        if number == 1:
            out.extend(["### Native contents text", "", str(slide.get("nativeText") or "").strip(), ""])
            continue

        previous_image = None
        previous_region = None
        for record in by_slide.get(number, []):
            image_number = int(record["imageNumber"])
            region_number = int(record["regionNumber"])
            if image_number != previous_image:
                out.extend([f"### Source image {image_number}", ""])
                previous_image = image_number
                previous_region = None
            if region_number != previous_region:
                region_label = str(record["regionName"]).replace("-", " ").title()
                out.extend([f"### {region_label} page region", ""])
                previous_region = region_number
            column_label = str(record["columnName"]).replace("-", " ").title()
            confidence = float(record["confidence"])
            review = " — **low-confidence OCR; verify directly**" if confidence < 60 else ""
            out.extend([f"#### {column_label}{review}", ""])
            paragraphs, artifacts = format_text(str(record.get("text") or ""))
            out.extend(paragraphs)
            all_artifacts[number].extend(artifacts)
            summary.append(
                {
                    "slideNumber": number,
                    "imageNumber": image_number,
                    "regionNumber": region_number,
                    "columnNumber": int(record["columnNumber"]),
                    "confidence": confidence,
                    "requiresDirectReview": confidence < 60,
                }
            )

        if all_artifacts[number]:
            out.extend(["### Unresolved visual/OCR marks", "", "The following marks were retained rather than silently discarded:", ""])
            out.extend(f"- `{mark}`" for mark in dict.fromkeys(all_artifacts[number]))
            out.append("")

    (ROOT / "transcription-clean.md").write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
    (ROOT / "clean-ocr-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    low_by_slide: dict[int, list[dict[str, object]]] = defaultdict(list)
    for item in summary:
        if item["requiresDirectReview"]:
            low_by_slide[int(item["slideNumber"])].append(item)
    review = [
        "# Direct image-review queue",
        "",
        "These regions remain below the conservative OCR confidence threshold. Their text is retained in the cleaned transcript and linked to the original image; it has not been silently guessed or removed.",
        "",
    ]
    for slide_number in sorted(low_by_slide):
        review.extend(
            [
                f"## Slide {slide_number} — {SLIDE_TITLES.get(slide_number, 'Untitled')}",
                "",
                f"[Rendered slide](pages/page-{slide_number:02d}.png) · {len(low_by_slide[slide_number])} region(s) requiring direct review",
                "",
            ]
        )
    (ROOT / "review-required.md").write_text("\n".join(review).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote cleaned transcript with {len(summary)} column records")


if __name__ == "__main__":
    main()
