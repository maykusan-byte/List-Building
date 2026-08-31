#!/usr/bin/env python3
"""Render review candidates as readable contact sheets."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument("--measured-dir", type=Path, required=True)
    parser.add_argument("--dependency-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


ARGS = parse_args()
sys.path.insert(0, str(ARGS.dependency_dir.resolve()))

import cv2  # type: ignore  # noqa: E402
import numpy as np  # type: ignore  # noqa: E402


CELL_WIDTH = 460
CELL_HEIGHT = 360
COLS = 4
ROWS = 5


def main() -> None:
    review = json.loads(ARGS.review.read_text(encoding="utf-8"))
    items = [item for item in review["items"] if "labelCenterPx" in item]
    ARGS.output_dir.mkdir(parents=True, exist_ok=True)
    for page_index in range(0, len(items), COLS * ROWS):
        page_items = items[page_index : page_index + COLS * ROWS]
        sheet = np.full((ROWS * CELL_HEIGHT, COLS * CELL_WIDTH, 3), 246, dtype=np.uint8)
        for offset, item in enumerate(page_items):
            row, col = divmod(offset, COLS)
            image = cv2.imread(str(ARGS.measured_dir / f"{item['layoutId']}.png"), cv2.IMREAD_COLOR)
            if image is None:
                image = cv2.imread(str(ARGS.measured_dir / f"{item['layoutId']}-portrait.png"), cv2.IMREAD_COLOR)
            if image is None:
                raise ValueError(f"Missing measured image for {item['layoutId']}")
            center_x = round(item["labelCenterPx"]["x"])
            center_y = round(item["labelCenterPx"]["y"])
            x0 = max(0, center_x - 115)
            y0 = max(0, center_y - 80)
            x1 = min(image.shape[1], center_x + 115)
            y1 = min(image.shape[0], center_y + 80)
            crop = image[y0:y1, x0:x1]
            crop = cv2.resize(crop, (CELL_WIDTH, 270), interpolation=cv2.INTER_LANCZOS4)
            base_x = col * CELL_WIDTH
            base_y = row * CELL_HEIGHT
            sheet[base_y : base_y + 270, base_x : base_x + CELL_WIDTH] = crop
            cv2.drawMarker(sheet, (base_x + CELL_WIDTH // 2, base_y + 135), (0, 0, 255), cv2.MARKER_CROSS, 24, 2)
            candidate_ids = ",".join(item.get("candidateIds", []))
            lines = [
                f"{item['layoutId']} {candidate_ids}",
                f"{item['kind']} value={item.get('tenthsOfInch', '?')}/10 edge={item.get('resolvedEdge', '?')}",
                f"value={item.get('valueStatus', '-')} edge={item.get('edgeStatus', '-')} score={item.get('qualityScore', '-')}",
            ]
            for line_index, line in enumerate(lines):
                cv2.putText(
                    sheet,
                    line[:70],
                    (base_x + 8, base_y + 292 + line_index * 24),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.42,
                    (20, 20, 20),
                    1,
                    cv2.LINE_AA,
                )
        page_number = page_index // (COLS * ROWS) + 1
        cv2.imwrite(str(ARGS.output_dir / f"review-{page_number:02d}.png"), sheet)


if __name__ == "__main__":
    main()
