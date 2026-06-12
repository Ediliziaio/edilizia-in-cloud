/**
 * HubSeoSchema — JSON-LD bundle per le pagine hub (Blog, ChiSiamo, Demo, Prezzi, ecc.)
 * Inietta:
 *   - BreadcrumbList
 *   - Organization (azienda)
 *   - WebSite
 *   - WebPage (con primaryImageOfPage e descrizione)
 *
 * Uso:
 *   <HubSeoSchema
 *     pageName="Blog"
 *     pagePath="/blog"
 *     pageDescription="Articoli e guide su gestionale edilizia"
 *     breadcrumbs={[{ name: "Home", url: "/" }, { name: "Blog", url: "/blog" }]}
 *   />
 */
import { JsonLd } from "./JsonLd";
import { SITE_URL } from "@/hooks/useSEO";

const ORG_LD = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "Edilizia in Cloud",
  url: SITE_URL,
  logo: {
    "@type": "ImageObject",
    url: `${SITE_URL}/og/edilizia-in-cloud-logo.png`,
    width: 512,
    height: 512,
  },
  sameAs: [
    "https://www.linkedin.com/company/edilizia-in-cloud",
    "https://www.facebook.com/ediliziaincloud",
    "https://www.youtube.com/@ediliziaincloud",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    availableLanguage: ["Italian"],
    areaServed: "IT",
    email: "info@ediliziaincloud.com",
  },
  address: {
    "@type": "PostalAddress",
    addressCountry: "IT",
    addressLocality: "Milano",
    addressRegion: "Lombardia",
  },
};

const WEBSITE_LD = {
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: "Edilizia in Cloud",
  description:
    "Software gestionale per imprese edili: cantieri, fatturazione SDI, HR, marketing e cassa in un'unica piattaforma cloud.",
  publisher: { "@id": `${SITE_URL}/#organization` },
  inLanguage: "it-IT",
  // SearchAction RIMOSSO (fix GSC 2026-06): Google scansionava l'URL template
  // letterale /blog?q={search_term_string} e lo segnalava per sempre come
  // "Pagina alternativa con tag canonical", facendo fallire la convalida.
  // Il rich result Sitelinks Searchbox è dismesso da Google da ottobre 2024.
};

interface HubSeoSchemaProps {
  pageName: string;
  pagePath: string;
  pageDescription: string;
  breadcrumbs?: Array<{ name: string; url: string }>;
  /** Optional override of OG image full URL */
  primaryImageUrl?: string;
}

export function HubSeoSchema({
  pageName,
  pagePath,
  pageDescription,
  breadcrumbs,
  primaryImageUrl,
}: HubSeoSchemaProps) {
  const fullUrl = pagePath.startsWith("http") ? pagePath : `${SITE_URL}${pagePath}`;

  const breadcrumbList = breadcrumbs && breadcrumbs.length > 0 ? breadcrumbs : [
    { name: "Home", url: "/" },
    { name: pageName, url: pagePath },
  ];

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${fullUrl}#breadcrumbs`,
    itemListElement: breadcrumbList.map((b, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: b.name,
      item: b.url.startsWith("http") ? b.url : `${SITE_URL}${b.url}`,
    })),
  };

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      ORG_LD,
      WEBSITE_LD,
      {
        "@type": "WebPage",
        "@id": `${fullUrl}#webpage`,
        url: fullUrl,
        name: `${pageName} | Edilizia in Cloud`,
        description: pageDescription,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "it-IT",
        ...(primaryImageUrl && {
          primaryImageOfPage: {
            "@type": "ImageObject",
            url: primaryImageUrl,
          },
        }),
        breadcrumb: { "@id": `${fullUrl}#breadcrumbs` },
      },
    ],
  };

  return (
    <>
      <JsonLd id={`jsonld-graph-${pageName.toLowerCase().replace(/\s+/g, "-")}`} data={graph} />
      <JsonLd id={`jsonld-breadcrumbs-${pageName.toLowerCase().replace(/\s+/g, "-")}`} data={breadcrumbLd} />
    </>
  );
}
