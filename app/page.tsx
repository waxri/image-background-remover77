import type { Metadata } from "next";
import { ProductStudioPage } from "@/components/product-studio-page";

export const metadata: Metadata = {
  title: { absolute: "Amazon Product Photo Maker | ListingReady" },
};

export default function HomePage() {
  return <ProductStudioPage variant="amazon" />;
}
