import type { Metadata } from "next";
import { ProductStudioPage } from "@/components/product-studio-page";
import { FAQ_ITEMS } from "@/lib/site-content";
import { canonicalUrl } from "@/lib/site-metadata";

const canonical = canonicalUrl("/");

export const metadata: Metadata = {
  title: { absolute: "Amazon Product Photo Maker | ListingReady" },
  description:
    "Turn ordinary product photos into listing-ready Amazon images with pure white backgrounds, automatic centering, sizing, and practical compliance checks.",
  ...(canonical ? { alternates: { canonical } } : {}),
};

export default function HomePage() {
  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqStructuredData).replace(/</g, "\\u003c"),
        }}
      />
      <ProductStudioPage variant="amazon" />
    </>
  );
}
