
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
import GuaranteeSection from "@/components/landing/GuaranteeSection";
import FinalCtaSection from "@/components/landing/FinalCtaSection";
import FounderLetterBottom from "@/components/landing/FounderLetterBottom";
import LandingFooter from "@/components/landing/LandingFooter";
import StickyBottomBar from "@/components/landing/StickyBottomBar";

function PromoBanner() {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    document.querySelector("#garanzie")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <a
      href="#garanzie"
      onClick={handleClick}
      className="fixed top-0 left-0 right-0 z-[60] bg-[#F97415] text-white py-2 text-center cursor-pointer hover:bg-[#e8650e] transition-colors overflow-hidden"
    >
      <span className="absolute inset-0 animate-shimmer" style={{ backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)", backgroundSize: "200% 100%" }} />
      <span className="relative flex items-center justify-center gap-2 text-xs md:text-sm font-bold tracking-wide">
        SE NON TI FA GUADAGNARE, IL PROGRAMMA È GRATIS PER SEMPRE
      </span>
    </a>
  );
}

export default function Home() {
  useSEO({
    title: "Edilizia in Cloud — Software Gestionale per Imprese Edili",
    description: "Il software gestionale n°1 per imprese edili italiane. Gestisci cantieri, margini, HR, marketing e fatturazione in un'unica piattaforma. Prova gratuita 30 giorni.",
    canonical: "/home",
    keywords: "software gestionale edilizia, gestionale imprese edili, software cantiere, gestione cantieri, preventivi edilizia, fatturazione edilizia, software costruzioni italiane",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] pb-24 overflow-x-hidden">
      <JsonLd id="jsonld-home" data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          { "@type": "Question", "name": "Quanto costa Edilizia in Cloud?", "acceptedAnswer": { "@type": "Answer", "text": "I piani partono da €79/mese per il piano Starter, fino a €319/mese per Enterprise. Tutti i piani includono 30 giorni di prova gratuita." }},
          { "@type": "Question", "name": "In quanto tempo si imposta il software?", "acceptedAnswer": { "@type": "Answer", "text": "Il setup completo richiede 48 ore. Il nostro team ti affianca nella configurazione iniziale e nella migrazione dei dati." }},
          { "@type": "Question", "name": "Il software funziona anche dal cantiere?", "acceptedAnswer": { "@type": "Answer", "text": "Sì, Edilizia in Cloud è accessibile da qualsiasi dispositivo: smartphone, tablet e computer, anche con connessione limitata." }},
          { "@type": "Question", "name": "I dati sono al sicuro?", "acceptedAnswer": { "@type": "Answer", "text": "Sì, tutti i dati sono conservati su server in Europa, conformi al GDPR, con backup automatico giornaliero e crittografia end-to-end." }}
        ]
      }} />

      <JsonLd id="jsonld-faq-home" data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Devo essere esperto di informatica per usare Edilizia in Cloud?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "No. Il sistema è progettato per imprenditori edili, non per informatici. L'interfaccia è intuitiva e il nostro team ti configura tutto in 48 ore."
            }
          },
          {
            "@type": "Question",
            "name": "Quanto costa Edilizia in Cloud?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "I piani partono da €79/mese (Starter). Il piano Professional è a €159/mese e include CRM, marketing e HR. Tutti i piani includono 30 giorni di prova gratuita."
            }
          },
          {
            "@type": "Question",
            "name": "Posso importare i dati che ho su Excel?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì. Il team di onboarding migra i tuoi dati esistenti gratuitamente: Excel, CSV o altri gestionali. Di solito bastano 48 ore per essere operativi."
            }
          },
          {
            "@type": "Question",
            "name": "Funziona da smartphone e tablet in cantiere?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, completamente. App mobile nativa per iOS e Android con modalità offline per zone senza segnale."
            }
          },
          {
            "@type": "Question",
            "name": "Posso disdire quando voglio?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Sì, puoi disdire in qualsiasi momento senza penali. E se il software non ti fa guadagnare più di quanto spendi, è gratis per sempre — garanzia scritta."
            }
          }
        ]
      }} />

      <JsonLd id="jsonld-offer-home" data={{
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Edilizia in Cloud — Software Gestionale Imprese Edili",
        "description": "Software gestionale completo per imprese edili: gestione cantieri, margini in tempo reale, fatturazione elettronica, CRM, HR e intelligenza artificiale.",
        "brand": {
          "@type": "Brand",
          "name": "Edilizia in Cloud"
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
            "description": "Gestione cantieri, finanza e documenti base"
          },
          {
            "@type": "Offer",
            "name": "Piano Professional",
            "price": "159",
            "priceCurrency": "EUR",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "url": "https://ediliziaincloud.com/prezzi",
            "description": "Tutto Starter + CRM, marketing, HR completo e AI"
          },
          {
            "@type": "Offer",
            "name": "Piano Enterprise",
            "price": "319",
            "priceCurrency": "EUR",
            "priceValidUntil": "2026-12-31",
            "availability": "https://schema.org/InStock",
            "url": "https://ediliziaincloud.com/prezzi",
            "description": "Multi-azienda, API, supporto dedicato"
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

      <PromoBanner />
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
      <GuaranteeSection />
      <FinalCtaSection />
      <FounderLetterBottom />
      <LandingFooter />
      <StickyBottomBar />
    </div>
  );
}
