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
import GuaranteeSection from "@/components/landing/GuaranteeSection";
import FinalCtaSection from "@/components/landing/FinalCtaSection";
import FounderLetterBottom from "@/components/landing/FounderLetterBottom";
import LandingFooter from "@/components/landing/LandingFooter";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-[#1a2744]">
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
      <GuaranteeSection />
      <FinalCtaSection />
      <FounderLetterBottom />
      <LandingFooter />
    </div>
  );
}
