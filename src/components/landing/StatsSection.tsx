import { useEffect, useRef, useState } from "react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { Building2, TrendingUp, Star, Clock } from "lucide-react";
import FloatingEdiliziaIcons from "./FloatingEdiliziaIcons";

interface Stat {
  icon: React.ElementType;
  prefix: string;
  value: number;
  suffix: string;
  decimals?: number;
  label: string;
  sublabel: string;
}

const stats: Stat[] = [
  {
    icon: Building2,
    prefix: "",
    value: 150,
    suffix: "+",
    label: "Imprese Edili Attive",
    sublabel: "che usano Edilizia in Cloud ogni giorno",
  },
  {
    icon: TrendingUp,
    prefix: "",
    value: 10,
    suffix: "x",
    label: "ROI Medio",
    sublabel: "ritorno stimato nel primo anno di utilizzo",
  },
  {
    icon: Star,
    prefix: "",
    value: 4.9,
    suffix: "/5",
    decimals: 1,
    label: "Soddisfazione Media",
    sublabel: "valutazione media dei nostri clienti attivi",
  },
  {
    icon: Clock,
    prefix: "",
    value: 12,
    suffix: "h",
    label: "Risparmiate/Settimana",
    sublabel: "in media per ogni imprenditore che usa il sistema",
  },
];

function useCountUp(target: number, duration: number, active: boolean, decimals = 0) {
  const [count, setCount] = useState(0);
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
      setCount(parseFloat((eased * target).toFixed(decimals)));

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
  }, [active, target, duration, decimals]);

  return count;
}

function StatCard({ stat, isVisible, delay }: { stat: Stat; isVisible: boolean; delay: number }) {
  const count = useCountUp(stat.value, 2000, isVisible, stat.decimals ?? 0);

  return (
    <div
      className="flex flex-col items-center text-center p-6 md:p-8 transition-all duration-700"
      style={{
        transitionDelay: isVisible ? `${delay}ms` : "0ms",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(24px)",
      }}
    >
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: "rgba(249, 116, 21, 0.15)", border: "1px solid rgba(249, 116, 21, 0.25)" }}
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
        <span className="text-4xl md:text-6xl font-extrabold tracking-tight" style={{ color: "#F97415" }}>
          {stat.decimals ? count.toFixed(stat.decimals) : Math.round(count)}
        </span>
        <span className="text-2xl md:text-3xl font-bold" style={{ color: "#F97415" }}>
          {stat.suffix}
        </span>
      </div>

      {/* Label */}
      <p className="text-white font-semibold text-base md:text-lg mb-1">{stat.label}</p>

      {/* Sublabel */}
      <p className="text-white/40 text-xs md:text-sm leading-relaxed max-w-[180px]">{stat.sublabel}</p>
    </div>
  );
}

export default function StatsSection() {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.2 });

  return (
    <section style={{ backgroundColor: "#111111" }} className="py-12 md:py-20 relative overflow-hidden">
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Bordo top luminoso */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.7) 30%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.7) 70%, transparent 100%)" }} />
      {/* Bordo bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.25) 50%, transparent 100%)" }} />

      {/* Glow orbs — intensificati */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[400px] rounded-full blur-[130px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(249,116,21,0.24) 0%, transparent 65%)" }} />
      <div className="absolute bottom-0 right-1/4 w-[450px] h-[350px] rounded-full blur-[120px] pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(249,116,21,0.18) 0%, transparent 65%)" }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(249,116,21,0.09) 0%, transparent 100%)" }} />

      <FloatingEdiliziaIcons variant={0} />
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
              color: "#F97415",
              backgroundColor: "rgba(249, 116, 21, 0.12)",
              border: "1px solid rgba(249, 116, 21, 0.25)",
            }}
          >
            I Numeri che Contano
          </p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-4">
            Risultati <span style={{ color: "#F97415" }}>Reali</span>, Ogni Giorno
          </h2>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="relative"
              style={{
                borderRight: i < stats.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
              }}
            >
              {/* Divider on mobile: bottom border for top row */}
              {i < 2 && (
                <div
                  className="absolute bottom-0 left-6 right-6 h-px md:hidden"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                />
              )}
              <StatCard stat={stat} isVisible={isVisible} delay={150 + i * 120} />
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
