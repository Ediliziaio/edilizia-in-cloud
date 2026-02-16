import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import PainPointsSection from "@/components/landing/PainPointsSection";
import CostTableSection from "@/components/landing/CostTableSection";
import SolutionSection from "@/components/landing/SolutionSection";
import ModulesSection from "@/components/landing/ModulesSection";
import ComparisonSection from "@/components/landing/ComparisonSection";
import TargetSection from "@/components/landing/TargetSection";
import CriteriaSection from "@/components/landing/CriteriaSection";
import PricingSection from "@/components/landing/PricingSection";
import GuaranteeSection from "@/components/landing/GuaranteeSection";
import FinalCtaSection from "@/components/landing/FinalCtaSection";
import LandingFooter from "@/components/landing/LandingFooter";

const WaveDivider = ({ flip = false, fromDark = true }: { flip?: boolean; fromDark?: boolean }) => (
  <div className={`relative h-16 md:h-24 ${flip ? "rotate-180" : ""}`} style={{ marginTop: "-1px", marginBottom: "-1px" }}>
    <svg viewBox="0 0 1440 96" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute w-full h-full" preserveAspectRatio="none">
      <path
        d="M0 96L48 85.3C96 75 192 53 288 48C384 43 480 53 576 58.7C672 64 768 64 864 58.7C960 53 1056 43 1152 42.7C1248 43 1344 53 1392 58.7L1440 64V0H1392C1344 0 1248 0 1152 0C1056 0 960 0 864 0C768 0 672 0 576 0C480 0 384 0 288 0C192 0 96 0 48 0H0V96Z"
        fill={fromDark ? "#0a0a0a" : "#f8f9fa"}
      />
    </svg>
  </div>
);

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <LandingNavbar />
      <HeroSection />
      <PainPointsSection />
      <WaveDivider fromDark />
      <CostTableSection />
      <WaveDivider flip fromDark={false} />
      <SolutionSection />
      <WaveDivider fromDark />
      <ModulesSection />
      <WaveDivider flip fromDark={false} />
      <ComparisonSection />
      <WaveDivider fromDark />
      <TargetSection />
      <WaveDivider flip fromDark={false} />
      <CriteriaSection />
      <WaveDivider fromDark />
      <PricingSection />
      <WaveDivider flip fromDark={false} />
      <GuaranteeSection />
      <FinalCtaSection />
      <LandingFooter />
    </div>
  );
}
