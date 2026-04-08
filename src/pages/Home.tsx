
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import StatsSection from "@/components/landing/StatsSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import FeatureShowcaseSection from "@/components/landing/FeatureShowcaseSection";
import FounderLetterSection from "@/components/landing/FounderLetterSection";
import BonusGiftSection from "@/components/landing/BonusGiftSection";
import PainPointsSection from "@/components/landing/PainPointsSection";
import CostTableSection from "@/components/landing/CostTableSection";
import SolutionSection from "@/components/landing/SolutionSection";
import ModulesSection from "@/components/landing/ModulesSection";
import VideoSection from "@/components/landing/VideoSection";
import ComparisonSection from "@/components/landing/ComparisonSection";
import ScenarioSection from "@/components/landing/ScenarioSection";
import TargetSection from "@/components/landing/TargetSection";
import CriteriaSection from "@/components/landing/CriteriaSection";
import PricingSection from "@/components/landing/PricingSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import FAQSection from "@/components/landing/FAQSection";
import FinalCtaSection from "@/components/landing/FinalCtaSection";
import GaranzieSection from "@/components/landing/GaranzieSection";
import FounderLetterBottom from "@/components/landing/FounderLetterBottom";
import LandingFooter from "@/components/landing/LandingFooter";
import StickyBottomBar from "@/components/landing/StickyBottomBar";


export default function Home() {
  useSEO({
    title: "Gestionale Edilizia con AI — Software n°1 per Imprese Edili | Edilizia in Cloud",
    description: "Il gestionale edilizia con AI più usato in Italia. Cantieri, margini reali, fatturazione elettronica, CRM, HR e intelligenza artificiale in un'unica piattaforma. Prova gratis 31 giorni.",
    canonical: "/",
    keywords: "gestionale edilizia, software gestionale edilizia, software impresa edile, gestione cantieri software, gestionale edilizia con AI, software edilizia intelligenza artificiale, AI impresa edile, ERP edilizia cloud, software costruzioni, gestionale cantieri online, software preventivi edilizia, fatturazione elettronica edilizia, gestionale margini cantieri, software HR edilizia, CRM impresa edile, gestionale edilizia 2026, miglior software impresa edile italiana, software edilizia PMI, gestionale edilizia prezzi, software cantieri digitale",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] pb-24 overflow-x-hidden">
      <JsonLd id="jsonld-breadcrumb-home" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://ediliziaincloud.com/"}
        ]
      }} />
      <JsonLd id="jsonld-offer-home" data={{
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": "https://ediliziaincloud.com/#product",
        "name": "Edilizia in Cloud — Software Gestionale Imprese Edili",
        "description": "Software gestionale completo per imprese edili: gestione cantieri, margini in tempo reale, fatturazione elettronica, CRM, HR e intelligenza artificiale.",
        "image": [
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7a5d2f3f-4a52-4b31-81c9-fc593d582ee7/id-preview-b70db1cf--c34c07f6-5aea-4505-b4c7-9b00cd75679c.lovable.app-1771279786357.png",
          "https://ediliziaincloud.com/icons/icon-512.png"
        ],
        "brand": {
          "@type": "Brand",
          "name": "Edilizia in Cloud"
        },
        "seller": {
          "@type": "Organization",
          "name": "Domus Group S.r.l.",
          "url": "https://ediliziaincloud.com"
        },
        "offers": [
          {
            "@type": "Offer",
            "name": "Piano Starter",
            "price": "79",
            "priceCurrency": "EUR",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "url": "https://ediliziaincloud.com/prezzi",
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
            "name": "Piano Professional",
            "price": "159",
            "priceCurrency": "EUR",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "url": "https://ediliziaincloud.com/prezzi",
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
            "name": "Piano Enterprise",
            "price": "319",
            "priceCurrency": "EUR",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "url": "https://ediliziaincloud.com/prezzi",
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
          }
        ]
      }} />

      <LandingNavbar />
      <HeroSection />
      <StatsSection />
      <HowItWorksSection />
      <FeatureShowcaseSection />
      <FounderLetterSection />
      <BonusGiftSection />
      <PainPointsSection />
      <CostTableSection />
      <SolutionSection />
      <ModulesSection />
      <VideoSection />
      <ComparisonSection />
      <ScenarioSection />
      <TargetSection />
      <CriteriaSection />
      <PricingSection />
      <TestimonialsSection />
      <FAQSection />
      <GaranzieSection />
      <FinalCtaSection />
      <FounderLetterBottom />
      <LandingFooter />
      <StickyBottomBar />
    </div>
  );
}
