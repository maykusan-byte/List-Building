#!/usr/bin/env python3
"""Render full measured boards with every OCR candidate marked for gap review."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", type=Path)
    parser.add_argument("--measurements", type=Path)
    parser.add_argument("--measured-dir", type=Path, required=True)
    parser.add_argument("--dependency-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--layout", action="append", dest="layouts")
    return parser.parse_args()


ARGS = parse_args()
sys.path.insert(0, str(ARGS.dependency_dir.resolve()))

import cv2  # type: ignore  # noqa: E402


def main() -> None:
    if (ARGS.candidates is None) == (ARGS.measurements is None):
        raise ValueError("Provide exactly one of --candidates or --measurements")
    source_path = ARGS.candidates or ARGS.measurements
    assert source_path is not None
    source = json.loads(source_path.read_text(encoding="utf-8"))
    requested = set(ARGS.layouts or [])
    ARGS.output_dir.mkdir(parents=True, exist_ok=True)
    for layout in source["layouts"]:
        if requested and layout["layoutId"] not in requested:
            continue
        source_image = layout["sourceImage"]
        file_name = source_image["fileName"] if isinstance(source_image, dict) else source_image
        image = cv2.imread(
            str(ARGS.measured_dir / file_name),
            cv2.IMREAD_COLOR,
        )
        if image is None:
            raise ValueError(f"Missing measured image for {layout['layoutId']}")
        board = layout["boardRectPx"]
        left = round(board["left"])
        top = round(board["top"])
        right = round(board["right"])
        bottom = round(board["bottom"])
        rendered = image[top:bottom, left:right].copy()
        if ARGS.candidates:
            markers = [
                (candidate["candidateId"], candidate["centerPx"])
                for candidate in layout["candidates"]
            ]
        else:
            markers = [
                (
                    measurement["evidence"]["labelRegion"]["regionId"],
                    measurement["evidence"]["labelRegion"]["centerPx"],
                )
                for measurement in layout["measurements"]
            ]
        for marker_id, center in markers:
            center_x = round(center["x"]) - left
            center_y = round(center["y"]) - top
            cv2.circle(rendered, (center_x, center_y), 26, (255, 80, 0), 2, cv2.LINE_AA)
            cv2.putText(
                rendered,
                marker_id,
                (center_x + 29, center_y + 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                (255, 80, 0),
                1,
                cv2.LINE_AA,
            )
        output_path = ARGS.output_dir / f"{layout['layoutId']}-board-review.png"
        if not cv2.imwrite(str(output_path), rendered):
            raise ValueError(f"Could not write review image: {output_path}")


if __name__ == "__main__":
    main()
