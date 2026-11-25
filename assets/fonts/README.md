# Original Peyda Font Assets

Place the five original WOFF2 files from the supplied assets.zip archive in this directory:
- Peyda-Regular.woff2
- Peyda-Medium.woff2
- Peyda-SemiBold.woff2
- Peyda-Bold.woff2
- Peyda-ExtraBold.woff2

Do not use placeholders or substitute a different build. The expected SHA-256 hashes and local import procedure are documented in ../../design-system/ASSET_MANIFEST.md.

The binary files are not committed yet. Run scripts/import-brand-assets.ps1 from the repository root with the path to the original assets.zip. This directory is intentionally documented so the coding agent does not silently fall back to a different font.
