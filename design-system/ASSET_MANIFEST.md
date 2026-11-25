# Brand Asset Manifest

Source of truth: the user-supplied assets.zip archive.

## Official SVG assets
| Source archive path | Repository path | Status |
|---|---|---|
| assets/images/af-logo.svg | assets/brand/af-logo.svg | Committed |
| assets/images/typography-fa.svg | assets/brand/wordmark-fa.svg | Committed |
| assets/images/typography-en.svg | assets/brand/wordmark-en.svg | Committed |
| assets/images/isometric.svg | assets/brand/isometric.svg | Pending |

The logo symbol and both wordmarks preserve the supplied #102333 brand artwork. Do not recreate them using text, stretch their aspect ratio, or apply CSS filters that alter the brand color. The isometric artwork is decorative; use sparingly and never behind financial data.

## Peyda font files
The archive contains these exact WOFF2 files:

| File | Weight | Original size | SHA-256 |
|---|---:|---:|---|
| Peyda-Regular.woff2 | 400 | 38,800 bytes | 5b5cc58273a0f9dfe44c8a13fe93f8b71065c8c05c84ed0c0b5cb85ba0a6bb34 |
| Peyda-Medium.woff2 | 500 | 39,156 bytes | b2de29c2bd24246921b0b90c48e178a27d3c675dda7f2ce60c113d8d0de0c493 |
| Peyda-SemiBold.woff2 | 600 | 38,588 bytes | 79fe2881777e201f2b09407cbac3c9cb6d2d47881c9c418ea7b9aecd6b58ac66 |
| Peyda-Bold.woff2 | 700 | 37,032 bytes | e07bb6c2625519867601d596eb586d763a3da4b6bd77bdc521d7b0e2b63cf875 |
| Peyda-ExtraBold.woff2 | 800 | 38,564 bytes | 54d316a372eaed9a837e1ef8f1f0d43b4b3b5576b3b5baddd9e7122f91d5e85a |

Required destination: assets/fonts/. These are binary WOFF2 files. They must be copied byte-for-byte from the supplied archive; do not replace them with a similarly named font from another repository or CDN.

## Import procedure
Run the repository script from the project root:
`powershell -ExecutionPolicy Bypass -File .\scripts\import-brand-assets.ps1 -ArchivePath <path-to-assets.zip>`

The script extracts the original archive entries and verifies the SHA-256 hashes of the five fonts. It must fail if the supplied archive is missing or any font does not match.

## Current status
- Logo symbol: committed.
- Persian wordmark: committed.
- English wordmark: committed.
- Isometric illustration: not yet committed.
- Five original Peyda WOFF2 binaries: identified and hash-verified in the attached archive, but not yet uploaded to GitHub by the repository text-file integration. Use the import script from a local checkout to add them as binary files.

## Do not
- recreate wordmarks with a generic font;
- stretch, rotate, crop, or recolor the official logo assets;
- substitute another Peyda build without owner approval;
- use the isometric illustration behind tables, forms, or amounts.
