import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Amazon Product Photo Maker | ListingReady",
    template: "%s | ListingReady",
  },
  description:
    "Turn ordinary product photos into listing-ready Amazon images with a pure white background, automatic centering, sizing, and compliance checks.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
