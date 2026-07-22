import type { Metadata } from "next";
import { ProductStudioPage } from "@/components/product-studio-page";

export const metadata: Metadata = {
  title: { absolute: "Product Photo Background Remover | ListingReady" },
  description:
    "Remove a product photo background, then export a transparent PNG or a marketplace-ready white background image.",
};

export default function BackgroundRemoverPage() {
  return <ProductStudioPage variant="background" />;
}
