# Brand Asset Manifest

Source: supplied assets.zip archive.

## Official SVG assets
The original official logo symbol has been copied without altering its geometry:

| Source archive path | Repository path | Status |
|---|---|---|
| assets/images/af-logo.svg | assets/brand/af-logo.svg | Included |
| assets/images/typography-fa.svg | assets/brand/wordmark-fa.svg | Not yet copied |
| assets/images/typography-en.svg | assets/brand/wordmark-en.svg | Not yet copied |
| assets/images/isometric.svg | assets/brand/isometric.svg | Not yet copied |

The artwork uses brand navy #102333. Preserve aspect ratio and color. Provide meaningful alternative text for informative use; use empty alt text for decorative instances.

## Peyda fonts
The archive contains Peyda-Regular.woff2, Peyda-Medium.woff2, Peyda-SemiBold.woff2, Peyda-Bold.woff2, and Peyda-ExtraBold.woff2. Required destination: assets/fonts/. Register using TYPOGRAPHY.md.

## Asset status and next action
The supplied archive was inspected. The logo symbol is included. The remaining three SVGs and five binary WOFF2 files are not yet committed. Copy them byte-for-byte from the supplied archive into the paths above. Do not create placeholders, approximate the wordmarks, or rename a different font to Peyda. If a GitHub integration cannot upload binary assets, add the original files locally in a separate commit.

## Do not
- recreate the wordmark using a generic font;
- stretch, rotate, crop, or recolor the logo;
- use isometric artwork behind tables or amounts;
- add stock illustrations that conflict with the supplied identity.
