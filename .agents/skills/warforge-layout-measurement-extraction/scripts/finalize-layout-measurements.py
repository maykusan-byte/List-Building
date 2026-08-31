#!/usr/bin/env python3
"""Compact OCR evidence into reviewed-layout candidates and a review queue."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", type=Path, required=True)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--measured-dir", type=Path, required=True)
    parser.add_argument("--plain-dir", type=Path, required=True)
    parser.add_argument("--dependency-dir", type=Path, required=True)
    parser.add_argument("--decisions", type=Path)
    parser.add_argument("--reviewed-queue", type=Path)
    parser.add_argument("--manifest-version", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--review-output", type=Path, required=True)
    return parser.parse_args()


ARGS = parse_args()
sys.path.insert(0, str(ARGS.dependency_dir.resolve()))

import cv2  # type: ignore  # noqa: E402
import numpy as np  # type: ignore  # noqa: E402


EXPECTED_CALLOUTS = 32
LABEL_COLORS_BGR = (
    (182, 211, 221),  # standard beige
    (204, 210, 240),  # pink deployment-side measure
    (234, 220, 207),  # blue deployment-side measure
)
TEMPLATE_BOXES = {
    "top": (1097, 918, 36, 36),
    "left": (632, 995, 36, 36),
    "right": (1067, 1018, 36, 36),
    "bottom": (585, 1997, 36, 36),
}


def load_image(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Unreadable image: {path}")
    return image


def arrow_templates() -> dict[str, np.ndarray]:
    reference = load_image(ARGS.measured_dir / "take-and-hold-mirror-1.png")
    binary = (cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY) < 100).astype(np.uint8) * 255
    return {
        edge: binary[y : y + height, x : x + width]
        for edge, (x, y, width, height) in TEMPLATE_BOXES.items()
    }


def template_arrow(image: np.ndarray, center: dict[str, float], templates: dict[str, np.ndarray]) -> dict[str, Any]:
    binary = (cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) < 100).astype(np.uint8) * 255
    center_x = round(center["x"])
    center_y = round(center["y"])
    x0 = max(0, center_x - 15)
    x1 = min(binary.shape[1], center_x + 115)
    y0 = max(0, center_y - 45)
    y1 = min(binary.shape[0], center_y + 45)
    region = binary[y0:y1, x0:x1]
    scores: dict[str, float] = {}
    for edge, template in templates.items():
        if region.shape[0] < template.shape[0] or region.shape[1] < template.shape[1]:
            scores[edge] = -1.0
            continue
        match = cv2.matchTemplate(region, template, cv2.TM_CCOEFF_NORMED)
        scores[edge] = float(match.max())
    ordered = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    best_edge, best_score = ordered[0]
    margin = best_score - ordered[1][1]
    reliable = best_score >= 0.62 and margin >= 0.12
    return {
        "edge": best_edge,
        "score": round(best_score, 6),
        "margin": round(margin, 6),
        "reliable": reliable,
        "scores": {edge: round(score, 6) for edge, score in sorted(scores.items())},
    }


def evidence_quality(candidate: dict[str, Any]) -> float:
    score = min(len(candidate["passIds"]), 6) * 0.7
    score += 5 if candidate["machineAgreement"] else 0
    score += 2 if candidate["crossSignalAgreement"] else 0
    score += 2.5 if len(candidate.get("arrowHints", [])) == 1 else 0
    score += 2.5 if candidate["templateArrow"]["reliable"] else 0
    score += 2 if candidate["resolvedEdgeStatus"] == "verified" else 0
    score -= min(len(candidate.get("conflictingTenthsOfInch", [])), 3) * 0.8
    score -= 3 if len(candidate["passIds"]) == 1 else 0
    score -= max(0.0, candidate["resolvedEdgeEvidence"]["scorePx"] - 90) / 40
    return round(score, 6)


def resolve_edge(candidate: dict[str, Any], match: dict[str, Any]) -> tuple[str, str, str, dict[str, Any]]:
    hints = candidate.get("arrowHints", [])
    preferred_edge = None
    preferred_source = None
    if len(hints) == 1:
        preferred_edge = hints[0]
        preferred_source = "ocr-arrow"
    elif match["reliable"]:
        preferred_edge = match["edge"]
        preferred_source = "template-arrow"
    alternatives = candidate["edgeInference"]["alternatives"]
    if preferred_edge is not None:
        preferred_evidence = next(item for item in alternatives if item["edge"] == preferred_edge)
        if preferred_evidence["axisResidualPx"] <= 140:
            return preferred_edge, preferred_source or "geometry", "verified", preferred_evidence

    edge = candidate["edgeInference"]["fromEdge"]
    source = "geometry"
    evidence = next(item for item in alternatives if item["edge"] == edge)
    template_support = (
        match.get("supportsGeometry", False)
        and match["edge"] == edge
        and evidence["axisResidualPx"] <= 140
    )
    status = "verified" if not candidate["edgeInference"]["ambiguous"] or template_support else "review_required"
    return edge, source, status, evidence


def enrich(candidate: dict[str, Any], image: np.ndarray, templates: dict[str, np.ndarray]) -> dict[str, Any]:
    result = dict(candidate)
    result["templateArrow"] = template_arrow(image, candidate["centerPx"], templates)
    geometric_edge = candidate["edgeInference"]["fromEdge"]
    supports_geometry = (
        result["templateArrow"]["edge"] == geometric_edge
        and result["templateArrow"]["score"] >= 0.42
        and result["templateArrow"]["margin"] >= 0.01
    )
    result["templateArrow"]["supportsGeometry"] = supports_geometry
    result["templateArrow"]["reliable"] = result["templateArrow"]["reliable"] or supports_geometry
    edge, source, status, evidence = resolve_edge(result, result["templateArrow"])
    result["resolvedEdge"] = edge
    result["resolvedEdgeSource"] = source
    result["resolvedEdgeStatus"] = status
    result["resolvedEdgeEvidence"] = evidence
    votes: dict[int, int] = {}
    for detection in candidate["detections"]:
        value = detection["tenthsOfInch"]
        votes[value] = votes.get(value, 0) + 1
    selected_count = votes.get(candidate["tenthsOfInch"], 0)
    other_count = max((count for value, count in votes.items() if value != candidate["tenthsOfInch"]), default=0)
    result["valueStatus"] = "verified" if selected_count >= 2 and selected_count > other_count else "review_required"
    result["qualityScore"] = evidence_quality(result)
    return result


def merge_near_duplicates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    remaining = sorted(candidates, key=lambda item: (-item["qualityScore"], item["candidateId"]))
    merged: list[dict[str, Any]] = []
    while remaining:
        primary = remaining.pop(0)
        duplicates = [primary]
        kept: list[dict[str, Any]] = []
        for candidate in remaining:
            distance = math.hypot(
                primary["centerPx"]["x"] - candidate["centerPx"]["x"],
                primary["centerPx"]["y"] - candidate["centerPx"]["y"],
            )
            if candidate["tenthsOfInch"] == primary["tenthsOfInch"] and distance <= 32:
                duplicates.append(candidate)
            else:
                kept.append(candidate)
        remaining = kept
        result = dict(primary)
        result["sourceCandidateIds"] = sorted(item["candidateId"] for item in duplicates)
        if len(duplicates) > 1:
            result["qualityScore"] = round(primary["qualityScore"] + min(len(duplicates) - 1, 2), 6)
        merged.append(result)
    return merged


def label_regions(
    measured: np.ndarray,
    plain: np.ndarray,
    candidates: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Locate the 32 printed numeric cartouches independently from OCR."""
    measured_i16 = measured.astype(np.int16)
    color_mask = np.logical_or.reduce(
        [
            np.max(np.abs(measured_i16 - np.asarray(color)), axis=2) <= 8
            for color in LABEL_COLORS_BGR
        ]
    )
    difference_mask = np.max(cv2.absdiff(measured, plain), axis=2) > 12
    mask = (color_mask & difference_mask).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    _, _, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
    regions: list[dict[str, Any]] = []
    for stats_row, centroid in zip(stats[1:], centroids[1:]):
        x, y, width, height, area = map(int, stats_row)
        if not (area >= 600 and 25 <= width <= 180 and 35 <= height <= 90):
            continue
        regions.append(
            {
                "kind": "difference-label",
                "boundsPx": {"x": x, "y": y, "width": width, "height": height},
                "centerPx": {"x": round(float(centroid[0]), 3), "y": round(float(centroid[1]), 3)},
                "changedColorAreaPx": area,
            }
        )

    # A cartouche can disappear from the difference-color mask when its fill
    # matches the underlying card. In that bounded case, add a high-quality OCR
    # center only when it is spatially distinct from every detected cartouche.
    diagnostics: list[str] = []
    if len(regions) < EXPECTED_CALLOUTS:
        needed = EXPECTED_CALLOUTS - len(regions)
        candidates_by_quality = sorted(
            candidates,
            key=lambda item: (-item["qualityScore"], item["centerPx"]["y"], item["centerPx"]["x"]),
        )
        for threshold in (100.0, 80.0, 65.0, 45.0):
            for candidate in candidates_by_quality:
                if len(regions) >= EXPECTED_CALLOUTS:
                    break
                center = candidate["centerPx"]
                distance = min(
                    (
                        math.hypot(center["x"] - region["centerPx"]["x"], center["y"] - region["centerPx"]["y"])
                        for region in regions
                    ),
                    default=math.inf,
                )
                if distance < threshold:
                    continue
                regions.append(
                    {
                        "kind": "ocr-label-complement",
                        "boundsPx": None,
                        "centerPx": center,
                        "changedColorAreaPx": None,
                        "sourceCandidateIds": candidate["sourceCandidateIds"],
                    }
                )
            if len(regions) >= EXPECTED_CALLOUTS:
                break
        diagnostics.append(f"difference-label-count:{EXPECTED_CALLOUTS - needed}")

    if len(regions) > EXPECTED_CALLOUTS:
        raise ValueError(f"Detected {len(regions)} label regions; expected at most {EXPECTED_CALLOUTS}")
    regions.sort(key=lambda item: (item["centerPx"]["y"], item["centerPx"]["x"], item["kind"]))
    for index, region in enumerate(regions, start=1):
        region["regionId"] = f"r{index:03d}"
    return regions, diagnostics


def associate_candidates(
    regions: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    assigned = {region["regionId"]: [] for region in regions}
    unassigned: list[dict[str, Any]] = []
    pairs: list[tuple[float, str, float, str, dict[str, Any], dict[str, Any]]] = []
    for candidate in candidates:
        for region in regions:
            distance = math.hypot(
                candidate["centerPx"]["x"] - region["centerPx"]["x"],
                candidate["centerPx"]["y"] - region["centerPx"]["y"],
            )
            if distance <= 160:
                pairs.append(
                    (
                        distance,
                        region["regionId"],
                        -candidate["qualityScore"],
                        candidate["candidateId"],
                        region,
                        candidate,
                    )
                )
    used_regions: set[str] = set()
    used_candidates: set[str] = set()
    for distance, region_id, _, candidate_id, _, candidate in sorted(pairs, key=lambda item: item[:4]):
        if region_id in used_regions or candidate_id in used_candidates:
            continue
        value = dict(candidate)
        value["labelRegionDistancePx"] = round(distance, 3)
        assigned[region_id].append(value)
        used_regions.add(region_id)
        used_candidates.add(candidate_id)

    # Remaining detections support the unique primary assignment but can never
    # displace it merely because the same cartouche was OCRed several times.
    for candidate in candidates:
        if candidate["candidateId"] in used_candidates:
            continue
        ordered = sorted(
            regions,
            key=lambda region: (
                math.hypot(
                    candidate["centerPx"]["x"] - region["centerPx"]["x"],
                    candidate["centerPx"]["y"] - region["centerPx"]["y"],
                ),
                region["regionId"],
            ),
        )
        nearest = ordered[0]
        distance = math.hypot(
            candidate["centerPx"]["x"] - nearest["centerPx"]["x"],
            candidate["centerPx"]["y"] - nearest["centerPx"]["y"],
        )
        if distance <= 160:
            value = dict(candidate)
            value["labelRegionDistancePx"] = round(distance, 3)
            assigned[nearest["regionId"]].append(value)
        else:
            unassigned.append(candidate)
    return assigned, unassigned


def load_decisions() -> tuple[dict[tuple[str, str], dict[str, Any]], dict[str, Any] | None]:
    if ARGS.decisions is None:
        if ARGS.reviewed_queue is not None:
            raise ValueError("--reviewed-queue requires --decisions")
        return {}, None
    if ARGS.reviewed_queue is None:
        raise ValueError("--decisions requires --reviewed-queue")
    payload = json.loads(ARGS.decisions.read_text(encoding="utf-8"))
    reviewed_queue_bytes = ARGS.reviewed_queue.read_bytes()
    reviewed_queue_hash = hashlib.sha256(reviewed_queue_bytes).hexdigest()
    review = payload.get("review", {})
    if reviewed_queue_hash != review.get("reviewedQueueSha256"):
        raise ValueError("Review decisions do not match the bound pre-review queue SHA-256")
    reviewed_queue = json.loads(reviewed_queue_bytes.decode("utf-8"))
    if reviewed_queue.get("schemaVersion") != "warforge-layout-measurement-review/v1":
        raise ValueError("Unsupported pre-review queue schema")
    if reviewed_queue.get("sourceId") != payload.get("sourceId"):
        raise ValueError("Review decisions and pre-review queue use different sources")
    reviewed_items = reviewed_queue.get("items")
    if not isinstance(reviewed_items, list) or len(reviewed_items) != review.get("reviewedItemCount"):
        raise ValueError("Review decisions do not cover the declared pre-review item count")
    reviewed_keys = {(item.get("layoutId"), item.get("regionId")) for item in reviewed_items}
    if len(reviewed_keys) != len(reviewed_items) or any(None in key for key in reviewed_keys):
        raise ValueError("Pre-review queue items require unique layoutId/regionId pairs")
    result: dict[tuple[str, str], dict[str, Any]] = {}
    for decision in payload["decisions"]:
        key = (decision["layoutId"], decision["regionId"])
        if key in result:
            raise ValueError(f"Duplicate review decision for {key[0]} {key[1]}")
        if key not in reviewed_keys:
            raise ValueError(f"Review decision is absent from the bound queue: {key[0]} {key[1]}")
        result[key] = {**decision, "review": payload["review"]}
    default = None
    if payload.get("defaultAction") == "confirm-current-reading":
        default = {"action": "confirm", "review": payload["review"], "defaulted": True}
    return result, default


def reviewed_candidate(
    layout_id: str,
    region: dict[str, Any],
    assigned: list[dict[str, Any]],
    decision: dict[str, Any] | None,
    default_decision: dict[str, Any] | None,
) -> dict[str, Any] | None:
    candidate = dict(assigned[0]) if assigned else None
    if candidate is not None:
        candidate["sourceCandidateIds"] = sorted(
            {candidate_id for item in assigned for candidate_id in item["sourceCandidateIds"]}
        )
        candidate["centerPx"] = region["centerPx"]
        candidate["labelRegion"] = region
    needs_review = candidate is not None and (
        candidate["valueStatus"] != "verified"
        or candidate["resolvedEdgeStatus"] != "verified"
        or region["kind"] == "ocr-label-complement"
    )
    if decision is None and needs_review and default_decision is not None:
        decision = default_decision
    if decision is None:
        if candidate is not None and region["kind"] == "ocr-label-complement":
            candidate["valueStatus"] = "review_required"
            candidate["resolvedEdgeStatus"] = "review_required"
        return candidate
    if decision["action"] not in ("confirm", "replace"):
        raise ValueError(f"Unknown review action for {layout_id} {region['regionId']}")
    if candidate is None or decision["action"] == "replace":
        reviewed_center = decision.get("labelCenterPx", region["centerPx"])
        reviewed_region = (
            {
                "regionId": region["regionId"],
                "kind": "direct-visual-review",
                "boundsPx": decision.get("boundsPx"),
                "centerPx": reviewed_center,
                "changedColorAreaPx": None,
                "replacesRegion": region,
            }
            if decision["action"] == "replace"
            else region
        )
        candidate = {
            "sourceCandidateIds": [],
            "passIds": [],
            "engineFamilies": [],
            "printedTextCandidates": [],
            "templateArrow": None,
            "resolvedEdgeEvidence": None,
            "qualityScore": None,
            "centerPx": reviewed_center,
            "labelRegion": reviewed_region,
        }
    if "tenthsOfInch" in decision:
        candidate["tenthsOfInch"] = decision["tenthsOfInch"]
    if "fromEdge" in decision:
        candidate["resolvedEdge"] = decision["fromEdge"]
    if "tenthsOfInch" not in candidate or "resolvedEdge" not in candidate:
        raise ValueError(f"Incomplete review decision for {layout_id} {region['regionId']}")
    candidate["valueStatus"] = "verified"
    candidate["resolvedEdgeStatus"] = "verified"
    candidate["resolvedEdgeSource"] = "direct-visual-review"
    candidate["reviewDecision"] = decision
    return candidate


def measurement(candidate: dict[str, Any], index: int) -> dict[str, Any]:
    edge = candidate["resolvedEdge"]
    value = candidate["tenthsOfInch"]
    if edge == "left":
        coordinate = value
        axis = "x"
    elif edge == "right":
        coordinate = 440 - value
        axis = "x"
    elif edge == "top":
        coordinate = value
        axis = "y"
    else:
        coordinate = 600 - value
        axis = "y"
    overall = "verified" if candidate["valueStatus"] == "verified" and candidate["resolvedEdgeStatus"] == "verified" else "review_required"
    return {
        "measurementId": f"m{index:03d}",
        "sourceCandidateIds": candidate["sourceCandidateIds"],
        "printedTenthsOfInch": value,
        "fromEdge": edge,
        "axis": axis,
        "coordinateTenthsOfInch": coordinate,
        "worldCoordinate": {
            "numerator": coordinate * 254,
            "denominator": 10,
            "roundedWorldUnits": round(coordinate * 254 / 10),
        },
        "labelCenterPx": candidate["centerPx"],
        "valueStatus": candidate["valueStatus"],
        "edgeStatus": candidate["resolvedEdgeStatus"],
        "status": overall,
        "evidence": {
            "passIds": candidate["passIds"],
            "engineFamilies": candidate["engineFamilies"],
            "printedTextCandidates": candidate["printedTextCandidates"],
            "edgeSource": candidate["resolvedEdgeSource"],
            "templateArrow": candidate["templateArrow"],
            "geometry": candidate["resolvedEdgeEvidence"],
            "qualityScore": candidate["qualityScore"],
            "labelRegion": candidate.get("labelRegion"),
            "reviewDecision": candidate.get("reviewDecision"),
        },
    }


def main() -> None:
    candidates_data = json.loads(ARGS.candidates.read_text(encoding="utf-8"))
    inventory = json.loads(ARGS.inventory.read_text(encoding="utf-8"))
    inventory_by_name = {item["fileName"]: item for item in inventory["files"]}
    templates = arrow_templates()
    decisions, default_decision = load_decisions()
    layouts: list[dict[str, Any]] = []
    review_items: list[dict[str, Any]] = []

    for layout in candidates_data["layouts"]:
        image = load_image(ARGS.measured_dir / layout["sourceImage"]["fileName"])
        plain = load_image(ARGS.plain_dir / layout["sourceImage"]["fileName"])
        enriched = [enrich(candidate, image, templates) for candidate in layout["candidates"]]
        compacted = merge_near_duplicates(enriched)
        regions, region_diagnostics = label_regions(image, plain, compacted)
        assignments, unassigned = associate_candidates(regions, compacted)
        selected_by_region: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
        for region in regions:
            candidate = reviewed_candidate(
                layout["layoutId"],
                region,
                assignments[region["regionId"]],
                decisions.get((layout["layoutId"], region["regionId"])),
                default_decision,
            )
            selected_by_region.append((region, candidate))
            if candidate is not None:
                continue
            else:
                review_items.append(
                    {
                        "layoutId": layout["layoutId"],
                        "kind": "missing-region-value",
                        "regionId": region["regionId"],
                        "labelCenterPx": region["centerPx"],
                        "labelRegion": region,
                    }
                )
        selected = [candidate for _, candidate in selected_by_region if candidate is not None]
        measures = [measurement(candidate, index + 1) for index, candidate in enumerate(selected)]
        if len(regions) < EXPECTED_CALLOUTS:
            review_items.append(
                {
                    "layoutId": layout["layoutId"],
                    "kind": "missing-label-regions",
                    "expected": EXPECTED_CALLOUTS,
                    "found": len(regions),
                }
            )
        for region, candidate in selected_by_region:
            if candidate is None:
                continue
            if candidate["valueStatus"] != "verified" or candidate["resolvedEdgeStatus"] != "verified":
                review_items.append(
                    {
                        "layoutId": layout["layoutId"],
                        "kind": "label-region-review",
                        "regionId": region["regionId"],
                        "candidateIds": candidate["sourceCandidateIds"],
                        "tenthsOfInch": candidate["tenthsOfInch"],
                        "resolvedEdge": candidate["resolvedEdge"],
                        "labelCenterPx": candidate["centerPx"],
                        "labelRegion": region,
                        "valueStatus": candidate["valueStatus"],
                        "edgeStatus": candidate["resolvedEdgeStatus"],
                        "qualityScore": candidate["qualityScore"],
                    }
                )
        source = inventory_by_name[layout["sourceImage"]["fileName"]]
        layouts.append(
            {
                "layoutId": layout["layoutId"],
                "sourceImage": source,
                "boardRectPx": layout["boardRectPx"],
                "expectedCalloutCount": EXPECTED_CALLOUTS,
                "measurementCount": len(measures),
                "status": "verified" if len(regions) == EXPECTED_CALLOUTS and len(measures) == EXPECTED_CALLOUTS and all(item["status"] == "verified" for item in measures) else "review_required",
                "extractionDiagnostics": {
                    "regionDiagnostics": region_diagnostics,
                    "unassignedCandidateIds": sorted(
                        candidate_id
                        for candidate in unassigned
                        for candidate_id in candidate["sourceCandidateIds"]
                    ),
                },
                "measurements": measures,
            }
        )

    output = {
        "schemaVersion": "warforge-layout-measurements/v1",
        "manifestVersion": ARGS.manifest_version,
        "version": "1.0.0",
        "source": inventory["source"],
        "board": candidates_data["board"],
        "expectedLayoutCount": 45,
        "expectedCalloutsPerLayout": EXPECTED_CALLOUTS,
        "layouts": layouts,
        "quality": {
            "verifiedLayoutCount": sum(layout["status"] == "verified" for layout in layouts),
            "reviewRequiredLayoutCount": sum(layout["status"] != "verified" for layout in layouts),
            "reviewItemCount": len(review_items),
        },
    }
    review = {
        "schemaVersion": "warforge-layout-measurement-review/v1",
        "sourceId": inventory["source"]["sourceId"],
        "items": review_items,
    }
    for path, payload in ((ARGS.output, output), (ARGS.review_output, review)):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
