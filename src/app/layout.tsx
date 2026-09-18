import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AttendEase — Attendance Management System",
  description:
    "A streamlined attendance management system for schools and institutes. Set up daily schedules, mark attendance with a fast default-present flow, and export to Google Sheets.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
