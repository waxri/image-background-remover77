import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Image Background Remover - Remove Background Online",
  description:
    "Remove image backgrounds online and download a transparent PNG in seconds. Upload a JPG, PNG, or WebP image and erase the background automatically.",
  keywords: [
    "image background remover",
    "remove background from image",
    "background remover",
    "transparent background maker",
    "remove image background online",
    "PNG background remover",
  ],
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
