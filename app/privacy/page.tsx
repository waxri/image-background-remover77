import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { canonicalUrl } from "@/lib/site-metadata";

const canonical = canonicalUrl("/privacy");

export const metadata: Metadata = {
  title: { absolute: "Privacy | MainPic" },
  description: "How MainPic handles product photos and request data.",
  ...(canonical ? { alternates: { canonical } } : {}),
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro="MainPic is designed to process product photos without building a permanent image library."
    >
      <section>
        <h2>Product photos</h2>
        <p>
          Photos are sent through our Cloudflare request handler to our background-removal
          provider for the current request. MainPic does not write the original or
          generated image to D1, KV, or R2 storage.
        </p>
      </section>
      <section>
        <h2>Operational data</h2>
        <p>
          We may record request status, processing duration, broad file-size buckets, and
          error categories. We do not send image pixels, file names, SKUs, or download files
          to product analytics.
        </p>
      </section>
      <section>
        <h2>Third-party processing</h2>
        <p>
          Background removal is provided by Remove.bg. Cloudflare provides hosting,
          request handling, bot protection, and optional short-lived rate limiting.
        </p>
      </section>
    </LegalPage>
  );
}
