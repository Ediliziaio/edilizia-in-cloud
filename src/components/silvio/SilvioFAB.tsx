/**
 * SilvioFAB — Floating Action Button desktop/tablet con accesso rapido a:
 *   1. Chat con Silvio (assistente AI principale)
 *   2. Azioni rapide (Documento intelligente, Computo metrico, Cerca commesse)
 *   3. "Cose da sapere" (tip rotanti AI/feature highlight)
 *
 * Visibile in CompanyLayout da tablet/desktop. Su mobile resta disponibile
 * dalla sezione Chat, così non copre CTA, input e bottom navigation.
 *
 * Pattern: Popover ancorato al bottone, animazioni leggere via framer-motion.
 */
import { useEffect, useMemo, useState, lazy, Suspense, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSilvioPageContext } from "@/hooks/useSilvioPageContext";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Brain,
  BrainCircuit,
  Search,
  X,
  Lightbulb,
  ArrowRight,
  AlertTriangle,
  // 🆕 Icon set espansa
  Calculator,
  Sparkles,
  Inbox,
  Network,
  Send,
  UploadCloud,
  Clock3,
  Route,
  FileText,
} from "lucide-react";
import { SilvioAvatar } from "@/components/silvio/SilvioAvatar";
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
  /** Modalità chat: "azienda" (default) o "admin" (Silvio Superadmin) */
  mode?: "azienda" | "admin";
}

/**
 * Configurazione contenuti popover Silvio per ogni modalità.
 * Permette di mostrare Hub AI / Carica documento / Search / Routes
 * specifiche al context (azienda vs piattaforma).
 */
interface ModeContent {
  uploadCard: {
    visible: boolean;
    title: string;
    description: string;
    chips: string[];
  };
  hub: Array<{
    icon: typeof Inbox;
    title: string;
    subtitle: string;
    tone: "amber" | "orange" | "emerald" | "blue";
    action: string;
  }>;
  searchPlaceholder: string;
  routes: Record<string, string>;
  chatExpandRoute: string;
}

const MODE_CONTENT: Record<"azienda" | "admin", ModeContent> = {
  azienda: {
    uploadCard: {
      visible: true,
      title: "Carica documento",
      description: "Silvio classifica PDF, foto, computi, fatture, DDT e contratti.",
      chips: ["Computo", "Foto/voce", "DDT", "Fatture"],
    },
    hub: [
      { icon: Inbox, title: "Azioni AI", subtitle: "Da approvare", tone: "amber", action: "azioni_proposte" },
      { icon: Sparkles, title: "Personas", subtitle: "18 esperti AI", tone: "orange", action: "personas_18" },
      { icon: Brain, title: "Memoria", subtitle: "Cosa sa di te", tone: "emerald", action: "ai_memoria" },
      { icon: Calculator, title: "Computo", subtitle: "Preventivo AI", tone: "blue", action: "import_computo" },
    ],
    searchPlaceholder: "Cerca clienti, cantieri, fatture…",
    routes: {
      azioni_proposte: "/azienda/azioni-proposte",
      personas_18: "/azienda/assistente-ai",
      ai_memoria: "/azienda/ai-memoria",
      import_computo: "/azienda/marketing/preventivi?action=import-computo",
      import_foto_preventivo: "/azienda/marketing/preventivi?action=import-foto",
      search_commesse: "/azienda/cantieri",
      documenti: "/azienda/documenti",
    },
    chatExpandRoute: "/azienda/chat",
  },
  admin: {
    uploadCard: {
      visible: false,
      title: "",
      description: "",
      chips: [],
    },
    // Hub AI mappato alle 21 personas già esistenti in DB (tabella
    // silvio_admin_personas): Beatrice CFO, Marco Vendite, Sofia Marketing,
    // Tommaso Outbound, Elena CS, Giorgio Support, Chiara Product,
    // Luca/Davide/Eleonora/Roberta/Vittorio/Antonio/Laura/Alessandro/
    // Giulia/Ferrari/Matteo/Federico/Valentina/Gabriele.
    hub: [
      { icon: Inbox, title: "Approvazioni AI", subtitle: "Azioni da rivedere", tone: "amber", action: "azioni_proposte" },
      { icon: Sparkles, title: "21 Personas SA", subtitle: "Beatrice, Marco, Sofia…", tone: "orange", action: "personas_18" },
      { icon: Brain, title: "Memoria SA", subtitle: "Knowledge piattaforma", tone: "emerald", action: "ai_memoria" },
      { icon: Network, title: "Cross-tenant", subtitle: "Vista N aziende", tone: "blue", action: "cross_tenant" },
    ],
    searchPlaceholder: "Cerca aziende, ticket, MRR, clienti…",
    routes: {
      // Tutte le route admin operative vivono in /admin/ai-operate (8 tab:
      // approvals/queue/policies/agents/chief/personas/memory/learning).
      // Le 21 personas superadmin (silvio_admin_personas) e le memorie
      // dedicate (silvio_persona_memory) sono già accessibili via tab.
      azioni_proposte: "/admin/ai-operate?tab=approvals",
      personas_18: "/admin/ai-operate?tab=personas",
      ai_memoria: "/admin/ai-operate?tab=memory",
      cross_tenant: "/admin/aziende",
      search_commesse: "/admin/aziende",
      documenti: "/admin",
    },
    chatExpandRoute: "/admin/chat",
  },
};

interface MorningBriefing {
  id: string;
  content: string;
  key_points: Array<{ text: string; severity?: "info" | "attention" | "urgent"; action_hint?: string }>;
  severity: "info" | "attention" | "urgent";
  brief_date: string;
  read_at: string | null;
}

export function SilvioFAB({ hidden = false, mode = "azienda" }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const pageContext = useSilvioPageContext();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [quickPrompt, setQuickPrompt] = useState("");
  const [chatPrefill, setChatPrefill] = useState("");
  // Contenuti popover specifici al mode (azienda vs admin/superadmin)
  const content = MODE_CONTENT[mode];

  // Briefing del giorno generato dal cron silvio-morning-brief.
  // Fetched solo se l'utente apre il FAB (enabled: open) per non sprecare
  // bandwidth al boot. Refresh dopo 10 min staleTime.
  const { data: morningBrief } = useQuery({
    queryKey: ["silvio-morning-brief", user?.id],
    enabled: !!user?.id && open,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<MorningBriefing | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("silvio_morning_briefings")
        .select("id, content, key_points, severity, brief_date, read_at")
        .eq("user_id", user!.id)
        .gte("brief_date", new Date().toISOString().slice(0, 10))
        .order("brief_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as MorningBriefing | null) ?? null;
    },
  });
  const [smartImportOpen, setSmartImportOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Una volta aperta la prima volta, manteniamo SilvioChatSheet montato (anche
  // quando chatOpen=false). Così non si ricarica ogni apertura: messaggi, query
  // realtime e cache React Query restano vivi tra open/close.
  const [chatHasMounted, setChatHasMounted] = useState(false);
  useEffect(() => { if (chatOpen) setChatHasMounted(true); }, [chatOpen]);

  // Listener globale per aprire il sheet da componenti esterni (es. il bell
  // popover "Apri chat con Silvio"). Pattern d'uso:
  //   window.dispatchEvent(new Event("silvio:open-chat"))                 // apre vuoto
  //   window.dispatchEvent(new CustomEvent("silvio:open-chat",            // apre con draft
  //     { detail: { draft: "Riassumi candidato Marco" } }))
  useEffect(() => {
    const openHandler = (e: Event) => {
      setOpen(false); // chiudi popover FAB se aperto
      const detail = (e as CustomEvent<{ draft?: string }>).detail;
      if (detail?.draft) {
        // Prefix con timestamp per forzare re-application su prefillDraft anche se stessa string
        setChatPrefill(`${Date.now()}::${detail.draft}`);
      }
      setChatOpen(true);
    };
    window.addEventListener("silvio:open-chat", openHandler);
    return () => window.removeEventListener("silvio:open-chat", openHandler);
  }, []);
  const [tipIdx, setTipIdx] = useState(0);
  const [tipsExpanded, setTipsExpanded] = useState(false);

  // Rotate tip ogni 7s quando il popover è aperto
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTipIdx((i) => (i + 1) % KNOW_HOW_TIPS.length), 7000);
    return () => clearInterval(id);
  }, [open]);

  const currentTip = useMemo(() => KNOW_HOW_TIPS[tipIdx], [tipIdx]);

  const pageContextLabel = useMemo(() => {
    if (pageContext?.route_label) return pageContext.route_label;
    if (location.pathname.includes("/cruscotto")) return "Cruscotto aziendale";
    if (location.pathname.includes("/contenuti-multimediali")) return "EiC Drive";
    if (location.pathname.includes("/impostazioni")) return "Impostazioni";
    if (location.pathname === "/azienda" || location.pathname === "/azienda/") return "Home azienda";
    if (location.pathname === "/admin" || location.pathname === "/admin/") return "Home Superadmin";
    if (location.pathname.startsWith("/admin/email")) return "Email Superadmin";
    if (location.pathname.startsWith("/admin/aziende")) return "Aziende clienti";
    if (location.pathname.startsWith("/admin/ai-operate")) return "AI Operatività";
    if (location.pathname.startsWith("/admin/")) return "Area Superadmin";
    return "Pagina corrente";
  }, [location.pathname, pageContext?.route_label]);

  const operationalPriorities = useMemo(() => {
    const fromBriefing = morningBrief?.key_points?.slice(0, 3).map((point) => ({
      text: point.text,
      severity: point.severity ?? "info",
      action: point.action_hint ?? "Apri dettaglio",
    })) ?? [];
    if (fromBriefing.length > 0) return fromBriefing;
    // Default suggestions specifiche al mode
    if (mode === "admin") {
      return [
        { text: "Approvazioni AI in attesa — rivedi le azioni proposte", severity: "attention", action: "Apri approvazioni" },
        { text: `Chiedi a Silvio Superadmin cosa conta ora in ${pageContextLabel}`, severity: "info", action: "Apri chat" },
        { text: "Aziende a rischio churn — controlla salute clienti", severity: "info", action: "Vedi aziende" },
      ];
    }
    return [
      { text: "Controlla le cose da sapere prima di cambiare pagina", severity: "attention", action: "Vedi priorita" },
      { text: `Chiedi a Silvio cosa conta ora in ${pageContextLabel}`, severity: "info", action: "Apri chat" },
      { text: "Carica documenti, foto o computi senza scegliere il modulo", severity: "info", action: "Importa file" },
    ];
  }, [morningBrief?.key_points, pageContextLabel, mode]);

  const pendingActionsCount = operationalPriorities.length + (morningBrief && !morningBrief.read_at ? 1 : 0);

  const openChat = (prefill?: string) => {
    const cleanPrefill = prefill?.trim() ?? "";
    setOpen(false);
    if (cleanPrefill) {
      setChatPrefill(`${Date.now()}::${cleanPrefill}`);
      setQuickPrompt("");
    }
    setChatOpen(true);
  };

  const handleQuickPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openChat(quickPrompt || `Analizza ${pageContextLabel} e dimmi cosa fare ora.`);
  };

  const handleAction = (action: string) => {
    setOpen(false);
    // Action speciali (non-routing)
    if (action === "open_chat") {
      openChat();
      return;
    }
    if (action === "smart_doc") {
      setSmartImportOpen(true);
      return;
    }
    if (action === "command_palette") {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
      return;
    }
    // Actions routing: usa la mappa mode-aware
    const route = content.routes[action];
    if (route) navigate(route);
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
	            className="fixed bottom-4 right-4 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 via-orange-500 to-amber-400 text-white shadow-xl shadow-orange-300/40 transition-all hover:scale-105 hover:shadow-2xl md:bottom-6 md:right-6 md:flex md:w-auto md:gap-2 md:px-4"
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
                  <SilvioAvatar size={28} bg="none" className="text-white" />
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
          collisionPadding={12}
          /* v8.6.66 — mobile fix: width responsive con max viewport-aware
             per evitare che il popover fuoriesca dal bordo destro quando
             aperto su trigger nascosti (es. da bell popover o link Silvio
             in bottom-nav). Era w-[340px] fisso = overflow su iPhone SE. */
          className="w-[min(340px,calc(100vw-1.5rem))] sm:w-[380px] max-h-[calc(100vh-120px)] p-0 border-orange-100 shadow-2xl rounded-2xl overflow-hidden flex flex-col"
        >
          <div className="shrink-0 border-b border-orange-100 bg-gradient-to-br from-orange-50 via-white to-amber-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <SilvioAvatar size={40} className="rounded-2xl shadow-lg shadow-orange-200" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black leading-tight text-slate-950">Regia Silvio</p>
                  <span className="rounded-full border border-orange-200 bg-white px-2 py-0.5 text-[10px] font-bold text-orange-700">
                    {pendingActionsCount} priorita
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] leading-tight text-slate-600">
                  Contesto pagina: {pageContextLabel}
                </p>
              </div>
            </div>
          </div>

          {/* 2026-05-27 (richiesta utente "Scrivi a Silvio in basso"):
              il form composer è stato spostato fuori dal contenitore
              scrollabile e ancorato in fondo al popover. Pattern standard
              chat (Slack, WhatsApp, ChatGPT): l'input è sempre visibile
              senza dover scrollare. Il contenuto sopra scrolla
              indipendentemente. */}
          <div className="flex-1 space-y-3 overflow-y-auto bg-white p-3">
            {morningBrief && !morningBrief.read_at && (
              <div className={`rounded-lg border-l-4 p-3 ${
                morningBrief.severity === "urgent"
                  ? "border-l-rose-500 bg-rose-50"
                  : morningBrief.severity === "attention"
                    ? "border-l-amber-500 bg-amber-50"
                    : "border-l-sky-500 bg-sky-50"
              }`}>
                <div className="flex items-start gap-2 mb-1.5">
                  {morningBrief.severity === "urgent"
                    ? <AlertTriangle className="h-3.5 w-3.5 text-rose-600 mt-0.5 shrink-0" />
                    : <Sparkles className="h-3.5 w-3.5 text-sky-600 mt-0.5 shrink-0" />
                  }
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                    Briefing del giorno · {new Date(morningBrief.brief_date).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                  </p>
                </div>
                {morningBrief.key_points.slice(0, 4).map((p, i) => (
                  <p key={i} className="text-[12px] text-slate-700 leading-snug pl-5">
                    {p.severity === "urgent" && <span className="text-rose-600 font-bold mr-1">•</span>}
                    {p.severity !== "urgent" && <span className="text-slate-400 mr-1">•</span>}
                    {p.text}
                  </p>
                ))}
              </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">Priorita operative</p>
                <span className="text-[10px] font-semibold text-orange-600">{operationalPriorities.length} da vedere</span>
              </div>
              <div className="space-y-1.5">
                {operationalPriorities.map((priority, index) => (
                  <button
                    key={`${priority.text}-${index}`}
                    type="button"
                    onClick={() => openChat(priority.text)}
                    className="group flex w-full items-start gap-2 rounded-xl border border-white bg-white px-2.5 py-2 text-left shadow-sm transition-colors hover:border-orange-200 hover:bg-orange-50/50"
                  >
                    <span className={`mt-0.5 h-2 w-2 rounded-full ${
                      priority.severity === "urgent"
                        ? "bg-rose-500"
                        : priority.severity === "attention"
                          ? "bg-amber-500"
                          : "bg-sky-500"
                    }`} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-[12px] font-semibold text-slate-800">{priority.text}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-orange-600">
                        {priority.action} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <button
              type="button"
              onClick={() => handleAction("smart_doc")}
              className={cn(
                "w-full rounded-2xl border border-dashed border-orange-300 bg-orange-50/60 p-3 text-left transition-colors hover:bg-orange-50",
                !content.uploadCard.visible && "hidden",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-orange-600 shadow-sm">
                  <UploadCloud className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-slate-900">{content.uploadCard.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-600">
                    {content.uploadCard.description}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1">
                    {content.uploadCard.chips.map((label) => (
                      <span key={label} className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-slate-600 shadow-sm">
                        {label}
                      </span>
                    ))}
                  </span>
                </span>
              </div>
            </button>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-1 mb-1.5">
                {mode === "admin" ? "Hub AI Superadmin" : "Hub AI"}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {content.hub.map((item) => (
                  <ActionCard
                    key={item.action}
                    icon={item.icon}
                    title={item.title}
                    subtitle={item.subtitle}
                    tone={item.tone}
                    onClick={() => handleAction(item.action)}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleAction("command_palette")}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-left"
            >
              <Search className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs text-slate-700 flex-1">{content.searchPlaceholder}</span>
              <kbd className="text-[9px] px-1.5 py-0.5 rounded border bg-white font-mono">⌘K</kbd>
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              <InfoTile icon={Route} label="Contesto pagina" value={pageContextLabel} />
              <InfoTile icon={Clock3} label="Ultime attivita" value="Memoria e azioni pronte" />
            </div>

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

          {/* Composer chat ancorato in fondo (sticky bottom) — sempre visibile */}
          <form
            onSubmit={handleQuickPrompt}
            className="shrink-0 border-t border-orange-100 bg-gradient-to-br from-orange-50/40 via-white to-orange-50/40 px-3 py-2.5"
          >
            <div className="flex items-center gap-2 rounded-2xl border border-orange-200 bg-white px-2.5 py-1.5 shadow-sm focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
              <MessageSquare className="h-4 w-4 text-orange-500 shrink-0" />
              <input
                value={quickPrompt}
                onChange={(event) => setQuickPrompt(event.target.value)}
                placeholder="Scrivi a Silvio..."
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                autoFocus
              />
              <button
                type="submit"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500 text-white transition-colors hover:bg-orange-600 shrink-0"
                aria-label="Apri chat con Silvio"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1 px-1 text-[10px] leading-tight text-slate-500">
              Scrivi una domanda o apri la chat con il contesto già pronto.
            </p>
          </form>
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
          <SilvioChatSheet open={chatOpen} onOpenChange={setChatOpen} prefillDraft={chatPrefill} mode={mode} />
        </Suspense>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-componente ActionCard
// ─────────────────────────────────────────────────────────────────────────
const TONE_STYLES: Record<string, string> = {
  orange:  "from-orange-50  to-orange-100  border-orange-200  hover:border-orange-300  text-orange-700",
  blue:    "from-blue-50    to-blue-100    border-blue-200    hover:border-blue-300    text-blue-700",
  green:   "from-green-50   to-green-100   border-green-200   hover:border-green-300   text-green-700",
  rose:    "from-rose-50    to-rose-100    border-rose-200    hover:border-rose-300    text-rose-700",
  amber:   "from-amber-50   to-amber-100   border-amber-200   hover:border-amber-300   text-amber-700",
  emerald: "from-emerald-50 to-emerald-100 border-emerald-200 hover:border-emerald-300 text-emerald-700",
};

function ActionCard({
  icon: Icon,
  title,
  subtitle,
  tone,
  compact = false,
  onClick,
}: {
  icon: typeof MessageSquare;
  title: string;
  subtitle: string;
  tone: keyof typeof TONE_STYLES;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`bg-gradient-to-br ${TONE_STYLES[tone]} border rounded-lg ${compact ? "p-2" : "p-2.5"} text-left transition-colors`}
    >
      <Icon className={compact ? "h-3.5 w-3.5 mb-0.5" : "h-4 w-4 mb-1"} />
      <p className={`${compact ? "text-[11px]" : "text-xs"} font-semibold leading-tight text-slate-800`}>
        {title}
      </p>
      <p className="text-[9px] text-slate-500 leading-tight">{subtitle}</p>
    </motion.button>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <Icon className="h-3 w-3 text-orange-500" />
        {label}
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-snug text-slate-800">{value}</p>
    </div>
  );
}
