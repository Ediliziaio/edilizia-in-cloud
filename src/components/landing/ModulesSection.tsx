import { useState, useRef, useEffect } from "react";
import {
  Building2, HardHat, ClipboardList, ShieldCheck, FileText, ShoppingCart,
  Wallet, TrendingUp, BarChart3, Receipt, FileCheck, Clock,
  Target, Users, Mail, MessageSquare, Bot, Zap, BarChart2, FileSignature,
  DollarSign, CalendarDays,
  Cpu, Workflow,
} from "lucide-react";

interface Module {
  icon: React.ElementType;
  name: string;
  desc: string;
  saving: string;
  category: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Cantieri: "#3b82f6",
  Finanziario: "#0fa68c",
  Marketing: "#8b5cf6",
  HR: "#f59e0b",
  AI: "#ec4899",
};

const ALL_MODULES: Module[] = [
  // Cantieri
  { icon: Building2, name: "Gestione Commesse", desc: "Margine, avanzamento, costi reali per cantiere in tempo reale.", saving: "5-8 ore/sett. eliminate", category: "Cantieri" },
  { icon: HardHat, name: "Marginalità Cantieri", desc: "Analisi profittabilità comparata tra tutti i tuoi cantieri attivi.", saving: "Ottimizzazione margini +15%", category: "Cantieri" },
  { icon: ClipboardList, name: "Giornale dei Lavori", desc: "Registro giornaliero attività in cantiere, accessibile da mobile.", saving: "Zero verbali cartacei", category: "Cantieri" },
  { icon: ShieldCheck, name: "Sicurezza Cantiere", desc: "DPI, formazione, scadenze sicurezza e documenti obbligatori centralizzati.", saving: "100% compliance normativa", category: "Cantieri" },
  { icon: FileText, name: "Documenti Cantiere", desc: "SAL, ordini di variante, verbali e documenti tecnici sempre aggiornati.", saving: "Zero documenti persi", category: "Cantieri" },
  { icon: ShoppingCart, name: "Ordini di Acquisto", desc: "Gestione acquisti materiali da fornitori collegata direttamente alle commesse.", saving: "2.000-8.000 €/anno risparmiati", category: "Cantieri" },

  // Finanziario
  { icon: Wallet, name: "Previsionale di Cassa", desc: "Forecast liquidità a 30/60/90 giorni. Sai esattamente cosa hai domani.", saving: "3.000-15.000 €/anno risparmiati", category: "Finanziario" },
  { icon: TrendingUp, name: "Tesoreria", desc: "Gestione conti correnti, movimenti bancari e riconciliazione automatica.", saving: "3 ore/sett. risparmiate", category: "Finanziario" },
  { icon: BarChart3, name: "Costi Aziendali", desc: "Costi fissi, variabili, overhead: tutto sotto controllo con drill-down per categoria.", saving: "5.000-25.000 €/anno risparmiati", category: "Finanziario" },
  { icon: Receipt, name: "Fatturazione Elettronica", desc: "SDI nativo, DDT, note credito e ciclo passivo integrato in un click.", saving: "2 ore/sett. eliminate", category: "Finanziario" },
  { icon: FileCheck, name: "Prima Nota", desc: "Registro contabile base sempre aggiornato, pronto per il commercialista.", saving: "Zero errori contabili", category: "Finanziario" },
  { icon: Clock, name: "Scadenzario", desc: "Scadenze clienti e fornitori con alert automatici via email e WhatsApp.", saving: "Zero pagamenti dimenticati", category: "Finanziario" },

  // Marketing
  { icon: Target, name: "CRM Contatti", desc: "Anagrafica clienti e lead centralizzata con storico completo di ogni interazione.", saving: "Zero opportunità perse", category: "Marketing" },
  { icon: Users, name: "Pipeline Opportunità", desc: "Gestione trattative commerciali con drag & drop visuale e forecast.", saving: "Tasso chiusura +20%", category: "Marketing" },
  { icon: FileSignature, name: "Preventivi Digitali", desc: "Preventivi firmabili online dal cliente con firma elettronica integrata.", saving: "Chiudi in 48h, non 2 sett.", category: "Marketing" },
  { icon: Mail, name: "Email Marketing", desc: "Campagne email con editor drag & drop e segmentazione avanzata.", saving: "ROI email medio 42:1", category: "Marketing" },
  { icon: MessageSquare, name: "WhatsApp Marketing", desc: "Messaggi e automazioni WhatsApp per comunicare dove sono i tuoi clienti.", saving: "Tasso apertura 98%", category: "Marketing" },
  { icon: Zap, name: "Automazioni", desc: "Flow builder visuale per processi automatici: follow-up, alert, assegnazioni.", saving: "10+ ore/sett. automatizzate", category: "Marketing" },
  { icon: BarChart2, name: "Lead Form Facebook", desc: "Cattura lead da Facebook/Instagram direttamente nel CRM in tempo reale.", saving: "Costo acquisizione -40%", category: "Marketing" },
  { icon: BarChart3, name: "Analisi Preventivi", desc: "Conversion rate, tempo medio chiusura e performance commerciale del team.", saving: "Dati per decidere meglio", category: "Marketing" },

  // HR
  { icon: Users, name: "Gestione Personale", desc: "Anagrafica dipendenti e squadre con documenti, contratti e scadenze.", saving: "Zero documenti smarriti", category: "HR" },
  { icon: Clock, name: "Timbratura Kiosk", desc: "Badge in/out da tablet in cantiere. Presenze automatiche e certificate.", saving: "Contestazioni azzerate", category: "HR" },
  { icon: DollarSign, name: "Costi Manodopera", desc: "Costo reale H per cantiere e dipendente, aggiornato in tempo reale.", saving: "Ottimizzazione 10-20% ore", category: "HR" },
  { icon: CalendarDays, name: "Calendario Lavori", desc: "Pianificazione team e risorse con vista Gantt, settimana e mese.", saving: "Zero sovrapposizioni", category: "HR" },

  // AI
  { icon: Bot, name: "Agenti AI", desc: "Assistenti AI personalizzati per la tua impresa: analisi, report, suggerimenti.", saving: "Decisioni 3x più veloci", category: "AI" },
  { icon: Cpu, name: "Flow Automazioni", desc: "Automazioni visuali no-code: collega moduli, dati e azioni in pochi click.", saving: "10+ ore/sett. automatizzate", category: "AI" },
  { icon: Workflow, name: "Chat Interna", desc: "Comunicazione team integrata con contesto cantiere, task e documenti.", saving: "Zero dispersione info", category: "AI" },
];

const CATEGORIES = ["Tutti", "Cantieri", "Finanziario", "Marketing", "HR", "AI"];

const INITIAL_VISIBLE = 9;

function ModuleCard({ mod, delay, visible }: { mod: Module; delay: number; visible: boolean }) {
  const color = CATEGORY_COLORS[mod.category] ?? "#0fa68c";
  return (
    <div
      className={`group p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-500 flex flex-col`}
      style={{
        borderTop: `4px solid ${color}`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms, box-shadow 0.3s ease, translate 0.3s ease`,
      }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300"
        style={{ backgroundColor: `${color}18` }}
      >
        <mod.icon size={22} style={{ color }} />
      </div>
      <h3 className="text-[#1a2744] font-bold text-base mb-1.5">{mod.name}</h3>
      <p className="text-gray-500 text-sm leading-relaxed flex-1 mb-3">{mod.desc}</p>
      <p className="text-xs font-semibold mt-auto" style={{ color }}>{mod.saving}</p>
    </div>
  );
}

export default function ModulesSection() {
  const [activeTab, setActiveTab] = useState("Tutti");
  const [showAll, setShowAll] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [sectionVisible, setSectionVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSectionVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset show-all when tab changes
  useEffect(() => {
    setShowAll(false);
  }, [activeTab]);

  const filtered =
    activeTab === "Tutti" ? ALL_MODULES : ALL_MODULES.filter((m) => m.category === activeTab);

  const displayed = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE);
  const hasMore = filtered.length > INITIAL_VISIBLE && !showAll;

  return (
    <section id="moduli" className="py-24 md:py-32 bg-white">
      <div ref={sectionRef} className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div
          className={`text-center mb-12 transition-all duration-700 ${
            sectionVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#1a2744] mb-4">
            La piattaforma completa
            <br />
            <span className="text-[#0fa68c]">per la tua impresa edile</span>
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            Tutti gli strumenti integrati. Nessuna app separata. Tutto sotto controllo.
          </p>
        </div>

        {/* Category Tabs */}
        <div
          className={`transition-all duration-700 delay-150 ${
            sectionVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="flex gap-2 overflow-x-auto pb-2 mb-10 scrollbar-none" style={{ scrollbarWidth: "none" }}>
            {CATEGORIES.map((cat) => {
              const isActive = activeTab === cat;
              const color = cat === "Tutti" ? "#0fa68c" : CATEGORY_COLORS[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap border"
                  style={
                    isActive
                      ? {
                          backgroundColor: color,
                          color: "#fff",
                          borderColor: color,
                          boxShadow: `0 0 0 3px ${color}30`,
                        }
                      : {
                          backgroundColor: "transparent",
                          color: "#6b7280",
                          borderColor: "#e5e7eb",
                        }
                  }
                >
                  {cat}
                  <span
                    className="ml-2 text-xs opacity-70"
                  >
                    {cat === "Tutti"
                      ? ALL_MODULES.length
                      : ALL_MODULES.filter((m) => m.category === cat).length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayed.map((mod, i) => (
            <ModuleCard
              key={`${mod.category}-${mod.name}`}
              mod={mod}
              delay={sectionVisible ? i * 60 : 0}
              visible={sectionVisible}
            />
          ))}
        </div>

        {/* Show more button */}
        {hasMore && (
          <div className="text-center mt-10">
            <button
              onClick={() => setShowAll(true)}
              className="px-8 py-3 rounded-full border-2 border-[#0fa68c] text-[#0fa68c] font-semibold hover:bg-[#0fa68c] hover:text-white transition-all duration-200"
            >
              Mostra tutti i moduli ({filtered.length - INITIAL_VISIBLE} altri)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
