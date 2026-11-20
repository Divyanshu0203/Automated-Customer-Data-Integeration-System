import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Customer Data Integration",
  description:
    "Merge customer data from multiple CSV/JSON sources, clean and deduplicate it, and analyze feedback sentiment.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}