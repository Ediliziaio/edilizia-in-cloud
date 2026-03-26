import { useRef, useEffect, useState } from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

interface Feature {
  badge: string;
  badgeClass: string;
  title: string;
  subtitle: string;
  bullets: string[];
  link: string;
  mockup: React.ReactNode;
  imageLeft: boolean;
  bg: string;
}

// --- Mockup: Commessa detail ---
function CommessaMockup() {
  return (
    <div className="rounded-2xl bg-[#111111] border border-white/10 shadow-2xl p-5 font-sans text-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white/40 text-xs">Commessa attiva</p>
          <p className="text-white font-bold text-base">Villa Rossi — Ristrutturazione</p>
        </div>
        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
          In Lavorazione
        </span>
      </div>
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-white/40 mb-1">
          <span>Avanzamento lavori</span>
          <span className="text-[#F97415] font-semibold">67%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-white/10">
          <div className="h-2 rounded-full bg-[#F97415]" style={{ width: "67%" }} />
        </div>
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white/[0.05] rounded-xl p-3 text-center">
          <p className="text-white/40 text-[10px] mb-1">Preventivo</p>
          <p className="text-white font-bold text-sm">€ 84.000</p>
        </div>
        <div className="bg-white/[0.05] rounded-xl p-3 text-center">
          <p className="text-white/40 text-[10px] mb-1">Costi Reali</p>
          <p className="text-amber-400 font-bold text-sm">€ 55.200</p>
        </div>
        <div className="bg-white/[0.05] rounded-xl p-3 text-center">
          <p className="text-white/40 text-[10px] mb-1">Margine</p>
          <p className="text-emerald-400 font-bold text-sm">34.2%</p>
        </div>
      </div>
      {/* Alert */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        <p className="text-emerald-400 text-xs font-medium">Margine in linea con il budget. Ottimo lavoro!</p>
      </div>
    </div>
  );
}

// --- Mockup: CRM Pipeline ---
function CrmMockup() {
  const columns = [
    { label: "Lead", color: "#3b82f6", cards: ["Fratelli Martini", "Edil Nuova Roma"] },
    { label: "Trattativa", color: "#8b5cf6", cards: ["Condominio Luce", "Impresa Futura"] },
    { label: "Chiuso", color: "#22c55e", cards: ["Villa Carbone ✓"] },
  ];
  return (
    <div className="rounded-2xl bg-[#111111] border border-white/10 shadow-2xl p-5">
      <p className="text-white/40 text-xs mb-4">Pipeline Opportunità</p>
      <div className="grid grid-cols-3 gap-3">
        {columns.map((col, i) => (
          <div key={i}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
              <span className="text-white/60 text-xs font-semibold">{col.label}</span>
            </div>
            <div className="space-y-2">
              {col.cards.map((card, j) => (
                <div key={j} className="bg-white/[0.06] rounded-lg px-2.5 py-2 border border-white/8">
                  <p className="text-white text-[11px] font-medium">{card}</p>
                  <p className="text-white/30 text-[10px] mt-0.5">Preventivo richiesto</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
        <span className="text-purple-400 text-xs font-semibold">Tasso chiusura:</span>
        <span className="text-white text-xs font-bold">42%</span>
        <span className="ml-auto text-emerald-400 text-xs">+12% vs mese scorso</span>
      </div>
    </div>
  );
}

// --- Mockup: HR Personale ---
function HrMockup() {
  const people = [
    { name: "Luigi Bianchi", ore: "38h", cantiere: "Villa Rossi", costo: "€ 28/h" },
    { name: "Marco Ferrari", ore: "42h", cantiere: "Via Roma 14", costo: "€ 24/h" },
    { name: "Antonio Ricci", ore: "35h", cantiere: "Villa Rossi", costo: "€ 32/h" },
    { name: "Sergio Moretti", ore: "40h", cantiere: "Centro Uff.", costo: "€ 26/h" },
  ];
  return (
    <div className="rounded-2xl bg-[#111111] border border-white/10 shadow-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-white/40 text-xs">Gestione Personale — Settimana corrente</p>
        <span className="text-[#F97415] text-xs font-semibold">4 attivi</span>
      </div>
      <div className="space-y-2">
        {people.map((p, i) => (
          <div key={i} className="flex items-center gap-3 bg-white/[0.04] rounded-lg px-3 py-2.5 border border-white/5">
            <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-amber-400 text-[10px] font-bold">{p.name[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{p.name}</p>
              <p className="text-white/40 text-[10px] truncate">{p.cantiere}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-white text-xs font-bold">{p.ore}</p>
              <p className="text-amber-400 text-[10px]">{p.costo}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Mockup: Finanza / Cassa ---
function FinanzaMockup() {
  const bars = [
    { label: "Gen", value: 62, forecast: false },
    { label: "Feb", value: 78, forecast: false },
    { label: "Mar", value: 55, forecast: false },
    { label: "Apr", value: 83, forecast: true },
    { label: "Mag", value: 70, forecast: true },
    { label: "Giu", value: 90, forecast: true },
  ];
  const scadenze = [
    { fornitore: "Edil Materiali Srl", data: "28 Mar", importo: "€ 4.200", stato: "In scadenza" },
    { fornitore: "Nolan Ponteggi", data: "05 Apr", importo: "€ 1.800", stato: "Programmato" },
  ];
  return (
    <div className="rounded-2xl bg-[#111111] border border-white/10 shadow-2xl p-5">
      <p className="text-white/40 text-xs mb-3">Previsionale Cassa — prossimi 90 giorni</p>
      <div className="flex items-end gap-1.5 h-20 mb-4">
        {bars.map((bar, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-sm"
              style={{
                height: `${bar.value}%`,
                background: bar.forecast
                  ? "linear-gradient(to top, #F9741555, #F9741533)"
                  : "linear-gradient(to top, #F97415, #F97415aa)",
                border: bar.forecast ? "1px dashed #F9741566" : "none",
              }}
            />
            <span className="text-white/30 text-[8px]">{bar.label}</span>
          </div>
        ))}
      </div>
      <p className="text-white/40 text-[10px] mb-2 font-semibold uppercase tracking-wide">Scadenzario Fornitori</p>
      <div className="space-y-1.5">
        {scadenze.map((s, i) => (
          <div key={i} className="flex items-center justify-between text-[11px] bg-white/[0.04] rounded-lg px-3 py-2">
            <span className="text-white/70 font-medium">{s.fornitore}</span>
            <span className="text-white/40">{s.data}</span>
            <span className="text-amber-400 font-bold">{s.importo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const features: Feature[] = [
  {
    badge: "CANTIERI",
    badgeClass: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    title: "Margine reale per cantiere, aggiornato al minuto",
    subtitle: "Basta scoprire che un cantiere è in perdita solo a lavori finiti. Vedi costi effettivi, avanzamento e profitto in diretta — e intervieni prima che il danno sia fatto.",
    bullets: [
      "Margine vs preventivo sempre aggiornato in tempo reale",
      "Alert automatico quando i costi superano il budget",
      "Giornale lavori da mobile — niente più verbali cartacei",
    ],
    link: "#moduli",
    mockup: <CommessaMockup />,
    imageLeft: false,
    bg: "bg-white",
  },
  {
    badge: "MARKETING & CRM",
    badgeClass: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
    title: "Dal primo contatto al contratto firmato — senza uscire dal gestionale",
    subtitle: "CRM visuale, preventivi digitali firmabili online, email e WhatsApp integrati. Sai sempre quante trattative hai aperte e quale sarà il tuo fatturato futuro.",
    bullets: [
      "Pipeline commerciale drag & drop con forecast automatico",
      "Preventivi digitali con firma elettronica integrata — chiudi in 48h",
      "Lead da Facebook e Instagram diretti nel CRM, in tempo reale",
    ],
    link: "#moduli",
    mockup: <CrmMockup />,
    imageLeft: true,
    bg: "bg-[#f8fafb]",
  },
  {
    badge: "HR & PERSONALE",
    badgeClass: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
    title: "Presenze, costi e manodopera: tutto controllato, senza Excel",
    subtitle: "Timbrature da tablet in cantiere, costo reale H per commessa, ferie e permessi gestiti digitalmente. Sai esattamente quanto ti costa ogni operaio su ogni lavoro.",
    bullets: [
      "Timbratura kiosk da tablet — presenze automatiche e certificate",
      "Costo reale manodopera per cantiere, aggiornato ogni ora",
      "Calendario squadre con vista Gantt — zero sovrapposizioni",
    ],
    link: "#moduli",
    mockup: <HrMockup />,
    imageLeft: false,
    bg: "bg-white",
  },
  {
    badge: "FINANZA",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    title: "Cassa, fatture e scadenze sempre sotto controllo — senza sorprese",
    subtitle: "Previsionale di cassa a 90 giorni, fatturazione elettronica SDI nativa e scadenzario automatico con alert. Sai esattamente cosa hai in cassa e cosa ti aspetta domani.",
    bullets: [
      "Fatturazione elettronica SDI nativa — un click per inviare",
      "Forecast cassa a 30/60/90 giorni con scenari multipli",
      "Scadenzario fornitori con alert WhatsApp — zero pagamenti dimenticati",
    ],
    link: "#moduli",
    mockup: <FinanzaMockup />,
    imageLeft: true,
    bg: "bg-[#f8fafb]",
  },
];

// Stagger delays per ogni riga (in ms)
const STAGGER_DELAYS = [0, 120, 240, 360];

function FeatureRow({
  feature,
  index,
  sectionVisible,
}: {
  feature: Feature;
  index: number;
  sectionVisible: boolean;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!sectionVisible) return;
    const delay = STAGGER_DELAYS[index] ?? index * 120;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [sectionVisible, index]);

  const textSide = (
    <div
      className={`flex flex-col justify-center transition-all duration-700 ${
        visible
          ? "opacity-100 translate-x-0"
          : feature.imageLeft
          ? "opacity-0 translate-x-10"
          : "opacity-0 -translate-x-10"
      }`}
    >
      <span className={`inline-block self-start px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4 ${feature.badgeClass}`}>
        {feature.badge}
      </span>
      <h3 className="text-2xl md:text-3xl font-extrabold text-[#111111] leading-tight mb-3">
        {feature.title}
      </h3>
      <p className="text-gray-500 text-base leading-relaxed mb-6">{feature.subtitle}</p>
      <ul className="space-y-3 mb-8">
        {feature.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-3">
            <CheckCircle2 size={18} className="text-[#F97415] flex-shrink-0 mt-0.5" />
            <span className="text-[#111111] text-sm font-medium">{b}</span>
          </li>
        ))}
      </ul>
      <a
        href={feature.link}
        onClick={(e) => { e.preventDefault(); document.querySelector(feature.link)?.scrollIntoView({ behavior: "smooth" }); }}
        className="inline-flex items-center gap-2 text-[#F97415] font-semibold text-sm hover:gap-3 transition-all duration-200 group"
      >
        Scopri di più
        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
      </a>
    </div>
  );

  const mockupSide = (
    <div
      className={`transition-all duration-700 delay-150 min-h-[100px] ${
        visible
          ? "opacity-100 translate-x-0"
          : feature.imageLeft
          ? "opacity-0 -translate-x-10"
          : "opacity-0 translate-x-10"
      }`}
    >
      {feature.mockup}
    </div>
  );

  return (
    <div className={`${feature.bg} py-20 md:py-28`}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center">
          {feature.imageLeft ? (
            <>
              {mockupSide}
              {textSide}
            </>
          ) : (
            <>
              {textSide}
              {mockupSide}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FeatureShowcaseSection() {
  const { ref, isVisible } = useScrollAnimation({
    threshold: 0.05,
    rootMargin: "0px 0px -20px 0px",
  });

  return (
    <section id="features" ref={ref}>
      {features.map((feature, i) => (
        <FeatureRow key={i} feature={feature} index={i} sectionVisible={isVisible} />
      ))}
    </section>
  );
}
