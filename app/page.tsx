import type { Metadata } from "next";
import JsonLd from "./components/JsonLd";
import Storefront from "./components/Storefront";
import { contacts } from "./components/data";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from "./lib/site";

export const metadata: Metadata = {
  // Шаблон «%s — Family Camping» з layout на головну не діє — задаємо повністю
  title: { absolute: `${SITE_NAME} — туристичне спорядження для сімейного відпочинку` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "OnlineStore",
            name: SITE_NAME,
            url: SITE_URL,
            logo: absoluteUrl("/family-camping-lake.webp"),
            description: SITE_DESCRIPTION,
            email: contacts.email,
            telephone: "+380800330121",
            areaServed: "UA",
            foundingDate: "2014",
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SITE_NAME,
            url: SITE_URL,
            inLanguage: "uk",
            // Пошук по сайту прямо з результатів Google
            potentialAction: {
              "@type": "SearchAction",
              target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/catalog?q={search_term_string}` },
              "query-input": "required name=search_term_string",
            },
          },
        ]}
      />
      <Storefront />
    </>
  );
}
