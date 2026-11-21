import { marketingMessages } from "@/lib/marketing/messages";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useEffect, useState } from "react";
import { ShieldCheck, Check, Database, Users } from "lucide-react";

const points = [
  "Setup e onboarding inclusi",
  "Tempi di avvio concordati sui tuoi dati",
  "Risultati misurati sui processi della tua impresa",
];

// I tre traguardi del percorso, uno per ogni punto dell'elenco.
const TRAGUARDI = [
  { label: "Dati importati", Icon: Database },
  { label: "Squadra avviata", Icon: Users },
  { label: "Commessa sotto controllo", Icon: ShieldCheck },
];

/**
 * L'anello del percorso: si riempie passando per i tre traguardi; a ogni traguardo
 * si accende la sua spunta nell'elenco a destra. Finito il giro, riparte dopo una pausa.
 */
function usePercorso(attivo: boolean) {
  // Con prefers-reduced-motion l'anello parte già pieno e resta fermo.
  const fermo = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [tappa, setTappa] = useState(fermo ? 2 : -1);
  useEffect(() => {
    if (!attivo || fermo) return;
    let t: number;
    const avanza = (k: number) => {
      t = window.setTimeout(() => {
        const n = k >= 2 ? -1 : k + 1;
        setTappa(n);
        avanza(n);
      }, k >= 2 ? 3600 : 1300);
    };
    avanza(-1);
    return () => window.clearTimeout(t);
  }, [attivo, fermo]);
  return tappa;
}

function AnelloPercorso({ tappa }: { tappa: number }) {
  const R = 88;
  const C = 2 * Math.PI * R;
  const quota = tappa < 0 ? 0 : (tappa + 1) / 3;
  const corrente = TRAGUARDI[Math.max(0, tappa)];
  const CurrentIcon = corrente.Icon;
  return (
    <div className="relative h-52 w-52 md:h-60 md:w-60">
      <svg viewBox="0 0 220 220" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="110" cy="110" r={R} fill="none" stroke="#FFEDD5" strokeWidth="14" />
        <circle
          cx="110"
          cy="110"
          r={R}
          fill="none"
          stroke="#F97415"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - quota)}
          style={{ transition: tappa < 0 ? "stroke-dashoffset 400ms ease" : "stroke-dashoffset 1100ms cubic-bezier(0.65,0,0.35,1)" }}
        />
        {TRAGUARDI.map((_, i) => {
          const a = ((i + 1) / 3) * Math.PI * 2;
          const fatto = tappa >= i;
          return (
            <g key={i} transform={`translate(${110 + Math.cos(a) * R} ${110 + Math.sin(a) * R})`}>
              <circle r={fatto ? 13 : 10} fill={fatto ? "#F97415" : "#ffffff"} stroke="#F97415" strokeWidth="3" style={{ transition: "all 300ms ease" }} />
              {fatto && <path d="M-5 0l3.5 3.5L5 -4" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" transform="rotate(90)" />}
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white text-center shadow-lg shadow-eic-orange/20">
        <CurrentIcon key={tappa} className="h-9 w-9 text-eic-orange" strokeWidth={2.1} />
        <p className="mt-1.5 px-2 text-[11px] font-extrabold uppercase leading-tight tracking-wide text-[#111111]">
          {tappa < 0 ? "Si parte" : corrente.label}
        </p>
      </div>
    </div>
  );
}

export default function GuaranteeSection() {
  const { ref, isVisible } = useScrollAnimation();
  const tappa = usePercorso(isVisible);

  return (
    <section className="py-16 md:py-24 bg-white relative overflow-hidden">
      {/* subtle glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(249,116,21,0.08) 0%, transparent 70%)",
        }}
      />

      <div ref={ref} className="relative z-10 max-w-6xl mx-auto px-6">
        <div
          className={`max-w-4xl mx-auto rounded-3xl border-2 border-eic-orange/30 bg-gradient-to-br from-white to-eic-orange/5 p-8 md:p-14 shadow-xl transition-all duration-700 ${
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <div className="grid md:grid-cols-[auto_1fr] gap-8 md:gap-12 items-center">
            {/* L'anello del percorso, coi tre traguardi */}
            <div className="flex justify-center md:justify-start">
              <AnelloPercorso tappa={tappa} />
            </div>

            {/* Content */}
            <div>
              <span className="inline-block mb-4 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest text-eic-orange-deep bg-eic-orange/10 border border-eic-orange/20">
                Un percorso concreto
              </span>
              <h2 className="text-3xl md:text-5xl font-extrabold text-[#111111] leading-tight mb-5">
                Dal primo dato <span className="text-eic-orange">al controllo della commessa</span>
              </h2>
              <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-6">
                {marketingMessages.activationDetail} {marketingMessages.savingsDetail}
              </p>

              <ul className="space-y-2.5">
                {points.map((p, i) => {
                  const fatto = tappa >= i;
                  return (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-all duration-300 ${fatto ? "scale-100 bg-eic-orange text-white" : "scale-90 bg-orange-100 text-eic-orange"}`}>
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                      <span className={`text-sm md:text-base font-medium transition-colors duration-300 ${fatto ? "text-[#111111]" : "text-gray-500"}`}>{p}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
