# Typography

## Typeface
Peyda is the primary UI family. The supplied package includes Regular 400, Medium 500, SemiBold 600, Bold 700, and ExtraBold 800. Use the real WOFF2 files; do not synthesize weights if the correct file exists.

## Font registration
Place original files in assets/fonts/ and register them:

    @font-face {
      font-family: "Peyda";
      src: url("/assets/fonts/Peyda-Regular.woff2") format("woff2");
      font-style: normal; font-weight: 400; font-display: swap;
    }
    @font-face {
      font-family: "Peyda";
      src: url("/assets/fonts/Peyda-Medium.woff2") format("woff2");
      font-style: normal; font-weight: 500; font-display: swap;
    }
    @font-face {
      font-family: "Peyda";
      src: url("/assets/fonts/Peyda-SemiBold.woff2") format("woff2");
      font-style: normal; font-weight: 600; font-display: swap;
    }
    @font-face {
      font-family: "Peyda";
      src: url("/assets/fonts/Peyda-Bold.woff2") format("woff2");
      font-style: normal; font-weight: 700; font-display: swap;
    }
    @font-face {
      font-family: "Peyda";
      src: url("/assets/fonts/Peyda-ExtraBold.woff2") format("woff2");
      font-style: normal; font-weight: 800; font-display: swap;
    }

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
