
import { lazy, Suspense } from "react";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import StatsSection from "@/components/landing/StatsSection";
import { Link } from "react-router-dom";

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
    title: "Gestionale Edilizia con AI — Software n°1 per Imprese Edili",
    description: "Il gestionale edilizia con AI più usato in Italia. Cantieri, margini reali, fatturazione elettronica, CRM, HR e intelligenza artificiale in un'unica…",
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
        "sameAs": [
          "https://www.linkedin.com/company/edilizia-in-cloud",
          "https://www.facebook.com/ediliziaincloud",
          "https://www.instagram.com/ediliziaincloud"
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
        "offers": {
          "@type": "AggregateOffer",
          "priceCurrency": "EUR",
          "lowPrice": "99",
          "highPrice": "437",
          "offerCount": "3"
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "reviewCount": "127",
          "bestRating": "5",
          "worstRating": "1"
        },
        "softwareVersion": "2026.1",
        "inLanguage": "it-IT",
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
          "name": "Edilizia in Cloud"
        },
        "seller": {
          "@type": "Organization",
          "name": "Domus Group S.r.l.",
          "url": "https://www.ediliziaincloud.com"
        },
        "offers": [
          {
            "@type": "Offer",
            "name": "Piano Gestionale",
            "price": "99",
            "priceCurrency": "EUR",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "url": "https://www.ediliziaincloud.com/prezzi/",
            "description": "Gestione cantieri, finanza e documenti base",
            "shippingDetails": {
              "@type": "OfferShippingDetails",
              "shippingRate": { "@type": "MonetaryAmount", "value": "0", "currency": "EUR" },
              "shippingDestination": { "@type": "DefinedRegion", "addressCountry": "IT" },
              "deliveryTime": {
                "@type": "ShippingDeliveryTime",
                "handlingTime": { "@type": "QuantitativeValue", "minValue": 0, "maxValue": 0, "unitCode": "DAY" },
                "transitTime": { "@type": "QuantitativeValue", "minValue": 0, "maxValue": 0, "unitCode": "DAY" }
              }
            },
            "hasMerchantReturnPolicy": {
              "@type": "MerchantReturnPolicy",
              "applicableCountry": "IT",
              "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
              "merchantReturnDays": 31,
              "returnFees": "https://schema.org/FreeReturn"
            }
          },
          {
            "@type": "Offer",
            "name": "Piano Professionista",
            "price": "197",
            "priceCurrency": "EUR",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "url": "https://www.ediliziaincloud.com/prezzi/",
            "description": "Tutto Starter + CRM, marketing, HR completo e AI",
            "shippingDetails": {
              "@type": "OfferShippingDetails",
              "shippingRate": { "@type": "MonetaryAmount", "value": "0", "currency": "EUR" },
              "shippingDestination": { "@type": "DefinedRegion", "addressCountry": "IT" },
              "deliveryTime": {
                "@type": "ShippingDeliveryTime",
                "handlingTime": { "@type": "QuantitativeValue", "minValue": 0, "maxValue": 0, "unitCode": "DAY" },
                "transitTime": { "@type": "QuantitativeValue", "minValue": 0, "maxValue": 0, "unitCode": "DAY" }
              }
            },
            "hasMerchantReturnPolicy": {
              "@type": "MerchantReturnPolicy",
              "applicableCountry": "IT",
              "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
              "merchantReturnDays": 31,
              "returnFees": "https://schema.org/FreeReturn"
            }
          },
          {
            "@type": "Offer",
            "name": "Piano Impresa AI",
            "price": "437",
            "priceCurrency": "EUR",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "url": "https://www.ediliziaincloud.com/prezzi/",
            "description": "Multi-azienda, API, supporto dedicato",
            "shippingDetails": {
              "@type": "OfferShippingDetails",
              "shippingRate": { "@type": "MonetaryAmount", "value": "0", "currency": "EUR" },
              "shippingDestination": { "@type": "DefinedRegion", "addressCountry": "IT" },
              "deliveryTime": {
                "@type": "ShippingDeliveryTime",
                "handlingTime": { "@type": "QuantitativeValue", "minValue": 0, "maxValue": 0, "unitCode": "DAY" },
                "transitTime": { "@type": "QuantitativeValue", "minValue": 0, "maxValue": 0, "unitCode": "DAY" }
              }
            },
            "hasMerchantReturnPolicy": {
              "@type": "MerchantReturnPolicy",
              "applicableCountry": "IT",
              "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
              "merchantReturnDays": 31,
              "returnFees": "https://schema.org/FreeReturn"
            }
          }
        ],
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
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Devo essere esperto di informatica per usarlo?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No. Il sistema è progettato per imprenditori edili, non per informatici. L'interfaccia è talmente intuitiva che la maggior parte degli utenti la usa autonomamente dopo 2 ore. Il nostro team ti configura tutto in 48 ore e resta disponibile via telefono, email e WhatsApp."
            }
          },
          {
            "@type": "Question",
            "name": "Quanto tempo ci vuole per vedere i primi risultati concreti?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Le prime inefficienze le identifichi nelle prime 2 settimane — commesse in perdita, ore non imputate, fornitori cari. Risultati concreti sui margini in 60-90 giorni. Molte imprese recuperano l'intero costo annuale del software già nel primo trimestre."
            }
          },
          {
            "@type": "Question",
            "name": "Posso importare i dati che ho su Excel o altri gestionali?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì. Il nostro team di onboarding migra i tuoi dati esistenti gratuitamente: Excel, CSV, altri gestionali o anche fogli cartacei. Non perdi nulla e non riparti da zero. Di solito bastano 48 ore per essere operativi."
            }
          },
          {
            "@type": "Question",
            "name": "Funziona anche in cantiere, da smartphone o tablet?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, completamente. App mobile nativa per iOS e Android, con modalità offline per le zone senza segnale. I capocantiere e gli operai aggiornano avanzamento lavori, timbrature e giornale direttamente dal telefono."
            }
          },
          {
            "@type": "Question",
            "name": "Cosa include esattamente la demo gratuita?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Una sessione di 30-45 minuti con un nostro consulente specializzato in imprese edili. Ti mostriamo il software sul tuo caso specifico — non una demo generica — e rispondiamo a tutte le domande. Nessun obbligo d'acquisto."
            }
          },
          {
            "@type": "Question",
            "name": "I miei dati sono al sicuro? Chi li vede?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "I dati sono conservati su server europei, conformi al GDPR, con backup automatici giornalieri e cifratura end-to-end. Solo tu e il tuo team potete accedere ai tuoi dati. Noi non li vendiamo, non li analizziamo e non li cediamo a terzi — mai."
            }
          },
          {
            "@type": "Question",
            "name": "Posso disdire quando voglio? Ci sono penali?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Puoi disdire in qualsiasi momento, senza penali e senza preavviso. E ricorda: se il software non ti fa guadagnare più di quanto spendi, è gratis per sempre — questa è la nostra garanzia scritta."
            }
          },
          {
            "@type": "Question",
            "name": "Edilizia in Cloud gestisce il DURC e la Cassa Edile?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì. Il software traccia le scadenze DURC per la tua impresa e per tutti i subappaltatori registrati, con alert automatici prima della scadenza. La gestione delle presenze è integrata per il corretto calcolo dei contributi Cassa Edile."
            }
          },
          {
            "@type": "Question",
            "name": "Posso usarlo per partecipare agli appalti pubblici?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì. Edilizia in Cloud è progettato anche per le imprese che lavorano con appalti pubblici: gestisce la rendicontazione SAL, il DURC, la documentazione richiesta dalle stazioni appaltanti e i fondi PNRR. Tutta la documentazione è archiviata digitalmente e sempre disponibile per i controlli."
            }
          }
        ]
      }} />

      <LandingNavbar />
      <HeroSection />
      <StatsSection />

      <Suspense fallback={<SectionFallback />}>
        <AISystemShowcaseSection />
        <PainPointsSection />
        <SolutionSection />
        <ModulesSection />
        <TestimonialsSection />
        <GuaranteeSection />
        <PricingSection />
        <FAQSection />
        <FinalCtaSection />
      </Suspense>

      {/* ── Copertura Geografica ─────────────────────────────────────────── */}
      <section className="border-t border-gray-200 bg-gray-50/70 py-8">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="mb-3 text-center text-base font-bold text-[#111111] md:text-lg">Software gestionale edilizia nelle principali città italiane</h2>
          <p className="max-w-3xl mx-auto text-center text-xs leading-relaxed text-gray-500 md:text-sm">
            Edilizia in Cloud è il software gestionale per imprese edili usato in tutta Italia: da Milano a Roma, da Napoli a Torino, abbiamo configurato il sistema per oltre 150 imprese edili nei principali capoluoghi italiani.
          </p>
          <div className="my-4 flex justify-center">
            <Link
              to="/software-gestionale-edilizia/"
              className="text-sm font-semibold text-[#F97415] hover:underline"
            >
              Vedi tutte le 35 città →
            </Link>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { name: "Milano", slug: "milano" },
              { name: "Roma", slug: "roma" },
              { name: "Napoli", slug: "napoli" },
              { name: "Torino", slug: "torino" },
              { name: "Bologna", slug: "bologna" },
              { name: "Firenze", slug: "firenze" },
              { name: "Bari", slug: "bari" },
              { name: "Verona", slug: "verona" },
              { name: "Brescia", slug: "brescia" },
              { name: "Genova", slug: "genova" },
              { name: "Palermo", slug: "palermo" },
              { name: "Catania", slug: "catania" },
              { name: "Venezia", slug: "venezia" },
              { name: "Padova", slug: "padova" },
              { name: "Bergamo", slug: "bergamo" },
              { name: "Modena", slug: "modena" },
              { name: "Parma", slug: "parma" },
              { name: "Salerno", slug: "salerno" },
              { name: "Trieste", slug: "trieste" },
              { name: "Cagliari", slug: "cagliari" },
              { name: "Perugia", slug: "perugia" },
              { name: "Ancona", slug: "ancona" },
              { name: "Reggio Emilia", slug: "reggio-emilia" },
              { name: "Udine", slug: "udine" },
              { name: "Messina", slug: "messina" },
              { name: "Livorno", slug: "livorno" },
              { name: "Prato", slug: "prato" },
              { name: "Vicenza", slug: "vicenza" },
              { name: "Reggio Calabria", slug: "reggio-calabria" },
              { name: "Foggia", slug: "foggia" },
              { name: "Pescara", slug: "pescara" },
              { name: "Taranto", slug: "taranto" },
              { name: "Cosenza", slug: "cosenza" },
              { name: "Trento", slug: "trento" },
              { name: "Bolzano", slug: "bolzano" },
              { name: "Ferrara", slug: "ferrara" },
            ].map((city) => (
              <Link
                key={city.slug}
                to={`/software-gestionale-edilizia-${city.slug}`}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-[#F97415] hover:text-[#F97415] md:text-sm"
              >
                {city.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Suspense fallback={<SectionFallback />}>
        <LandingFooter />
        <StickyBottomBar />
        <QuickContactModal />
      </Suspense>
    </div>
  );
}
