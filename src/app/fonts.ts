import localFont from "next/font/local";

/**
 * Original Peyda WOFF2 files (hash-verified against design-system
 * ASSET_MANIFEST.md). Self-hosted via next/font/local — never CDN.
 */
export const peyda = localFont({
  src: [
    { path: "../../assets/fonts/Peyda-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../assets/fonts/Peyda-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../assets/fonts/Peyda-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../../assets/fonts/Peyda-Bold.woff2", weight: "700", style: "normal" },
    { path: "../../assets/fonts/Peyda-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-peyda",
  display: "swap",
  fallback: ["Tahoma", "Arial", "sans-serif"],
});
