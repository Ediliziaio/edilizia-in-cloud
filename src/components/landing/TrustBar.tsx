import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Shield, Server, CreditCard, FileCheck, Lock } from "lucide-react";

const badges = [
  { icon: Shield, label: "GDPR compliant" },
  { icon: Server, label: "Dati cifrati" },
  { icon: CreditCard, label: "Pagamenti Stripe sicuri" },
  { icon: FileCheck, label: "P.IVA IT13132010961" },
  { icon: Lock, label: "SDI accreditato" },
];

export default function TrustBar() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section
      aria-label="Garanzie e conformità"
      className="py-8 md:py-10 bg-white border-y border-gray-100"
    >
      <div
        ref={ref}
        className={`max-w-6xl mx-auto px-6 transition-all duration-700 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 md:gap-x-10">
          {badges.map((b, i) => {
            const Icon = b.icon;
            return (
              <li
                key={i}
                className="flex items-center gap-2 text-xs md:text-sm font-medium text-gray-600"
              >
                <Icon className="w-4 h-4 md:w-5 md:h-5 text-[#F97415] flex-shrink-0" />
                <span>{b.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
