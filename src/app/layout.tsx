import type { Metadata } from "next";
import "../../design-system/tokens.css";
import "./globals.css";
import { peyda } from "./fonts";

export const metadata: Metadata = {
  title: "فرزام ERP | سامانه مالی آتی فرزام",
  description:
    "سامانه ثبت و بازسازی اطلاعات مالی آتی فرزام — سال مالی ۱۴۰۴",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body className={peyda.variable}>{children}</body>
    </html>
  );
}
