# Layout measurement schema

Use `warforge-layout-measurements/v1` for reviewed source data and
`warforge-layout-ocr/v1` only for raw OCR evidence.

## Coordinate convention

- Board origin: top-left.
- `x`: increases to the right; width is 44 inches for GDM 2026.
- `y`: increases downward; height is 60 inches for GDM 2026.
- Printed measures are integers in `tenthsOfInch`: `6` becomes `60`, `8.7`
  becomes `87`.
- Exact engine conversion is rational: numerator `tenthsOfInch * 254`,
  denominator `10`. A rounded 0.1 mm engine coordinate may be stored only
  beside that rational value, never in its place.

For a measure `d` from an edge:

- left: `x = d`;
- right: `x = 44 - d`;
- top: `y = d`;
- bottom: `y = 60 - d`.

## Reviewed dataset

```json
{
  "schemaVersion": "warforge-layout-measurements/v1",
  "manifestVersion": "0.8.0",
  "version": "1.0.0",
  "source": {
    "sourceId": "approved-gdm-2026-layout-images",
    "folderId": "opaque-provider-id",
    "authority": "project-approved",
    "approvedAt": "YYYY-MM-DD"
  },
  "board": {
    "widthTenthsInch": 440,
    "heightTenthsInch": 600,
    "origin": "top-left",
    "xDirection": "right",
    "yDirection": "down"
  },
  "layouts": [
    {
      "layoutId": "take-and-hold-mirror-1",
      "sourceImage": {
        "fileName": "take-and-hold-mirror-1.png",
        "driveFileId": "opaque-provider-id",
        "sha256": "lowercase-hex",
        "widthPx": 1653,
        "heightPx": 2833
      },
      "boardRectPx": { "left": 269, "right": 1384, "top": 757, "bottom": 2277 },
      "expectedCalloutCount": 32,
      "measurementCount": 32,
      "status": "verified",
      "measurements": [
        {
          "measurementId": "m001",
          "sourceCandidateIds": ["c001"],
          "printedTenthsOfInch": 87,
          "axis": "y",
          "fromEdge": "top",
          "coordinateTenthsOfInch": 87,
          "worldCoordinate": {
            "numerator": 22098,
            "denominator": 10,
            "roundedWorldUnits": 2210
          },
          "labelCenterPx": { "x": 1082, "y": 986 },
          "valueStatus": "verified",
          "edgeStatus": "verified",
          "status": "verified",
          "evidence": {
            "passIds": ["rapid-crop-color"],
            "engineFamilies": ["rapidocr"],
            "printedTextCandidates": ["8.7"],
            "edgeSource": "template-arrow",
            "labelRegion": {
              "regionId": "r001",
              "kind": "difference-label"
            },
            "reviewDecision": null
          }
        }
      ]
    }
  ],
  "quality": {
    "verifiedLayoutCount": 45,
    "reviewRequiredLayoutCount": 0,
    "reviewItemCount": 0
  }
}
```

`status` is one of `candidate`, `verified`, `review_required` or `rejected`.
A review item records image, crop/bounds, issue, candidates and the exact
decision needed. The reviewed dataset records dimension callouts and their
board-axis coordinates. Pairing X/Y callouts with terrain vertices, objectives
or deployment anchors is a separate geometry-transcription step; do not invent
`subjectRef` values during measurement extraction.

## Stable ordering

Sort layouts by `layoutId`. Within a layout, use the stable reviewed label-region
order (centre `y`, centre `x`, then `regionId`) and assign `measurementId` from
that order. Keep `regionId` when a direct visual decision replaces an OCR
candidate. Identifiers must remain stable across deterministic reruns.
