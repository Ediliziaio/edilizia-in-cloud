import { useState, useEffect } from "react";
import { Gift, ArrowRight } from "lucide-react";
import { getTimeLeft } from "@/lib/urgencyUtils";

export default function StickyBottomBar() {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" });
  };

  const units = [
    { value: timeLeft.days, label: "giorni", short: "g" },
    { value: timeLeft.hours, label: "ore", short: "h" },
    { value: timeLeft.minutes, label: "min", short: "m" },
    { value: timeLeft.seconds, label: "sec", short: "s" },
  ];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-[#1a2744] via-[#1e2f52] to-[#1a2744] text-white transition-transform duration-500 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      {/* Shimmer border */}
      <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
        <div className="absolute inset-0 bg-[#0fa68c]/60" />
        <div
          className="absolute inset-0 animate-shimmer"
          style={{
            backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(15,166,140,0.9) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
          }}
        />
      </div>

      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-4 md:flex-row md:justify-between md:gap-6">
        {/* Countdown */}
        <div className="flex items-center gap-1.5">
          <span className="relative mr-1.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          {units.map((u) => (
            <div key={u.short} className="flex items-baseline gap-0.5">
              <span className="inline-block min-w-[30px] rounded border border-white/10 bg-white/15 px-1.5 py-0.5 text-center font-mono text-base font-bold leading-tight">
                {String(u.value).padStart(2, "0")}
              </span>
              <span className="hidden text-[11px] text-white/50 md:inline">{u.label}</span>
              <span className="text-[11px] text-white/50 md:hidden">{u.short}</span>
            </div>
          ))}
        </div>

        {/* Text */}
        <p className="flex items-center gap-2 text-center text-xs font-medium leading-snug md:text-sm">
          <Gift size={18} className="shrink-0 text-[#0fa68c]" />
          <span className="line-clamp-2 md:line-clamp-none">
            In regalo: <strong>4 lezioni</strong> in cui ho racchiuso il metodo di vendita per il Settore Edile, come aumentare del <strong>40% le vendite</strong> in Edilizia <strong>(valore 497€)</strong>
          </span>
        </p>

        {/* CTA */}
        <button
          onClick={handleClick}
          className="group flex items-center gap-2 whitespace-nowrap rounded-lg bg-[#0fa68c] px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_20px_rgba(15,166,140,0.4)] transition-all hover:scale-105 hover:bg-[#0d9079] hover:shadow-[0_0_30px_rgba(15,166,140,0.6)] animate-pulse-glow"
        >
          Richiedi la Demo Gratuita
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </div>
  );
}
