import type { Metadata } from "next";
import "./globals.css";

// Load the design system's fonts with next/font (e.g. `import { Archivo } from "next/font/google"`)
// and add their CSS variables to <html>.

export const metadata: Metadata = {
  title: "Site",
  description: "",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
