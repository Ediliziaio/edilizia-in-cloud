import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { TrendingUp, Clock, Target, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const cases = [
  {
    icon: TrendingUp,
    metric: "+40%",
    headline: "margini in 6 mesi",
    company: "Impresa Lombarda",
    detail: "25 cantieri/anno",
  },
  {
    icon: Clock,
    metric: "−12 ore",
    headline: "settimanali di amministrazione",
    company: "Studio tecnico Veneto",
    detail: "team di 8 persone",
  },
  {
    icon: Target,
    metric: "ROI",
    headline: "in 90 giorni",
    company: "PMI edile Toscana",
    detail: "fatturato 1,2M€",
  },
];

export default function CaseStudyTeaserSection() {
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section className="py-16 md:py-24 bg-[#f8f9fa]">
      <div ref={ref} className="max-w-6xl mx-auto px-6">
        <h2
          className={`text-3xl md:text-5xl font-extrabold text-[#111111] text-center mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Risultati reali dei nostri <span className="text-[#F97415]">clienti</span>
        </h2>
        <p
          className={`text-gray-500 text-center mb-14 text-lg transition-all duration-700 delay-150 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Numeri veri di imprese edili italiane che hanno smesso di lavorare a sensazione.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {cases.map((c, i) => {
            const Icon = c.icon;
            return (
              <div
                key={i}
                className={`p-8 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:border-[#F97415]/30 transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
                }`}
                style={{ transitionDelay: isVisible ? `${200 + i * 150}ms` : "0ms" }}
              >
                <div className="w-12 h-12 rounded-xl bg-[#F97415]/10 flex items-center justify-center mb-5">
                  <Icon className="w-6 h-6 text-[#F97415]" />
                </div>
                <p className="text-4xl md:text-5xl font-extrabold text-[#111111] mb-1">
                  {c.metric}
                </p>
                <p className="text-base text-gray-700 font-medium mb-4">{c.headline}</p>
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-sm font-bold text-[#111111]">{c.company}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.detail}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={`text-center mt-12 transition-all duration-700 delay-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Link
            to="/casi-studio/"
            className="inline-flex items-center gap-2 text-[#F97415] hover:text-[#C94F06] font-bold text-base group"
          >
            Scopri tutti i casi studio
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
