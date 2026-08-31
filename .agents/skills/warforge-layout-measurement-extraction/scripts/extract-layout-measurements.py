#!/usr/bin/env python3
"""Build deterministic measurement candidates from paired GDM layout cards.

RapidOCR is deliberately loaded from an explicitly supplied temporary target.
The result remains extraction evidence; it does not replace visual review.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--measured-dir", type=Path, required=True)
    parser.add_argument("--plain-dir", type=Path, required=True)
    parser.add_argument("--upstream-dir", type=Path, required=True)
    parser.add_argument("--windows-ocr", type=Path)
    parser.add_argument("--dependency-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


ARGS = parse_args()
sys.path.insert(0, str(ARGS.dependency_dir.resolve()))

import cv2  # type: ignore  # noqa: E402
import numpy as np  # type: ignore  # noqa: E402
from rapidocr_onnxruntime import RapidOCR  # type: ignore  # noqa: E402


NUMBER_RE = re.compile(r"(?<!\d)(\d{1,2}(?:[.,:]\d)?)(?!\d)")
ARROWS = {"←": "left", "→": "right", "↑": "top", "↓": "bottom"}
BOARD_WIDTH_INCH = 44.0
BOARD_HEIGHT_INCH = 60.0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image(path: Path) -> np.ndarray:
    value = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if value is None:
        raise ValueError(f"Unreadable image: {path}")
    return value


def board_rect(plain: np.ndarray) -> dict[str, int]:
    height, width = plain.shape[:2]
    gray = cv2.cvtColor(plain, cv2.COLOR_BGR2GRAY)
    rect = {
        "left": round(width * 0.1627),
        "right": round(width * 0.8373),
        "top": round(height * 0.2672),
        "bottom": round(height * 0.8037),
    }
    left, top, right, bottom = (rect[key] for key in ("left", "top", "right", "bottom"))
    vertical_dark_ratio = min(
        max(np.mean(gray[top : bottom + 1, x] < 80) for x in range(left - 8, left + 9)),
        max(np.mean(gray[top : bottom + 1, x] < 80) for x in range(right - 8, right + 9)),
    )
    horizontal_dark_ratio = min(
        max(np.mean(gray[y, left : right + 1] < 80) for y in range(top - 8, top + 9)),
        max(np.mean(gray[y, left : right + 1] < 80) for y in range(bottom - 8, bottom + 9)),
    )
    if right - left < width * 0.60 or bottom - top < height * 0.45:
        raise ValueError("Board calibration produced an implausible rectangle")
    if vertical_dark_ratio < 0.40 or horizontal_dark_ratio < 0.40:
        raise ValueError("GDM board frame does not match the calibrated card template")
    return rect


def contiguous_groups(values: list[int], minimum_size: int = 2) -> list[list[int]]:
    groups: list[list[int]] = []
    for value in values:
        if not groups or value > groups[-1][-1] + 1:
            groups.append([value])
        else:
            groups[-1].append(value)
    return [group for group in groups if len(group) >= minimum_size]


def edge_signals(mask: np.ndarray, rect: dict[str, int]) -> dict[str, list[int]]:
    left, top, right, bottom = (rect[key] for key in ("left", "top", "right", "bottom"))
    raw = {
        "left": (np.where(mask[top : bottom + 1, left - 4 : left + 5].sum(axis=1) >= 2)[0] + top).tolist(),
        "right": (np.where(mask[top : bottom + 1, right - 4 : right + 5].sum(axis=1) >= 2)[0] + top).tolist(),
        "top": (np.where(mask[top - 4 : top + 5, left : right + 1].sum(axis=0) >= 2)[0] + left).tolist(),
        "bottom": (np.where(mask[bottom - 4 : bottom + 5, left : right + 1].sum(axis=0) >= 2)[0] + left).tolist(),
    }
    return {
        edge: [round(sum(group) / len(group)) for group in contiguous_groups(values)]
        for edge, values in raw.items()
    }


def polygon_bounds(points: list[list[float]], scale: float, offset_x: float, offset_y: float) -> dict[str, float]:
    xs = [point[0] / scale + offset_x for point in points]
    ys = [point[1] / scale + offset_y for point in points]
    return {
        "x": round(min(xs), 3),
        "y": round(min(ys), 3),
        "width": round(max(xs) - min(xs), 3),
        "height": round(max(ys) - min(ys), 3),
    }


def numeric_values(text: str) -> list[int]:
    normalized = text.replace(":", ".").replace(",", ".")
    result: list[int] = []
    for match in NUMBER_RE.finditer(normalized):
        value = float(match.group(1))
        if 0 < value <= 60:
            result.append(round(value * 10))
    return result


def arrow_hints(text: str) -> list[str]:
    return sorted({direction for token, direction in ARROWS.items() if token in text})


def run_pass(
    engine: RapidOCR,
    pass_id: str,
    engine_family: str,
    pixels: np.ndarray,
    scale: float = 1.0,
    offset_x: float = 0.0,
    offset_y: float = 0.0,
) -> list[dict[str, Any]]:
    result, _ = engine(pixels)
    detections: list[dict[str, Any]] = []
    for points, text, confidence in result or []:
        bounds = polygon_bounds(points, scale, offset_x, offset_y)
        center = {
            "x": round(bounds["x"] + bounds["width"] / 2, 3),
            "y": round(bounds["y"] + bounds["height"] / 2, 3),
        }
        values = numeric_values(text)
        if len(values) != 1:
            continue
        for tenths in values:
            detections.append(
                {
                    "passId": pass_id,
                    "engineFamily": engine_family,
                    "text": text,
                    "tenthsOfInch": tenths,
                    "confidence": round(float(confidence), 6),
                    "boundsPx": bounds,
                    "centerPx": center,
                    "arrowHints": arrow_hints(text),
                }
            )
    return detections


def component_patch_detections(
    engine: RapidOCR,
    measured: np.ndarray,
    difference_mask: np.ndarray,
    existing: list[dict[str, Any]],
    rect: dict[str, int],
) -> list[dict[str, Any]]:
    gray = cv2.cvtColor(measured, cv2.COLOR_BGR2GRAY)
    light_change = (difference_mask.astype(bool) & (gray > 100)).astype(np.uint8) * 255
    light_change = cv2.morphologyEx(light_change, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    _, _, stats, _ = cv2.connectedComponentsWithStats(light_change, 8)
    result: list[dict[str, Any]] = []
    centers = [(item["centerPx"]["x"], item["centerPx"]["y"]) for item in existing]
    component_index = 0
    for x, y, width, height, area in stats[1:]:
        x, y, width, height, area = map(int, (x, y, width, height, area))
        if not (area >= 1300 and 45 <= width <= 300 and 40 <= height <= 190):
            continue
        center_x = x + width / 2
        center_y = y + height / 2
        if not (
            rect["left"] - 110 <= center_x <= rect["right"] + 110
            and rect["top"] - 130 <= center_y <= rect["bottom"] + 130
        ):
            continue
        if min((math.hypot(center_x - cx, center_y - cy) for cx, cy in centers), default=math.inf) <= 65:
            continue
        component_index += 1
        pad = 24
        x0 = max(0, x - pad)
        y0 = max(0, y - pad)
        x1 = min(measured.shape[1], x + width + pad)
        y1 = min(measured.shape[0], y + height + pad)
        patch = measured[y0:y1, x0:x1]
        patch = cv2.resize(patch, None, fx=4.0, fy=4.0, interpolation=cv2.INTER_LANCZOS4)
        result.extend(
            run_pass(
                engine,
                f"rapid-component-{component_index:03d}",
                "rapidocr",
                patch,
                4.0,
                x0,
                y0,
            )
        )
        result.extend(
            run_pass(
                engine,
                f"rapid-component-gray-{component_index:03d}",
                "rapidocr",
                cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY),
                4.0,
                x0,
                y0,
            )
        )
    return result


def windows_detections(entry: dict[str, Any] | None) -> list[dict[str, Any]]:
    if entry is None:
        return []
    detections: list[dict[str, Any]] = []
    for word in entry.get("words", []):
        if not word.get("isMeasurementCandidate"):
            continue
        values = numeric_values(word.get("normalizedNumericText") or word.get("text") or "")
        bounds = word["boundsPx"]
        for tenths in values:
            detections.append(
                {
                    "passId": "windows-scene",
                    "engineFamily": "windows-ocr",
                    "text": word.get("text", ""),
                    "tenthsOfInch": tenths,
                    "confidence": None,
                    "boundsPx": bounds,
                    "centerPx": {
                        "x": round(bounds["x"] + bounds["width"] / 2, 3),
                        "y": round(bounds["y"] + bounds["height"] / 2, 3),
                    },
                    "arrowHints": arrow_hints(word.get("text", "")),
                }
            )
    return detections


def cluster_detections(detections: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    clusters: list[list[dict[str, Any]]] = []
    for detection in sorted(detections, key=lambda item: (item["centerPx"]["y"], item["centerPx"]["x"], item["passId"])):
        best_index = None
        best_distance = math.inf
        for index, cluster in enumerate(clusters):
            cx = sum(item["centerPx"]["x"] for item in cluster) / len(cluster)
            cy = sum(item["centerPx"]["y"] for item in cluster) / len(cluster)
            distance = math.hypot(detection["centerPx"]["x"] - cx, detection["centerPx"]["y"] - cy)
            same_value = detection["tenthsOfInch"] in {item["tenthsOfInch"] for item in cluster}
            threshold = 55 if same_value else 24
            if distance <= threshold and distance < best_distance:
                best_index = index
                best_distance = distance
        if best_index is None:
            clusters.append([detection])
        else:
            clusters[best_index].append(detection)
    return clusters


def targeted_candidate_detections(
    engine: RapidOCR,
    measured: np.ndarray,
    existing: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for index, cluster in enumerate(cluster_detections(existing), start=1):
        pass_ids = {item["passId"] for item in cluster}
        votes = Counter(item["tenthsOfInch"] for item in cluster)
        ordered_counts = sorted(votes.values(), reverse=True)
        has_majority = len(ordered_counts) == 1 or ordered_counts[0] > ordered_counts[1]
        if len(pass_ids) >= 2 and has_majority:
            continue
        center_x = sum(item["centerPx"]["x"] for item in cluster) / len(cluster)
        center_y = sum(item["centerPx"]["y"] for item in cluster) / len(cluster)
        x0 = max(0, round(center_x - 115))
        y0 = max(0, round(center_y - 85))
        x1 = min(measured.shape[1], round(center_x + 115))
        y1 = min(measured.shape[0], round(center_y + 85))
        patch = measured[y0:y1, x0:x1]
        patch = cv2.resize(patch, None, fx=4.0, fy=4.0, interpolation=cv2.INTER_LANCZOS4)
        result.extend(run_pass(engine, f"rapid-target-color-{index:03d}", "rapidocr", patch, 4.0, x0, y0))
        result.extend(
            run_pass(
                engine,
                f"rapid-target-gray-{index:03d}",
                "rapidocr",
                cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY),
                4.0,
                x0,
                y0,
            )
        )
    return result


def infer_edge(
    center: dict[str, float],
    tenths: int,
    rect: dict[str, int],
    signals: dict[str, list[int]],
    arrow_hint: str | None,
) -> dict[str, Any]:
    distance = tenths / 10
    px_per_x = (rect["right"] - rect["left"]) / BOARD_WIDTH_INCH
    px_per_y = (rect["bottom"] - rect["top"]) / BOARD_HEIGHT_INCH
    predicted = {
        "left": rect["left"] + distance * px_per_x,
        "right": rect["right"] - distance * px_per_x,
        "top": rect["top"] + distance * px_per_y,
        "bottom": rect["bottom"] - distance * px_per_y,
    }
    scored: list[dict[str, Any]] = []
    for edge in ("left", "right", "top", "bottom"):
        axis = "x" if edge in ("left", "right") else "y"
        axis_value = center[axis]
        perpendicular = center["y" if axis == "x" else "x"]
        signal_distance = min((abs(perpendicular - signal) for signal in signals[edge]), default=999.0)
        axis_residual = abs(axis_value - predicted[edge])
        score = axis_residual + 0.35 * signal_distance
        scored.append(
            {
                "edge": edge,
                "axis": axis,
                "scorePx": round(score, 3),
                "axisResidualPx": round(axis_residual, 3),
                "nearestEdgeSignalDistancePx": round(signal_distance, 3),
            }
        )
    scored.sort(key=lambda item: (item["scorePx"], item["edge"]))
    best = scored[0]
    used_arrow_hint = False
    if arrow_hint:
        hinted = next(item for item in scored if item["edge"] == arrow_hint)
        if hinted["scorePx"] <= 130 and hinted["nearestEdgeSignalDistancePx"] <= 75:
            best = hinted
            used_arrow_hint = True
    other_scores = [item["scorePx"] for item in scored if item["edge"] != best["edge"]]
    margin = min(other_scores) - best["scorePx"]
    return {
        "fromEdge": best["edge"],
        "axis": best["axis"],
        "scorePx": best["scorePx"],
        "marginPx": round(margin, 3),
        "usedArrowHint": used_arrow_hint,
        "ambiguous": best["scorePx"] > 105 or (margin < 10 and not used_arrow_hint) or best["nearestEdgeSignalDistancePx"] > 75,
        "alternatives": scored,
    }


def summarize_cluster(
    cluster: list[dict[str, Any]],
    index: int,
    rect: dict[str, int],
    signals: dict[str, list[int]],
) -> dict[str, Any]:
    votes = Counter(item["tenthsOfInch"] for item in cluster)
    selected_value, selected_count = sorted(votes.items(), key=lambda item: (-item[1], item[0]))[0]
    agreeing = [item for item in cluster if item["tenthsOfInch"] == selected_value]
    center = {
        "x": round(sum(item["centerPx"]["x"] for item in agreeing) / len(agreeing), 3),
        "y": round(sum(item["centerPx"]["y"] for item in agreeing) / len(agreeing), 3),
    }
    hints = sorted({hint for item in agreeing for hint in item["arrowHints"]})
    arrow_hint = hints[0] if len(hints) == 1 else None
    inference = infer_edge(center, selected_value, rect, signals, arrow_hint)
    pass_ids = sorted({item["passId"] for item in agreeing})
    engine_families = sorted({item["engineFamily"] for item in agreeing})
    signal_classes = sorted(
        {
            "difference" if item["passId"] == "rapid-difference" else "scene"
            for item in agreeing
        }
    )
    conflicts = sorted(value for value in votes if value != selected_value)
    second_count = sorted(votes.values(), reverse=True)[1] if len(votes) > 1 else 0
    machine_agreement = (
        selected_count >= 2
        and len(pass_ids) >= 2
        and (not conflicts or selected_count > second_count)
        and not inference["ambiguous"]
    )
    cross_signal_agreement = len(signal_classes) >= 2 or len(engine_families) >= 2
    status = "candidate" if machine_agreement else "review_required"
    return {
        "candidateId": f"c{index:03d}",
        "printedTextCandidates": sorted({item["text"] for item in agreeing}),
        "tenthsOfInch": selected_value,
        "centerPx": center,
        "edgeInference": inference,
        "passIds": pass_ids,
        "engineFamilies": engine_families,
        "signalClasses": signal_classes,
        "machineAgreement": machine_agreement,
        "crossSignalAgreement": cross_signal_agreement,
        "conflictingTenthsOfInch": conflicts,
        "arrowHints": hints,
        "status": status,
        "detections": sorted(cluster, key=lambda item: (item["passId"], item["tenthsOfInch"])),
    }


def main() -> None:
    for directory in (ARGS.measured_dir, ARGS.plain_dir, ARGS.upstream_dir, ARGS.dependency_dir):
        if not directory.is_dir():
            raise ValueError(f"Missing directory: {directory}")
    windows_by_name: dict[str, dict[str, Any]] = {}
    if ARGS.windows_ocr:
        payload = json.loads(ARGS.windows_ocr.read_text(encoding="utf-8-sig"))
        windows_by_name = {entry["fileName"]: entry for entry in payload.get("files", [])}

    engine = RapidOCR()
    layouts: list[dict[str, Any]] = []
    review_queue: list[dict[str, Any]] = []
    upstream_files = sorted(ARGS.upstream_dir.glob("*.png"), key=lambda path: path.name)
    for layout_index, upstream_path in enumerate(upstream_files, start=1):
        print(f"[{layout_index}/{len(upstream_files)}] {upstream_path.name}", flush=True)
        measured_path = ARGS.measured_dir / upstream_path.name
        plain_path = ARGS.plain_dir / upstream_path.name
        if not measured_path.is_file() or not plain_path.is_file():
            raise ValueError(f"Missing local pair for {upstream_path.name}")
        upstream = image(upstream_path)
        measured = image(measured_path)
        plain = image(plain_path)
        if upstream.shape != measured.shape or measured.shape != plain.shape:
            raise ValueError(f"Dimension mismatch for {upstream_path.name}")

        rect = board_rect(plain)
        difference = cv2.absdiff(measured, plain)
        difference_mask = (difference.max(axis=2) > 12).astype(np.uint8)
        isolated = np.full_like(measured, 255)
        isolated[difference_mask.astype(bool)] = measured[difference_mask.astype(bool)]
        signals = edge_signals(difference_mask, rect)

        pad_x = round(upstream.shape[1] * 0.055)
        pad_y = round(upstream.shape[0] * 0.045)
        x0 = max(0, rect["left"] - pad_x)
        y0 = max(0, rect["top"] - pad_y)
        x1 = min(upstream.shape[1], rect["right"] + pad_x)
        y1 = min(upstream.shape[0], rect["bottom"] + pad_y)
        crop = upstream[y0:y1, x0:x1]
        crop2 = cv2.resize(crop, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_LANCZOS4)
        gray2 = cv2.cvtColor(crop2, cv2.COLOR_BGR2GRAY)

        detections: list[dict[str, Any]] = []
        detections.extend(run_pass(engine, "rapid-upstream", "rapidocr", upstream))
        detections.extend(run_pass(engine, "rapid-local", "rapidocr", measured))
        detections.extend(run_pass(engine, "rapid-crop-color", "rapidocr", crop2, 2.0, x0, y0))
        detections.extend(run_pass(engine, "rapid-crop-gray", "rapidocr", gray2, 2.0, x0, y0))
        detections.extend(run_pass(engine, "rapid-difference", "rapidocr", isolated))
        detections.extend(windows_detections(windows_by_name.get(upstream_path.name)))

        detections.extend(component_patch_detections(engine, measured, difference_mask, detections, rect))
        detections.extend(targeted_candidate_detections(engine, measured, detections))

        filtered = [
            item
            for item in detections
            if rect["left"] - pad_x <= item["centerPx"]["x"] <= rect["right"] + pad_x
            and rect["top"] - pad_y <= item["centerPx"]["y"] <= rect["bottom"] + pad_y
        ]
        clusters = cluster_detections(filtered)
        candidates = [summarize_cluster(cluster, index + 1, rect, signals) for index, cluster in enumerate(clusters)]
        candidates.sort(key=lambda item: (item["centerPx"]["y"], item["centerPx"]["x"], item["candidateId"]))
        for index, candidate in enumerate(candidates, start=1):
            candidate["candidateId"] = f"c{index:03d}"

        issues: list[str] = []
        if any(candidate["status"] == "review_required" for candidate in candidates):
            issues.append("one-or-more-candidates-require-review")
        if issues:
            review_queue.append(
                {
                    "layoutId": upstream_path.stem,
                    "issues": issues,
                    "reviewCandidateIds": [
                        candidate["candidateId"]
                        for candidate in candidates
                        if candidate["status"] == "review_required"
                    ],
                }
            )

        mean_abs_difference = np.abs(upstream.astype(np.int16) - measured.astype(np.int16)).mean(axis=(0, 1))
        layouts.append(
            {
                "layoutId": upstream_path.stem,
                "sourceImage": {
                    "fileName": upstream_path.name,
                    "upstreamSha256": sha256(upstream_path),
                    "localMeasuredSha256": sha256(measured_path),
                    "localPlainSha256": sha256(plain_path),
                    "widthPx": int(upstream.shape[1]),
                    "heightPx": int(upstream.shape[0]),
                    "meanAbsoluteRgbDifferenceUpstreamVsLocal": [round(float(value), 6) for value in mean_abs_difference],
                },
                "boardRectPx": rect,
                "edgeSignalsPx": signals,
                "uniqueEdgeSignalCount": sum(len(values) for values in signals.values()),
                "candidates": candidates,
                "issues": issues,
            }
        )

    output = {
        "schemaVersion": "warforge-layout-measurement-candidates/v1",
        "board": {
            "widthTenthsInch": 440,
            "heightTenthsInch": 600,
            "origin": "top-left",
            "xDirection": "right",
            "yDirection": "down",
        },
        "extraction": {
            "ocrEngines": ["rapidocr_onnxruntime", "windows-media-ocr"],
            "differenceThreshold": 12,
            "status": "evidence-only",
        },
        "layouts": layouts,
        "reviewQueue": review_queue,
    }
    ARGS.output.parent.mkdir(parents=True, exist_ok=True)
    ARGS.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
