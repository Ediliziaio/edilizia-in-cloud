/**
 * SilvioFAB — Floating Action Button bottom-left con accesso rapido a:
 *   1. Chat con Silvio (assistente AI principale)
 *   2. Azioni rapide (Documento intelligente, Computo metrico, Cerca commesse)
 *   3. "Cose da sapere" (tip rotanti AI/feature highlight)
 *
 * Visibile in tutto CompanyLayout. Su mobile diventa un bottone più grande
 * e il popover full-width.
 *
 * Pattern: Popover ancorato al bottone, animazioni leggere via framer-motion.
 */
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Brain,
  BrainCircuit,
  FileUp,
  Search,
  X,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// Lazy load: il SmartDocumentImportModal e il SilvioChatSheet sono pesanti
// (chat ha 1k LOC + supabase realtime + framer-motion + audio recording).
// Caricamento on-demand al primo open → boot iniziale del CompanyLayout
// resta veloce (fab visibile immediatamente, modali si fetchano al click).
const SmartDocumentImportModal = lazy(() =>
  import("@/components/documenti/SmartDocumentImportModal").then(m => ({ default: m.SmartDocumentImportModal })),
);
const SilvioChatSheet = lazy(() =>
  import("@/components/silvio/SilvioChatSheet").then(m => ({ default: m.SilvioChatSheet })),
);

// ─────────────────────────────────────────────────────────────────────────
// Tip rotanti — "Cose da sapere" che gli utenti trovano utili
// (estendibili leggendo da DB se serve)
// ─────────────────────────────────────────────────────────────────────────
const KNOW_HOW_TIPS: Array<{
  title: string;
  body: string;
  cta?: { label: string; action: string };
}> = [
  {
    title: "🧠 Documento intelligente",
    body: "Carica QUALSIASI documento (PDF, foto, Excel). L'AI capisce se è un computo, DDT, fattura o contratto e lo smista al modulo giusto. Per i DDT, lo allega da sola all'OdA aperto.",
    cta: { label: "Prova ora", action: "smart_doc" },
  },
  {
    title: "💬 Chat con Silvio",
    body: "Silvio è il tuo CFO/PM/Capocantiere AI. Puoi chiedere qualsiasi cosa: cashflow, margini, stato cantieri, allerta crediti. Risponde con i dati reali della tua azienda.",
    cta: { label: "Apri chat", action: "open_chat" },
  },
  {
    title: "📐 Computo → Preventivo in 3 click",
    body: "Carica un computo metrico estimativo (anche scansionato): l'AI estrae le voci, ti fa rivedere i prezzi e genera il preventivo cliente automaticamente.",
    cta: { label: "Prova", action: "import_computo" },
  },
  {
    title: "🚚 DDT al volo dalla foto",
    body: "Fai la foto a un DDT cartaceo dal cantiere. L'AI riconosce mittente, merce e quantità, poi lo collega da sola all'Ordine d'Acquisto giusto.",
    cta: { label: "Prova", action: "smart_doc" },
  },
  {
    title: "🛡️ Auto + Conferma differenziati",
    body: "Per DDT, foto cantiere e biglietti da visita l'AI agisce autonomamente (con annulla rapido). Per fatture, contratti e polizze ti chiede sempre conferma — sicurezza prima di tutto.",
  },
  {
    title: "📊 Decision Log automatico",
    body: "Ogni decisione AI viene tracciata. Puoi vedere perché Silvio ha proposto X, quali alternative ha valutato e l'esito reale. Trasparenza totale per audit AI Act.",
  },
];

interface Props {
  /** Se true, nasconde il FAB (es. dentro modali). Default false. */
  hidden?: boolean;
}

export function SilvioFAB({ hidden = false }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [smartImportOpen, setSmartImportOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Una volta aperta la prima volta, manteniamo SilvioChatSheet montato (anche
  // quando chatOpen=false). Così non si ricarica ogni apertura: messaggi, query
  // realtime e cache React Query restano vivi tra open/close.
  const [chatHasMounted, setChatHasMounted] = useState(false);
  useEffect(() => { if (chatOpen) setChatHasMounted(true); }, [chatOpen]);
  const [tipIdx, setTipIdx] = useState(0);
  const [tipsExpanded, setTipsExpanded] = useState(false);

  // Rotate tip ogni 7s quando il popover è aperto
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTipIdx((i) => (i + 1) % KNOW_HOW_TIPS.length), 7000);
    return () => clearInterval(id);
  }, [open]);

  const currentTip = useMemo(() => KNOW_HOW_TIPS[tipIdx], [tipIdx]);

  const handleAction = (action: string) => {
    setOpen(false);
    switch (action) {
      case "open_chat":
        // Apri Sheet inline (richiesta utente: NON navigare alla pagina chat)
        setChatOpen(true);
        break;
      case "smart_doc":
        setSmartImportOpen(true);
        break;
      case "import_computo":
        navigate("/azienda/marketing/preventivi?action=import-computo");
        break;
      case "search_commesse":
        navigate("/azienda/cantieri");
        break;
      case "documenti":
        navigate("/azienda/documenti");
        break;
      default:
        break;
    }
  };

  if (hidden) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
	          <motion.button
	            type="button"
	            aria-label="Apri assistente Silvio"
              aria-expanded={open}
	            className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 via-orange-500 to-amber-400 text-white shadow-xl shadow-orange-300/40 hover:shadow-2xl hover:scale-105 transition-all sm:w-auto sm:gap-2 sm:px-4 md:bottom-6 md:right-6"
              style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
	            whileHover={{ rotate: [0, -5, 5, 0] }}
	            transition={{ duration: 0.5 }}
	          >
            {/* Glow pulsante quando chiuso */}
            {!open && (
              <motion.span
                className="absolute inset-0 rounded-full bg-orange-400"
                animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <AnimatePresence mode="wait">
              {open ? (
                <motion.span
                  key="x"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <X className="h-6 w-6" />
                </motion.span>
              ) : (
                <motion.span
                  key="brain"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  className="relative z-10 flex items-center gap-2"
                >
                  <BrainCircuit className="h-7 w-7" strokeWidth={2.2} />
                  <span className="hidden text-sm font-semibold sm:inline">Silvio</span>
                </motion.span>
	              )}
            </AnimatePresence>
          </motion.button>
        </PopoverTrigger>

        <PopoverContent
          side="top"
          align="end"
          sideOffset={12}
          className="w-[340px] sm:w-[380px] max-h-[calc(100vh-120px)] p-0 border-orange-100 shadow-2xl rounded-2xl overflow-hidden flex flex-col"
        >
          {/* Header (sticky) */}
          <div className="bg-gradient-to-br from-orange-500 to-amber-400 px-4 py-3 text-white shrink-0">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              <div className="flex-1">
                <p className="text-sm font-semibold leading-tight">Silvio · Assistente AI</p>
                <p className="text-[11px] opacity-90 leading-tight">Cosa vuoi fare?</p>
              </div>
            </div>
          </div>

          {/* Body scrollable */}
          <div className="p-3 space-y-2 overflow-y-auto flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-1">
              Azioni rapide
            </p>
            <div className="grid grid-cols-2 gap-2">
              <ActionCard
                icon={MessageSquare}
                title="Chat con Silvio"
                subtitle="Chiedi qualsiasi cosa"
                tone="orange"
                onClick={() => handleAction("open_chat")}
              />
              <ActionCard
                icon={Brain}
                title="Documento intelligente"
                subtitle="AI smista da sola"
                tone="purple"
                onClick={() => handleAction("smart_doc")}
              />
              <ActionCard
                icon={FileUp}
                title="Computo metrico"
                subtitle="→ Preventivo"
                tone="blue"
                onClick={() => handleAction("import_computo")}
              />
              <ActionCard
                icon={Search}
                title="Cerca cantieri"
                subtitle="Apri lista"
                tone="green"
                onClick={() => handleAction("search_commesse")}
              />
            </div>

            {/* Cose da sapere — accordion collassabile (default chiuso) */}
            <div className="mt-3 border-t pt-2">
              <button
                type="button"
                onClick={() => setTipsExpanded((v) => !v)}
                className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-1 hover:text-slate-700 transition-colors py-1"
              >
                <span className="flex items-center gap-1.5">
                  <Lightbulb className="h-3 w-3 text-amber-500" />
                  Cose da sapere
                  <span className="text-[9px] font-normal text-slate-400 normal-case">
                    ({KNOW_HOW_TIPS.length} suggerimenti)
                  </span>
                </span>
                <motion.span animate={{ rotate: tipsExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                  <ArrowRight className="h-3 w-3" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {tipsExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-2">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={tipIdx}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={{ duration: 0.2 }}
                          className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-lg p-3"
                        >
                          <p className="text-[12px] font-semibold text-slate-800 mb-1 leading-snug">
                            {currentTip.title}
                          </p>
                          <p className="text-[11px] leading-relaxed text-slate-600">{currentTip.body}</p>
                          {currentTip.cta && (
                            <button
                              type="button"
                              className="text-orange-600 hover:text-orange-700 mt-1.5 text-[11px] font-semibold flex items-center gap-1"
                              onClick={() => handleAction(currentTip.cta!.action)}
                            >
                              {currentTip.cta.label} <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                        </motion.div>
                      </AnimatePresence>
                      <div className="flex items-center justify-between mt-2 px-1">
                        <button
                          type="button"
                          onClick={() => setTipIdx((i) => (i - 1 + KNOW_HOW_TIPS.length) % KNOW_HOW_TIPS.length)}
                          className="text-[10px] text-slate-400 hover:text-slate-700"
                          aria-label="Tip precedente"
                        >‹ prec</button>
                        <div className="flex gap-1">
                          {KNOW_HOW_TIPS.map((_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setTipIdx(i)}
                              className={`h-1 rounded-full transition-all ${
                                i === tipIdx ? "bg-orange-500 w-3" : "bg-slate-300 w-1 hover:bg-slate-400"
                              }`}
                              aria-label={`Tip ${i + 1}`}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setTipIdx((i) => (i + 1) % KNOW_HOW_TIPS.length)}
                          className="text-[10px] text-slate-400 hover:text-slate-700"
                          aria-label="Tip successivo"
                        >succ ›</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Smart Document Import Modal — gestito dal FAB (lazy: carica al primo open) */}
      {smartImportOpen && (
        <Suspense fallback={null}>
          <SmartDocumentImportModal
            open={smartImportOpen}
            onOpenChange={setSmartImportOpen}
          />
        </Suspense>
      )}

      {/* Chat con Silvio inline (sheet laterale) — lazy: carica al primo open
          e poi resta montata (chatHasMounted) per non ricaricarsi ogni volta */}
      {chatHasMounted && (
        <Suspense fallback={null}>
          <SilvioChatSheet open={chatOpen} onOpenChange={setChatOpen} />
        </Suspense>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-componente ActionCard
// ─────────────────────────────────────────────────────────────────────────
const TONE_STYLES: Record<string, string> = {
  orange: "from-orange-50 to-orange-100 border-orange-200 hover:border-orange-300 text-orange-700",
  purple: "from-purple-50 to-purple-100 border-purple-200 hover:border-purple-300 text-purple-700",
  blue: "from-blue-50 to-blue-100 border-blue-200 hover:border-blue-300 text-blue-700",
  green: "from-green-50 to-green-100 border-green-200 hover:border-green-300 text-green-700",
};

function ActionCard({
  icon: Icon,
  title,
  subtitle,
  tone,
  onClick,
}: {
  icon: typeof MessageSquare;
  title: string;
  subtitle: string;
  tone: keyof typeof TONE_STYLES;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`bg-gradient-to-br ${TONE_STYLES[tone]} border rounded-lg p-2.5 text-left transition-colors`}
    >
      <Icon className="h-4 w-4 mb-1" />
      <p className="text-xs font-semibold leading-tight text-slate-800">{title}</p>
      <p className="text-[10px] text-slate-500 leading-tight">{subtitle}</p>
    </motion.button>
  );
}
