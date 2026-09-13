/**
 * SilvioChatSheet — Chat embedded con Silvio dentro un Sheet laterale.
 *
 * Riusa il channel "silvio-ai" della company, lo crea se non esiste, e fa
 * round-trip via edge function `silvio-chat`. Stesso pattern di /azienda/chat
 * ma compatto e accessibile da OVUNQUE via SilvioFAB.
 *
 * Sprint AI Uploads (2026-05-05):
 *   - Upload PDF/immagini (paperclip): salvati in bucket silvio-uploads,
 *     passati a silvio-chat che li manda al modello multimodal.
 *   - Registrazione audio inline (microfono): MediaRecorder API + invio a
 *     silvio-transcribe-audio → testo trascritto inserito automaticamente
 *     nel draft. L'utente può confermare prima di inviare.
 *   - Render messaggi con allegati (anteprima immagine inline, link PDF,
 *     player audio).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSilvioPageContext } from "@/hooks/useSilvioPageContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Send,
  Loader2,
  Brain,
  User as UserIcon,
  ExternalLink,
  Sparkles,
  Paperclip,
  Mic,
  Camera,
  Square,
  FileText,
  X,
  AudioLines,
  FileSpreadsheet,
  FileType,
  File as FileIcon,
  Plus,
  Zap,
  Smile,
  // 🆕 Quick actions
  Wallet,
  HardHat,
  Search,
  TrendingUp,
  Maximize2,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { SilvioAvatar } from "@/components/silvio/SilvioAvatar";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { AIModelSelector } from "@/components/ai/AIModelSelector";
import { AIRunFooter } from "@/components/ai/AIRunFooter";
import { useAIModelSelector } from "@/lib/ai/use-ai-model-selector";
import {
  channelMessagesQueryKey,
  readChannelMessagesItems,
  upsertChannelMessage,
  type ChannelMessagesCache,
} from "@/lib/chat/channelMessagesCache";
import { useAutoSizeTextarea } from "@/hooks/useAutoSizeTextarea";
import { supabase } from "@/integrations/supabase/client";
import { segnalaCreditoEsaurito } from "@/lib/creditoEsaurito";
import { useAuth } from "@/contexts/AuthContext";
import { ChatMarkdown, type ChatMarkdownSource } from "@/components/ui/ChatMarkdown";
import { AiMessageMetaTop, AiMessageMetaBottom, type AiMeta } from "@/components/silvio/AiMessageMeta";

const SILVIO_SENDER_ID_AZIENDA = "00000000-0000-0000-0000-000000000002";
const SILVIO_SENDER_ID_ADMIN = "00000000-0000-0000-0000-000000000003";

/**
 * Configurazione backend per modalità chat.
 * "azienda" → Silvio aziendale (context impresa edile, persone CFO/PM/HR)
 * "admin"   → Silvio Superadmin (context piattaforma, agenti cross-tenant)
 */
export type SilvioChatMode = "azienda" | "admin";

interface SilvioModeConfig {
  senderId: string;
  rpcEnsureChannel: string;
  edgeFunction: string;
  realtimePrefix: string;
  headerTitle: string;
  headerBadge: string;
  contextHintLabel: string;
}

const MODE_CONFIG: Record<SilvioChatMode, SilvioModeConfig> = {
  azienda: {
    senderId: SILVIO_SENDER_ID_AZIENDA,
    rpcEnsureChannel: "ensure_user_silvio_channel",
    edgeFunction: "silvio-chat",
    realtimePrefix: "silvio-chat-rt",
    headerTitle: "Silvio",
    headerBadge: "AI",
    contextHintLabel: "Area Azienda",
  },
  admin: {
    senderId: SILVIO_SENDER_ID_ADMIN,
    rpcEnsureChannel: "ensure_user_silvio_admin_channel",
    edgeFunction: "silvio-admin-chat",
    realtimePrefix: "silvio-admin-chat-rt",
    headerTitle: "Silvio Superadmin",
    headerBadge: "Superadmin",
    contextHintLabel: "Area Superadmin",
  },
};

// Back-compat alias (riferimenti esistenti nel file)
const SILVIO_SENDER_ID = SILVIO_SENDER_ID_AZIENDA;
const MAX_ATTACHMENTS = 5;

// Skill shortcuts riusabili (pattern slash command)
// Definizioni in src/lib/silvio-skills.ts (shared con InternalChat)
import { SILVIO_SKILLS as SILVIO_SKILLS_SHARED } from "@/lib/silvio-skills";

// Local alias per back-compat (codice sotto usa SILVIO_SKILLS)
const SILVIO_SKILLS = SILVIO_SKILLS_SHARED;

const MAX_FILE_MB = 10; // limite ragionevole per chat

type AttachmentKind = "image" | "pdf" | "audio" | "text-doc" | "office-doc" | "other";

/** Estensioni file di testo che possiamo decodificare lato server come UTF-8 */
const TEXT_EXTENSIONS = [
  ".txt", ".csv", ".tsv", ".md", ".markdown", ".json", ".jsonl", ".log",
  ".xml", ".yaml", ".yml", ".html", ".htm", ".rtf", ".ini", ".conf", ".sql",
];
/** Estensioni Office gestite via mammoth/xlsx in edge function */
const OFFICE_EXTENSIONS = [".docx", ".xlsx", ".xls"];

interface PendingAttachment {
  id: string;
  file: File;
  kind: AttachmentKind;
  /** Path nel bucket dopo upload (riempito da uploadAttachment) */
  storagePath?: string;
  /** Flag stato upload */
  uploading: boolean;
  uploadError?: string;
  /** Anteprima locale (URL.createObjectURL) per le immagini */
  previewUrl?: string;
}

interface SilvioMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
  /** true mentre silvio-chat sta ancora scrivendo (arriva a lotti via UPDATE). */
  streaming?: boolean | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  // Sessione 1 — metadata AI
  rag_sources?: ChatMarkdownSource[] | null;
  rag_min_similarity?: number | null;
  ai_confidence?: "high" | "medium" | "low" | null;
  ai_requires_human_review?: boolean | null;
  followup_suggestions?: string[] | null;
  council_data?: AiMeta["council_data"] | null;
  // AI Test Lab — run metadata (modello, costo, latenza)
  last_model_id?: string | null;
  last_provider?: string | null;
  last_cost_usd?: number | null;
  last_latency_ms?: number | null;
  last_input_tokens?: number | null;
  last_output_tokens?: number | null;
  last_generation_id?: string | null;
  /** Modello richiesto dall'utente nel selettore. Se ≠ last_model_id → fallback. */
  requested_model_id?: string | null;
}

/**
 * Element 3 — Typewriter hook (effetto streaming).
 * Quando un messaggio Silvio NUOVO arriva, mostra il testo carattere-per-carattere
 * a velocità `cps` (default 50 char/sec). Una volta completato il typing,
 * il messaggio resta statico. Skip rapido on click/scroll = UX gracefull.
 *
 * @param text — testo target completo da animare
 * @param enabled — se false, ritorna text intero subito (per messaggi vecchi)
 * @param cps — caratteri per secondo (default 50)
 */
// FIX 15 (A6): typewriter con auto-skip per messaggi lunghi e API skip()
// - Long msg (>LONG_MSG_THRESHOLD char): renderizza subito intero
// - skip() esposto: completa l'animazione su demand (click bolla / scroll utente)
const LONG_MSG_THRESHOLD = 1200;

function useTypewriter(text: string, enabled: boolean, cps = 50) {
  const skippedRef = useRef(false);
  const isLongMsg = (text?.length ?? 0) > LONG_MSG_THRESHOLD;
  const effectiveEnabled = enabled && !isLongMsg; // long msg = no animation
  const [displayed, setDisplayed] = useState(effectiveEnabled ? "" : text);

  useEffect(() => {
    if (!effectiveEnabled) {
      setDisplayed(text);
      skippedRef.current = false;
      return;
    }
    if (skippedRef.current) {
      setDisplayed(text);
      return;
    }
    setDisplayed("");
    if (!text) return;
    const intervalMs = Math.max(8, Math.floor(1000 / cps));
    let i = 0;
    const tick = setInterval(() => {
      if (skippedRef.current) {
        setDisplayed(text);
        clearInterval(tick);
        return;
      }
      i++;
      if (i >= text.length) {
        setDisplayed(text);
        clearInterval(tick);
      } else {
        const step = text[i] === " " ? 1 : 2;
        i = Math.min(text.length, i + step - 1);
        setDisplayed(text.substring(0, i));
      }
    }, intervalMs);
    return () => clearInterval(tick);
  }, [text, effectiveEnabled, cps]);

  const skip = () => {
    skippedRef.current = true;
    setDisplayed(text);
  };

  return { displayed, skip, isLong: isLongMsg };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillDraft?: string;
  /**
   * Modalità chat: switcha tutti i punti di interazione col backend +
   * branding header. Default "azienda" (back-compat).
   *   • "azienda" → silvio-chat + ensure_user_silvio_channel + Silvio
   *   • "admin"   → silvio-admin-chat + ensure_user_silvio_admin_channel +
   *                 Silvio Superadmin (per gestione platform, agenti
   *                 cross-tenant, ecc.)
   */
  mode?: SilvioChatMode;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function detectKind(file: File): AttachmentKind {
  // Image: incluso HEIC/TIFF/SVG riconosciuti dal MIME
  if (file.type.startsWith("image/")) return "image";
  // PDF
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  // Audio
  if (file.type.startsWith("audio/")) return "audio";
  const lowerName = file.name.toLowerCase();
  // Office
  if (
    OFFICE_EXTENSIONS.some((ext) => lowerName.endsWith(ext)) ||
    file.type.includes("wordprocessingml") ||
    file.type.includes("spreadsheetml") ||
    file.type === "application/msword" ||
    file.type === "application/vnd.ms-excel"
  ) {
    return "office-doc";
  }
  // Plain text varianti
  if (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/xml" ||
    file.type === "application/yaml" ||
    TEXT_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
  ) {
    return "text-doc";
  }
  return "other";
}

/** Etichetta human-readable per ogni kind (mostra in tooltip/UI) */
function kindLabel(kind: AttachmentKind): string {
  switch (kind) {
    case "image": return "Immagine";
    case "pdf": return "PDF";
    case "audio": return "Audio";
    case "text-doc": return "Documento testo";
    case "office-doc": return "Documento Office";
    default: return "File";
  }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Component ────────────────────────────────────────────────────────────

export function SilvioChatSheet({ open, onOpenChange, prefillDraft, mode = "azienda" }: Props) {
  const modeCfg = MODE_CONFIG[mode];
  const silvioSenderId = modeCfg.senderId;
  const navigate = useNavigate();
  // Context pagina corrente: passato a silvio-chat come HINT (non filtro).
  // Vedi useSilvioPageContext per le route mappate.
  const pageContext = useSilvioPageContext();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // v8.6.75 — Input dedicato per la camera: stesso onChange ma con
  // `capture="environment"` per aprire direttamente la fotocamera retro
  // su mobile (su desktop apre comunque il file picker, accept="image/*").
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState("");
  // Textarea auto-grow stile WhatsApp: 1 → 5 righe, poi scroll interno
  const draftTextareaRef = useAutoSizeTextarea(draft, { maxRows: 5 });
  const appliedPrefillRef = useRef<string | null>(null);
  // AI Test Lab — selettore modello (visibile solo per Demo Azienda + utente demo)
  const aiSelector = useAIModelSelector('silvio_chat', 'text');
  const [sending, setSending] = useState(false);
  // Tempo trascorso dall'inizio dell'invio in secondi — guida i micro-feedback
  // UX ("riflette" → "analizza" → "ci sta mettendo troppo") senza far credere
  // all'utente che la chat sia bloccata. Reset a 0 ad ogni nuovo invio.
  const [sendingElapsed, setSendingElapsed] = useState(0);
  // AbortController per cancellare DAVVERO la chiamata edge function
  // quando l'utente clicca "Annulla attesa". Senza questo la promise
  // continua server-side anche dopo aver sbloccato l'UI, consumando
  // budget AI inutilmente.
  const sendAbortRef = useRef<AbortController | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  // Element 3: messaggi Silvio appena arrivati che devono ricevere effetto
  // typewriter. Quando arrivano via realtime, vengono inseriti in questo set;
  // dopo render iniziale, restano "freschi" finché l'animazione finisce.
  const [streamingMessageIds, setStreamingMessageIds] = useState<Set<string>>(new Set());
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  // hasHydratedRef: la prima volta che messages si popola (initial load di 30
  // msg storici) NON vogliamo animarli. Solo i messaggi che arrivano DOPO il
  // mount via realtime devono attivare il typewriter.
  const hasHydratedRef = useRef(false);
  // F4 — auto-brief: flag che segnala al secondo effect di triggerare l'invio
  // non appena il draft (settato nel primo effect) è effettivamente in stato.
  const [autoSendPending, setAutoSendPending] = useState(false);

  useEffect(() => {
    if (!open || !prefillDraft) return;
    const [, ...messageParts] = prefillDraft.split("::");
    const clean = (messageParts.length > 0 ? messageParts.join("::") : prefillDraft).trim();
    if (!clean || appliedPrefillRef.current === prefillDraft) return;
    appliedPrefillRef.current = prefillDraft;
    setDraft((prev) => (prev.trim() ? `${prev.trim()}\n${clean}` : clean));
    requestAnimationFrame(() => draftTextareaRef.current?.focus());
  }, [draftTextareaRef, open, prefillDraft]);

  // F4 — Trigger effettivo invio quando draft è sincronizzato allo stato
  useEffect(() => {
    if (!autoSendPending || !draft.trim() || sending) return;
    setAutoSendPending(false);
    setSending(true);
    sendMutation.mutate();
  // sendMutation è stabile (React Query) — non serve in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSendPending, draft, sending]);
  // mountTimeRef: cutoff per distinguere messaggi storici (created_at <)
  // da messaggi davvero "live" (created_at >=). Resettato sul cambio canale.
  const mountTimeRef = useRef<string>(new Date().toISOString());

  // Recording state
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  // Element 2: blob registrato in attesa di conferma (play/transcribe/discard)
  const [pendingAudio, setPendingAudio] = useState<{ blob: Blob; url: string; durationSec: number } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirror del recordingMs in ref per leggerlo dentro callback (onstop)
  const recordingMsRef = useRef<number>(0);

  // v8.6.74 — Hold-to-talk pattern (WhatsApp-style):
  //   tap rapido sul mic     → modalità classica: registra → preview → conferma
  //   premi e tieni (>250ms) → modalità rapida: registra → rilascia per inviare
  // autoSendAfterStop dice all'effetto che monitora pendingAudio se al prossimo
  // blob deve auto-confermare (saltare preview e trascrivere subito).
  const [autoSendAfterStop, setAutoSendAfterStop] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActiveRef = useRef<boolean>(false);

  // PERF/LEAK FIX: cleanup unmount con deps=[] cattura attachments/pendingAudio
  // del primo render (sempre vuoti) -> i blob URL non venivano mai revocati.
  // Pattern: latest-ref aggiornato ad ogni render, cleanup legge il ref.
  const attachmentsLatestRef = useRef(attachments);
  const pendingAudioLatestRef = useRef(pendingAudio);
  useEffect(() => { attachmentsLatestRef.current = attachments; }, [attachments]);
  useEffect(() => { pendingAudioLatestRef.current = pendingAudio; }, [pendingAudio]);

  useEffect(() => {
    return () => {
      attachmentsLatestRef.current.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      const audio = pendingAudioLatestRef.current;
      if (audio) URL.revokeObjectURL(audio.url);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ── 1. Trova/crea il channel Silvio personale via RPC idempotente ──────
  const { data: channelId, isLoading: loadingChannel } = useQuery({
    queryKey: ["silvio-channel", companyId, userId],
    queryFn: async (): Promise<string | null> => {
      if (!companyId || !userId) return null;
      // RPC restituisce uuid del channel — cast tipizzato senza `any`.
      const { data, error } = await supabase.rpc(
        modeCfg.rpcEnsureChannel as never,
      );
      if (error) {
        toast.error("Non riesco ad aprire la chat Silvio", {
          description: error.message,
        });
        return null;
      }
      return data ? String(data) : null;
    },
    enabled: !!companyId && !!userId && open,
    staleTime: 60_000,
  });

  // F4 — Daily auto-brief: quando il canale si carica per la prima volta oggi,
  // invia automaticamente "Cosa conta ora?" senza che l'utente debba cliccare.
  // Deduplica via localStorage (una sola volta per company per giornata).
  // NB: DEVE stare DOPO la dichiarazione di channelId qui sopra — prima era più
  // in alto e le deps dell'effect leggevano `channelId` in TDZ → ReferenceError
  // "Cannot access 'channelId' before initialization": OGNI apertura della chat
  // Silvio buttava giù l'area azienda con la pagina di errore.
  useEffect(() => {
    if (!open || !channelId || loadingChannel || mode !== "azienda" || !companyId) return;
    const briefKey = `silvio_brief_${companyId}`;
    const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD locale (no shift UTC notturno)
    if (localStorage.getItem(briefKey) === todayStr) return;
    localStorage.setItem(briefKey, todayStr);
    setDraft("Cosa conta ora?");
    setAutoSendPending(true);
  // channelId cambia solo se la company cambia — stabile durante la sessione

  }, [open, channelId, loadingChannel, mode, companyId]);

  // ── 2. Carica gli ULTIMI N messaggi (Element 4 Sprint AI Uploads:
  //       Supabase Realtime invece di polling — risparmio batteria mobile
  //       e latency immediata). FIX BUG: prima `order ASC limit 30` caricava
  //       i 30 più VECCHI; ora DESC + reverse client-side per latest-N
  //       (stesso pattern di InternalChat.tsx) e cache compatibile. ────────
  const MESSAGES_PAGE_SIZE = 30;
  // FIX 2026-06 (crash "liveMessages.map is not a function"): la cache è
  // CONDIVISA con InternalChat (stesso queryKey) che scrive { items, hasOlder }.
  // Qui prima scrivevamo/leggevamo un array nudo → shape collision → crash
  // aprendo la sheet dopo Chat Team sullo stesso canale. Ora shape canonica
  // ovunque (vedi src/lib/chat/channelMessagesCache.ts) + lettura tollerante.
  const { data: liveData } = useQuery({
    queryKey: channelMessagesQueryKey(channelId),
    queryFn: async (): Promise<ChannelMessagesCache<SilvioMessage>> => {
      if (!channelId) return { items: [], hasOlder: false };
      const { data } = await supabase
        .from("internal_chat_messages")
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(MESSAGES_PAGE_SIZE + 1); // +1 per calcolare hasOlder senza count
      const rows = (data ?? []) as SilvioMessage[];
      // Reverse client-side: ordine ASC per render UI (più vecchio in alto).
      return {
        items: rows.slice(0, MESSAGES_PAGE_SIZE).reverse(),
        hasOlder: rows.length > MESSAGES_PAGE_SIZE,
      };
    },
    enabled: !!channelId && open,
    // staleTime alto: il refresh viene pilotato dal realtime listener qui sotto
    staleTime: 30 * 60 * 1000,
    // gcTime alto: la cache sopravvive a chiusura/riapertura sheet senza fetch
    gcTime: 60 * 60 * 1000,
  });
  const liveMessages = useMemo(
    () => readChannelMessagesItems<SilvioMessage>(liveData),
    [liveData],
  );

  // ── 2.a Paginazione backward — "Carica messaggi più vecchi" ──────────
  // Quando l'utente vuole vedere conversazioni storiche oltre i 30 caricati,
  // clicca il pulsante in cima e carichiamo 30 messaggi PRIMA del più vecchio
  // già visibile. Stato locale (non shared cache) per non interferire con
  // InternalChat che usa lo stesso queryKey.
  const [olderMessages, setOlderMessages] = useState<SilvioMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

  // Reset paginazione + tracking typewriter quando cambia canale o si chiude
  // la sheet. Senza il reset di hasHydratedRef/mountTimeRef, riaprire la
  // sheet con la cache già piena animerebbe di nuovo TUTTI i messaggi
  // storici come "live".
  useEffect(() => {
    setOlderMessages([]);
    setHasMoreOlder(true);
    seenMessageIdsRef.current = new Set();
    hasHydratedRef.current = false;
    mountTimeRef.current = new Date().toISOString();
  }, [channelId, open]);

  // Combina: messaggi storici (paginati) + live (cache condivisa con realtime).
  // Dedup safety: se realtime invalidate carica un messaggio che era in
  // olderMessages, lo skippiamo dalla lista storica via Set di ID.
  const messages = useMemo(() => {
    const liveIds = new Set(liveMessages.map((m) => m.id));
    return [...olderMessages.filter((m) => !liveIds.has(m.id)), ...liveMessages];
  }, [olderMessages, liveMessages]);

  const loadOlderMessages = useCallback(async () => {
    if (!channelId || loadingOlder || !hasMoreOlder) return;
    const oldestLoaded = messages[0];
    if (!oldestLoaded) return;
    setLoadingOlder(true);
    // Preserva la scroll position: dopo il prepend, il browser sposterebbe
    // il viewport. Manteniamo l'utente sulla stessa "ancora" visiva.
    const scrollEl = scrollRef.current;
    const beforeAnchorTop = scrollEl?.scrollTop ?? 0;
    const beforeAnchorHeight = scrollEl?.scrollHeight ?? 0;
    try {
      const { data } = await supabase
        .from("internal_chat_messages")
        .select("*")
        .eq("channel_id", channelId)
        .lt("created_at", oldestLoaded.created_at)
        .order("created_at", { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);
      const fetched = ((data ?? []) as SilvioMessage[]).slice().reverse();
      if (fetched.length === 0) {
        setHasMoreOlder(false);
      } else {
        if (fetched.length < MESSAGES_PAGE_SIZE) setHasMoreOlder(false);
        setOlderMessages((prev) => [...fetched, ...prev]);
        // Restore scroll: dopo il rendering del prepend, riposiziona così
        // l'utente resta sull'elemento che stava guardando.
        requestAnimationFrame(() => {
          if (!scrollEl) return;
          const delta = scrollEl.scrollHeight - beforeAnchorHeight;
          scrollEl.scrollTop = beforeAnchorTop + delta;
        });
      }
    } catch (err) {
      toast.error("Errore nel caricare messaggi più vecchi");
      console.error("[silvio] loadOlder error", err);
    } finally {
      setLoadingOlder(false);
    }
  }, [channelId, loadingOlder, hasMoreOlder, messages]);

  // ── 2.b Realtime subscription per nuovi messaggi (Sprint AI Uploads #4)
  // PERF FIX: prima ogni INSERT/UPDATE triggerava invalidateQueries → refetch
  // di 30 messaggi via select("*"). Durante lo streaming Silvio (UPDATE
  // token-per-token, ~30 update/messaggio) significava ~900 query Supabase
  // wasteful per una sola risposta AI. Ora applichiamo il payload Postgres
  // changes direttamente alla cache React Query (`setQueryData`).
  useEffect(() => {
    if (!channelId || !open) return;
    const queryKey = channelMessagesQueryKey(channelId);
    const channel = supabase
      .channel(`${modeCfg.realtimePrefix}-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const newMsg = payload.new as SilvioMessage | undefined;
          if (!newMsg?.id) {
            qc.invalidateQueries({ queryKey });
            return;
          }
          // upsert shape-canonica { items, hasOlder } — dedup incluso
          qc.setQueryData<ChannelMessagesCache<SilvioMessage>>(
            queryKey,
            (prev) => upsertChannelMessage(prev, newMsg),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "internal_chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          // Streaming Silvio (vedi Element 3): UPDATE arriva ad ogni token.
          // Patch in-place via setQueryData → no refetch, no flicker.
          const updMsg = payload.new as SilvioMessage | undefined;
          if (!updMsg?.id) {
            qc.invalidateQueries({ queryKey });
            return;
          }
          // upsert shape-canonica: replace se esiste, append altrimenti
          qc.setQueryData<ChannelMessagesCache<SilvioMessage>>(
            queryKey,
            (prev) => upsertChannelMessage(prev, updMsg),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId, open, qc]);

  // ── 3. Scroll bottom su nuovi messaggi + streaming ─────────────────────
  // v8.6.65 — Bug fix: durante streaming AI (token-per-token) il contenuto
  // dell'ultimo messaggio cresce ma messages.length resta uguale, quindi
  // l'auto-scroll non scattava. Ora dipendiamo anche dal contenuto del
  // messaggio più recente per seguire la risposta in tempo reale.
  // Paginazione fix: tracciamo l'ID dell'ultimo messaggio LIVE (non storico).
  // Se cambia l'ultimo live → nuovo messaggio in arrivo → scroll bottom.
  // Se cresce solo `olderMessages` (paginazione) → NON scrollare (loadOlder
  // restaura già la scroll position via scrollTop+delta).
  const liveLength = liveMessages.length;
  const lastLiveContent = liveMessages[liveLength - 1]?.content;
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [liveLength, lastLiveContent]);

  // v8.6.73 — Bug fix robusto: all'apertura del sheet, scroll all'ultimo
  // messaggio. Senza questo, l'utente vedeva i messaggi dall'alto e doveva
  // scrollare manualmente.
  // Pattern WhatsApp: chat sempre in basso, vecchi caricati in alto.
  // Approccio: sentinel <div ref={messagesEndRef} /> + scrollIntoView dopo
  // un tick (con `instant` per non animare). Triggera anche dopo che le
  // motion animations dei MessageBubble cambiano l'altezza.
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasScrolledOnOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      hasScrolledOnOpenRef.current = false;
      return;
    }
    if (hasScrolledOnOpenRef.current) return;
    if (messages.length === 0) return;
    // Multi-frame scroll: ripetiamo lo scroll su più tick per beccare anche
    // i ricalcoli di layout dopo i mount delle motion bubble. Cap a 6 frame.
    let frameCount = 0;
    const scrollNow = () => {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
      // Fallback con sentinel per browser che ignorano scrollHeight asincrono
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "instant" as ScrollBehavior });
      frameCount++;
      if (frameCount < 6) {
        rafId = requestAnimationFrame(scrollNow);
      } else {
        hasScrolledOnOpenRef.current = true;
      }
    };
    let rafId = requestAnimationFrame(scrollNow);
    return () => cancelAnimationFrame(rafId);
  }, [open, messages.length]);

  // Ticker secondo-per-secondo durante l'invio. Senza questo l'utente vede
  // solo i tre puntini animati e dopo 30s di silenzio pensa che la chat
  // sia bloccata. Con il ticker possiamo mostrare "Silvio sta riflettendo…"
  // → "Sta analizzando i dati…" → "Più tempo del previsto…" + pulsante
  // annulla dopo 30s e toast warning a 45s.
  useEffect(() => {
    if (!sending) {
      setSendingElapsed(0);
      return;
    }
    const start = Date.now();
    const iv = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setSendingElapsed(elapsed);
      if (elapsed === 45) {
        toast.warning("Silvio ci sta mettendo più del previsto.", {
          description: "Sta probabilmente analizzando un dataset grande. Puoi annullare e riprovare con una domanda più mirata.",
          duration: 6000,
        });
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [sending]);

  // Label dinamico per il typing indicator — testuale, non solo animato.
  const sendingPhaseLabel = useMemo(() => {
    if (!sending) return null;
    if (sendingElapsed < 3) return "Silvio sta riflettendo…";
    if (sendingElapsed < 10) return "Sta analizzando i tuoi dati…";
    if (sendingElapsed < 25) return "Sta interrogando le aree aziendali…";
    if (sendingElapsed < 45) return `Più tempo del previsto (${sendingElapsed}s)…`;
    return `Operazione in corso da ${sendingElapsed}s — puoi annullare`;
  }, [sending, sendingElapsed]);

  // Element 3: quando arrivano messaggi nuovi di Silvio, marcali come streaming
  // (effetto typewriter). I messaggi già visti restano statici.
  //
  // BUG FIX: prima la "prima hydration" (apertura sheet + arrivo dei 30 msg
  // iniziali) trattava TUTTI i messaggi storici come nuovi → typewriter su
  // ogni risposta Silvio storica. Stesso problema con paginazione backward
  // (Carica messaggi più vecchi): i 30 messaggi vecchi appena prepended
  // ripartivano in animazione.
  // Fix: animare SOLO messaggi davvero arrivati DOPO il mount (created_at >=
  // mountTime). Initial load + paginazione storica → no animazione.
  // PERF/LEAK FIX: i setTimeout per finire l'animazione typewriter venivano
  // creati senza tracking. Se la sheet veniva chiusa prima della scadenza
  // (utenti chattano rapidamente), restavano callback orfani con setState
  // su componente potenzialmente smontato. Ora trackiamo gli handle e li
  // pulisco all'unmount.
  const streamingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => () => {
    streamingTimersRef.current.forEach(clearTimeout);
    streamingTimersRef.current.clear();
  }, []);

  useEffect(() => {
    const newSilvioIds: string[] = [];
    const isFirstHydration = !hasHydratedRef.current && messages.length > 0;
    for (const m of messages) {
      if (!seenMessageIdsRef.current.has(m.id)) {
        if (
          !isFirstHydration &&
          m.sender_id === silvioSenderId &&
          m.content &&
          m.content.trim().length > 0 &&
          m.created_at >= mountTimeRef.current &&
          // Streaming vero dal server: il testo arriva gia' a pezzi, il
          // typewriter finto non serve. Il messaggio viene visto la prima
          // volta con streaming=true e finisce fra i "gia' visti": quando
          // diventa definitivo non riparte l'animazione.
          !m.streaming
        ) {
          newSilvioIds.push(m.id);
        }
        seenMessageIdsRef.current.add(m.id);
      }
    }
    if (isFirstHydration) hasHydratedRef.current = true;
    if (newSilvioIds.length === 0) return;
    setStreamingMessageIds((prev) => {
      const next = new Set(prev);
      newSilvioIds.forEach((id) => next.add(id));
      return next;
    });
    newSilvioIds.forEach((id) => {
      const msg = messages.find((m) => m.id === id);
      const len = msg?.content.length ?? 0;
      const durationMs = Math.max(800, (len / 50) * 1000 + 300);
      const handle = setTimeout(() => {
        streamingTimersRef.current.delete(handle);
        setStreamingMessageIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, durationMs);
      streamingTimersRef.current.add(handle);
    });
  }, [messages]);

  // ── 4. Upload attachment to storage ────────────────────────────────────
  const uploadAttachment = async (att: PendingAttachment): Promise<PendingAttachment> => {
    if (!companyId || !userId) throw new Error("Setup non pronto");
    const ts = Date.now();
    // Path: <companyId>/<userId>/<timestamp>-<sanitized-name>
    const safeName = att.file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const path = `${companyId}/${userId}/${ts}-${safeName}`;
    const { error } = await supabase.storage
      .from("silvio-uploads")
      .upload(path, att.file, {
        contentType: att.file.type || "application/octet-stream",
        upsert: false,
      });
    if (error) throw new Error(`Upload fallito: ${error.message}`);
    return { ...att, storagePath: path, uploading: false };
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // reset per permettere stesso file
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
      const pending: PendingAttachment = {
        id,
        file,
        kind,
        uploading: true,
        previewUrl,
      };
      setAttachments((prev) => [...prev, pending]);
      // Upload async
      uploadAttachment(pending)
        .then((completed) => {
          setAttachments((prev) =>
            prev.map((p) => (p.id === id ? completed : p)),
          );
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(msg);
          setAttachments((prev) =>
            prev.map((p) =>
              p.id === id ? { ...p, uploading: false, uploadError: msg } : p,
            ),
          );
        });
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  // ── 5. Audio recording (MediaRecorder) ─────────────────────────────────
  // FIX 16 (A7): pick best MIME — Safari (desktop+iOS) preferisce mp4/aac.
  // Senza questa lista Safari fa silently-fail con audio vuoto.
  const pickBestAudioMime = (): string | undefined => {
    if (typeof MediaRecorder === "undefined") return undefined;
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/aac",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    for (const c of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(c)) return c;
      } catch { /* continue */ }
    }
    return undefined;
  };
  const extFromMime = (mime: string): string => {
    if (mime.includes("webm")) return "webm";
    if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
    if (mime.includes("ogg")) return "ogg";
    return "audio";
  };

  const startRecording = async () => {
    if (recording || transcribing) return;
    if (typeof MediaRecorder === "undefined") {
      toast.error("Il tuo browser non supporta la registrazione audio. Aggiorna il browser o usa Chrome/Safari recente.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Microfono non disponibile (richiede HTTPS o browser moderno).");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickBestAudioMime();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
	      } catch {
	        // Safari pre-15 può rifiutare anche mp4: ultimo tentativo senza opts
	        recorder = new MediaRecorder(stream);
	      }
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
	      recorder.onerror = () => {
	        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        toast.error("Errore registrazione audio. Riprova o usa l'upload file.");
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const elapsedSec = Math.floor(recordingMsRef.current / 1000);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        setRecordingMs(0);
        recordingMsRef.current = 0;
        const blobMime = recorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: blobMime });
        if (audioBlob.size === 0) {
          toast.warning("Nessun audio registrato — controlla il microfono e riprova.");
          return;
        }
        const url = URL.createObjectURL(audioBlob);
        setPendingAudio({ blob: audioBlob, url, durationSec: elapsedSec });
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordingMs(0);
      recordingMsRef.current = 0;
      // Hard cap a 5 min (300s). Sopra quella durata la trascrizione
      // è lenta + costosa + spesso significa che l'utente si è
      // dimenticato il mic acceso. Auto-stop con toast.
      const MAX_AUDIO_MS = 5 * 60 * 1000;
      recordTimerRef.current = setInterval(() => {
        setRecordingMs((ms) => {
          const next = ms + 100;
          recordingMsRef.current = next;
          if (next >= MAX_AUDIO_MS) {
            // Stop programmatico tramite il recorder. Triggera onstop
            // che pulisce il timer e setRecording(false).
            const r = mediaRecorderRef.current;
            if (r && r.state !== "inactive") r.stop();
            toast.info("Registrazione fermata automaticamente (max 5 minuti).", {
              description: "Per audio più lunghi caricali come file.",
            });
          }
          return next;
        });
      }, 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Errori noti: NotAllowedError (permesso negato), NotFoundError (no mic), NotReadableError (mic occupato)
      if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
        toast.error("Permesso microfono negato. Abilita l'accesso nelle impostazioni del browser.");
      } else if (msg.includes("NotFoundError") || msg.includes("DevicesNotFound")) {
        toast.error("Nessun microfono rilevato. Collega un microfono e riprova.");
      } else if (msg.includes("NotReadableError")) {
        toast.error("Microfono occupato da un'altra app. Chiudila e riprova.");
      } else {
        toast.error(`Microfono non disponibile: ${msg}`);
      }
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setRecording(false);
  };

  const transcribeAudio = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const form = new FormData();
      // FIX 16 (A7): estensione coerente con il MIME effettivo del blob
      const ext = extFromMime(blob.type || "audio/webm");
      form.append("audio", blob, `silvio-audio-${Date.now()}.${ext}`);
      const { data, error } = await supabase.functions.invoke(
        "silvio-transcribe-audio",
        { body: form },
      );
      if (error) throw new Error(error.message);
      const text = (data as { text?: string } | null)?.text ?? "";
      if (!text.trim()) {
        toast.warning("Trascrizione vuota — riprova parlando più chiaramente");
        return;
      }
      // Append al draft esistente (se utente stava già scrivendo)
      setDraft((prev) => (prev ? `${prev} ${text}` : text));
      toast.success("Audio trascritto. Controlla e invia.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Trascrizione fallita: ${msg}`);
    } finally {
      setTranscribing(false);
    }
  };

  // Element 2: confermare la trascrizione del blob in attesa
  const confirmTranscribe = async () => {
    if (!pendingAudio) return;
    const { blob, url } = pendingAudio;
    URL.revokeObjectURL(url);
    setPendingAudio(null);
    await transcribeAudio(blob);
  };

  // v8.6.74 — Hold-to-talk: quando l'utente rilascia il mic dopo press-and-hold,
  // stopRecording() salva il blob in pendingAudio. Se la modalità "auto-send"
  // era attiva (= hold detected), saltiamo la preview e trascriviamo subito.
  useEffect(() => {
    if (!pendingAudio || !autoSendAfterStop) return;
    setAutoSendAfterStop(false);
    void confirmTranscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAudio, autoSendAfterStop]);

  // Hold-to-talk handlers — innescano lo startRecording dopo 250ms di tenuta.
  // Su rilascio: se hold attivo → stop + auto-confirm; se tap rapido → cancel.
  const handleMicHoldStart = useCallback(() => {
    if (recording || sending || loadingChannel || transcribing) return;
    holdActiveRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      holdActiveRef.current = true;
      setAutoSendAfterStop(true);
      // Vibrazione di feedback se supportata
      if ("vibrate" in navigator) {
        try { navigator.vibrate(15); } catch { /* ignora */ }
      }
      void startRecording();
    }, 250);
  }, [recording, sending, loadingChannel, transcribing]);

  const handleMicHoldEnd = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (holdActiveRef.current) {
      holdActiveRef.current = false;
      stopRecording();
      // autoSendAfterStop è già true, l'effetto sopra confermerà la trascrizione.
    }
  }, []);

  const handleMicClick = useCallback(() => {
    // Se hold ha appena gestito → ignora il click (evita doppio toggle)
    if (holdActiveRef.current) {
      holdActiveRef.current = false;
      return;
    }
    // Tap rapido = comportamento classico: toggle recording con preview
    setAutoSendAfterStop(false);
    if (recording) stopRecording();
    else void startRecording();
  }, [recording]);

  const discardPendingAudio = () => {
    if (!pendingAudio) return;
    URL.revokeObjectURL(pendingAudio.url);
    setPendingAudio(null);
    toast.info("Registrazione scartata");
  };

  const reRecord = () => {
    discardPendingAudio();
    void startRecording();
  };

  // ── 6. Send message ─────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!channelId || !companyId || !userId) throw new Error("Setup non pronto");
      const trimmed = draft.trim();
      const readyAttachments = attachments.filter((a) => a.storagePath && !a.uploadError);
      if (!trimmed && readyAttachments.length === 0) return;
      // Se ci sono allegati ancora in upload, blocca
      if (attachments.some((a) => a.uploading)) {
        throw new Error("Allegati ancora in upload, attendi");
      }

      // UX: clear draft + attachments SUBITO dopo lo snapshot, prima del round-trip
      // verso silvio-chat (3-10s). Senza questo il textarea resta popolato durante
      // tutta l'attesa e l'utente non capisce se l'invio è andato. In caso di
      // errore, onError ripristina il draft. Le variabili `trimmed` e
      // `readyAttachments` sopra catturano i valori da inviare via closure,
      // quindi il clear della UI non impatta il payload.
      setDraft("");
      setAttachments((prev) => {
        prev.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
        return [];
      });

      // Build content per la riga di chat (visibile all'utente)
      let displayContent = trimmed;
      if (!trimmed && readyAttachments.length > 0) {
        const labels = readyAttachments.map((a) => `📎 ${a.file.name}`).join(" · ");
        displayContent = labels;
      }

      // Insert user message — il primo allegato finisce in attachment_url/_name
      // (back-compat con UI esistente). Gli altri vivono nel payload silvio-chat.
      const firstAtt = readyAttachments[0];
      let firstAttPublicUrl: string | null = null;
      if (firstAtt?.storagePath) {
        const { data: signed } = await supabase.storage
          .from("silvio-uploads")
          .createSignedUrl(firstAtt.storagePath, 60 * 60 * 24 * 7); // 7 giorni
        firstAttPublicUrl = signed?.signedUrl ?? null;
      }

      const messageType =
        readyAttachments.length === 0
          ? "text"
          : firstAtt?.kind === "image"
            ? "image"
            : firstAtt?.kind === "audio"
              ? "audio"
              : firstAtt?.kind === "pdf" ||
                  firstAtt?.kind === "text-doc" ||
                  firstAtt?.kind === "office-doc" ||
                  firstAtt?.kind === "other"
                ? "file"
                : "text";

      const { error: insertErr } = await supabase.from("internal_chat_messages").insert({
        channel_id: channelId,
        sender_id: userId,
        company_id: companyId,
        content: displayContent,
        message_type: messageType,
        attachment_url: firstAttPublicUrl,
        attachment_name: firstAtt?.file.name ?? null,
      });
      if (insertErr) throw new Error(`Invio: ${insertErr.message}`);
      qc.invalidateQueries({ queryKey: ["internal-chat-messages", channelId] });

      // Crea un nuovo AbortController per questa chiamata. Il pulsante
      // "Annulla attesa" usa questo per interrompere realmente la fetch
      // verso silvio-chat invece di lasciarla finire in background.
      const ac = new AbortController();
      sendAbortRef.current = ac;
      // Invoke Silvio with full attachments list
      const res = await supabase.functions.invoke(modeCfg.edgeFunction, {
        body: {
          channel_id: channelId,
          message: trimmed || "",
          attachments: readyAttachments.map((a) => ({
            storage_path: a.storagePath!,
            mime_type: a.file.type || "application/octet-stream",
            file_name: a.file.name,
            kind: a.kind,
          })),
          // Page-aware context: Silvio sa cosa l'utente stava guardando quando
          // ha aperto la chat. Usato come HINT nel system prompt — Silvio
          // sceglie se applicarlo (domande vaghe) o ignorarlo (domande
          // esplicite su altra entità).
          ...(pageContext ? { current_context: pageContext } : {}),
          // AI Test Lab — passa il modello selezionato SOLO se demo
          // (server-side è comunque gated, double safety).
          ...(aiSelector.showSelector ? { model: aiSelector.selectedModel } : {}),
        },
        signal: ac.signal,
      });
      if (res.error) throw new Error(`Silvio: ${res.error.message}`);
      // Credito finito: la frase con il link e' gia' in chat (la scrive il
      // server); qui si apre anche la finestra di ricarica.
      const esitoCredito = res.data as { ok?: boolean; error?: string } | null;
      if (esitoCredito?.ok === false && esitoCredito.error === "credito_esaurito") {
        segnalaCreditoEsaurito({ portafoglio: "ai" });
      }
      // AI Test Lab — toast warning se aiRouter ha fatto fallback automatico.
      if (aiSelector.showSelector && aiSelector.selectedModel) {
        const data = res.data as {
          model_used?: string;
          failed_attempts?: Array<{ model: string; error: string }>;
        } | null;
        const usato = data?.model_used;
        if (usato && usato !== aiSelector.selectedModel) {
          const richiestoLabel = aiSelector.selectedModel.split('/').pop() ?? aiSelector.selectedModel;
          const usatoLabel = usato.split('/').pop() ?? usato;
          // Estrai la causa reale del fallimento (se disponibile)
          const failedAttempt = data?.failed_attempts?.find(
            (a) => a.model === aiSelector.selectedModel,
          );
          const reason = failedAttempt?.error
            ? ` — ${failedAttempt.error.slice(0, 100)}`
            : '';
          toast.warning(
            `⚠️ Fallback: ${richiestoLabel} non disponibile, risposta da ${usatoLabel}${reason}`,
            { duration: 9000 },
          );
        }
      }
      qc.invalidateQueries({ queryKey: ["internal-chat-messages", channelId] });
    },
    onSuccess: () => {
      // Draft + attachments già clearati ottimisticamente in mutationFn — qui no-op.
    },
    onError: (e: Error, _vars, context) => {
      // AbortError silenzioso: è una cancellazione utente, NON un fail.
      // Il toast.info("Invio annullato") è già stato emesso dal click handler.
      const isAbort = e.name === "AbortError" || /aborted|abort/i.test(e.message);
      if (!isAbort) {
        toast.error(humanizeSilvioError(e.message));
      }
      // Ripristina il draft se è stato clearato ottimisticamente — l'utente
      // non perde il testo digitato in caso di errore di rete/server (o abort).
      const restored = (context as { draft?: string } | undefined)?.draft;
      if (restored) setDraft((cur) => cur || restored);
    },
    onMutate: () => {
      // Snapshot pre-clear per ripristino in onError. Le attachments NON si
      // ripristinano (sono file utente già caricati, ricaricarli sarebbe peggio).
      return { draft };
    },
    onSettled: () => {
      sendAbortRef.current = null;
      setSending(false);
    },
  });

  const handleSend = () => {
    const hasContent = draft.trim() || attachments.some((a) => a.storagePath);
    if (!hasContent || sending) return;
    setSending(true);
    sendMutation.mutate();
  };

  const recordingSeconds = useMemo(() => Math.floor(recordingMs / 1000), [recordingMs]);
  const recordingLabel = useMemo(() => {
    const s = Math.floor(recordingMs / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, [recordingMs]);

  // ── 7. Render single message (component standalone per useTypewriter) ──
  // Vedi MessageBubble in fondo al file.

  // ── 8. Render ───────────────────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col gap-0 bg-slate-50"
      >
        {/* Header migliorato 2026-05-10 con menu kebab + quick actions */}
        <SheetHeader className="px-3 sm:px-4 py-2 sm:py-3 border-b bg-white/95 backdrop-blur">
          <SheetTitle className="flex items-center gap-2 text-base">
            <div className="relative shrink-0">
              <SilvioAvatar size={36} className="rounded-full" />
              <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
                Chat con {modeCfg.headerTitle}
                {mode === "admin" && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-700">
                    {modeCfg.headerBadge}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-slate-500 font-normal truncate">
                {pageContext
                  ? `Sai che sto guardando: ${pageContext.route_label}`
                  : messages.length > 0
                    ? `${messages.length} messaggi · live · multimodal`
                    : mode === "admin"
                      ? "Gestione piattaforma + agenti cross-tenant"
                      : "Analizza testi, foto, PDF, DDT e vocali"}
              </p>
            </div>
            {/* 🆕 Bottoni azione header.
                v8.6.73 — Maximize2 e MoreVertical nascosti su mobile: l'utente
                vede header sovraffollato (X + ⋮ + ↗ + tre dots Radix Close).
                Su mobile la X di chiusura di Radix basta. */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex h-8 w-8 shrink-0"
              title="Espandi in pagina dedicata"
              onClick={() => {
                onOpenChange(false);
                navigate(mode === "admin" ? "/admin/chat" : "/azienda/chat");
              }}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden sm:inline-flex h-8 w-8 shrink-0"
                  title="Altre opzioni"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate("/azienda/azioni-proposte")}>
                  <Sparkles className="h-3.5 w-3.5 mr-2 text-orange-600" />
                  Azioni proposte AI
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/azienda/ai-memoria")}>
                  <Brain className="h-3.5 w-3.5 mr-2 text-orange-600" />
                  Memoria AI
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/azienda/email-triage")}>
                  <FileText className="h-3.5 w-3.5 mr-2 text-blue-600" />
                  Email triage
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/azienda/assistente-ai")}>
                  <UserIcon className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                  Le 18 personas AI
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    if (confirm("Pulire la cronologia visibile? I messaggi rimangono in DB.")) {
                      // shape canonica condivisa con InternalChat (mai array nudo)
                      qc.setQueryData(channelMessagesQueryKey(channelId), { items: [], hasOlder: false });
                    }
                  }}
                  className="text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Pulisci visualizzazione
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SheetTitle>
        </SheetHeader>

        {/* 🆕 Quick actions toolbar — sempre visibile (non solo nell'empty state)
            v8.6.72 — Padding ridotto su mobile per recuperare verticale. */}
        <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b bg-white/60 flex gap-1.5 overflow-x-auto scrollbar-thin shrink-0">
          {/* F4 — Brief giornata: re-triggerabile manualmente anche se già auto-inviato */}
          <SilvioQuickAction
            icon={Sparkles}
            label="Brief giornata"
            color="text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100"
            onClick={() => {
              if (companyId) localStorage.setItem(`silvio_brief_${companyId}`, new Date().toISOString().split("T")[0]);
              setDraft("Cosa conta ora?");
              setAutoSendPending(true);
            }}
          />
          <SilvioQuickAction
            icon={FileSpreadsheet}
            label="Computo → Preventivo"
            color="text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
            onClick={() => {
              onOpenChange(false);
              navigate("/azienda/marketing/preventivi?action=import-computo");
            }}
          />
          <SilvioQuickAction
            icon={Wallet}
            label="Cassa 30gg"
            color="text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
            onClick={() => setDraft("Come sta la mia cassa nei prossimi 30 giorni?")}
          />
          <SilvioQuickAction
            icon={HardHat}
            label="Margini cantieri"
            color="text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100"
            onClick={() => setDraft("Quali commesse stanno erodendo margine? Spiega cause e suggerisci azioni.")}
          />
          <SilvioQuickAction
            icon={TrendingUp}
            label="Pipeline"
            color="text-sky-700 bg-sky-50 border-sky-200 hover:bg-sky-100"
            onClick={() => setDraft("Forecast pipeline trimestre + opportunità a rischio.")}
          />
          <SilvioQuickAction
            icon={Search}
            label="Cerca"
            color="text-slate-700 bg-slate-50 border-slate-200 hover:bg-slate-100"
            onClick={() => {
              onOpenChange(false);
              // Trigger Cmd+K command palette
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
            }}
          />
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-slate-50">
          {loadingChannel ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-xs">Connetto a Silvio…</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
              <SilvioAvatar size={48} className="mb-3 rounded-full shadow-lg" />
              <p className="text-sm font-semibold text-slate-800 mb-1">Ciao! Sono Silvio.</p>
              <p className="text-xs text-muted-foreground mb-4">
                Posso aiutarti su finanza, cantieri, vendite, personale, strategia.
                Chiedi qualsiasi cosa con i tuoi dati reali, mandami foto, PDF o vocale.
              </p>
              <div className="grid grid-cols-1 gap-1.5 w-full max-w-sm">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setDraft(q)}
                    className="text-left text-xs bg-white hover:bg-orange-50 border border-slate-200 hover:border-orange-200 rounded-lg px-3 py-2.5 transition-colors shadow-sm"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {/* Pulsante per caricare conversazioni storiche oltre i 30 messaggi
                  iniziali. Mostrato solo se non sappiamo già che siamo arrivati
                  al primo messaggio del canale (hasMoreOlder=false dopo che una
                  fetch ha restituito 0 risultati). */}
              {hasMoreOlder && messages.length >= MESSAGES_PAGE_SIZE && (
                <div className="flex justify-center pb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadOlderMessages}
                    disabled={loadingOlder}
                    className="text-xs text-slate-500 hover:text-orange-600 hover:bg-orange-50"
                  >
                    {loadingOlder ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                        Caricamento…
                      </>
                    ) : (
                      <>↑ Carica messaggi più vecchi</>
                    )}
                  </Button>
                </div>
              )}
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isMe={m.sender_id === userId}
                  streaming={streamingMessageIds.has(m.id)}
                  onAskFollowup={(q) => setDraft(q)}
                  silvioSenderId={silvioSenderId}
                  showRunMeta={aiSelector.showSelector}
                />
              ))}
            </AnimatePresence>
          )}
          {/* Mentre la risposta arriva in streaming la bolla e' gia' in chat:
              i tre puntini sopra sarebbero un doppione. */}
          {sending && !liveMessages.some((m) => m.streaming) && (
            <div className="flex gap-2 justify-start">
              <SilvioAvatar size={28} animated="thinking" className="rounded-full" />
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-2 max-w-fit">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-slate-400"
                        animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                  {sendingPhaseLabel && (
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">
                      {sendingPhaseLabel}
                    </span>
                  )}
                </div>
                {/* Pulsante annulla dopo 30s di attesa. Setta sending=false
                    via la mutation reset — la promise edge function può
                    completare comunque server-side ma il client smette di
                    aspettare e sblocca l'input per la prossima domanda. */}
                {sendingElapsed >= 30 && (
                  <button
                    type="button"
                    onClick={() => {
                      // Aborta la fetch reale verso silvio-chat se ancora in corso.
                      sendAbortRef.current?.abort();
                      sendAbortRef.current = null;
                      sendMutation.reset();
                      setSending(false);
                      toast.info("Invio annullato. Puoi scrivere una nuova domanda.");
                    }}
                    className="self-start text-[11px] text-orange-600 hover:text-orange-700 underline underline-offset-2"
                  >
                    Annulla attesa
                  </button>
                )}
              </div>
            </div>
          )}
          {/* v8.6.73 — Sentinel per scrollIntoView all'apertura: ancora il
              viewport in fondo anche quando le animazioni di mount delle
              motion.div fanno crescere l'altezza in modo asincrono. */}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>

        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="border-t bg-slate-50 px-3 py-2 flex gap-2 overflow-x-auto">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="relative shrink-0 group"
              >
                <div
                  className="h-16 w-16 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden"
                  title={`${kindLabel(a.kind)} · ${a.file.name}`}
                >
                  {a.previewUrl ? (
                    <img loading="lazy" src={a.previewUrl} alt={a.file.name} className="h-full w-full object-cover" />
                  ) : a.kind === "pdf" ? (
                    <FileText className="h-6 w-6 text-red-500" />
                  ) : a.kind === "audio" ? (
                    <AudioLines className="h-6 w-6 text-blue-500" />
                  ) : a.kind === "office-doc" ? (
                    a.file.name.toLowerCase().match(/\.(xlsx|xls)$/) ? (
                      <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
                    ) : (
                      <FileType className="h-6 w-6 text-blue-700" />
                    )
                  ) : a.kind === "text-doc" ? (
                    <FileText className="h-6 w-6 text-slate-500" />
                  ) : (
                    <FileIcon className="h-6 w-6 text-slate-400" />
                  )}
                </div>
                {a.uploading && (
                  <div className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
                {a.uploadError && (
                  <div className="absolute inset-0 rounded-lg bg-red-500/80 flex items-center justify-center text-white text-[9px] text-center px-1">
                    Errore
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-md hover:bg-slate-700"
                  aria-label={`Rimuovi ${a.file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="absolute -bottom-1 left-0 right-0 text-[9px] text-slate-500 truncate text-center px-0.5">
                  {fmtBytes(a.file.size)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recording indicator */}
        {recording && (
          <div className="border-t bg-red-50 px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-semibold text-red-700">
                Registrazione · {recordingLabel}
              </span>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={stopRecording}
              className="h-7 px-3"
            >
              <Square className="h-3 w-3 mr-1" /> Stop
            </Button>
          </div>
        )}

        {transcribing && (
          <div className="border-t bg-blue-50 px-3 py-2 flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
            <span className="text-xs text-blue-700">Trascrivo l'audio…</span>
          </div>
        )}

        {/* Element 2: pending audio player — riascolta prima di trascrivere */}
        {pendingAudio && !transcribing && (
          <div className="border-t bg-orange-50 px-3 py-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
                <AudioLines className="h-3.5 w-3.5" />
                Registrato {pendingAudio.durationSec}s · riascolta prima di inviare
              </span>
              <button
                type="button"
                onClick={discardPendingAudio}
                className="text-[11px] text-slate-500 hover:text-red-600 underline"
              >
                Scarta
              </button>
            </div>
            <audio
              src={pendingAudio.url}
              controls
              className="w-full h-9"
              preload="auto"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={reRecord}
                className="h-7 px-3 text-xs"
              >
                <Mic className="h-3 w-3 mr-1" /> Rifai
              </Button>
              <Button
                size="sm"
                onClick={confirmTranscribe}
                className="h-7 px-3 text-xs bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 ml-auto"
              >
                <Sparkles className="h-3 w-3 mr-1" /> Trascrivi
              </Button>
            </div>
          </div>
        )}

        {/* Hold-to-talk overlay — appare quando l'utente sta tenendo premuto
            il mic in modalità rapida. Pattern WhatsApp: indicatore rosso con
            timer + suggerimento "rilascia per inviare". */}
        {recording && autoSendAfterStop && (
          <div className="border-t bg-red-50/90 backdrop-blur px-4 py-2 flex items-center gap-3 text-sm shrink-0">
            <span className="flex items-center justify-center h-7 w-7 rounded-full bg-red-500 shrink-0 animate-pulse">
              <Mic className="h-4 w-4 text-white" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-red-900 leading-tight">
                Registrazione · {Math.floor(recordingMs / 1000)}s
              </p>
              <p className="text-[11px] text-red-700 leading-tight">
                Rilascia per inviare l'audio
              </p>
            </div>
            <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping" />
          </div>
        )}

        {/* Input footer */}
        <div className="border-t bg-white p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          {/* AI Test Lab — selettore modello (visibile solo Demo Azienda)
              v8.6.72 — Nascosto su mobile: dev/debug tool, su mobile l'input
              deve avere il massimo spazio. Resta da tablet (sm+) in su. */}
          {aiSelector.showSelector && aiSelector.availableModels.length > 0 && (
            <div className="mb-2 hidden sm:flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">AI Test Lab:</span>
              <AIModelSelector
                models={aiSelector.availableModels}
                selectedModel={aiSelector.selectedModel}
                onSelect={aiSelector.setSelectedModel}
                loading={aiSelector.loading}
                onRefresh={aiSelector.refresh}
                showCost
              />
            </div>
          )}
          <div className="flex gap-2 items-end">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,audio/*,text/*,application/json,application/xml,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.txt,.csv,.md,.json,.docx,.xlsx,.xls,.log,.xml,.yaml,.yml"
              multiple
              onChange={handleFilePick}
              className="hidden"
            />
            {/* Camera input — su mobile apre la fotocamera diretta grazie a
                capture="environment". Su desktop apre il file picker immagini. */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFilePick}
              className="hidden"
            />
            {/* Skill picker — "+" che apre menu di shortcut prompts (slash command style) */}
            <Popover open={skillPickerOpen} onOpenChange={setSkillPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  disabled={sending || loadingChannel}
                  className="h-11 w-11 sm:h-10 sm:w-10 rounded-2xl sm:rounded-xl text-slate-600 hover:text-orange-600 hover:bg-orange-50 shrink-0"
                  title="Skill di Silvio (azioni rapide)"
                >
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                sideOffset={8}
                className="w-[340px] sm:w-[380px] p-0 border-orange-100 shadow-2xl rounded-2xl overflow-hidden flex flex-col"
                style={{ maxHeight: 'min(70vh, 540px)' }}
              >
                <div className="bg-gradient-to-br from-orange-500 to-amber-400 px-3 py-2 text-white shrink-0">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" fill="currentColor" />
                    <p className="text-xs font-semibold">Azioni rapide</p>
                  </div>
                  <p className="text-[10px] opacity-90 leading-tight">Allega file, foto o usa una skill di Silvio</p>
                </div>
                <div className="overflow-y-auto p-2 space-y-3 flex-1 min-h-0">
                  {/* Quick actions: allega file (mobile-friendly entry, replica
                      la paperclip che su mobile è nascosta per UX WhatsApp) */}
                  <div className="sm:hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setSkillPickerOpen(false);
                        fileInputRef.current?.click();
                      }}
                      disabled={attachments.length >= MAX_ATTACHMENTS}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-left hover:bg-orange-50 transition-colors disabled:opacity-50"
                    >
                      <Paperclip className="h-4 w-4 shrink-0 text-orange-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800 leading-tight">Allega file</p>
                        <p className="text-[11px] text-slate-500 leading-tight">Foto, PDF, DDT, audio, Excel</p>
                      </div>
                    </button>
                    <div className="h-px bg-slate-200 my-2" />
                  </div>
                  {(["data", "doc", "operations", "advisor"] as const).map((cat) => {
                    const items = SILVIO_SKILLS.filter((s) => s.category === cat);
                    if (items.length === 0) return null;
                    const catLabel: Record<string, string> = {
                      data: "📊 Dati aziendali",
                      doc: "📄 Documenti",
                      operations: "🏗️ Operations",
                      advisor: "🧠 Advisor strategico",
                    };
                    return (
                      <div key={cat}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 px-1.5 mb-1">
                          {catLabel[cat]}
                        </p>
                        <div className="space-y-0.5">
                          {items.map((skill) => (
                            <button
                              key={skill.id}
                              type="button"
                              onClick={() => {
                                setDraft(skill.template);
                                setSkillPickerOpen(false);
                                // focus textarea
                                setTimeout(() => {
                                  const ta = document.querySelector<HTMLTextAreaElement>(
                                    'textarea[placeholder*="Silvio"], textarea[placeholder*="analizzi"]',
                                  );
                                  ta?.focus();
                                }, 50);
                              }}
                              className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left hover:bg-orange-50 transition-colors group"
                            >
                              <span className="text-base shrink-0 mt-0.5">{skill.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-semibold text-slate-800 group-hover:text-orange-700 leading-tight">
                                  {skill.label}
                                </p>
                                <p className="text-[10px] text-slate-500 leading-tight truncate">{skill.hint}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {/* Paperclip — solo desktop (su mobile sta dentro al "+" skill picker) */}
            <Button
              size="icon"
              variant="ghost"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || loadingChannel || attachments.length >= MAX_ATTACHMENTS}
              className="hidden sm:inline-flex h-10 w-10 rounded-xl text-slate-600 hover:text-orange-600 hover:bg-orange-50 shrink-0"
              title="Allega file (immagine o PDF)"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            {/* Emoji picker — solo desktop (su mobile c'è già la tastiera native) */}
            <EmojiPicker
              accent="orange"
              onPick={(emoji) => setDraft((cur) => cur + emoji)}
              trigger={
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  className="hidden sm:inline-flex h-10 w-10 rounded-xl text-slate-600 hover:text-orange-600 hover:bg-orange-50 shrink-0"
                  title="Inserisci emoji"
                  aria-label="Inserisci emoji"
                >
                  <Smile className="h-4 w-4" />
                </Button>
              }
            />
            {/* Input pill — WhatsApp-style: arrotondato pieno, fondo pastello,
                cresce in altezza con il contenuto, nessun bordo visibile a riposo. */}
            <textarea
              ref={draftTextareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={attachments.length > 0 ? "Descrivi cosa vuoi che analizzi…" : "Scrivi a Silvio…"}
              rows={1}
              className="flex-1 resize-none rounded-full bg-slate-100 border border-transparent focus:border-orange-300 focus:bg-white px-4 py-2.5 text-[15px] sm:text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-orange-200 min-h-[44px] placeholder:text-slate-500"
              disabled={sending || loadingChannel}
            />
            {/* Right-side buttons — pattern WhatsApp:
                  draft vuoto    → 📷 Camera + 🎤 Mic
                  draft con testo → ➤ Send (Camera+Mic spariscono)
                v8.6.75 — Camera + transizione animata WhatsApp-style:
                  fade-out + scale-down sui due bottoni che spariscono,
                  fade-in + scale-up con leggera rotazione su Send che entra.
                  mode="wait" così l'uscita finisce prima dell'ingresso. */}
            <AnimatePresence mode="wait" initial={false}>
              {(draft.trim() || attachments.length > 0) ? (
                <motion.div
                  key="send"
                  initial={{ scale: 0, opacity: 0, rotate: -45 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0, opacity: 0, rotate: 45 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="flex items-center gap-1 sm:gap-2 shrink-0"
                >
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={
                      (!draft.trim() && attachments.length === 0) ||
                      sending ||
                      loadingChannel ||
                      attachments.some((a) => a.uploading)
                    }
                    className="h-11 w-11 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 shadow-md shadow-orange-300/30 shrink-0"
                    aria-label="Invia messaggio"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="camera-mic"
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.7, opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="flex items-center gap-1 sm:gap-2 shrink-0"
                >
                  {/* Camera button — apre la fotocamera (capture="environment") */}
                  <Button
                    size="icon"
                    variant="ghost"
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={sending || loadingChannel || attachments.length >= MAX_ATTACHMENTS}
                    className="h-11 w-11 sm:h-10 sm:w-10 rounded-full text-slate-600 hover:text-orange-600 hover:bg-orange-50 shrink-0 active:scale-95 transition-transform"
                    aria-label="Scatta foto"
                    title="Scatta foto"
                  >
                    <Camera className="h-5 w-5 sm:h-4 sm:w-4" />
                  </Button>
                  {/* Mic button — tap classico / hold WhatsApp-style per audio veloce */}
                  <Button
                    size="icon"
                    variant="ghost"
                    type="button"
                    onClick={handleMicClick}
                    onPointerDown={handleMicHoldStart}
                    onPointerUp={handleMicHoldEnd}
                    onPointerLeave={handleMicHoldEnd}
                    onPointerCancel={handleMicHoldEnd}
                    disabled={sending || loadingChannel || transcribing}
                    className={`h-11 w-11 sm:h-10 sm:w-10 rounded-full shrink-0 select-none touch-none transition-transform ${
                      recording
                        ? "bg-red-500 text-white scale-110 ring-4 ring-red-200 animate-pulse"
                        : "text-slate-600 hover:text-orange-600 hover:bg-orange-50 active:scale-95"
                    }`}
                    aria-label={recording ? "Ferma registrazione" : "Tap registra · Tieni premuto per audio veloce"}
                    title={recording ? "Ferma registrazione" : "Tap = registra · Tieni premuto = audio veloce (rilascia per inviare)"}
                  >
                    <Mic className="h-5 w-5 sm:h-4 sm:w-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Footer hint — solo desktop; su mobile gli affordance sono già
              evidenti dai bottoni rotondi e dalla tastiera native. */}
          <div className="hidden sm:flex items-center justify-between mt-2 px-1">
            <p className="text-[10px] text-muted-foreground">
              📎 file · 🎙 vocale · ⏎ invio
              {recordingSeconds >= 60 && recordingSeconds < 240 && " · audio max 5 min"}
              {recordingSeconds >= 240 && recordingSeconds < 300 && ` · stop auto tra ${300 - recordingSeconds}s`}
            </p>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                navigate("/azienda/chat");
              }}
              className="text-[10px] text-orange-600 hover:underline flex items-center gap-0.5"
            >
              Apri chat completa <ExternalLink className="h-2.5 w-2.5" />
            </button>
          </div>
          {/* Su mobile mostriamo solo eventuali warning attivi (recording timer) */}
          {(recordingSeconds >= 60) && (
            <p className="sm:hidden text-[10px] text-muted-foreground mt-1.5 px-1">
              {recordingSeconds < 240 && "🎙 audio max 5 min"}
              {recordingSeconds >= 240 && recordingSeconds < 300 && `🎙 stop auto tra ${300 - recordingSeconds}s`}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const SUGGESTED_QUESTIONS = [
  "Cosa conta ora? Dimmi le priorità di oggi.",
  "Come sta la mia cassa nei prossimi 30 giorni?",
  "Quali commesse stanno erodendo margine?",
  "Quanti preventivi devo ancora chiudere?",
];

// 🆕 Quick action chip riutilizzabile in toolbar
function SilvioQuickAction({
  icon: Icon,
  label,
  color,
  onClick,
}: {
  icon: typeof Sparkles;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[11px] font-medium transition-colors ${color}`}
      title={label}
    >
      <Icon className="h-3 w-3" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

/**
 * FIX 6 (A11): mappa errori tecnici a messaggi user-friendly italiani.
 * Prima il toast mostrava "Silvio: ERR_NAME_NOT_RESOLVED" o
 * "Silvio: 503 Service Unavailable" — utente non capisce e si blocca.
 */
function humanizeSilvioError(rawMsg: string): string {
  const msg = (rawMsg ?? "").toLowerCase();
  // Rete / DNS
  if (msg.includes("err_name_not_resolved") || msg.includes("err_internet")) {
    return "Connessione assente. Verifica la tua rete e riprova.";
  }
  if (msg.includes("err_network") || msg.includes("network error") || msg.includes("fetch failed")) {
    return "Problema di rete. Riprova tra qualche istante.";
  }
  // Auth
  if (msg.includes("unauthorized") || msg.includes("401") || msg.includes("invalid jwt")) {
    return "Sessione scaduta. Aggiorna la pagina e accedi di nuovo.";
  }
  if (msg.includes("forbidden") || msg.includes("403")) {
    return "Non hai il permesso per usare Silvio in questo contesto.";
  }
  // Server
  if (msg.includes("503") || msg.includes("service unavailable")) {
    return "Silvio non è raggiungibile in questo momento. Riprova fra 1 minuto.";
  }
  if (msg.includes("502") || msg.includes("bad gateway")) {
    return "Silvio sta avendo problemi col motore AI. Riprova tra poco.";
  }
  if (msg.includes("504") || msg.includes("gateway timeout") || msg.includes("timeout")) {
    return "Silvio ha impiegato troppo tempo a rispondere. Prova a riformulare in modo più semplice.";
  }
  if (msg.includes("openrouter timeout")) {
    return "Il modello AI non ha risposto in tempo. Riprova — potrebbe essere un problema temporaneo del provider.";
  }
  // Cost / Credits
  if (msg.includes("credit") || msg.includes("budget") || msg.includes("insufficient")) {
    return "Crediti AI esauriti. Contatta l'amministratore per ricaricare il wallet AI.";
  }
  // RBAC
  if (msg.includes("rbac") || msg.includes("non posso accedere")) {
    return "Non posso accedere a queste informazioni con il tuo ruolo. Chiedi a un amministratore.";
  }
  // Setup
  if (msg.includes("silvio non configurato") || msg.includes("disabilitato")) {
    return "Silvio non è ancora configurato per la tua azienda. Contatta il supporto.";
  }
  // Allegati
  if (msg.includes("upload") || msg.includes("storage")) {
    return "Errore caricamento allegato. Verifica dimensione (<10MB) e formato e riprova.";
  }
  // Setup non pronto
  if (msg.includes("setup non pronto")) {
    return "Sto ancora preparando la chat. Attendi qualche secondo.";
  }
  // Default: messaggio originale ma ripulito + suggerimento
  const cleaned = rawMsg.replace(/^Silvio:\s*/, "").substring(0, 150);
  return `Errore: ${cleaned}. Se persiste, riprova o contatta il supporto.`;
}

// ─────────────────────────────────────────────────────────────────────────
// MessageBubble — render di un singolo messaggio con effetto typewriter
// (Element 3 Sprint AI Uploads). Estratto come component perché useTypewriter
// è un hook e non può vivere dentro una map callback inline.
// ─────────────────────────────────────────────────────────────────────────
function MessageBubble({
  message,
  isMe,
  streaming,
  onAskFollowup,
  silvioSenderId = SILVIO_SENDER_ID,
  showRunMeta = false,
}: {
  message: SilvioMessage;
  isMe: boolean;
  streaming: boolean;
  onAskFollowup?: (query: string) => void;
  silvioSenderId?: string;
  /**
   * AIRunFooter (⏱ tempo · modello · $costo) è meta dev/debug del Test Lab:
   * visibile SOLO a demo company + super_admin (aiSelector.showSelector).
   * Gli utenti normali NON devono vedere quanto costa la chiamata AI.
   */
  showRunMeta?: boolean;
}) {
  const isSilvio = message.sender_id === silvioSenderId;
  const isImage = message.message_type === "image" && message.attachment_url;
  const isAudio = message.message_type === "audio" && message.attachment_url;
  const isFile = message.message_type === "file" && message.attachment_url;
  // Streaming vero (colonna `streaming`): il testo arriva gia' a pezzi dal
  // server; il typewriter finto ripartirebbe da zero a ogni aggiornamento.
  // Si mostra il testo com'e', col cursore, finche' il server non lo chiude.
  const isLiveStream = isSilvio && message.streaming === true;
  // FIX 15 (A6): typewriter con skip API + auto-skip per long msg
  const { displayed: animatedContent, skip: skipTypewriter } = useTypewriter(
    message.content || "",
    isSilvio && streaming && !isLiveStream,
    60,
  );
  const visibleContent = isSilvio && streaming && !isLiveStream ? animatedContent : message.content;
  const isStillTyping = isLiveStream ||
    (isSilvio && streaming && !isLiveStream && animatedContent.length < message.content.length);

  // FIX 15 (A6): auto-skip se il bubble esce dalla viewport (utente scrolla via)
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isStillTyping || !bubbleRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) {
            skipTypewriter();
          }
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(bubbleRef.current);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStillTyping]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}
    >
      {isSilvio && (
        <SilvioAvatar size={28} className="rounded-full shadow-sm" />
      )}
      <div
        ref={bubbleRef}
        onClick={isStillTyping ? skipTypewriter : undefined}
        title={isStillTyping ? "Tocca per saltare l'animazione" : undefined}
	        className={`max-w-[84%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm ${
	          isStillTyping ? "cursor-pointer" : ""
	        } ${
	          isMe
	            ? "bg-orange-500 text-white rounded-br-sm"
	            : "bg-white text-slate-800 rounded-bl-sm border border-slate-200"
	        }`}
      >
        {/* Anteprima allegato */}
        {isImage && (
          <a href={message.attachment_url!} target="_blank" rel="noopener noreferrer">
            <img
              src={message.attachment_url!}
              alt={message.attachment_name ?? "immagine"}
              className="max-h-48 rounded-lg mb-1.5 object-cover"
              loading="lazy"
            />
          </a>
        )}
        {isAudio && (
          <audio controls src={message.attachment_url!} className="max-w-full mb-1.5">
            audio
          </audio>
        )}
        {isFile && (
          <a
            href={message.attachment_url!}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 mb-1.5 px-2 py-1.5 rounded-lg ${
              isMe
                ? "bg-orange-600/40 hover:bg-orange-600/60"
                : "bg-white hover:bg-slate-50 border border-slate-200"
            }`}
          >
            <FileText className={`h-4 w-4 ${isMe ? "text-white" : "text-slate-700"}`} />
            <span className={`text-xs truncate ${isMe ? "text-white" : "text-slate-700"}`}>
              {message.attachment_name ?? "documento.pdf"}
            </span>
          </a>
        )}
        {/* AI metadata top: review banner + low confidence + multi-area badge */}
        {isSilvio && !isStillTyping && (
          <AiMessageMetaTop
            meta={{
              ai_confidence: message.ai_confidence,
              ai_requires_human_review: message.ai_requires_human_review,
              followup_suggestions: message.followup_suggestions,
              council_data: message.council_data,
            }}
          />
        )}
        {visibleContent && (
          isMe || isStillTyping
            // Per i messaggi utente E durante il typing animato, manteniamo il
            // testo grezzo (typewriter funziona char-by-char, markdown si renderizza
            // SOLO al completamento).
            ? <span>{visibleContent}</span>
            : <ChatMarkdown content={visibleContent} className="text-[13px]" sources={message.rag_sources ?? undefined} />
        )}
        {/* Cursor blinking durante typing */}
        {isStillTyping && (
          <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-slate-500 align-middle animate-pulse" />
        )}
        {/* AI metadata bottom: council expandable + chip follow-up */}
        {isSilvio && !isStillTyping && (
          <AiMessageMetaBottom
            meta={{
              ai_confidence: message.ai_confidence,
              ai_requires_human_review: message.ai_requires_human_review,
              followup_suggestions: message.followup_suggestions,
              council_data: message.council_data,
            }}
            onAskFollowup={onAskFollowup}
          />
        )}
        {/* AI Test Lab — footer ⏱ tempo · 🟠 modello · $costo (solo demo)
            v8.6.72 — Nascosto su mobile: meta dev/debug, su mobile occupa
            spazio prezioso. Resta su tablet/desktop (sm+).
            Fix 2026-06: gate esplicito showRunMeta (demo/super_admin) — prima
            bastava last_model_id (sempre persistito) e TUTTI gli utenti
            vedevano il costo della chiamata AI in chat. */}
        {showRunMeta && isSilvio && !isStillTyping && message.last_model_id && (
          <div className="hidden sm:block">
            <AIRunFooter meta={{
              model_id: message.last_model_id,
              latency_ms: message.last_latency_ms,
              cost_usd: message.last_cost_usd,
              input_tokens: message.last_input_tokens,
              output_tokens: message.last_output_tokens,
              requested_model_id: message.requested_model_id,
            }} />
          </div>
        )}
      </div>
      {isMe && (
        <div className="h-7 w-7 shrink-0 rounded-full bg-slate-200 flex items-center justify-center">
          <UserIcon className="h-3.5 w-3.5 text-slate-600" />
        </div>
      )}
    </motion.div>
  );
}
