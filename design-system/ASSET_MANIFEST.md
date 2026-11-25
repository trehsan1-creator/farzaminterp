# Brand Asset Manifest

Source: supplied assets.zip archive.

## Official SVG assets
Copy the original artwork without changing paths or geometry:
| Source archive path | Recommended repository path | Usage |
|---|---|---|
| assets/images/af-logo.svg | assets/brand/af-logo.svg | Brand symbol |
| assets/images/typography-fa.svg | assets/brand/wordmark-fa.svg | Persian wordmark |
| assets/images/typography-en.svg | assets/brand/wordmark-en.svg | English wordmark |
| assets/images/isometric.svg | assets/brand/isometric.svg | Sparse decorative illustration |

The logo and wordmarks use #102333. Preserve aspect ratio and color. Provide meaningful alternative text for informative use; use empty alt text for decorative instances.

## Peyda fonts
The archive contains Peyda-Regular.woff2, Peyda-Medium.woff2, Peyda-SemiBold.woff2, Peyda-Bold.woff2, and Peyda-ExtraBold.woff2. Required destination: assets/fonts/. Register using TYPOGRAPHY.md.

## Asset status
SVG artwork is included in this repository under assets/brand/. The five font files are binary WOFF2 files and must be copied byte-for-byte from the supplied archive into assets/fonts/. Do not create placeholder fonts or rename a different font to Peyda. If a GitHub integration cannot upload binary assets, add the original files locally in a separate commit.

## Do not
- recreate the wordmark using a generic font;
- stretch, rotate, crop, or recolor the logo;
- use isometric artwork behind tables or amounts;
- add stock illustrations that conflict with the supplied identity.
