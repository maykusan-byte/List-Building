# Ork Codex Slides extraction

Source presentation: <https://docs.google.com/presentation/d/1vqnN_Hh2A5rB49UNYf25hINDufv3Fqsi7cyOAToTWI8>

Extraction date: 2026-08-21

## Contents

- `pages/`: 33 rendered slide images, named in slide order.
- `source-images/`: 35 higher-resolution images embedded in the slides.
- `transcription-raw.md`: ordered native slide text plus automated OCR for every page/source image.
- `transcription-clean.md`: layout-aware cleaned transcription, organized by slide, source image, page region, and datasheet/column.
- `review-required.md`: direct-image review queue for every region below the conservative OCR confidence threshold.
- `ocr/`: one JSON record per OCR input, including every detected token, its bounding box, confidence, and applied rotation.
- `clean-ocr/`: page-, column-, and datasheet-shaped secondary OCR artifacts used to restore reading order without replacing the raw extraction.
- `manifest.json`: slide IDs, slide order, native text, source URLs, and image geometry.
- `ocr-summary.json`: compact OCR coverage and quality summary.
- `download-report.json`: downloaded-file list, byte sizes, and reported MIME types.

## Coverage

- Slides discovered: 33
- Rendered slide pages downloaded: 33
- Embedded source images downloaded: 35
- OCR inputs completed: 36 (35 source images plus slide 1, which has no embedded source image)

The raw OCR is a completeness artifact, not a verified rules source. Photographed pages contain skew, glare, small type, symbols, and multi-column layouts. Before changing Warforge game data, each extracted rule must be checked against its source image and recorded with a document version and validity date.

The cleaned transcription never substitutes inferred rules for unreadable text. Low-confidence regions remain visibly marked and are indexed in `review-required.md`; the raw OCR and every downloaded image remain available for audit.
