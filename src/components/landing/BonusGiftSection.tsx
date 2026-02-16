import { useState, useEffect } from "react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { BookOpen, ArrowRight } from "lucide-react";
import AIImage from "@/components/landing/AIImage";
import { getTimeLeft, MESI } from "@/lib/urgencyUtils";

export default function BonusGiftSection() {
  const { ref, isVisible } = useScrollAnimation();
  const [timeLeft, setTimeLeft] = useState(getTimeLeft);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const meseCorrente = MESI[now.getMonth()];
  const anno = now.getFullYear();

  const units = [
    { value: timeLeft.days, label: "giorni", short: "g" },
    { value: timeLeft.hours, label: "ore", short: "h" },
    { value: timeLeft.minutes, label: "min", short: "m" },
    { value: timeLeft.seconds, label: "sec", short: "s" },
  ];
  return (
    <section className="py-16 md:py-24 bg-white">
      <div ref={ref} className="max-w-3xl mx-auto px-6 text-center">
        <h2
          className={`text-2xl md:text-4xl font-extrabold text-[#1a2744] mb-10 md:mb-14 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          Se richiedi ora la tua Dimostrazione{" "}
          <span className="text-[#0fa68c]">riceverai subito questo regalo:</span>
        </h2>

        <div
          className={`relative border-2 border-[#0fa68c] rounded-2xl p-6 md:p-10 bg-white shadow-[0_0_30px_rgba(15,166,140,0.1)] transition-all duration-700 delay-200 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Icon */}
          <AIImage
            prompt="A professional flat illustration of a golden gift box opening with light rays, representing a free bonus sales course for construction industry, teal and navy color scheme, clean modern style, white background"
            alt="Corso Metodo Vendita Edile - Regalo gratuito"
            className="w-40 h-40 mx-auto mb-5 rounded-xl"
          />

          <span className="inline-block px-4 py-1 rounded-full text-[10px] font-bold tracking-widest text-[#0fa68c] border border-[#0fa68c]/40 bg-[#0fa68c]/10 mb-5">
            BONUS GRATUITO
          </span>

          <h3 className="text-xl md:text-2xl font-bold text-[#1a2744] mb-4 flex items-center justify-center gap-2">
            <BookOpen className="w-5 h-5 text-[#0fa68c]" />
            Corso Metodo Vendita Edile
          </h3>

          <p className="text-[#1a2744]/60 text-sm md:text-base leading-relaxed max-w-lg mx-auto mb-6">
            4 lezioni in cui ho racchiuso il metodo di vendita per il Settore Edile, come aumentare del 40% le vendite in Edilizia
          </p>

          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0fa68c] text-white text-xs font-bold tracking-wide">
            +40% VENDITE
          </span>

          {/* Countdown */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {units.map((u) => (
              <div key={u.short} className="flex flex-col items-center">
                <span className="inline-block min-w-[44px] rounded-lg border border-[#1a2744]/10 bg-[#1a2744] px-2 py-1.5 text-center font-mono text-lg md:text-xl font-bold leading-tight text-white">
                  {String(u.value).padStart(2, "0")}
                </span>
                <span className="text-[10px] text-[#1a2744]/50 mt-1 hidden md:block">{u.label}</span>
                <span className="text-[10px] text-[#1a2744]/50 mt-1 md:hidden">{u.short}</span>
              </div>
            ))}
          </div>

          {/* Scarcity text */}
          <p className="text-[#1a2744]/60 text-sm mt-4">
            Dopo il <strong className="text-[#1a2744]">{lastDay} {meseCorrente} {anno}</strong>, il corso tornerà in vendita a{" "}
            <span className="line-through text-red-500 font-bold">497€</span>
          </p>
        </div>

        {/* CTA */}
        <div
          className={`mt-10 transition-all duration-700 delay-500 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <a
            href="#cta-finale"
            onClick={(e) => { e.preventDefault(); document.querySelector("#cta-finale")?.scrollIntoView({ behavior: "smooth" }); }}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-[#0fa68c] hover:bg-[#0d9179] text-white font-bold text-base md:text-lg shadow-lg shadow-[#0fa68c]/25 hover:shadow-[#0fa68c]/40 transition-all duration-300 hover:scale-105"
          >
            Richiedi la Demo e Ricevi il Corso
            <ArrowRight className="w-5 h-5" />
          </a>
        </div>
      </div>
    </section>
  );
}
