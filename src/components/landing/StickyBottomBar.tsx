import { useState, useEffect } from "react";
import { Gift } from "lucide-react";

function getTimeLeft() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const diff = Math.max(0, end.getTime() - now.getTime());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

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
    { value: timeLeft.days, label: "g" },
    { value: timeLeft.hours, label: "h" },
    { value: timeLeft.minutes, label: "m" },
    { value: timeLeft.seconds, label: "s" },
  ];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 border-t-2 border-[#0fa68c] bg-[#1a2744] text-white transition-transform duration-500 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-3 md:flex-row md:justify-between md:gap-6">
        {/* Countdown */}
        <div className="flex items-center gap-1.5">
          {units.map((u) => (
            <div key={u.label} className="flex items-baseline gap-0.5">
              <span className="inline-block min-w-[28px] rounded bg-white/10 px-1.5 py-0.5 text-center font-mono text-base font-bold leading-tight">
                {String(u.value).padStart(2, "0")}
              </span>
              <span className="text-xs text-white/60">{u.label}</span>
            </div>
          ))}
        </div>

        {/* Text */}
        <p className="flex items-center gap-2 text-center text-xs font-medium md:text-sm">
          <Gift size={16} className="shrink-0 text-[#0fa68c]" />
          <span>
            In regalo: <strong>Corso Vendita Edile</strong> (4 lezioni, +40% vendite)
          </span>
        </p>

        {/* CTA */}
        <button
          onClick={handleClick}
          className="whitespace-nowrap rounded-lg bg-[#0fa68c] px-5 py-2 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#0d9079]"
        >
          Richiedi la Demo Gratuita
        </button>
      </div>
    </div>
  );
}
