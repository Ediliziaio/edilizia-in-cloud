import { Gift } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import FounderLetterSection from "@/components/landing/FounderLetterSection";
import PainPointsSection from "@/components/landing/PainPointsSection";
import CostTableSection from "@/components/landing/CostTableSection";
import SolutionSection from "@/components/landing/SolutionSection";
import ModulesSection from "@/components/landing/ModulesSection";
import ComparisonSection from "@/components/landing/ComparisonSection";
import ScenarioSection from "@/components/landing/ScenarioSection";
import TargetSection from "@/components/landing/TargetSection";
import CriteriaSection from "@/components/landing/CriteriaSection";
import PricingSection from "@/components/landing/PricingSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import GuaranteeSection from "@/components/landing/GuaranteeSection";
import BonusGiftSection from "@/components/landing/BonusGiftSection";
import FinalCtaSection from "@/components/landing/FinalCtaSection";
import FounderLetterBottom from "@/components/landing/FounderLetterBottom";
import LandingFooter from "@/components/landing/LandingFooter";

function PromoBanner() {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    document.querySelector("#garanzie")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <a
      href="#garanzie"
      onClick={handleClick}
      className="fixed top-0 left-0 right-0 z-[60] bg-[#0fa68c] text-white py-2 text-center cursor-pointer hover:bg-[#0d9079] transition-colors overflow-hidden"
    >
      <span className="absolute inset-0 animate-shimmer" style={{ backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)", backgroundSize: "200% 100%" }} />
      <span className="relative flex items-center justify-center gap-2 text-xs md:text-sm font-bold tracking-wide">
        <Gift size={16} />
        SE NON TI FA GUADAGNARE, IL PROGRAMMA È GRATIS PER SEMPRE
      </span>
    </a>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-[#1a2744]">
      <PromoBanner />
      <LandingNavbar />
      <HeroSection />
      <FounderLetterSection />
      <PainPointsSection />
      <CostTableSection />
      <SolutionSection />
      <ModulesSection />
      <ComparisonSection />
      <ScenarioSection />
      <TargetSection />
      <CriteriaSection />
      <PricingSection />
      <TestimonialsSection />
      <GuaranteeSection />
      <BonusGiftSection />
      <FinalCtaSection />
      <FounderLetterBottom />
      <LandingFooter />
    </div>
  );
}
