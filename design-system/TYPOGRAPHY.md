# Typography

## Typeface
Peyda is the primary UI family. The supplied package includes Regular 400, Medium 500, SemiBold 600, Bold 700, and ExtraBold 800. Use the original WOFF2 files from assets/fonts/. Do not synthesize weights when the correct file is available and do not substitute a similarly named third-party build.

## Next.js font integration
For the planned Next.js application, prefer next/font/local so fonts are self-hosted, optimized, and included in the build. Example for a project using src/app/fonts.ts (adjust relative paths if the app uses a different directory layout):

    import localFont from "next/font/local";

    export const peyda = localFont({
      src: [
        { path: "../../assets/fonts/Peyda-Regular.woff2", weight: "400", style: "normal" },
        { path: "../../assets/fonts/Peyda-Medium.woff2", weight: "500", style: "normal" },
        { path: "../../assets/fonts/Peyda-SemiBold.woff2", weight: "600", style: "normal" },
        { path: "../../assets/fonts/Peyda-Bold.woff2", weight: "700", style: "normal" },
        { path: "../../assets/fonts/Peyda-ExtraBold.woff2", weight: "800", style: "normal" }
      ],
      variable: "--font-peyda",
      display: "swap",
      fallback: ["Tahoma", "Arial", "sans-serif"]
    });

Apply the generated class or variable at the application root. The CSS font token should resolve to the Peyda variable with system fallbacks. Do not copy font files to a remote CDN.

## Font-face alternative
If the project is not using next/font/local, register the same local files with @font-face. Keep paths relative to the actual CSS file location; do not assume a /assets URL unless the files are in the framework's public directory.

## Type scale
| Role | Size | Weight |
|---|---:|---:|
| Page title | 24–28px | 700 |
| Section title | 18–20px | 600 |
| Card title | 14–16px | 600 |
| Body | 14px | 400 |
| Table body | 13–14px | 400 |
| Labels | 12–13px | 500 |
| KPI value | 26–32px | 700 |
| Helper text | 12px | 400 |

Use tabular numerals for aligned numeric columns and KPI values. Use locale-aware formatters; do not concatenate raw numeric strings. Isolate Latin identifiers and technical codes with LTR direction and Unicode bidi isolation.

Prefer concise plain Persian labels. Avoid all-caps English headings in Persian workflows. Do not truncate amounts, account names, or critical status text without a discoverable way to inspect the full value.
