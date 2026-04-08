
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
              "returnMethod": "https://schema.org/ReturnByMail",
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
              "returnMethod": "https://schema.org/ReturnByMail",
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
              "returnMethod": "https://schema.org/ReturnByMail",
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
