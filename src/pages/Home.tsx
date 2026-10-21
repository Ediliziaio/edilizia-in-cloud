import { landingFaqs } from "@/lib/marketing/landingFaqs";

import { lazy, Suspense } from "react";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import HeroSection from "@/components/landing/HeroSection";
import { Link } from "react-router-dom";

// v8.6.120 — LandingNavbar lazy: importa 60 icone lucide-react (344KB chunk
// vendor-icons quando raggruppato) bloccava TBT 9.9s desktop. Caricarlo lazy
// permette al LCP di renderizzare prima senza aspettare il parse degli SVG.
// StatsSection ugualmente lazy: usata sotto al hero (~600px scroll su mobile),
// non parte del LCP element.
const LandingNavbar = lazy(() => import("@/components/landing/LandingNavbar"));
const StatsSection = lazy(() => import("@/components/landing/StatsSection"));

// Below-the-fold: lazy-loaded
const AISystemShowcaseSection = lazy(() => import("@/components/landing/AISystemShowcaseSection"));
const PainPointsSection = lazy(() => import("@/components/landing/PainPointsSection"));
const SolutionSection = lazy(() => import("@/components/landing/SolutionSection"));
const ModulesSection = lazy(() => import("@/components/landing/ModulesSection"));
const TestimonialsSection = lazy(() => import("@/components/landing/TestimonialsSection"));
const GuaranteeSection = lazy(() => import("@/components/landing/GuaranteeSection"));
const PricingSection = lazy(() => import("@/components/landing/PricingSection"));
const FAQSection = lazy(() => import("@/components/landing/FAQSection"));
const FinalCtaSection = lazy(() => import("@/components/landing/FinalCtaSection"));
const LandingFooter = lazy(() => import("@/components/landing/LandingFooter"));
const StickyBottomBar = lazy(() => import("@/components/landing/StickyBottomBar"));
const QuickContactModal = lazy(() => import("@/components/landing/QuickContactModal"));

const SectionFallback = () => <div className="h-32" aria-hidden="true" />;


export default function Home() {
  useSEO({
    title: "Gestionale Edilizia in Cloud con AI per Imprese Edili",
    description: "Gestionale edilizia con AI scelto da oltre 150 aziende: cantieri, margini reali per commessa, fatturazione SDI, CRM e HR. Prova 31 giorni.",
    canonical: "/",
    keywords: "gestionale edilizia, software gestionale edilizia, software impresa edile, gestione cantieri software, gestionale edilizia con AI, software edilizia intelligenza artificiale, AI impresa edile, ERP edilizia cloud, software costruzioni, gestionale cantieri online, software preventivi edilizia, fatturazione elettronica edilizia, gestionale margini cantieri, software HR edilizia, CRM impresa edile, gestionale edilizia 2026, miglior software impresa edile italiana, software edilizia PMI, gestionale edilizia prezzi, software cantieri digitale",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] pb-24 overflow-x-hidden">
      <JsonLd id="jsonld-breadcrumb-home" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.ediliziaincloud.com/"}
        ]
      }} />
      {/* Le pagine principali, candidate ai sitelink della ricerca del marchio.
          C'era solo nella vecchia home per i bot, persa quando la home è
          passata al prerender (settembre 2026). Stessa lista della home di
          riserva in functions/_middleware.js. */}
      <JsonLd id="jsonld-navigazione-home" data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Sezioni principali di Edilizia in Cloud",
        "itemListElement": [
          { "@type": "SiteNavigationElement", "position": 1, "name": "Funzionalità", "url": "https://www.ediliziaincloud.com/funzionalita/" },
          { "@type": "SiteNavigationElement", "position": 2, "name": "Prezzi", "url": "https://www.ediliziaincloud.com/prezzi/" },
          { "@type": "SiteNavigationElement", "position": 3, "name": "Gestione Cantieri", "url": "https://www.ediliziaincloud.com/funzionalita/gestione-cantieri/" },
          { "@type": "SiteNavigationElement", "position": 4, "name": "Confronto", "url": "https://www.ediliziaincloud.com/confronto/" },
          { "@type": "SiteNavigationElement", "position": 5, "name": "Gestionale per Imprese Edili", "url": "https://www.ediliziaincloud.com/per/imprese-edili/" },
          { "@type": "SiteNavigationElement", "position": 6, "name": "Demo", "url": "https://www.ediliziaincloud.com/demo/" },
          { "@type": "SiteNavigationElement", "position": 7, "name": "Chi siamo", "url": "https://www.ediliziaincloud.com/chi-siamo/" },
          { "@type": "SiteNavigationElement", "position": 8, "name": "Blog", "url": "https://www.ediliziaincloud.com/blog/" },
        ],
      }} />
      <JsonLd id="jsonld-organization-home" data={{
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": "https://www.ediliziaincloud.com/#organization",
        "name": "Edilizia in Cloud",
        "legalName": "Domus Group S.r.l.",
        "url": "https://www.ediliziaincloud.com",
        "logo": "https://www.ediliziaincloud.com/icons/icon-512.png",
        "vatID": "IT13132010961",
        "address": {
          "@type": "PostalAddress",
          "addressCountry": "IT",
          "addressRegion": "Lombardia"
        },
        "contactPoint": {
          "@type": "ContactPoint",
          "contactType": "customer support",
          "email": "info@ediliziaincloud.com",
          "areaServed": "IT",
          "availableLanguage": ["Italian"]
        },
        // Stessi profili di HubSeoSchema.tsx: e' la stessa Organization e due
        // elenchi divergenti impediscono la riconciliazione dell'entita'.
        // Verificati 2026-08-03; Facebook corretto in "…business" (l'URL
        // precedente non era la pagina ufficiale).
        "sameAs": [
          "https://www.linkedin.com/company/edilizia-in-cloud",
          "https://www.facebook.com/ediliziaincloudbusiness",
          "https://www.instagram.com/ediliziaincloud",
          "https://share.google/tbE8MjJlaiZbQqHxp"
        ]
      }} />
      <JsonLd id="jsonld-software-home" data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "@id": "https://www.ediliziaincloud.com/#software",
        "name": "Edilizia in Cloud",
        "applicationCategory": "BusinessApplication",
        "applicationSubCategory": "Construction Management Software",
        "operatingSystem": "Web, iOS, Android",
        "description": "Software gestionale per imprese edili con AI integrata: gestione cantieri, margini in tempo reale, fatturazione elettronica, CRM, HR.",
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "reviewCount": "127",
          "bestRating": "5",
          "worstRating": "1"
        },
        "softwareVersion": "2026.1",
        "inLanguage": "it-IT",
        "sameAs": ["https://www.wikidata.org/wiki/Q140698655"],
        "publisher": {
          "@id": "https://www.ediliziaincloud.com/#organization"
        }
      }} />
      <JsonLd id="jsonld-offer-home" data={{
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": "https://www.ediliziaincloud.com/#product",
        "name": "Edilizia in Cloud — Software Gestionale Imprese Edili",
        "description": "Software gestionale completo per imprese edili: gestione cantieri, margini in tempo reale, fatturazione elettronica, CRM, HR e intelligenza artificiale.",
        "image": [
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7a5d2f3f-4a52-4b31-81c9-fc593d582ee7/id-preview-b70db1cf--c34c07f6-5aea-4505-b4c7-9b00cd75679c.lovable.app-1771279786357.png",
          "https://www.ediliziaincloud.com/icons/icon-512.png"
        ],
        "brand": {
          "@type": "Brand",
          "name": "Edilizia in Cloud",
          "sameAs": ["https://www.wikidata.org/wiki/Q140698655"]
        },
        "seller": {
          "@type": "Organization",
          "name": "Domus Group S.r.l.",
          "url": "https://www.ediliziaincloud.com"
        },

        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "reviewCount": "127",
          "bestRating": "5",
          "worstRating": "1"
        },
        "review": [
          {
            "@type": "Review",
            "reviewRating": {"@type": "Rating", "ratingValue": "5"},
            "author": {"@type": "Person", "name": "Giuseppe T."},
            "reviewBody": "Finalmente so il margine reale di ogni cantiere. Ho recuperato 3 mesi di lavoro perso in 6 settimane."
          },
          {
            "@type": "Review",
            "reviewRating": {"@type": "Rating", "ratingValue": "5"},
            "author": {"@type": "Person", "name": "Massimo R."},
            "reviewBody": "Il previsionale di cassa mi ha salvato da una crisi di liquidità. Lo consiglio a tutti gli imprenditori edili."
          }
        ]
      }} />
      <JsonLd id="jsonld-faq-home" data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": landingFaqs.map(item => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } }))
      }} />

      {/* LandingNavbar lazy: 60 lucide icons, lo carichiamo SOTTO al hero
          per non bloccare il LCP. Lo spazio è preservato dal min-h del header. */}
      <Suspense fallback={<div className="h-16" aria-hidden="true" />}>
        <LandingNavbar />
      </Suspense>
      <HeroSection />
      <Suspense fallback={<div className="h-32" aria-hidden="true" />}>
        <StatsSection />
      </Suspense>

      {/* content-visibility:auto via .cv-auto-tall: il browser skip rendering
          delle sezioni fuori dal viewport iniziale → main thread libero.
          Ordine di vendita (2026-06): problema → soluzione → prova sociale →
          meccanismo (AI) → catalogo moduli. Prima l'AI showcase veniva
          mostrata a freddo, prima di aver agitato il problema. */}
      <Suspense fallback={<SectionFallback />}>
        <div className="cv-auto-tall">
          <PainPointsSection />
        </div>
        <div className="cv-auto-tall">
          <SolutionSection />
        </div>
        <div className="cv-auto">
          <TestimonialsSection />
        </div>
        <div className="cv-auto-tall">
          <AISystemShowcaseSection />
        </div>
        <div className="cv-auto-tall">
          <ModulesSection />
        </div>
        <div className="cv-auto">
          <GuaranteeSection />
        </div>
        <div className="cv-auto-tall">
          <PricingSection />
        </div>
        <div className="cv-auto">
          <FAQSection />
        </div>
        <div className="cv-auto-short">
          <FinalCtaSection />
        </div>
      </Suspense>

      {/* ── Copertura geografica ───────────────────────────────────────────
          Un solo link alla guida delle città. Le 43 città linkate da qui
          erano un terzo dei link della home: Google le prendeva per pagine
          principali e ne metteva una fra i sitelink del marchio (18/10/2026).
          L'elenco completo resta nella guida /software-gestionale-edilizia/. */}
      <section className="border-t border-gray-200 bg-gray-50/70 py-6 cv-auto-short">
        <p className="max-w-5xl mx-auto px-6 text-center text-xs leading-relaxed text-gray-500 md:text-sm">
          Edilizia in Cloud lavora con imprese edili in tutta Italia.{" "}
          <Link
            to="/software-gestionale-edilizia/"
            className="font-semibold text-eic-orange hover:underline"
          >
            Software gestionale edilizia nelle principali città →
          </Link>
          {" · "}
          <Link
            to="/blog/migliori-software-gestionali-edilizia-confronto/"
            className="font-semibold text-eic-orange hover:underline"
          >
            I migliori software gestionali per l'edilizia a confronto →
          </Link>
        </p>
      </section>

      <Suspense fallback={<SectionFallback />}>
        <LandingFooter />
        <StickyBottomBar />
        <QuickContactModal />
      </Suspense>
    </div>
  );
}
