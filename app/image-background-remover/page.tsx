import type { Metadata } from "next";
import { ProductStudioPage } from "@/components/product-studio-page";
import { canonicalUrl } from "@/lib/site-metadata";

const canonical = canonicalUrl("/image-background-remover");

export const metadata: Metadata = {
  title: { absolute: "Product Photo Background Remover | MainPic" },
  description:
    "Remove a product photo background, then export a transparent PNG or a marketplace-ready white background image.",
  ...(canonical ? { alternates: { canonical } } : {}),
};

export default function BackgroundRemoverPage() {
  return <ProductStudioPage variant="background" />;
}
