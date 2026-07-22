import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { canonicalUrl } from "@/lib/site-metadata";

const canonical = canonicalUrl("/contact");

export const metadata: Metadata = {
  title: { absolute: "Contact | ListingReady" },
  description: "Contact ListingReady about product photo processing and early access.",
  ...(canonical ? { alternates: { canonical } } : {}),
};

export default function ContactPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

  return (
    <LegalPage
      title="Contact"
      intro="Tell us what you sell, how many images you process, and where the current workflow slows you down."
    >
      <section>
        <h2>Early access and support</h2>
        {supportEmail ? (
          <p>
            Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with the subject
            “ListingReady early access”. Do not attach private product photos unless we
            explicitly ask for a sample and you agree to share it.
          </p>
        ) : (
          <p>The public support address will be added before the production launch.</p>
        )}
      </section>
    </LegalPage>
  );
}
