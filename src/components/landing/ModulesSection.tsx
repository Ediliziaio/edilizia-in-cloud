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
  Finanziario: "#F97415",
  Marketing: "#8b5cf6",
  HR: "#f59e0b",
  AI: "#ec4899",
};

const ALL_MODULES: Module[] = [
  // Cantieri
  { icon: Building2, name: "Gestione Commesse", desc: "Margine reale, avanzamento e costi effettivi per ogni cantiere — aggiornati in tempo reale, accessibili da ovunque.", saving: "5-8 ore/sett. risparmiate", category: "Cantieri" },
  { icon: HardHat, name: "Marginalità Cantieri", desc: "Confronta la profittabilità di tutti i cantieri attivi in un colpo d'occhio. Identifica subito quelli a rischio.", saving: "Margini +15% in media", category: "Cantieri" },
  { icon: ClipboardList, name: "Giornale dei Lavori", desc: "Registro giornaliero attività compilabile da mobile direttamente in cantiere. SAL automatico, zero carta.", saving: "Zero verbali cartacei", category: "Cantieri" },
  { icon: ShieldCheck, name: "Sicurezza Cantiere", desc: "DPI, formazione, scadenze normative e documenti obbligatori centralizzati. Sempre in regola, senza sforzo.", saving: "100% compliance D.Lgs. 81/08", category: "Cantieri" },
  { icon: FileText, name: "Documenti Cantiere", desc: "SAL, ordini di variante, verbali e documenti tecnici — tutti aggiornati, sempre reperibili, mai persi.", saving: "Zero documenti smarriti", category: "Cantieri" },
  { icon: ShoppingCart, name: "Ordini di Acquisto", desc: "Gestione acquisti materiali direttamente collegata alla commessa. Confronto fornitori e controllo spese in un click.", saving: "Risparmio 2.000-8.000€/anno", category: "Cantieri" },

  // Finanziario
  { icon: Wallet, name: "Previsionale di Cassa", desc: "Forecast liquidità a 30/60/90 giorni basato su incassi attesi, scadenze fornitori e costi fissi reali. Zero sorprese.", saving: "Risparmio 3.000-15.000€/anno", category: "Finanziario" },
  { icon: TrendingUp, name: "Tesoreria", desc: "Conti correnti, movimenti bancari e riconciliazione automatica. Tieni tutto il cash flow in un unico posto.", saving: "3 ore/sett. risparmiate", category: "Finanziario" },
  { icon: BarChart3, name: "Costi Aziendali", desc: "Costi fissi, variabili e overhead con drill-down per categoria, commessa e periodo. Sai dove vanno i tuoi soldi.", saving: "Risparmio 5.000-25.000€/anno", category: "Finanziario" },
  { icon: Receipt, name: "Fatturazione Elettronica", desc: "SDI nativo, DDT, note credito e ciclo passivo completo. Emetti e ricevi fatture in un click, già pronte per l'Agenzia delle Entrate.", saving: "2 ore/sett. eliminate", category: "Finanziario" },
  { icon: FileCheck, name: "Prima Nota", desc: "Registro contabile sempre aggiornato e pronto da esportare per il commercialista. Zero errori, zero rincorse.", saving: "Zero errori contabili", category: "Finanziario" },
  { icon: Clock, name: "Scadenzario", desc: "Alert automatici su scadenze clienti e fornitori via email e WhatsApp. Non dimentichi più un pagamento — mai.", saving: "Zero pagamenti dimenticati", category: "Finanziario" },

  // Marketing
  { icon: Target, name: "CRM Contatti", desc: "Anagrafica clienti e prospect con storico completo: chiamate, preventivi, contratti e comunicazioni. Tutto in un posto.", saving: "Zero opportunità perse", category: "Marketing" },
  { icon: Users, name: "Pipeline Opportunità", desc: "Vista kanban drag & drop delle trattative con forecast commerciale automatico. Sai sempre quanti lavori stai per chiudere.", saving: "Tasso chiusura +20%", category: "Marketing" },
  { icon: FileSignature, name: "Preventivi Digitali", desc: "Crea preventivi professionali, mandali online e ricevi la firma elettronica dal cliente in pochi minuti — non settimane.", saving: "Chiudi in 48h, non 2 settimane", category: "Marketing" },
  { icon: Mail, name: "Email Marketing", desc: "Campagne email con editor drag & drop, segmentazione avanzata e analytics. Resta in mente ai tuoi clienti ogni mese.", saving: "ROI email medio 42:1", category: "Marketing" },
  { icon: MessageSquare, name: "WhatsApp Marketing", desc: "Messaggi e automazioni WhatsApp per seguire clienti, mandare preventivi e raccogliere feedback dove sono davvero.", saving: "Tasso apertura 98%", category: "Marketing" },
  { icon: Zap, name: "Automazioni", desc: "Flow builder visuale: crea processi automatici per follow-up, alert interni, assegnazioni e notifiche — senza una riga di codice.", saving: "10+ ore/sett. automatizzate", category: "Marketing" },
  { icon: BarChart2, name: "Lead da Facebook/Instagram", desc: "I lead generati dalle tue campagne social arrivano automaticamente nel CRM. Nessun copia-incolla, nessun lead perso.", saving: "Costo acquisizione -40%", category: "Marketing" },
  { icon: BarChart3, name: "Analisi Commerciale", desc: "Conversion rate, tempo medio di chiusura, performance del team e valore medio preventivi. Dati per decidere meglio.", saving: "Decisioni basate sui dati", category: "Marketing" },

  // HR
  { icon: Users, name: "Gestione Personale", desc: "Anagrafica dipendenti e squadre con documenti, contratti, scadenze e certificazioni. Tutto centralizzato, niente smarriti.", saving: "Zero documenti smarriti", category: "HR" },
  { icon: Clock, name: "Timbratura Kiosk", desc: "Badge in/out da tablet installato in cantiere. Presenze automatiche, certificate e pronte per le buste paga.", saving: "Contestazioni azzerate", category: "HR" },
  { icon: DollarSign, name: "Costi Manodopera", desc: "Costo reale per ora, per dipendente e per cantiere — aggiornato in tempo reale. Sai esattamente quanto ti costa ogni lavoro.", saving: "Ottimizzazione ore 10-20%", category: "HR" },
  { icon: CalendarDays, name: "Calendario Squadre", desc: "Pianificazione team e risorse con vista Gantt, settimana e mese. Assegna, sposta e ottimizza senza conflitti.", saving: "Zero sovrapposizioni", category: "HR" },

  // AI
  { icon: Bot, name: "Agenti AI", desc: "Assistenti intelligenti personalizzati per la tua impresa: analizzano i tuoi dati, generano report e ti suggeriscono le azioni prioritarie.", saving: "Decisioni 3x più rapide", category: "AI" },
  { icon: Cpu, name: "Flow Automazioni AI", desc: "Automazioni no-code potenziate dall'AI: collega moduli, trigger e azioni in pochi click. Il gestionale lavora anche quando non ci sei.", saving: "10+ ore/sett. automatizzate", category: "AI" },
  { icon: Workflow, name: "Chat Interna", desc: "Comunicazione team integrata con contesto cantiere, task e documenti. Fine alle email infinite e ai messaggi WhatsApp sparsi.", saving: "Zero dispersione informazioni", category: "AI" },
];

const CATEGORIES = ["Tutti", "Cantieri", "Finanziario", "Marketing", "HR", "AI"];

const INITIAL_VISIBLE = 9;

function ModuleCard({ mod, delay, visible }: { mod: Module; delay: number; visible: boolean }) {
  const color = CATEGORY_COLORS[mod.category] ?? "#F97415";
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
      <h3 className="text-[#111111] font-bold text-base mb-1.5">{mod.name}</h3>
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
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#111111] mb-4">
            26 moduli. Un'unica piattaforma.
            <br />
            <span className="text-[#F97415]">Tutto quello che serve per gestire un'impresa edile.</span>
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            Cantieri, finanza, marketing, HR e AI integrati. Nessuna app separata, nessun dato duplicato. Tutto parla con tutto — in tempo reale.
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
              const color = cat === "Tutti" ? "#F97415" : CATEGORY_COLORS[cat];
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
              className="px-8 py-3 rounded-full border-2 border-[#B45309] text-[#B45309] font-semibold hover:bg-[#B45309] hover:text-white transition-all duration-200"
            >
              Mostra tutti i moduli ({filtered.length - INITIAL_VISIBLE} altri)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
