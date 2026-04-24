import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resilient Chat Demo",
  description: "Answer with live system evidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
