import { useState, useEffect } from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { getTimeLeft } from "@/lib/urgencyUtils";
import { openContactModal } from "@/components/landing/QuickContactModal";

export default function StickyBottomBar() {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 1800);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openContactModal();
  };

  const units = [
    { value: timeLeft.days, label: "giorni", short: "g" },
    { value: timeLeft.hours, label: "ore", short: "h" },
    { value: timeLeft.minutes, label: "min", short: "m" },
    { value: timeLeft.seconds, label: "sec", short: "s" },
  ];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-[#111111] via-[#1e2f52] to-[#111111] text-white transition-transform duration-500 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      {/* Shimmer border */}
      <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
        <div className="absolute inset-0 bg-[#F97415]/60" />
        <div
          className="absolute inset-0 animate-shimmer"
          style={{
            backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.9) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
          }}
        />
      </div>

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2.5 md:px-4 md:py-4">
        {/* Countdown */}
        <div className="hidden items-center gap-1.5 sm:flex">
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

        {/* Text — short, sticky */}
        <p className="flex min-w-0 items-center gap-2 text-left text-[11px] font-medium leading-snug md:text-sm">
          <ShieldCheck size={16} className="shrink-0 text-[#F97415] md:size-[18px]" />
          <span>
            <strong>31 giorni gratis</strong> per vedere i numeri veri
          </span>
        </p>

        {/* CTA — compact */}
        <button
          onClick={handleClick}
          className="group flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#F97415] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white shadow-[0_0_20px_rgba(249,116,21,0.4)] transition-all hover:scale-105 hover:bg-[#C94F06] hover:shadow-[0_0_30px_rgba(249,116,21,0.6)] md:gap-2 md:px-5 md:py-2.5 md:text-sm animate-pulse-glow"
        >
          Inizia
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-1 md:size-4" />
        </button>
      </div>
    </div>
  );
}
