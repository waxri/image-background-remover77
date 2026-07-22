import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { canonicalUrl } from "@/lib/site-metadata";

const canonical = canonicalUrl("/terms");

export const metadata: Metadata = {
  title: { absolute: "Terms | ListingReady" },
  description: "Terms for using the ListingReady product photo tool.",
  ...(canonical ? { alternates: { canonical } } : {}),
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      intro="Use ListingReady as a production aid, and review every output before publishing it to a marketplace."
    >
      <section>
        <h2>Marketplace review</h2>
        <p>
          Compliance checks are based on publicly available guidance. They do not guarantee
          approval by Amazon, Shopify, or another marketplace, and category-specific rules
          may still apply.
        </p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>
          You must have the right to process the images you upload. Do not upload illegal,
          infringing, or sensitive material.
        </p>
      </section>
      <section>
        <h2>Service availability</h2>
        <p>
          Background removal depends on third-party infrastructure and may occasionally be
          unavailable. Review and keep your own copies of downloaded results.
        </p>
      </section>
    </LegalPage>
  );
}
