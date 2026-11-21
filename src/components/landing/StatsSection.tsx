import { marketingMessages } from "@/lib/marketing/messages";
import { useEffect, useRef, useState } from "react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Building2, TrendingUp, Star, Clock } from "lucide-react";

interface Stat {
  icon: React.ElementType;
  display?: string;
  prefix: string;
  value: number;
  suffix: string;
  decimals?: number;
  // Valore di partenza dell'animazione: i rating non devono mai mostrare
  // valori bassi intermedi (es. "3.0/5" a metà count-up).
  startFrom?: number;
  label: string;
  sublabel: string;
}

const stats: Stat[] = [
  { icon: Building2, prefix: "", value: 150, suffix: "+", display: marketingMessages.companies,
    label: "Scelgono Edilizia in Cloud", sublabel: "per collegare ufficio e cantiere" },
  { icon: TrendingUp, prefix: "", value: 0, suffix: "", display: "Meno doppioni",
    label: "Risparmio da misurare", sublabel: "sui processi e sui dati della tua impresa" },
  { icon: Star, prefix: "", value: 0, suffix: "", display: "Un solo flusso",
    label: "Dal preventivo al margine", sublabel: "ore, materiali e fatture sulla commessa" },
  { icon: Clock, prefix: "", value: 0, suffix: "", display: marketingMessages.activation,
    label: "Con il nostro team", sublabel: "tempi concordati in base ai dati da importare" },
];

function useCountUp(target: number, duration: number, active: boolean, decimals = 0, startFrom = 0) {
  const [count, setCount] = useState(startFrom);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(parseFloat((startFrom + eased * (target - startFrom)).toFixed(decimals)));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startTimeRef.current = null;
    };
  }, [active, target, duration, decimals, startFrom]);

  return count;
}

function StatCard({ stat, isVisible, delay }: { stat: Stat; isVisible: boolean; delay: number }) {
  const count = useCountUp(stat.value, 2000, isVisible, stat.decimals ?? 0, stat.startFrom ?? 0);

  return (
    <div
      className="relative z-10 flex h-full flex-col items-center rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm transition-all duration-700 hover:-translate-y-1 hover:border-eic-orange/40 hover:shadow-lg md:p-7"
      style={{
        transitionDelay: isVisible ? `${delay}ms` : "0ms",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(24px)",
      }}
    >
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: "#FFF1E6", border: "1px solid rgba(249, 116, 21, 0.3)" }}
      >
        <stat.icon size={22} color="#F97415" />
      </div>

      {/* Number */}
      <div className="flex items-baseline gap-1 mb-1">
        {stat.prefix && (
          <span className="text-2xl md:text-3xl font-bold" style={{ color: "#F97415" }}>
            {stat.prefix}
          </span>
        )}
        <span className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ color: "#F97415" }}>
          {stat.display ?? (stat.decimals ? count.toFixed(stat.decimals) : Math.round(count))}
        </span>
        <span className="text-2xl md:text-3xl font-bold" style={{ color: "#F97415" }}>
          {stat.suffix}
        </span>
      </div>

      {/* Label */}
      <p className="text-[#111111] font-semibold text-base md:text-lg mb-1">{stat.label}</p>

      {/* Sublabel */}
      <p className="text-gray-500 text-xs md:text-sm leading-relaxed max-w-[180px]">{stat.sublabel}</p>
    </div>
  );
}

export default function StatsSection() {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.2 });

  return (
    <section className="py-12 md:py-20 relative overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div className="pointer-events-none absolute top-0 left-1/4 h-[360px] w-[480px] rounded-full blur-[120px]" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.14) 0%, transparent 65%)" }} />
      <div ref={ref} className="relative z-10 max-w-6xl mx-auto px-6">
        {/* Heading */}
        <div
          className="text-center mb-8 md:mb-12 transition-all duration-700"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <p
            className="inline-block mb-4 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest"
            style={{
              color: "#C2560C",
              backgroundColor: "#FFF7ED",
              border: "1px solid #FED7AA",
            }}
          >
            Il lavoro collegato
          </p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#111111] mb-4">
            Più controllo, <span style={{ color: "#F97415" }}>ogni giorno</span>
          </h2>
        </div>

        {/* Le quattro schede, collegate da un filo su cui scorrono i dati */}
        <div className="relative">
          <svg aria-hidden="true" viewBox="0 0 1000 40" preserveAspectRatio="none" className="pointer-events-none absolute left-0 right-0 top-1/2 hidden h-10 w-full -translate-y-1/2 md:block">
            <path d="M60 20H940" stroke="#FED7AA" strokeWidth="3" strokeDasharray="6 8" />
            {[0, 1, 2, 3].map((k) => (
              <circle key={k} r="5" cy="0" fill="#F97415">
                <animateMotion dur="5s" begin={`${-k * 1.25}s`} repeatCount="indefinite" path="M60 20H940" />
              </circle>
            ))}
          </svg>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
            {stats.map((stat, i) => (
              <StatCard key={i} stat={stat} isVisible={isVisible} delay={150 + i * 120} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
