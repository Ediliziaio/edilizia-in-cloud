/**
 * SilvioAIPage (Beta) — interfaccia stile ChatGPT/Claude per Silvio AI.
 *
 * Sinistra: lista conversazioni (raggruppate per data + ricerca; drawer su mobile).
 * Destra: thread ricco (avatar, meta, fonti, follow-up, azioni) + composer con
 * allegati (riuso bucket `silvio-uploads`) e stop generazione.
 * Empty-state proattivo data-aware: `SilvioAlertsPanel` + `SilvioActionProposals`.
 *
 * Multi-conversazione + memoria per-canale dal motore esistente (edge `silvio-chat`).
 * NON tocca la SilvioChatSheet. Tema CHIARO (no dark mode).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { segnalaCreditoEsaurito } from "@/lib/creditoEsaurito";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  MessageSquare,
  ArrowUp,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
  Loader2,
  Copy,
  RefreshCw,
  Pencil,
  Check,
  X,
  Search,
  ArrowDown,
  Paperclip,
  Camera,
  FileText,
  Square,
  Mic,
  Pin,
  ChevronDown,
  Brain,
  RotateCcw,
  AlertTriangle,
  SquarePen,
  CalendarClock,
  Folder,
  FolderPlus,
  FolderInput,
  ChevronRight,
  MoreVertical,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ChatMarkdown } from "@/components/ui/ChatMarkdown";
import { AIAssistantInterface } from "@/components/ui/ai-assistant-interface";
import { AiLoader } from "@/components/ui/ai-loader";
import { useAnimatedText } from "@/components/ui/animated-text";
import { AiMessageMetaTop, AiMessageMetaBottom, type AiMeta } from "@/components/silvio/AiMessageMeta";
import { SilvioRatingButtons } from "@/components/silvio/SilvioRatingButtons";
import { SilvioActionProposals } from "@/components/silvio/SilvioActionProposals";
import { SilvioProgrammatePanel } from "@/components/silvio/SilvioProgrammatePanel";
import { SilvioAvatar } from "@/components/silvio/SilvioAvatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { SILVIO_SKILLS } from "@/lib/silvio-skills";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const SILVIO_SENDER_ID = "00000000-0000-0000-0000-000000000002";
const MAX_ATTACHMENTS = 5;
const MAX_FILE_MB = 10;
const ATTACH_ACCEPT =
  "image/*,application/pdf,audio/*,text/*,application/json,application/xml,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.txt,.csv,.md,.json,.docx,.xlsx,.xls,.log,.xml,.yaml,.yml";

type AttachmentKind = "image" | "pdf" | "audio" | "text-doc" | "office-doc" | "other";
const OFFICE_EXTENSIONS = [".docx", ".xlsx", ".xls"];
const TEXT_EXTENSIONS = [
  ".txt", ".csv", ".tsv", ".md", ".markdown", ".json", ".jsonl", ".log",
  ".xml", ".yaml", ".yml", ".html", ".htm", ".rtf", ".ini", ".conf", ".sql",
];

function detectKind(file: File): AttachmentKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("audio/")) return "audio";
  const lower = file.name.toLowerCase();
  if (
    OFFICE_EXTENSIONS.some((e) => lower.endsWith(e)) ||
    file.type.includes("wordprocessingml") ||
    file.type.includes("spreadsheetml") ||
    file.type === "application/msword" ||
    file.type === "application/vnd.ms-excel"
  )
    return "office-doc";
  if (TEXT_EXTENSIONS.some((e) => lower.endsWith(e)) || file.type.startsWith("text/")) return "text-doc";
  return "other";
}

interface PendingAttachment {
  id: string;
  file: File;
  kind: AttachmentKind;
  storagePath?: string;
  uploading: boolean;
  uploadError?: string;
  previewUrl?: string;
}

interface SilvioMsg {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
  /** true mentre silvio-chat sta ancora scrivendo (arriva a lotti via UPDATE). */
  streaming?: boolean | null;
  rag_sources?: Array<{ id?: string; title?: string; url?: string }> | null;
  ai_confidence?: "high" | "medium" | "low" | null;
  ai_requires_human_review?: boolean | null;
  followup_suggestions?: string[] | null;
  council_data?: AiMeta["council_data"] | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
}

interface Conversazione {
  id: string;
  titolo: string;
  ultimo_messaggio_at: string;
  n_messaggi: number;
  pinned?: boolean;
  folder_id?: string | null;
}

interface Cartella {
  id: string;
  nome: string;
  colore: string;
  posizione: number;
  n_conversazioni: number;
}

function formatOra(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Spunti rapidi mostrati su una conversazione nuova/vuota. */
const QUICK_PROMPTS: Array<{ label: string; prompt: string }> = [
  { label: "📅 Cosa conta oggi?", prompt: "Cosa conta oggi? Dammi le 3 priorità più importanti." },
  { label: "💰 Chi mi deve pagare?", prompt: "Quali clienti hanno fatture scadute o in scadenza? Mostrami gli importi." },
  { label: "📊 Margini cantieri", prompt: "Come stanno andando i margini dei miei cantieri attivi?" },
  { label: "📋 Bozza preventivo", prompt: "Aiutami a creare una bozza di preventivo: chiedimi i dati che ti servono." },
];

const ORDINE_GRUPPI = ["Oggi", "Ieri", "Ultimi 7 giorni", "Ultimi 30 giorni", "Precedenti"];
function gruppoData(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const giorno = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const oggi = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((oggi - giorno) / 86_400_000);
  if (diff <= 0) return "Oggi";
  if (diff === 1) return "Ieri";
  if (diff <= 7) return "Ultimi 7 giorni";
  if (diff <= 30) return "Ultimi 30 giorni";
  return "Precedenti";
}

/** Titolo conversazione "intelligente" (locale): toglie saluti/filler, taglia a
 *  confine di parola, capitalizza. Migliore dei primi 40 caratteri grezzi. */
function titoloIntelligente(text: string, fallback: string): string {
  let t = text.trim();
  if (!t) return fallback;
  t = t.replace(/^(ciao|ehi|hey|buongiorno|buonasera|salve|ok|allora|senti|scusa|per favore|silvio)[\s,!:.]+/gi, "");
  t = t.replace(/\bsilvio\b/gi, "").replace(/\s+/g, " ").trim();
  if (!t) t = text.trim();
  if (t.length > 42) {
    const cut = t.slice(0, 42);
    const lastSpace = cut.lastIndexOf(" ");
    t = `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Stato "pensiero" dinamico: testo che evolve mentre Silvio elabora, con una
 *  prima fase scelta in base alla domanda (effetto agentico, 100% frontend). */
function useThinkingStatus(active: boolean, hint: string): string {
  const phases = useMemo(() => {
    const h = hint.toLowerCase();
    const first = /fattur|credit|pagament|scadut|sollecit|incass/.test(h)
      ? "Sto controllando fatture e pagamenti…"
      : /cantier|lavor|comm|budget/.test(h)
        ? "Sto analizzando i cantieri…"
        : /preventiv|offert|quotaz/.test(h)
          ? "Sto preparando il preventivo…"
          : /client|lead|opportun|crm/.test(h)
            ? "Sto guardando clienti e opportunità…"
            : /cassa|flusso|margin|cost|tesorer/.test(h)
              ? "Sto calcolando i numeri…"
              : /email|posta|mail/.test(h)
                ? "Sto leggendo le email…"
                : /document|ddt|bolletta|alleg|pdf|foto|fattura/.test(h)
                  ? "Sto leggendo il documento…"
                  : "Sto leggendo i dati…";
    return [first, "Sto ragionando…", "Sto preparando la risposta…"];
  }, [hint]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) {
      setIdx(0);
      return;
    }
    setIdx(0);
    const t = setInterval(() => setIdx((i) => Math.min(i + 1, phases.length - 1)), 2600);
    return () => clearInterval(t);
  }, [active, phases]);
  return phases[idx] ?? "Silvio sta pensando…";
}

export default function SilvioAIPage() {
  const { effectiveCompany, user, profile } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const firstName = profile?.first_name?.trim() || "";
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const isMobile = useIsMobile();
  const [sending, setSending] = useState(false);
  // Aperta di default solo da md in su: su mobile è un drawer a tutta altezza
  // che coprirebbe l'hero al primo ingresso nella pagina.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 768,
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [programmateOpen, setProgrammateOpen] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [lastFailed, setLastFailed] = useState<{ text: string } | null>(null);
  const [memoriaOpen, setMemoriaOpen] = useState(false);
  const [onboarded, setOnboarded] = useState(true);
  const [toolSteps, setToolSteps] = useState<{ id: string; label: string }[]>([]);
  // Messaggi arrivati in streaming dal server (colonna `streaming`): per loro
  // il typewriter finto non parte mai, nemmeno all'aggiornamento definitivo.
  // E' stato, non ref: lo si legge nel render della lista.
  const [streamedIds, setStreamedIds] = useState<Set<string>>(() => new Set());
  const segnaStreamed = useCallback((id: string) => {
    setStreamedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const sendAbortRef = useRef<AbortController | null>(null);
  const deeplinkHandledRef = useRef(false);
  // Istante di mount: solo i messaggi creati DOPO vengono animati (typewriter).
  const [mountTime] = useState(() => Date.now());

  // Onboarding (mostrato una volta nell'empty-state)
  useEffect(() => {
    try {
      setOnboarded(localStorage.getItem("silvio_ai_onboarded") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const dismissOnboarding = () => {
    try {
      localStorage.setItem("silvio_ai_onboarded", "1");
    } catch {
      /* ignore */
    }
    setOnboarded(true);
  };

  // Dettatura vocale → trascrizione (append al draft)
  const voice = useVoiceInput((t) => setDraft((p) => (p ? `${p} ${t}` : t)));

  // Conversazioni fissate — sincronizzate server-side (RPC silvio_pin_conversazione)
  const togglePin = async (id: string, pinned: boolean) => {
    qc.setQueryData<Conversazione[]>(["silvio-conversazioni", userId], (prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, pinned } : c)) : prev,
    );
    const { error } = await supabase.rpc(
      "silvio_pin_conversazione" as never,
      { p_channel_id: id, p_pinned: pinned } as never,
    );
    if (error) {
      // rollback dell'aggiornamento ottimistico
      qc.setQueryData<Conversazione[]>(["silvio-conversazioni", userId], (prev) =>
        prev ? prev.map((c) => (c.id === id ? { ...c, pinned: !pinned } : c)) : prev,
      );
      toast.error("Non sono riuscito a salvare. Riprova tra poco.");
    }
    void refetchConvs();
  };

  // ── Cartelle / Progetti (organizzazione conversazioni, per-utente) ──────────
  const { data: cartelle = [] } = useQuery({
    queryKey: ["silvio-cartelle", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<Cartella[]> => {
      const { data, error } = await supabase.rpc("silvio_lista_cartelle" as never);
      if (error || !Array.isArray(data)) return [];
      return data as Cartella[];
    },
  });

  // Conteggio promemoria in sospeso → badge sul bottone "Programmate".
  const { data: programmateCount = 0 } = useQuery({
    queryKey: ["silvio-reminders-count", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count } = await supabase
        .from("silvio_reminders" as never)
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "pending");
      return count ?? 0;
    },
  });

  const toggleFolder = (id: string) =>
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleNuovaCartella = async () => {
    const nome = typeof window !== "undefined" ? window.prompt("Nome della nuova cartella") : null;
    if (!nome || !nome.trim()) return;
    const { error } = await supabase.rpc("silvio_crea_cartella" as never, { p_nome: nome.trim(), p_colore: "orange" } as never);
    if (error) {
      toast.error("Non sono riuscito a creare la cartella.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["silvio-cartelle", userId] });
    toast.success("Cartella creata");
  };

  const handleRinominaCartella = async (id: string, attuale: string) => {
    const nome = typeof window !== "undefined" ? window.prompt("Rinomina cartella", attuale) : null;
    if (!nome || !nome.trim() || nome.trim() === attuale) return;
    const { error } = await supabase.rpc("silvio_rinomina_cartella" as never, { p_id: id, p_nome: nome.trim() } as never);
    if (error) {
      toast.error("Rinomina non riuscita.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["silvio-cartelle", userId] });
  };

  const handleEliminaCartella = async (id: string) => {
    if (typeof window !== "undefined" && !window.confirm("Eliminare la cartella? Le chat NON verranno eliminate: torneranno semplicemente senza cartella.")) return;
    const { error } = await supabase.rpc("silvio_elimina_cartella" as never, { p_id: id } as never);
    if (error) {
      toast.error("Eliminazione non riuscita.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["silvio-cartelle", userId] });
    void refetchConvs();
    toast.success("Cartella eliminata");
  };

  const spostaInCartella = async (channelId: string, folderId: string | null) => {
    qc.setQueryData<Conversazione[]>(["silvio-conversazioni", userId], (prev) =>
      prev ? prev.map((c) => (c.id === channelId ? { ...c, folder_id: folderId } : c)) : prev,
    );
    const { error } = await supabase.rpc("silvio_sposta_conversazione" as never, { p_channel_id: channelId, p_folder_id: folderId } as never);
    if (error) {
      toast.error("Spostamento non riuscito.");
      void refetchConvs();
      return;
    }
    qc.invalidateQueries({ queryKey: ["silvio-cartelle", userId] });
  };

  // ── Conversazioni (RPC; esclude il canale legacy) ──────────────────────────
  const { data: conversazioni = [], refetch: refetchConvs } = useQuery({
    queryKey: ["silvio-conversazioni", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Conversazione[]> => {
      const { data, error } = await supabase.rpc("silvio_lista_conversazioni" as never);
      if (error || !Array.isArray(data)) return [];
      return data as Conversazione[];
    },
    staleTime: 30_000,
  });

  // All'apertura mostra SEMPRE la "Nuova chat" (hero), come ChatGPT/Grok — non
  // auto-apriamo l'ultima conversazione. La si sceglie dalla sidebar o si inizia
  // a scrivere (la conversazione viene creata al primo messaggio).

  const activeConv = conversazioni.find((c) => c.id === activeId) ?? null;

  // Ricerca anche nel CONTENUTO dei messaggi (non solo nei titoli)
  const convIds = useMemo(() => conversazioni.map((c) => c.id), [conversazioni]);
  // Debounce della ricerca (per la query nel contenuto messaggi)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: msgMatchIds } = useQuery({
    queryKey: ["silvio-msg-search", debouncedSearch.trim().toLowerCase(), convIds.length],
    enabled: debouncedSearch.trim().length >= 2 && convIds.length > 0,
    queryFn: async (): Promise<string[]> => {
      const q = debouncedSearch.trim();
      const { data } = await supabase
        .from("internal_chat_messages")
        .select("channel_id")
        .in("channel_id", convIds)
        .ilike("content", `%${q}%`)
        .limit(200);
      return Array.from(new Set(((data ?? []) as { channel_id: string }[]).map((r) => r.channel_id)));
    },
    staleTime: 10_000,
  });

  // Conversazioni dentro le cartelle (raggruppate per cartella). Quando si cerca,
  // mostra solo le cartelle con risultati.
  const cartelleConItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = new Set(msgMatchIds ?? []);
    const ok = (c: Conversazione) => !q || c.titolo.toLowerCase().includes(q) || matches.has(c.id);
    const list = cartelle.map((f) => ({
      ...f,
      items: conversazioni.filter((c) => c.folder_id === f.id && ok(c)),
    }));
    return q ? list.filter((f) => f.items.length > 0) : list;
  }, [cartelle, conversazioni, search, msgMatchIds]);

  const gruppi = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = new Set(msgMatchIds ?? []);
    // Esclude le conversazioni assegnate a una cartella (mostrate nella sezione cartella).
    const base = conversazioni.filter((c) => !c.folder_id);
    const filtrate = q
      ? base.filter((c) => c.titolo.toLowerCase().includes(q) || matches.has(c.id))
      : base;
    const fissate = filtrate.filter((c) => c.pinned);
    const altre = filtrate.filter((c) => !c.pinned);
    const map = new Map<string, Conversazione[]>();
    for (const c of altre) {
      const g = gruppoData(c.ultimo_messaggio_at);
      (map.get(g) ?? map.set(g, []).get(g)!).push(c);
    }
    const perData = ORDINE_GRUPPI.filter((g) => map.has(g)).map((g) => ({ gruppo: g, items: map.get(g)!, isPinned: false }));
    return fissate.length > 0 ? [{ gruppo: "Fissate", items: fissate, isPinned: true }, ...perData] : perData;
  }, [conversazioni, search, msgMatchIds]);

  // ── Messaggi conversazione attiva ──────────────────────────────────────────
  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ["silvio-ai-messages", activeId],
    enabled: !!activeId,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async (): Promise<SilvioMsg[]> => {
      if (!activeId) return [];
      const { data } = await supabase
        .from("internal_chat_messages")
        .select(
          "id, channel_id, sender_id, content, message_type, created_at, streaming, rag_sources, ai_confidence, ai_requires_human_review, followup_suggestions, council_data, attachment_url, attachment_name",
        )
        .eq("channel_id", activeId)
        .order("created_at", { ascending: false })
        .limit(50);
      return ((data ?? []) as SilvioMsg[]).slice().reverse();
    },
  });

  // ── Realtime: INSERT + UPDATE (streaming) ──────────────────────────────────
  useEffect(() => {
    if (!activeId) return;
    const key = ["silvio-ai-messages", activeId];
    const channel = supabase
      .channel(`silvio-ai-${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "internal_chat_messages", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const m = payload.new as SilvioMsg | undefined;
          if (!m?.id) return;
          if (m.sender_id === SILVIO_SENDER_ID) setToolSteps([]); // risposta arrivata → nascondi step
          // Arrivato in streaming: il testo scorre gia' dal server, niente
          // typewriter — nemmeno quando diventa definitivo.
          if (m.streaming) segnaStreamed(m.id);
          qc.setQueryData<SilvioMsg[]>(key, (prev) =>
            !prev ? [m] : prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "internal_chat_messages", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const m = payload.new as SilvioMsg | undefined;
          if (!m?.id) return;
          if (m.streaming) segnaStreamed(m.id);
          qc.setQueryData<SilvioMsg[]>(key, (prev) => {
            if (!prev) return [m];
            const idx = prev.findIndex((x) => x.id === m.id);
            if (idx === -1) return [...prev, m];
            const next = prev.slice();
            next[idx] = m;
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "silvio_tool_steps", filter: `channel_id=eq.${activeId}` },
        (payload) => {
          const s = payload.new as { id?: string; label?: string } | undefined;
          if (s?.id && s.label) {
            setToolSteps((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, { id: s.id!, label: s.label! }]));
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeId, qc, segnaStreamed]);

  // Auto-scroll in fondo su nuovi messaggi / streaming
  const lastContent = messages[messages.length - 1]?.content;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && !showScrollDown) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastContent, showScrollDown]);

  // Auto-resize del textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, [draft]);

  // Cleanup object URLs allo smontaggio
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(
    () => () => {
      attachmentsRef.current.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      sendAbortRef.current?.abort();
    },
    [],
  );

  const onThreadScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 240);
  };
  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setShowScrollDown(false);
  };

  // ── Allegati ────────────────────────────────────────────────────────────────
  const uploadAttachment = async (att: PendingAttachment): Promise<PendingAttachment> => {
    if (!companyId || !userId) throw new Error("Setup non pronto");
    const safeName = att.file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const path = `${companyId}/${userId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from("silvio-uploads")
      .upload(path, att.file, { contentType: att.file.type || "application/octet-stream", upsert: false });
    if (error) throw new Error(`Upload fallito: ${error.message}`);
    return { ...att, storagePath: path, uploading: false };
  };

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      toast.error(`Massimo ${MAX_ATTACHMENTS} allegati per messaggio`);
      return;
    }
    for (const file of files) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`"${file.name}" supera ${MAX_FILE_MB}MB. Salta.`);
        continue;
      }
      const kind = detectKind(file);
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = kind === "image" ? URL.createObjectURL(file) : undefined;
      const pending: PendingAttachment = { id, file, kind, uploading: true, previewUrl };
      setAttachments((prev) => [...prev, pending]);
      uploadAttachment(pending)
        .then((done) => setAttachments((prev) => prev.map((p) => (p.id === id ? done : p))))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(msg);
          setAttachments((prev) => prev.map((p) => (p.id === id ? { ...p, uploading: false, uploadError: msg } : p)));
        });
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    addFiles(files);
  };

  // Incolla (immagine dagli appunti) + drag-and-drop nella chat
  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!activeId) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) addFiles(files);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const t = prev.find((p) => p.id === id);
      if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  // Drag-and-drop allegati: reset robusto dell'overlay "Rilascia per allegare".
  // Evita che resti bloccato se il drag finisce fuori area o si cambia conversazione.
  useEffect(() => {
    setDragOver(false); // cambio chat → nessun overlay residuo
    setDraft(""); // evita che la bozza "scappi" in un'altra conversazione
    const reset = () => setDragOver(false);
    window.addEventListener("drop", reset);
    window.addEventListener("dragend", reset);
    window.addEventListener("mouseup", reset);
    return () => {
      window.removeEventListener("drop", reset);
      window.removeEventListener("dragend", reset);
      window.removeEventListener("mouseup", reset);
    };
  }, [activeId]);

  // ── Invio / rigenera / stop ──────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async ({
      channelId,
      text,
      atts,
      insertUser,
    }: {
      channelId: string;
      text: string;
      atts: PendingAttachment[];
      insertUser: boolean;
    }) => {
      const trimmed = text.trim();
      if ((!trimmed && atts.length === 0) || !userId || !companyId) return;
      // Abort pronto SUBITO: così "Stop" annulla anche durante upload/insert pre-invoke.
      const ac = new AbortController();
      sendAbortRef.current = ac;
      if (insertUser) {
        const first = atts[0];
        let firstUrl: string | null = null;
        if (first?.storagePath) {
          const { data: signed } = await supabase.storage
            .from("silvio-uploads")
            .createSignedUrl(first.storagePath, 60 * 60 * 24 * 7);
          firstUrl = signed?.signedUrl ?? null;
        }
        const messageType =
          atts.length === 0
            ? "text"
            : first?.kind === "image"
              ? "image"
              : first?.kind === "audio"
                ? "audio"
                : "file";
        const displayContent = trimmed || atts.map((a) => `📎 ${a.file.name}`).join(" · ");
        const { error: insErr } = await supabase.from("internal_chat_messages").insert({
          channel_id: channelId,
          sender_id: userId,
          company_id: companyId,
          content: displayContent,
          message_type: messageType,
          attachment_url: firstUrl,
          attachment_name: first?.file.name ?? null,
        });
        if (insErr) throw new Error(insErr.message);
        qc.invalidateQueries({ queryKey: ["silvio-ai-messages", channelId] });
      }
      if (ac.signal.aborted) return; // "Stop" premuto durante gli await pre-invoke
      const res = await supabase.functions.invoke("silvio-chat", {
        body: {
          channel_id: channelId,
          message: trimmed || "",
          attachments: atts.map((a) => ({
            storage_path: a.storagePath!,
            mime_type: a.file.type || "application/octet-stream",
            file_name: a.file.name,
            kind: a.kind,
          })),
        },
        signal: ac.signal,
      });
      if (res.error) throw new Error(res.error.message);
      // Credito finito: Silvio ha gia' scritto in chat la frase con il link ai
      // crediti; in piu' si apre la finestra di ricarica, come per ogni altro
      // strumento a consumo.
      const esito = res.data as { ok?: boolean; error?: string } | null;
      if (esito?.ok === false && esito.error === "credito_esaurito") {
        segnalaCreditoEsaurito({ portafoglio: "ai" });
      }
      qc.invalidateQueries({ queryKey: ["silvio-ai-messages", channelId] });
    },
    onMutate: () => {
      setToolSteps([]); // #10 nuova richiesta → reset step live
    },
    onError: (e: Error, variables) => {
      const isAbort = e.name === "AbortError" || /abort/i.test(e.message);
      if (!isAbort) {
        console.error("[silvio-chat]", e);
        toast.error("Silvio non è riuscito a rispondere. Riprova.");
        if (variables?.text?.trim()) setLastFailed({ text: variables.text });
      }
    },
    onSettled: () => {
      sendAbortRef.current = null;
      setSending(false);
      void refetchConvs();
    },
  });

  const handleRetry = () => {
    if (!lastFailed || !activeId || sending) return;
    const lastMsg = messages[messages.length - 1];
    const userMsgPresent = !!lastMsg && lastMsg.sender_id !== SILVIO_SENDER_ID && lastMsg.content === lastFailed.text;
    const text = lastFailed.text;
    setLastFailed(null);
    setSending(true);
    sendMutation.mutate({ channelId: activeId, text, atts: [], insertUser: !userMsgPresent });
  };

  const creaConversazione = async (titolo: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc(
      "silvio_crea_conversazione" as never,
      { p_titolo: titolo } as never,
    );
    if (error || !data) {
      toast.error("Non riesco ad avviare una nuova conversazione. Riprova tra poco.");
      return null;
    }
    await refetchConvs();
    return String(data);
  };

  // Invio "semplice" (empty-state, follow-up chips, CTA alert) — senza allegati
  const handleSend = async (text: string) => {
    const t = text.trim();
    if (!t || sending) return;
    setLastFailed(null);
    let chId = activeId;
    if (!chId) {
      chId = await creaConversazione(titoloIntelligente(t, "Nuova conversazione"));
      if (!chId) return;
      setActiveId(chId);
    }
    setSending(true);
    setDraft("");
    setShowScrollDown(false);
    sendMutation.mutate({ channelId: chId, text: t, atts: [], insertUser: true });
  };

  // Invio dal composer — testo + allegati
  const handleComposerSend = async () => {
    const t = draft.trim();
    const ready = attachments.filter((a) => a.storagePath && !a.uploadError);
    if ((!t && ready.length === 0) || sending) return;
    if (attachments.some((a) => a.uploading)) {
      toast.error("Allegati ancora in upload, attendi");
      return;
    }
    setLastFailed(null);
    let chId = activeId;
    if (!chId) {
      chId = await creaConversazione(titoloIntelligente(t, ready[0]?.file.name ?? "Nuova conversazione"));
      if (!chId) return;
      setActiveId(chId);
    }
    setSending(true);
    setDraft("");
    setShowScrollDown(false);
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
    sendMutation.mutate({ channelId: chId, text: t, atts: ready, insertUser: true });
  };

  const handleRigenera = () => {
    if (!activeId || sending) return;
    const lastUser = [...messages].reverse().find((m) => m.sender_id !== SILVIO_SENDER_ID);
    if (!lastUser) return;
    setSending(true);
    sendMutation.mutate({ channelId: activeId, text: lastUser.content, atts: [], insertUser: false });
  };

  const handleStop = () => {
    sendAbortRef.current?.abort();
    sendAbortRef.current = null;
    setSending(false);
    toast.info("Generazione interrotta");
  };

  const handleNuova = () => {
    // Torna all'hero "Nuova chat" — la conversazione si crea al primo invio.
    setActiveId(null);
    setDraft("");
    setLastFailed(null);
    if (typeof window !== "undefined" && window.innerWidth < 768) setSidebarOpen(false);
  };

  // Scorciatoia: Cmd/Ctrl+K → nuova conversazione (dopo handleNuova per evitare TDZ)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        void handleNuova();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
     
  }, []);

  const handleElimina = async (id: string) => {
    if (!window.confirm("Eliminare questa conversazione e tutti i suoi messaggi?")) return;
    const { error } = await supabase.rpc("silvio_elimina_conversazione" as never, { p_channel_id: id } as never);
    if (error) {
      toast.error("Non sono riuscito a eliminare la conversazione. Riprova.");
      return;
    }
    if (activeId === id) setActiveId(null);
    await refetchConvs();
    toast.success("Conversazione eliminata");
  };

  // Riga conversazione (riusata sia nelle cartelle sia nei gruppi per data).
  const renderConvRow = (c: Conversazione) => {
    const isPin = !!c.pinned;
    // Voci "Sposta in…" condivise tra dropdown desktop e sottomenu mobile.
    const spostaItems = (
      <>
        {cartelle.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Nessuna cartella ancora</div>
        )}
        {cartelle.map((f) => (
          <DropdownMenuItem key={f.id} className="gap-2" onClick={() => void spostaInCartella(c.id, f.id)}>
            <Folder className="h-3.5 w-3.5 text-orange-500" />
            <span className="truncate">{f.nome}</span>
            {c.folder_id === f.id && <Check className="ml-auto h-3.5 w-3.5 text-orange-500" />}
          </DropdownMenuItem>
        ))}
        {c.folder_id && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-slate-600" onClick={() => void spostaInCartella(c.id, null)}>
              <X className="h-3.5 w-3.5" /> Togli dalla cartella
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2" onClick={() => void handleNuovaCartella()}>
          <FolderPlus className="h-3.5 w-3.5" /> Nuova cartella…
        </DropdownMenuItem>
      </>
    );
    return (
      <div
        key={c.id}
        className={cn(
          "group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors",
          activeId === c.id ? "bg-orange-50 text-orange-900" : "hover:bg-slate-100 text-slate-700",
        )}
        onClick={() => {
          setActiveId(c.id);
          if (typeof window !== "undefined" && window.innerWidth < 768) setSidebarOpen(false);
        }}
      >
        <MessageSquare className={cn("h-4 w-4 shrink-0", activeId === c.id ? "text-orange-500" : "text-slate-400")} />
        <span className="flex-1 min-w-0 truncate text-sm">{c.titolo}</span>
        <span className="text-[10px] text-slate-400 group-hover:hidden">
          {isPin ? <Pin className="h-3 w-3 fill-orange-400 text-orange-400" /> : formatOra(c.ultimo_messaggio_at)}
        </span>
        {/* Desktop: 3 azioni inline che compaiono in hover (com'erano). Su mobile
            erano SEMPRE visibili e, gonfiate dal min-44 globale, schiacciavano il
            titolo a 2-3 lettere → sostituite da un unico menu "⋯". */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="hidden md:group-hover:block text-slate-400 hover:text-orange-500 transition"
              aria-label="Sposta in cartella"
              title="Sposta in cartella"
            >
              <FolderInput className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuLabel className="text-xs">Sposta in…</DropdownMenuLabel>
            {spostaItems}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          onClick={(e) => {
            e.stopPropagation();
            void togglePin(c.id, !isPin);
          }}
          className={cn(
            "hidden md:group-hover:block transition",
            isPin ? "text-orange-500" : "text-slate-400 hover:text-orange-500",
          )}
          aria-label={isPin ? "Rimuovi dai fissati" : "Fissa in alto"}
          title={isPin ? "Rimuovi dai fissati" : "Fissa in alto"}
        >
          <Pin className={cn("h-3.5 w-3.5", isPin && "fill-orange-400 text-orange-400")} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            void handleElimina(c.id);
          }}
          className="hidden md:group-hover:block text-slate-400 hover:text-rose-500 transition"
          aria-label="Elimina"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {/* Mobile: tutte le azioni in un menu solo — il titolo respira */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="md:hidden -my-1 rounded-md p-2 text-slate-400 active:bg-slate-100"
              aria-label="Azioni conversazione"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem className="gap-2" onClick={() => void togglePin(c.id, !isPin)}>
              <Pin className={cn("h-3.5 w-3.5", isPin && "fill-orange-400 text-orange-400")} />
              {isPin ? "Rimuovi dai fissati" : "Fissa in alto"}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <FolderInput className="h-3.5 w-3.5" /> Sposta in…
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">{spostaItems}</DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-rose-600 focus:text-rose-600" onClick={() => void handleElimina(c.id)}>
              <Trash2 className="h-3.5 w-3.5" /> Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const copiaConversazione = () => {
    if (messages.length === 0) return;
    const txt = messages
      .map((m) => `${m.sender_id === SILVIO_SENDER_ID ? "Silvio" : "Tu"}: ${m.content}`)
      .join("\n\n");
    void navigator.clipboard?.writeText(txt);
    toast.success("Conversazione copiata");
  };

  const confermaRinomina = async () => {
    const nome = renameValue.trim();
    setRenaming(false);
    if (!activeId || !nome || nome === activeConv?.titolo) return;
    const { error } = await supabase.rpc(
      "silvio_rinomina_conversazione" as never,
      { p_channel_id: activeId, p_titolo: nome } as never,
    );
    if (error) {
      toast.error("Rinomina non disponibile (richiede l'aggiornamento del database).");
      return;
    }
    void refetchConvs();
  };

  const showHero = !activeId; // nessuna conversazione selezionata → hero proattivo
  const threadVuoto = !!activeId && messages.length === 0 && !loadingMsgs;

  // Stato "pensiero" dinamico basato sull'ultima domanda dell'utente
  const lastUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id !== SILVIO_SENDER_ID) return messages[i].content;
    }
    return "";
  }, [messages]);
  const thinking = useThinkingStatus(sending, lastUserText);

  // Deep-link: ?ask=… apre Silvio AI e avvia subito la domanda (da altre pagine)
  useEffect(() => {
    if (deeplinkHandledRef.current) return;
    const ask = searchParams.get("ask");
    if (!ask || !companyId || !userId) return;
    deeplinkHandledRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("ask");
    setSearchParams(next, { replace: true });
    void handleSend(ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, companyId, userId]);

  // Slash command "/" → menu skill Silvio
  const slashQuery = draft.startsWith("/") ? draft.slice(1).toLowerCase() : null;
  const slashItems =
    slashQuery !== null && !slashQuery.includes(" ")
      ? SILVIO_SKILLS.filter(
          (s) =>
            !slashQuery ||
            s.label.toLowerCase().includes(slashQuery) ||
            s.id.toLowerCase().includes(slashQuery) ||
            s.hint.toLowerCase().includes(slashQuery),
        ).slice(0, 6)
      : [];
  const showSlash = slashItems.length > 0 && !sending;

  // ── Performance: callback STABILI per le bolle memoizzate (così digitare nel
  // composer, i tick del "pensiero" e gli step NON ri-renderizzano il thread) ──
  const handleSendRef = useRef(handleSend);
  const handleRigeneraRef = useRef(handleRigenera);
  useEffect(() => {
    handleSendRef.current = handleSend;
    handleRigeneraRef.current = handleRigenera;
  });
  const onFollowupStable = useCallback((q: string) => void handleSendRef.current(q), []);
  const onRegeneraStable = useCallback(() => handleRigeneraRef.current(), []);
  const onEditUserStable = useCallback((content: string) => {
    setDraft(content);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  // Lista messaggi renderizzata e memoizzata: ricalcola solo se cambiano i
  // messaggi o lo stato `sending` (non a ogni battitura).
  const renderedMessages = useMemo(
    () =>
      messages.map((m, idx) => {
        const isLast = idx === messages.length - 1;
        if (m.sender_id === SILVIO_SENDER_ID) {
          const isLive = new Date(m.created_at).getTime() >= mountTime - 1000;
          return (
            <MessaggioSilvio
              key={m.id}
              m={m}
              live={m.streaming === true}
              animate={isLast && isLive && !m.streaming && !streamedIds.has(m.id)}
              canRegenerate={isLast && !sending}
              onFollowup={onFollowupStable}
              onRegenera={onRegeneraStable}
            />
          );
        }
        return <MessaggioUtente key={m.id} m={m} onEdit={onEditUserStable} />;
      }),
    [messages, sending, mountTime, streamedIds, onFollowupStable, onRegeneraStable, onEditUserStable],
  );

  return (
    <div className="flex h-full min-h-0 bg-slate-50 overflow-hidden">
      {/* Backdrop mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      {/* Barra slim (desktop): la larghezza anima in sincrono con l'aside →
          chiusura/apertura fluida (la sidebar si "restringe" verso il rail). */}
      <div
        className={cn(
          "hidden md:flex shrink-0 flex-col items-center gap-1 overflow-hidden bg-white py-3",
          "transition-[width,opacity] duration-300 ease-in-out",
          sidebarOpen ? "md:w-0 md:opacity-0" : "md:w-14 md:opacity-100 md:border-r md:border-slate-200",
        )}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          title="Espandi conversazioni"
          aria-label="Espandi conversazioni"
          className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <PanelLeft className="h-5 w-5" />
        </button>
        <button
          onClick={handleNuova}
          title="Nuova chat"
          aria-label="Nuova chat"
          className="h-9 w-9 flex items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow hover:from-orange-600 hover:to-amber-500"
        >
          <SquarePen className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            setSidebarOpen(true);
            setSearchOpen(true);
          }}
          title="Cerca"
          aria-label="Cerca"
          className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <Search className="h-5 w-5" />
        </button>
        <button
          onClick={() => setProgrammateOpen(true)}
          title="Attività programmate"
          aria-label="Attività programmate"
          className="relative h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <CalendarClock className="h-5 w-5" />
          {programmateCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[16px] h-4 px-1 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center">
              {programmateCount > 9 ? "9+" : programmateCount}
            </span>
          )}
        </button>
      </div>

      {/* Sidebar conversazioni (drawer su mobile, colonna che anima la width su desktop) */}
      <aside
        className={cn(
          // Mobile z-50: a z-40 la barra in basso dell'app (stesso livello, più
          // avanti nella pagina) copriva le ultime conversazioni.
          "z-40 max-md:z-50 w-72 shrink-0 bg-white flex flex-col overflow-hidden",
          "fixed inset-y-0 left-0 md:static transition-[width,transform,opacity] duration-300 ease-in-out",
          sidebarOpen
            ? "translate-x-0 md:w-64 md:opacity-100 border-r border-slate-200"
            : "-translate-x-full md:translate-x-0 md:w-0 md:opacity-0",
        )}
      >
        {/* Mobile: intestazione del drawer con chiusura esplicita (prima si
            chiudeva solo toccando lo sfondo — non si capiva). */}
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 md:hidden">
          <span className="text-sm font-semibold text-slate-800">Le tue chat</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="-mr-1 rounded-md p-2 text-slate-400 active:bg-slate-100"
            aria-label="Chiudi elenco conversazioni"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-2 border-b border-slate-100">
          {searchOpen ? (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearch("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="Cerca conversazioni…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 py-2 text-sm outline-none focus:border-orange-300"
              />
              <button
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Chiudi ricerca"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              <button
                onClick={handleNuova}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <SquarePen className="h-4 w-4 text-orange-500" /> Nuova chat
              </button>
              <button
                onClick={() => setSearchOpen(true)}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Search className="h-4 w-4 text-slate-400" /> Cerca
              </button>
              <button
                onClick={() => setProgrammateOpen(true)}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <CalendarClock className="h-4 w-4 text-orange-500" /> Programmate
                {programmateCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-orange-100 text-orange-700 text-[10px] font-semibold flex items-center justify-center">
                    {programmateCount}
                  </span>
                )}
              </button>
              {/* Mobile no: organizzare in cartelle è lavoro da scrivania. */}
              <button
                onClick={() => void handleNuovaCartella()}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors max-md:hidden"
              >
                <FolderPlus className="h-4 w-4 text-slate-400" /> Nuova cartella
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {/* Cartelle / Progetti */}
          {cartelleConItems.map((folder) => {
            const collapsed = collapsedFolders.has(folder.id);
            return (
              <div key={folder.id}>
                <div className="group/f flex items-center gap-1 px-2 pb-1">
                  <button
                    onClick={() => toggleFolder(folder.id)}
                    className="flex flex-1 min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
                  >
                    <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", !collapsed && "rotate-90")} />
                    <Folder className="h-3 w-3 shrink-0 text-orange-400" />
                    <span className="truncate">{folder.nome}</span>
                    <span className="font-normal text-slate-400">{folder.items.length}</span>
                  </button>
                  {/* tap-compact: senza, il min-44 globale gonfia le due icone
                      e ruba metà riga al nome della cartella su mobile */}
                  <button
                    onClick={() => void handleRinominaCartella(folder.id, folder.nome)}
                    className="tap-compact p-1.5 md:p-0 md:opacity-0 md:group-hover/f:opacity-100 text-slate-400 hover:text-slate-600 transition"
                    title="Rinomina cartella"
                    aria-label="Rinomina cartella"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => void handleEliminaCartella(folder.id)}
                    className="tap-compact p-1.5 md:p-0 md:opacity-0 md:group-hover/f:opacity-100 text-slate-400 hover:text-rose-500 transition"
                    title="Elimina cartella"
                    aria-label="Elimina cartella"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {!collapsed && (
                  <div className="space-y-0.5 mb-1">
                    {folder.items.length === 0 ? (
                      <div className="px-2 py-1 text-[11px] italic text-slate-300 max-md:hidden">Vuota — sposta qui una chat</div>
                    ) : (
                      folder.items.map(renderConvRow)
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {/* Conversazioni senza cartella, raggruppate per data */}
          {gruppi.map(({ gruppo, items, isPinned }) => (
            <div key={gruppo}>
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1">
                {isPinned && <Pin className="h-2.5 w-2.5 fill-orange-400 text-orange-400" />}
                {gruppo}
              </div>
              <div className="space-y-0.5">{items.map(renderConvRow)}</div>
            </div>
          ))}
          {conversazioni.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <div className="h-11 w-11 rounded-xl bg-orange-50 flex items-center justify-center mb-3">
                <Sparkles className="h-5 w-5 text-orange-500" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Inizia la tua prima chat</p>
              <p className="text-xs text-slate-400 mt-1 mb-3">
                Chiedi insight, analizza documenti o fai eseguire azioni nel gestionale.
              </p>
              <button
                onClick={handleNuova}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 px-3 py-2 text-sm font-semibold text-white shadow hover:from-orange-600 hover:to-amber-500"
              >
                <Plus className="h-4 w-4" /> Avvia una nuova chat
              </button>
            </div>
          ) : gruppi.length === 0 && cartelleConItems.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-slate-400">Nessun risultato per “{search}”.</div>
          ) : null}
        </div>
        <div className="p-3 border-t border-slate-100 text-[10px] text-slate-400">
          Silvio AI · Beta · memoria per conversazione
        </div>
      </aside>

      {/* Area chat */}
      <main
        className="relative flex-1 flex flex-col min-w-0"
        onDragOver={(e) => {
          // Overlay solo per il drag di FILE reali (non testo/selezioni/link).
          if (!activeId) return;
          if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          // Reset SOLO quando il puntatore lascia davvero l'area (non passando sui figli).
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
        }}
        onDrop={handleDrop}
      >
        {dragOver && activeId && (
          <div className="absolute inset-0 z-50 m-3 rounded-2xl border-2 border-dashed border-orange-400 bg-orange-50/80 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 font-medium text-orange-700">
              <Paperclip className="h-5 w-5" /> Rilascia per allegare
            </div>
          </div>
        )}
        <header className="h-12 shrink-0 border-b border-slate-200 bg-white flex items-center gap-2 px-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="Mostra/nascondi conversazioni"
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </button>
          <SilvioAvatar size={28} className="rounded-lg" />
          {renaming ? (
            <div className="flex items-center gap-1 min-w-0">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confermaRinomina();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="min-w-0 rounded border border-orange-300 px-2 py-0.5 text-sm outline-none"
              />
              <button onClick={() => void confermaRinomina()} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" aria-label="Conferma">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setRenaming(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded" aria-label="Annulla">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-slate-800 text-sm truncate">{activeConv?.titolo ?? "Silvio AI"}</span>
              <span className="hidden sm:inline rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 shrink-0">Beta</span>
              {activeConv && (
                <button
                  onClick={() => {
                    setRenameValue(activeConv.titolo);
                    setRenaming(true);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded shrink-0"
                  aria-label="Rinomina conversazione"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            <button
              onClick={() => setMemoriaOpen(true)}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              title="Cosa ricorda Silvio"
              aria-label="Memoria di Silvio"
            >
              <Brain className="h-4 w-4" />
            </button>
            {activeConv && messages.length > 0 && !renaming && (
              <button
                onClick={copiaConversazione}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                title="Copia tutta la conversazione"
                aria-label="Copia conversazione"
              >
                <Copy className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {showHero ? (
          /* Hero centrato MA scroll-safe: justify-center direttamente sul
             contenitore overflow tagliava avatar (sopra) e banner (sotto)
             quando il contenuto superava il viewport — su mobile era
             irraggiungibile. min-h-full sul wrapper interno: se il contenuto
             ci sta è centrato, se è più alto scorre normalmente dall'alto. */
          <div className="flex-1 overflow-y-auto">
            <div className="flex min-h-full w-full flex-col items-center justify-start sm:justify-center gap-4 px-2 py-6 sm:px-4 md:gap-6 md:py-10">
            <AIAssistantInterface onSend={handleSend} disabled={sending} userName={firstName} />
            {!onboarded && (
              // Mobile no: quattro righe di istruzioni sotto i suggerimenti.
              <div className="hidden sm:block w-full max-w-2xl rounded-xl border border-orange-200 bg-orange-50/70 px-3 py-2.5 text-[13px] leading-snug sm:px-4 sm:py-3 sm:text-sm text-slate-600">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <span className="font-medium text-slate-800">Benvenuto in Silvio AI.</span> Puoi{" "}
                    <strong>allegare</strong> documenti (DDT, fatture, bollette), <strong>dettare</strong> con la voce 🎙️, usare{" "}
                    <strong>/comandi</strong> rapidi e far <strong>eseguire azioni</strong> nel gestionale (preventivi, solleciti,
                    ordini) con la tua conferma.
                  </div>
                  <button onClick={dismissOnboarding} className="text-slate-400 hover:text-slate-600" aria-label="Ho capito">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        ) : (
          <div className="relative flex-1 overflow-hidden">
            <div ref={scrollRef} onScroll={onThreadScroll} className="h-full overflow-y-auto px-4 py-6">
              <div className="max-w-3xl mx-auto space-y-5" role="log" aria-live="polite" aria-busy={sending}>
                {loadingMsgs ? (
                  <SkeletonThread />
                ) : threadVuoto ? (
                  <div className="text-center text-slate-400 py-16">
                    <SilvioAvatar size={48} className="mx-auto mb-3" />
                    <p className="text-sm">Nuova conversazione — scrivi un messaggio o allega un documento (DDT, fattura, bolletta…).</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {QUICK_PROMPTS.map((q) => (
                        <button
                          key={q.label}
                          onClick={() => void handleSend(q.prompt)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-orange-300 hover:text-orange-700 hover:bg-orange-50 transition"
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  renderedMessages
                )}
                {/* Con la bolla in streaming gia' in chat, il "pensiero" sarebbe un doppione. */}
                {sending && !messages.some((m) => m.streaming) && (
                  <div className="flex gap-3">
                    <SilvioAvatar size={32} animated="thinking" className="rounded-lg" />
                    <div className="flex-1 min-w-0 pt-1">
                      {toolSteps.length > 0 && (
                        <div className="mb-1.5 space-y-1">
                          {toolSteps.map((s) => (
                            <div key={s.id} className="flex items-center gap-1.5 text-xs text-slate-500">
                              <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                              {s.label}
                            </div>
                          ))}
                        </div>
                      )}
                      <AiLoader size={30} text={thinking} />
                    </div>
                  </div>
                )}
                {lastFailed && !sending && (
                  <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="flex-1">Invio non riuscito.</span>
                    <button onClick={handleRetry} className="inline-flex items-center gap-1 font-medium hover:underline">
                      <RotateCcw className="h-3.5 w-3.5" /> Riprova
                    </button>
                    <button onClick={() => setLastFailed(null)} className="text-rose-400 hover:text-rose-600" aria-label="Ignora">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            {showScrollDown && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 h-9 w-9 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-500 hover:text-slate-700"
                aria-label="Vai in fondo"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Composer (nascosto nell'hero senza conversazione) */}
        {!showHero && (
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:px-2 max-sm:py-2">
            <div className="max-w-3xl mx-auto">
              {/* Azioni che Silvio può eseguire nel sistema (agentico) */}
              <ActionsInlineBar />
              {/* Anteprima allegati */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                      {a.kind === "image" && a.previewUrl ? (
                        <img src={a.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <FileText className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="max-w-[140px] truncate text-slate-600">{a.file.name}</span>
                      {a.uploading ? (
                        <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                      ) : a.uploadError ? (
                        <span className="text-rose-500">errore</span>
                      ) : (
                        <Check className="h-3 w-3 text-emerald-500" />
                      )}
                      <button onClick={() => removeAttachment(a.id)} className="text-slate-400 hover:text-rose-500" aria-label="Rimuovi">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Mobile: graffetta, microfono, testo e invio su una riga bassa;
                  la fotocamera la offre già la graffetta (il selettore di file
                  del telefono propone «Scatta foto»). */}
              <div className="relative flex items-end gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm focus-within:border-orange-300 max-sm:items-center max-sm:gap-0.5 max-sm:rounded-full max-sm:py-1">
                {showSlash && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden z-20">
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                      Comandi rapidi
                    </div>
                    {slashItems.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setDraft(s.template);
                          requestAnimationFrame(() => textareaRef.current?.focus());
                        }}
                        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-orange-50"
                      >
                        <span className="text-base leading-none mt-0.5">{s.emoji}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-700">{s.label}</span>
                          <span className="block text-xs text-slate-400 truncate">{s.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <input ref={fileInputRef} type="file" multiple accept={ATTACH_ACCEPT} className="hidden" onChange={handleFilePick} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFilePick} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachments.length >= MAX_ATTACHMENTS}
                  className="tap-compact h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                  title="Allega documento (DDT, fattura, bolletta…)"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={attachments.length >= MAX_ATTACHMENTS}
                  className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                  title="Scatta foto"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <button
                  onClick={voice.toggle}
                  disabled={voice.transcribing}
                  className={cn(
                    "tap-compact h-8 w-8 shrink-0 flex items-center justify-center rounded-full transition-colors",
                    voice.recording
                      ? "text-rose-500 bg-rose-50 animate-pulse"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40",
                  )}
                  title={voice.recording ? "Ferma e trascrivi" : "Detta con la voce"}
                  aria-label={voice.recording ? "Ferma registrazione" : "Detta con la voce"}
                >
                  {voice.transcribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : voice.recording ? (
                    <Square className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleComposerSend();
                    }
                  }}
                  rows={1}
                  enterKeyHint="send"
                  placeholder={attachments.length > 0 ? "Descrivi cosa vuoi che analizzi…" : isMobile ? "Scrivi a Silvio…" : "Scrivi a Silvio…  (Invio per inviare)"}
                  className="flex-1 min-w-0 resize-none outline-none text-base md:text-sm text-slate-700 placeholder:text-slate-400 max-h-40 py-1.5 max-sm:px-1"
                />
                {voice.recording && (
                  <span className="shrink-0 self-center text-xs font-medium text-rose-500 tabular-nums">
                    {Math.floor(voice.recordingMs / 60000)}:
                    {String(Math.floor((voice.recordingMs % 60000) / 1000)).padStart(2, "0")}
                  </span>
                )}
                {sending ? (
                  <button
                    onClick={handleStop}
                    className="tap-compact h-9 w-9 shrink-0 flex items-center justify-center rounded-full bg-slate-800 text-white hover:bg-slate-900 max-sm:h-8 max-sm:w-8"
                    aria-label="Interrompi"
                    title="Interrompi generazione"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={() => void handleComposerSend()}
                    disabled={!draft.trim() && attachments.filter((a) => a.storagePath).length === 0}
                    className={cn(
                      "tap-compact h-9 w-9 shrink-0 flex items-center justify-center rounded-full transition-colors max-sm:h-8 max-sm:w-8",
                      draft.trim() || attachments.some((a) => a.storagePath)
                        ? "bg-orange-500 text-white hover:bg-orange-600"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed",
                    )}
                    aria-label="Invia"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-center text-[10px] text-slate-400 max-sm:hidden">
                Silvio può sbagliare. Verifica le informazioni importanti.
                <span className="hidden md:inline"> ⌘K per nuova conversazione.</span>
              </p>
            </div>
          </div>
        )}
      </main>

      <MemoriaSilvioDialog open={memoriaOpen} onOpenChange={setMemoriaOpen} companyId={companyId} />
      <SilvioProgrammatePanel open={programmateOpen} onClose={() => setProgrammateOpen(false)} />
    </div>
  );
}

/** Dialog "Cosa ricorda Silvio": elenca i fatti memorizzati su questa azienda
 *  (ai_brain_facts) usati nelle risposte. Sola lettura. */
function MemoriaSilvioDialog({
  open,
  onOpenChange,
  companyId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId?: string;
}) {
  const { data: facts = [], isLoading } = useQuery({
    queryKey: ["silvio-brain-facts", companyId],
    enabled: open && !!companyId,
    queryFn: async (): Promise<Array<{ id: string; fact_key: string; fact_value: unknown }>> => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("ai_brain_facts" as never)
        .select("id, fact_key, fact_value, updated_at")
        .eq("company_id", companyId)
        .eq("enabled", true)
        .order("updated_at", { ascending: false })
        .limit(60);
      return (data ?? []) as unknown as Array<{ id: string; fact_key: string; fact_value: unknown }>;
    },
  });

  const fmtVal = (v: unknown): string => {
    if (v == null) return "—";
    if (typeof v === "string") return v;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-orange-500" /> Cosa ricorda Silvio
          </DialogTitle>
          <DialogDescription>
            Fatti che Silvio ha imparato sulla tua azienda e usa nelle risposte.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="py-6 text-center text-sm text-slate-400">Carico la memoria…</div>
          ) : facts.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">
              Silvio non ha ancora memorizzato fatti specifici. Più lo usi, più impara.
            </div>
          ) : (
            facts.map((f) => (
              <div key={f.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold text-slate-700">{f.fact_key}</div>
                <div className="text-sm text-slate-600 break-words">{fmtVal(f.fact_value)}</div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Barra agentica: mostra quante azioni Silvio ha pronto da eseguire nel sistema.
 *  Collassata di default (1 riga); espandendo si vedono le card conferma/esegui
 *  (riuso SilvioActionProposals → silvio-execute-action). */
function ActionsInlineBar() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [open, setOpen] = useState(false);
  const { data: count = 0 } = useQuery({
    queryKey: ["silvio-proposals-count", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<number> => {
      if (!companyId) return 0;
      const result = await supabase
        .from("ai_action_proposals" as never)
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "pending");
      return (result as { count: number | null }).count ?? 0;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  if (!count) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800 hover:bg-orange-100 transition-colors"
      >
        <Sparkles className="h-4 w-4 text-orange-500 shrink-0" />
        <span className="font-medium">
          Silvio ha {count} {count === 1 ? "azione pronta" : "azioni pronte"} da eseguire
        </span>
        <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 max-h-[50vh] overflow-y-auto">
          <SilvioActionProposals compact />
        </div>
      )}
    </div>
  );
}

/** Scheletro di caricamento del thread. */
function SkeletonThread() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex justify-end">
        <div className="h-10 w-48 rounded-2xl bg-orange-200/60" />
      </div>
      <div className="flex gap-3">
        <div className="h-8 w-8 rounded-lg bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded bg-slate-200" />
          <div className="h-20 w-full rounded-2xl bg-slate-200/70" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="h-10 w-32 rounded-2xl bg-orange-200/60" />
      </div>
    </div>
  );
}

/** Bolla risposta di Silvio: avatar + header, meta, contenuto (typewriter live →
 *  ChatMarkdown), follow-up chips e azioni (copia, rigenera, valutazione) on hover. */
const MessaggioSilvio = memo(function MessaggioSilvio({
  m,
  live,
  animate,
  canRegenerate,
  onFollowup,
  onRegenera,
}: {
  m: SilvioMsg;
  /** Streaming vero dal server: testo com'e' + cursore, niente typewriter. */
  live: boolean;
  animate: boolean;
  canRegenerate: boolean;
  onFollowup: (q: string) => void;
  onRegenera: () => void;
}) {
  const meta: AiMeta = {
    ai_confidence: m.ai_confidence ?? undefined,
    ai_requires_human_review: m.ai_requires_human_review ?? undefined,
    followup_suggestions: m.followup_suggestions ?? undefined,
    council_data: m.council_data ?? undefined,
  };

  const copia = () => {
    void navigator.clipboard?.writeText(m.content);
    toast.success("Risposta copiata");
  };

  return (
    <div className="group flex gap-3">
      {/* Mobile: niente avatar accanto (44px di larghezza tolti al testo). */}
      <SilvioAvatar size={32} className="rounded-lg mt-0.5 max-sm:hidden" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-slate-800">Silvio</span>
          <span className="text-[10px] text-slate-400">{formatOra(m.created_at)}</span>
        </div>
        {/* Mobile: testo a 14px (ereditava 16-17px) e meno margine interno. */}
        <div className="rounded-2xl rounded-tl-sm bg-white border border-slate-200 px-4 py-3 shadow-sm max-sm:px-3 max-sm:py-2.5 max-sm:text-sm">
          <AiMessageMetaTop meta={meta} />
          {live ? (
            <span className="whitespace-pre-wrap text-sm text-slate-700">
              {m.content}
              <span className="inline-block w-1.5 h-4 -mb-0.5 ml-0.5 bg-orange-400 rounded-sm animate-pulse" />
            </span>
          ) : animate ? (
            <SilvioAnimatedMessage content={m.content} sources={m.rag_sources ?? undefined} />
          ) : (
            <ChatMarkdown content={m.content} sources={m.rag_sources ?? undefined} />
          )}
          <AiMessageMetaBottom meta={meta} onAskFollowup={onFollowup} />
        </div>
        <div className="flex items-center gap-1 mt-1 pl-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button onClick={copia} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100" title="Copia">
            <Copy className="h-3 w-3" /> Copia
          </button>
          {canRegenerate && (
            <button onClick={onRegenera} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100" title="Rigenera">
              <RefreshCw className="h-3 w-3" /> Rigenera
            </button>
          )}
          <SilvioRatingButtons messageId={m.id} />
        </div>
      </div>
    </div>
  );
});

/** Bolla messaggio utente (memoizzata): testo + allegato + "Modifica e reinvia". */
const MessaggioUtente = memo(function MessaggioUtente({
  m,
  onEdit,
}: {
  m: SilvioMsg;
  onEdit: (content: string) => void;
}) {
  return (
    <div className="group flex justify-end">
      <div className="max-w-[85%]">
        <div className="rounded-2xl rounded-tr-sm bg-orange-500 text-white px-4 py-2.5 whitespace-pre-wrap text-sm shadow-sm">
          {m.content}
          {m.attachment_url &&
            (m.message_type === "image" ? (
              <img
                src={m.attachment_url}
                alt={m.attachment_name ?? ""}
                className="mt-2 max-h-60 rounded-lg border border-white/20"
              />
            ) : (
              <a
                href={m.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-xs underline"
              >
                <FileText className="h-3.5 w-3.5" />
                {m.attachment_name ?? "Allegato"}
              </a>
            ))}
        </div>
        <div className="flex items-center justify-end gap-2 mt-1 pr-1">
          <button
            onClick={() => onEdit(m.content)}
            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition"
            title="Modifica e reinvia"
          >
            <Pencil className="h-3 w-3" /> Modifica
          </button>
          <span className="text-[10px] text-slate-400">{formatOra(m.created_at)}</span>
        </div>
      </div>
    </div>
  );
});

/** Typewriter per la risposta live; a fine animazione passa a ChatMarkdown. */
function SilvioAnimatedMessage({
  content,
  sources,
}: {
  content: string;
  sources?: SilvioMsg["rag_sources"];
}) {
  const animated = useAnimatedText(content, "", 3);
  const done = animated.length >= content.length;
  if (done) return <ChatMarkdown content={content} sources={sources ?? undefined} />;
  return (
    <span className="whitespace-pre-wrap text-sm text-slate-700">
      {animated}
      <span className="inline-block w-1.5 h-4 -mb-0.5 ml-0.5 bg-orange-400 rounded-sm animate-pulse" />
    </span>
  );
}
