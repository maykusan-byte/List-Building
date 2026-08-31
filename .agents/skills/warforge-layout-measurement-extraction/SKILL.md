---
name: warforge-layout-measurement-extraction
description: Extract, verify, normalize, or audit Warforge terrain-layout measurements from screenshots or image cards. Use for GDM layout inventories, OCR of dimension callouts, board-edge coordinates, terrain-anchor reconstruction, ambiguity queues, or generation of structured layout-measurement data; do not use for mission-rule interpretation or ordinary simulator UI work.
---

# Warforge Layout Measurement Extraction

Use this skill whenever a terrain layout is derived from one or more images.
The output is source data: an OCR result alone is never a verified measure.

## Required context

1. Read the repository `AGENTS.md`.
2. Read `warforge-data-operations` before changing versioned data.
3. Read `warforge-simulator-development` when the output feeds the simulator.
4. Read `references/layout-measurement-schema.md` before producing JSON.
5. Identify the active tracker task and its allowed paths before writing.

## Workflow

1. Establish authority, version/date, source URL or archive path, and intended
   board dimensions. Record these facts before interpreting pixels.
2. Inventory every direct source image by stable id, filename, byte size,
   dimensions and SHA-256. Reject missing, duplicate or unexpected names.
3. Preserve upstream bytes externally or locally and keep their hash. Do not
   overwrite an existing normalized copy merely because encoding differs.
4. Run `scripts/extract-layout-ocr.ps1` with Windows PowerShell 5.1 when
   available, then `scripts/extract-layout-measurements.py` with RapidOCR in
   an isolated temporary dependency directory. Preserve every engine pass and
   bounding box; numeric candidates are hints, not accepted data.
5. Calibrate the visible board rectangle and orientation. For GDM 2026 cards,
   use a top-left board origin with +x to the right and +y downward; validate
   the declared 44 x 60 inch board on every image rather than assuming it.
6. For each callout, capture the printed value, arrow direction, label centre,
   axis, referenced board edge and source bounding boxes. Arrows toward
   left/right encode x distance from that edge; arrows toward top/bottom encode
   y distance from that edge.
7. Treat association with a black anchor, terrain vertex or objective as a
   separate geometry-transcription step. Add `subjectRef` only when that step
   has explicit visual evidence; never infer it from callout proximity alone.
8. Store printed values as integer tenths of an inch. Preserve the exact
   rational conversion to engine units and record any rounding separately:
   `worldUnitNumerator = tenthsOfInch * 254`, denominator `10`.
9. Cross-check each accepted callout against its pixel position after board
   calibration. Also check mirrored/repeated layouts, orthogonal coordinate
   pairs, board bounds and stable ordering. A disagreement creates a review
   item instead of being silently reconciled.
10. Promote a candidate to `verified` only after direct visual confirmation or
    two independent agreeing extraction passes plus all geometric checks. Mark
    the verification method and reviewer identity explicitly.
11. Generate the review queue from unresolved or contradictory evidence. Ask
    the project owner only for those cropped regions; a full manual table is
    the fallback when automated confidence is poor.
12. Validate schema, counts, hashes, deterministic ordering and downstream
    simulator data. Regenerate public mirrors only through repository tooling.

## Quality gates

- Exactly one inventory row per expected source image.
- Every accepted measurement retains source image, printed token candidates,
  label region, edge, axis, value and verification evidence.
- No `verified` entry is based on OCR alone.
- No unresolved review item is used to construct authoritative geometry.
- Board-edge conversion is tested for all four directions.
- Re-running extraction on identical bytes produces identical authoritative
  measures. Floating diagnostic scores can vary at insignificant precision
  across OpenCV versions; the reviewed canonical artifact is hash-pinned.

## Commands

Run raw OCR from the repository root with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .agents/skills/warforge-layout-measurement-extraction/scripts/extract-layout-ocr.ps1 -InputDirectory <images> -OutputPath <raw-ocr.json>
```

For the independent scene/difference extraction pass, install
`rapidocr_onnxruntime` into a temporary directory outside the repository and
run:

```powershell
python .agents/skills/warforge-layout-measurement-extraction/scripts/extract-layout-measurements.py --measured-dir <with-measurements> --plain-dir <no-measurements> --upstream-dir <downloaded-originals> --windows-ocr <raw-ocr.json> --dependency-dir <temporary-python-packages> --output <candidates.json>
```

The Python script produces candidates and review diagnostics. It does not
claim human verification or construct terrain polygons.

Compact the candidates and classify their arrow glyphs with:

```powershell
python .agents/skills/warforge-layout-measurement-extraction/scripts/finalize-layout-measurements.py --candidates <candidates.json> --inventory <source-inventory.json> --measured-dir <with-measurements> --plain-dir <no-measurements> --dependency-dir <temporary-python-packages> --manifest-version <simulator-manifest-version> --output <layout-measurements.json> --review-output <review-queue.json>
```

This finalizer relies on the GDM 2026 card invariant of 32 printed callouts
per image. It first detects the colored numeric cartouches from the measured
versus unmeasured image difference, then associates OCR evidence to those
regions. Unassigned OCR remains in extraction diagnostics; missing or
unresolved cartouches are written to the review queue.

Render that queue into bounded visual sheets with
`scripts/render-layout-review.py`. Inspect every sheet at original detail and
record explicit accept/reject/correct decisions; do not infer a missing value
from neighbouring layouts.

For a bounded review queue that has been inspected in full, a decisions file
may bind `confirm-current-reading` to the queue SHA-256 and list only explicit
corrections. Missing values and replacement regions must still be listed
individually. Preserve the original queue, then pass both `--decisions` and
`--reviewed-queue`; the finalizer refuses a missing or mismatched queue hash.
Retain reviewer, date, method, reviewed item count and queue hash in the
versioned resource.

When a card has fewer candidates than the expected callout count, render its
complete board with `scripts/render-layout-board-review.py`. The script marks
all detected labels so the missing printed callout can be identified directly
on the source image. Crop and review that callout before recording it.

Validate this skill with the `skill-creator` `quick_validate.py` script. Run
the data and simulator gates declared by the active TaskBrief afterward.
