import { useEffect, useRef } from "react";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { trackEvent } from "@/lib/track";
import { AIExamples } from "./components/AIExamples";
import { AgentiAziendali } from "./components/AgentiAziendali";
import { AziendaBrain } from "./components/AziendaBrain";
import { CruscottoKPI } from "./components/CruscottoKPI";
import { CTAFinale } from "./components/CTAFinale";
import { DemoSilvioCTA } from "./components/DemoSilvioCTA";
import { FAQAccordion } from "./components/FAQAccordion";
import { GaranzieTable } from "./components/GaranzieTable";
import { Hero } from "./components/Hero";
import { InfrastruttureGrid } from "./components/InfrastruttureGrid";
import { LandingFooter } from "./components/LandingFooter";
import { LeadMagnet } from "./components/LeadMagnet";
import { LetteraImprenditore } from "./components/LetteraImprenditore";
import { ManifestoMission } from "./components/ManifestoMission";
import { NumberWall } from "./components/NumberWall";
import { NotaFinale } from "./components/NotaFinale";
import { TestimonialCarousel } from "./components/TestimonialCarousel";
import { faq, metadata as landingMetadata } from "./content";

export const metadata = {
  title: "EdiliziaInCloud AI — Margini, cassa e cantieri sotto controllo",
  description:
    "Il gestionale per imprese edili che collega CRM, preventivi, ordini, cantieri, incassi e margini. AI operativa, prova 31 giorni e consulenza gratuita.",
  openGraph: {
    title: "EdiliziaInCloud AI — Margini, cassa e cantieri sotto controllo",
    description:
      "Il gestionale per imprese edili che collega CRM, preventivi, ordini, cantieri, incassi e margini. AI operativa, prova 31 giorni e consulenza gratuita.",
    images: ["/og/landing-ai-imprenditore-edile.png"],
    url: "https://www.ediliziaincloud.com/landing/ai-imprenditore-edile",
    siteName: "EdiliziaInCloud",
    locale: "it_IT",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "https://www.ediliziaincloud.com/landing/ai-imprenditore-edile" },
};

function JsonLd() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "EdiliziaInCloud",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", ratingCount: "100" },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "EdiliziaInCloud",
      url: SITE_URL,
      email: "info@ediliziaincloud.com",
      telephone: "+39 02 87198520",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        {
          "@type": "ListItem",
          position: 2,
          name: "AI per Imprenditore Edile",
          item: `${SITE_URL}/landing/ai-imprenditore-edile`,
        },
      ],
    },
  ];

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

export default function LandingAIImprenditoreEdilePage() {
  const sentScroll75 = useRef(false);

  useSEO({
    title: landingMetadata.title,
    description: landingMetadata.description,
    canonical: landingMetadata.canonical,
    ogImage: `${SITE_URL}${landingMetadata.ogImage}`,
    keywords: "AI edilizia, gestionale edilizia, software imprese edili, margini cantiere, preventivi AI",
  });

  useEffect(() => {
    trackEvent("landing_ai_view");

    const handleScroll = () => {
      if (sentScroll75.current) return;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (pageHeight <= 0) return;
      if (scrollTop / pageHeight >= 0.75) {
        sentScroll75.current = true;
        trackEvent("landing_ai_scroll_75");
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <main className="min-h-screen bg-white font-sans text-eic-ink antialiased">
      <JsonLd />
      <Hero />
      <AIExamples />
      <AziendaBrain />
      <AgentiAziendali />
      <NumberWall />
      <LetteraImprenditore />
      <CruscottoKPI />
      <ManifestoMission />
      <InfrastruttureGrid />
      <TestimonialCarousel />
      <DemoSilvioCTA />
      <GaranzieTable />
      <FAQAccordion />
      <LeadMagnet />
      <NotaFinale />
      <CTAFinale />
      <LandingFooter />
    </main>
  );
}
