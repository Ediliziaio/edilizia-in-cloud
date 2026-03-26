import { useRef, useEffect, useState } from "react";
import { CheckCircle2, ArrowRight } from "lucide-react";

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
    <div className="rounded-2xl bg-[#0f1a2e] border border-white/10 shadow-2xl p-5 font-sans text-sm">
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
          <span className="text-[#0fa68c] font-semibold">67%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-white/10">
          <div className="h-2 rounded-full bg-[#0fa68c]" style={{ width: "67%" }} />
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
    <div className="rounded-2xl bg-[#0f1a2e] border border-white/10 shadow-2xl p-5">
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
    <div className="rounded-2xl bg-[#0f1a2e] border border-white/10 shadow-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-white/40 text-xs">Gestione Personale — Settimana corrente</p>
        <span className="text-[#0fa68c] text-xs font-semibold">4 attivi</span>
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
    <div className="rounded-2xl bg-[#0f1a2e] border border-white/10 shadow-2xl p-5">
      <p className="text-white/40 text-xs mb-3">Previsionale Cassa — prossimi 90 giorni</p>
      <div className="flex items-end gap-1.5 h-20 mb-4">
        {bars.map((bar, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-sm"
              style={{
                height: `${bar.value}%`,
                background: bar.forecast
                  ? "linear-gradient(to top, #0fa68c55, #0fa68c33)"
                  : "linear-gradient(to top, #0fa68c, #0fa68caa)",
                border: bar.forecast ? "1px dashed #0fa68c66" : "none",
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
    title: "Sai esattamente quanto guadagni su ogni cantiere",
    subtitle: "Smetti di scoprire il margine reale solo a cantiere chiuso. Monitora costi, avanzamento e profitto in tempo reale.",
    bullets: [
      "Margine reale aggiornato al centesimo",
      "Alert quando i costi superano il budget",
      "Storico completo di ogni variazione",
    ],
    link: "#moduli",
    mockup: <CommessaMockup />,
    imageLeft: false,
    bg: "bg-white",
  },
  {
    badge: "MARKETING",
    badgeClass: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
    title: "Acquisisci clienti con CRM e preventivi integrati",
    subtitle: "Dal primo contatto al contratto firmato: gestisci l'intera pipeline commerciale senza uscire dal gestionale.",
    bullets: [
      "Pipeline vendite visuale drag & drop",
      "Preventivi digitali firmabili online",
      "Email e WhatsApp integrati",
    ],
    link: "#moduli",
    mockup: <CrmMockup />,
    imageLeft: true,
    bg: "bg-[#f8fafb]",
  },
  {
    badge: "HR",
    badgeClass: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
    title: "Gestisci il tuo personale senza fogli Excel",
    subtitle: "Timbrature, costi reali manodopera, ferie e presenze: tutto centralizzato, accessibile da qualsiasi dispositivo.",
    bullets: [
      "Timbrature da app mobile",
      "Costo reale manodopera per cantiere",
      "Ferie, permessi e presenze centralizzate",
    ],
    link: "#moduli",
    mockup: <HrMockup />,
    imageLeft: false,
    bg: "bg-white",
  },
  {
    badge: "FINANZA",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    title: "Fatturazione elettronica e cassa sempre sotto controllo",
    subtitle: "Previsionale di cassa a 90 giorni, SDI nativo e scadenzario automatico. Zero sorprese di liquidità.",
    bullets: [
      "Fatturazione elettronica SDI nativa",
      "Previsionale cassa a 90 giorni",
      "Prima nota e scadenzario automatici",
    ],
    link: "#moduli",
    mockup: <FinanzaMockup />,
    imageLeft: true,
    bg: "bg-[#f8fafb]",
  },
];

function FeatureRow({ feature, index }: { feature: Feature; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      <h3 className="text-2xl md:text-3xl font-extrabold text-[#1a2744] leading-tight mb-3">
        {feature.title}
      </h3>
      <p className="text-gray-500 text-base leading-relaxed mb-6">{feature.subtitle}</p>
      <ul className="space-y-3 mb-8">
        {feature.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-3">
            <CheckCircle2 size={18} className="text-[#0fa68c] flex-shrink-0 mt-0.5" />
            <span className="text-[#1a2744] text-sm font-medium">{b}</span>
          </li>
        ))}
      </ul>
      <a
        href={feature.link}
        onClick={(e) => { e.preventDefault(); document.querySelector(feature.link)?.scrollIntoView({ behavior: "smooth" }); }}
        className="inline-flex items-center gap-2 text-[#0fa68c] font-semibold text-sm hover:gap-3 transition-all duration-200 group"
      >
        Scopri di più
        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
      </a>
    </div>
  );

  const mockupSide = (
    <div
      className={`transition-all duration-700 delay-150 ${
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
    <div ref={ref} className={`${feature.bg} py-20 md:py-28`}>
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
  return (
    <section id="features">
      {features.map((feature, i) => (
        <FeatureRow key={i} feature={feature} index={i} />
      ))}
    </section>
  );
}
