/**
 * EmailViewer — visualizza un thread con tutti i messaggi
 *
 * - Header con subject + actions toolbar (star, archive, trash, reply)
 * - Lista messaggi del thread (collapsible quando >2)
 * - Render HTML sanitizzato via DOMPurify (no script, no on* handlers)
 * - Allegati cliccabili (download da storage)
 * - AI summary chip (se presente)
 *
 * Reply/Reply all/Forward aprono la compose con contesto del thread.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  useThreadActivity,
  useTrackThreadView,
  summarizeThreadActivity,
  type EmailActivityAction,
} from "../hooks/useThreadActivity";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import DOMPurify from "dompurify";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DocumentoEstrattoPanel } from "@/components/email-ai/DocumentoEstrattoPanel";
import { OpportunitaEmailPanel } from "@/components/email-ai/OpportunitaEmailPanel";
import { CollegamentiEmailPanel } from "@/components/email-ai/CollegamentiEmailPanel";
import { EventoEmailPanel } from "@/components/email-ai/EventoEmailPanel";
import { RischioBanner } from "@/components/email-ai/RischioBanner";
import { PecBadge } from "@/components/email-ai/PecBadge";
import {
  ArrowLeft, Star, Archive, Trash2, Reply, ReplyAll, Forward,
  Paperclip, Sparkles, AlertTriangle, X, Wand2, Loader2, ListChecks,
  Truck, CalendarClock, PackageCheck, Send, ClipboardCheck, MoreHorizontal,
  ChevronUp, ChevronDown,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ActionProposalCard } from "@/components/ai/ActionProposals/ActionProposalCard";
// MP-EMAIL-AI-01: pulsante "Rispondi con AI" (L4 Sonnet) + selettore categoria (feedback loop)
import { AiDraftButton } from "@/components/email-ai/AiDraftButton";
import {
  predictEmailReconciliation,
  type PredictiveEmailResult,
} from "../lib/predictiveReconciliation";

interface MessageRow {
  id: string;
  thread_id: string;
  message_id: string | null;
  oauth_connection_id: string | null;
  from_email: string | null;
  from_name: string | null;
  to_email: string | null;
  cc_emails?: string[] | null;
  subject: string | null;
  received_at: string;
  raw_html: string | null;
  raw_text: string | null;
  attachments: unknown;
  ai_category: string | null;
  ai_priority: string | null;
  ai_summary: string | null;
  ai_extracted: Record<string, unknown> | null;
  ai_suggested_action: string | null;
  ai_processed_at: string | null;
  is_read: boolean;
  is_starred: boolean;
  is_pec?: boolean | null;
  pec_tipo?: string | null;
  pec_stato?: string | null;
}

interface EmailAnalysisResult {
  category: string;
  priority: string;
  summary: string;
  action_items: string[];
  extracted: Record<string, unknown>;
  suggested_action: string;
  intent: string;
  sentiment: string;
  risk_flags: string[];
  reply_strategy: string;
  operations?: EmailOperationsInsight;
}

interface EmailOperationsInsight {
  domain?: string;
  confidence?: number;
  supplier?: {
    name?: string | null;
    email?: string | null;
  };
  purchase_order?: {
    id?: string | null;
    number?: string | null;
    reference_text?: string | null;
  };
  delivery?: {
    status?: string | null;
    original_date?: string | null;
    new_date?: string | null;
    delay_days?: number | string | null;
    reason?: string | null;
  };
  ddt?: {
    number?: string | null;
    date?: string | null;
    items?: unknown[];
  };
  items?: Array<{
    description?: string | null;
    sku?: string | null;
    quantity?: number | string | null;
    unit?: string | null;
  }>;
  recommended_actions?: Array<{
    type?: string | null;
    label?: string | null;
    risk?: string | null;
    requires_confirmation?: boolean | null;
    payload?: Record<string, unknown> | null;
  }>;
  draft_email?: {
    to?: string | null;
    subject?: string | null;
    body?: string | null;
  };
}

interface EmailActionProposalLite {
  id: string;
  action_type: string;
  summary: string;
  status: "pending" | "confirmed" | "rejected" | "expired" | "applied" | "failed" | "undone";
  risk_level: "green" | "yellow" | "red";
  expires_at: string | null;
  created_at: string;
}

interface EmailViewerProps {
  threadId: string;
  onBack: () => void;
  onClose: () => void;
  onReply?: (
    source: {
      id: string;
      thread_id: string | null;
      from_email: string | null;
      from_name: string | null;
      to_email: string | null;
      cc_emails?: string[] | null;
      subject: string | null;
      received_at: string;
      raw_text: string | null;
      raw_html: string | null;
    },
    mode: "reply" | "replyAll" | "forward",
  ) => void;
  /**
   * MP-EMAIL-AI-02: callback chiamato quando l'utente sceglie una VARIANTE di bozza
   * (dopo selezione Secca/Diplomatica). Apre la compose con oggetto/corpo pre-popolati.
   */
  onAiDraftReady?: (
    source: {
      id: string;
      thread_id: string | null;
      from_email: string | null;
      from_name: string | null;
      to_email: string | null;
      cc_emails?: string[] | null;
      subject: string | null;
      received_at: string;
      raw_text: string | null;
      raw_html: string | null;
    },
    draft: { oggetto: string; corpo: string },
  ) => void;
}

function isHighPriority(priority: string | null | undefined): boolean {
  return priority === "alta" || priority === "high";
}

function emailCategoryLabel(category: string | null | undefined): string | null {
  switch (category) {
    case "lead":
    case "lead_new":
    case "lead_followup":
      return "Lead";
    case "quote_request":
    case "quote":
    case "preventivo":
    case "richiesta_preventivo":
      return "Preventivo";
    case "cliente_esistente":
    case "customer":
      return "Cliente";
    case "fornitore":
    case "supplier":
    case "ddt":
      return "Fornitore";
    case "fattura":
    case "invoice":
      return "Fattura";
    case "pratica_amministrativa":
    case "admin":
    case "documento_amministrativo":
      return "Pratica";
    case "support":
    case "assistenza":
    case "ticket":
      return "Supporto";
    case "spam":
      return "Spam";
    case "altro":
    case "other":
      return "Altro";
    case "pending":
    case null:
    case undefined:
      return null;
    default:
      return category.replaceAll("_", " ");
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function recordValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function operationsFromValue(value: unknown): EmailOperationsInsight | undefined {
  const record = recordValue(value);
  const domain = String(record.domain ?? "none").trim();
  if (!domain || domain === "none") return undefined;
  return record as EmailOperationsInsight;
}

/**
 * Pulisce un ai_summary inquinato (es. include backticks ```json o è puro
 * codice JSON serializzato come stringa). 2026-05-26: backward-compat per
 * record DB salvati prima del fix parser lato edge function.
 */
function sanitizeAiSummary(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  // Caso 1: fenced markdown JSON
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  const candidate = fenced ? fenced[1] : value;
  // Caso 2: il contenuto è già JSON (parsabile)? estrai .summary
  if (candidate.startsWith("{")) {
    try {
      const obj = JSON.parse(candidate) as { summary?: string };
      if (typeof obj.summary === "string" && obj.summary.trim()) {
        return obj.summary.trim().slice(0, 500);
      }
    } catch { /* not valid JSON, fall through to heuristic */ }
    // Estrai prima sequenza { } bilanciata
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first !== -1 && last > first) {
      try {
        const obj = JSON.parse(candidate.slice(first, last + 1)) as { summary?: string };
        if (typeof obj.summary === "string" && obj.summary.trim()) {
          return obj.summary.trim().slice(0, 500);
        }
      } catch { /* give up */ }
    }
    // Se proprio non parsa, nascondi il rumore JSON
    return "Riepilogo da rigenerare — clicca \"Analizza email\" per aggiornarlo.";
  }
  return value.slice(0, 500);
}

function analysisFromMessages(messages: MessageRow[] | undefined): EmailAnalysisResult | null {
  if (!messages?.length) return null;
  const source = [...messages]
    .reverse()
    .find((message) => message.ai_summary || message.ai_suggested_action || message.ai_extracted);
  if (!source) return null;
  const extracted = source.ai_extracted && typeof source.ai_extracted === "object"
    ? source.ai_extracted
    : {};
  const cleanSummary = sanitizeAiSummary(source.ai_summary);
  return {
    category: source.ai_category ?? "altro",
    priority: source.ai_priority ?? "nessuna",
    summary: cleanSummary || "Analisi disponibile.",
    action_items: stringArray(extracted.action_items),
    extracted,
    suggested_action: source.ai_suggested_action ?? "rispondi",
    intent: stringValue(extracted.intent),
    sentiment: stringValue(extracted.sentiment),
    risk_flags: stringArray(extracted.risk_flags),
    reply_strategy: stringValue(extracted.reply_strategy),
    operations: operationsFromValue(extracted.operations),
  };
}

/**
 * Azioni contestuali allineate al mockup "Demo casella email operativa".
 * Restituisce 3 azioni pertinenti alla categoria (con icona, label e kind).
 *   - "reply"     → apre direttamente la compose in modalità reply
 *   - "operative" → genera proposte operative (Silvio)
 *   - "placeholder" → toast "Funzione in arrivo" (per UI feedback immediato)
 */
type ContextualEmailAction = {
  id: string;
  label: string;
  icon: typeof Truck;
  kind: "reply" | "operative" | "placeholder" | "navigate";
  /** Per kind="navigate": rotta da aprire. */
  to?: string;
};

function getContextualEmailActions(category: string | null | undefined): ContextualEmailAction[] {
  const value = (category ?? "").toLowerCase();
  if (["lead", "lead_new", "lead_followup"].includes(value)) {
    return [
      { id: "lead-create", label: "Crea opportunità CRM", icon: Sparkles, kind: "navigate", to: "/azienda/marketing/opportunita" },
      { id: "lead-task", label: "Pianifica sopralluogo", icon: CalendarClock, kind: "operative" },
      { id: "lead-reply", label: "Scrivi risposta", icon: Reply, kind: "reply" },
    ];
  }
  if (["quote_request", "preventivo", "quote", "richiesta_preventivo"].includes(value)) {
    return [
      { id: "quote-build", label: "Apri preventivi", icon: ClipboardCheck, kind: "navigate", to: "/azienda/marketing/preventivi" },
      { id: "quote-task", label: "Crea task commerciale", icon: ListChecks, kind: "operative" },
      { id: "quote-reply", label: "Scrivi risposta", icon: Reply, kind: "reply" },
    ];
  }
  if (["fornitore", "supplier", "ddt"].includes(value)) {
    return [
      { id: "supplier-oda", label: "Aggiorna ODA", icon: PackageCheck, kind: "operative" },
      { id: "supplier-task", label: "Crea task logistica", icon: Truck, kind: "operative" },
      { id: "supplier-reply", label: "Scrivi risposta", icon: Reply, kind: "reply" },
    ];
  }
  if (["fattura", "invoice"].includes(value)) {
    return [
      { id: "invoice-pay", label: "Pianifica pagamento", icon: CalendarClock, kind: "navigate", to: "/azienda/scadenzario" },
      { id: "invoice-task", label: "Crea task contabilità", icon: ListChecks, kind: "operative" },
      { id: "invoice-reply", label: "Scrivi risposta", icon: Reply, kind: "reply" },
    ];
  }
  if (["pratica_amministrativa", "admin", "documento_amministrativo"].includes(value)) {
    return [
      { id: "admin-doc", label: "Salva nel cassetto", icon: ClipboardCheck, kind: "navigate", to: "/azienda/documenti" },
      { id: "admin-task", label: "Crea task amministrativa", icon: ListChecks, kind: "operative" },
      { id: "admin-reply", label: "Scrivi risposta", icon: Reply, kind: "reply" },
    ];
  }
  if (["support", "assistenza", "ticket"].includes(value)) {
    return [
      { id: "support-ticket", label: "Apri ticket", icon: AlertTriangle, kind: "navigate", to: "/azienda/assistenza/nuovo" },
      { id: "support-task", label: "Crea task supporto", icon: ListChecks, kind: "operative" },
      { id: "support-reply", label: "Scrivi risposta", icon: Reply, kind: "reply" },
    ];
  }
  if (["cliente_esistente", "customer"].includes(value)) {
    return [
      { id: "customer-history", label: "Apri scheda cliente", icon: ClipboardCheck, kind: "navigate", to: "/azienda/clienti" },
      { id: "customer-task", label: "Crea task cliente", icon: ListChecks, kind: "operative" },
      { id: "customer-reply", label: "Scrivi risposta", icon: Reply, kind: "reply" },
    ];
  }
  // default operativo (mockup-style)
  return [
    { id: "default-oda", label: "Aggiorna ODA", icon: PackageCheck, kind: "operative" },
    { id: "default-task", label: "Crea task logistica", icon: Truck, kind: "operative" },
    { id: "default-reply", label: "Scrivi risposta", icon: Reply, kind: "reply" },
  ];
}

function predictiveFromMessages(messages: MessageRow[] | undefined): PredictiveEmailResult | null {
  if (!messages?.length) return null;
  const source = messages[messages.length - 1];
  return predictEmailReconciliation({
    subject: source.subject,
    fromEmail: source.from_email,
    fromName: source.from_name,
    preview: source.raw_text?.slice(0, 420),
    body: source.raw_text,
    attachments: source.attachments,
  });
}

export function EmailViewer({ threadId, onBack, onClose, onReply, onAiDraftReady }: EmailViewerProps) {
  const qc = useQueryClient();
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  const [aiSummary, setAiSummary] = useState<{ summary: string; action_items: string[] } | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<EmailAnalysisResult | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Array<{ tone: string; label: string; body: string }> | null>(null);

  const { data: messages, isLoading, isError, error: messagesError, refetch: refetchMessages } = useQuery({
    queryKey: ["email-thread-messages", threadId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("email_inbox")
        .select("id, thread_id, message_id, oauth_connection_id, from_email, from_name, to_email, cc_emails, subject, received_at, raw_html, raw_text, attachments, headers, ai_category, ai_priority, ai_summary, ai_extracted, ai_suggested_action, ai_processed_at, is_read, is_starred, is_pec, pec_tipo, pec_stato")
        .eq("thread_id", threadId)
        .order("received_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  // 2026-05-26: collaborazione email — chi nella company ha aperto/risposto.
  // Estrae i provider message_id del thread (univoci cross-utente) e li
  // passa al tracker. La RPC è idempotente (skip se viewed negli ultimi 5min).
  const navigate = useNavigate();

  const messageProviderIds = useMemo(
    () => (messages ?? []).map((m) => m.message_id).filter((id): id is string => !!id),
    [messages],
  );
  const lastMessage = messages?.[messages.length - 1];
  useTrackThreadView({
    threadId,
    messageIds: messageProviderIds,
    companyId,
    oauthConnectionId: lastMessage?.oauth_connection_id ?? null,
    emailAddress: lastMessage?.to_email ?? null,
  });
  const { data: threadActivity } = useThreadActivity(threadId, companyId);
  const collabSummary = useMemo(
    () => summarizeThreadActivity(threadActivity ?? [], user?.id ?? null),
    [threadActivity, user?.id],
  );

  const {
    data: emailActionProposals = [],
    isLoading: isLoadingEmailActionProposals,
  } = useQuery({
    queryKey: ["email-action-proposals", threadId],
    enabled: Boolean(threadId),
    staleTime: 5_000,
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as EmailActionProposalLite[];
      return rows.some((row) => row.status === "pending") ? 30_000 : false;
    },
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("ai_action_proposals")
        .select("id, action_type, summary, status, risk_level, expires_at, created_at")
        .filter("payload->>source_thread_id", "eq", threadId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as EmailActionProposalLite[];
    },
  });

  const toggleFlag = useMutation({
    mutationFn: async ({ id, flag, value }: { id: string; flag: string; value: boolean }) => {
      const { error } = await supabase.rpc("email_inbox_toggle_flag", {
        p_email_id: id,
        p_flag: flag,
        p_value: value,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-thread-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      qc.invalidateQueries({ queryKey: ["email-folder-counts"] });
    },
    onError: (e) => toast.error("Operazione fallita", { description: String(e) }),
  });

  const archiveAll = useMutation({
    // 2026-05-26 (audit fix P1-10): chiamate parallele invece di seriali.
    // Thread con 20 messaggi prima impiegava 20 × ~150ms = 3s. Ora ~150ms tot.
    mutationFn: async () => {
      if (!messages) return;
      await Promise.allSettled(
        messages.map((m) => supabase.rpc("email_inbox_toggle_flag", {
          p_email_id: m.id, p_flag: "archived", p_value: true,
        })),
      );
    },
    onSuccess: () => {
      toast.success("Conversazione archiviata");
      qc.invalidateQueries({ queryKey: ["email-thread-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      qc.invalidateQueries({ queryKey: ["email-folder-counts"] });
      onClose();
    },
    onError: (e) => toast.error("Archiviazione fallita", { description: String(e) }),
  });

  const summarizeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("email-ai-assistant", {
        body: { action: "summary", thread_id: threadId },
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      if (!r?.ok) throw new Error(r?.error ?? "AI summary fallita");
      return r as { summary: string; action_items: string[] };
    },
    onSuccess: (r) => {
      setAiSummary({ summary: r.summary, action_items: r.action_items });
    },
    onError: (e) => toast.error("AI riassunto fallito", { description: String(e) }),
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("email-ai-assistant", {
        body: { action: "analysis", thread_id: threadId },
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      if (!r?.ok) throw new Error(r?.error ?? "AI analysis fallita");
      return r.analysis as EmailAnalysisResult;
    },
    onSuccess: (analysis) => {
      setAiAnalysis(analysis);
      toast.success("Analisi AI aggiornata");
      qc.invalidateQueries({ queryKey: ["email-thread-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
    },
    onError: (e) => toast.error("Analisi AI fallita", { description: String(e) }),
  });

  const suggestRepliesMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("email-ai-assistant", {
        body: { action: "reply_suggestions", thread_id: threadId },
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      if (!r?.ok) throw new Error(r?.error ?? "AI suggestions fallita");
      return r.suggestions as Array<{ tone: string; label: string; body: string }>;
    },
    onSuccess: (suggestions) => {
      setAiSuggestions(suggestions);
    },
    onError: (e) => toast.error("AI risposte fallite", { description: String(e) }),
  });

  const operationProposalsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("email-ai-assistant", {
        body: { action: "operation_proposals", thread_id: threadId },
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      if (!r?.ok) throw new Error(r?.error ?? "Proposte operative fallite");
      return r as {
        analysis: EmailAnalysisResult;
        proposals: Array<{ id: string; action_type: string; summary: string }>;
      };
    },
    onSuccess: (result) => {
      setAiAnalysis(result.analysis);
      qc.invalidateQueries({ queryKey: ["email-thread-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      qc.invalidateQueries({ queryKey: ["email-action-proposals", threadId] });
      if (result.proposals.length > 0) {
        toast.success("Proposte operative create", {
          description: `${result.proposals.length} azioni pronte da confermare nel pannello AI.`,
        });
      } else {
        toast.info("Analisi operativa completata", {
          description: "Non ho trovato azioni applicabili in sicurezza senza più dati.",
        });
      }
    },
    onError: (e) => toast.error("Proposte operative fallite", { description: String(e) }),
  });

  const trashAll = useMutation({
    // 2026-05-26 (audit fix P1-10): chiamate parallele come archiveAll.
    mutationFn: async () => {
      if (!messages) return;
      await Promise.allSettled(
        messages.map((m) => supabase.rpc("email_inbox_toggle_flag", {
          p_email_id: m.id, p_flag: "trashed", p_value: true,
        })),
      );
    },
    onSuccess: () => {
      toast.success("Spostato nel cestino");
      qc.invalidateQueries({ queryKey: ["email-thread-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
      qc.invalidateQueries({ queryKey: ["email-folder-counts"] });
      onClose();
    },
    onError: (e) => toast.error("Spostamento nel cestino fallito", { description: String(e) }),
  });

  const subject = messages?.[0]?.subject ?? "(senza oggetto)";
  const messageCount = messages?.length ?? 0;
  const hasStarred = messages?.some((m) => m.is_starred) ?? false;
  const storedAnalysis = useMemo(() => analysisFromMessages(messages), [messages]);
  const activeAnalysis = aiAnalysis ?? storedAnalysis;
  const predictiveAnalysis = useMemo(() => predictiveFromMessages(messages), [messages]);
  const showPredictiveAnalysis = Boolean(
    predictiveAnalysis
    && (predictiveAnalysis.category !== "other"
      || predictiveAnalysis.priority !== "bassa"
      || predictiveAnalysis.targets.length > 0),
  );

  // Categoria visibile in header — preferisci AI stored, poi predictive (mockup style)
  const lastAvailableMessage = messages?.[messages.length - 1];
  const headerCategoryRaw = activeAnalysis?.category
    ?? lastAvailableMessage?.ai_category
    ?? predictiveAnalysis?.category
    ?? null;
  const headerCategoryLabel = emailCategoryLabel(headerCategoryRaw);
  const headerPriorityHigh = isHighPriority(activeAnalysis?.priority ?? lastAvailableMessage?.ai_priority)
    || predictiveAnalysis?.priority === "alta";

  return (
    <>
      {/* Header viewer — allineato al mockup "Demo casella email operativa":
          back button (mobile), badge categoria prominente, azioni desktop, X chiudi */}
      <div className="border-b border-slate-200 p-2 sm:p-3 flex items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0"
          onClick={onBack}
          aria-label="Torna alla lista"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {headerCategoryLabel && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
              headerPriorityHigh
                ? "bg-orange-50 text-orange-700"
                : "bg-blue-50 text-blue-700",
            )}
          >
            {headerCategoryLabel}
          </span>
        )}
        <h2 className="font-semibold truncate flex-1 text-sm sm:text-base">{subject}</h2>
        {messageCount > 0 && (
          <Badge variant="secondary" className="hidden sm:inline-flex text-[10px] shrink-0">
            {messageCount} {messageCount === 1 ? "messaggio" : "messaggi"}
          </Badge>
        )}
        {/* Icon actions: desktop only — su mobile la bottom action bar ne replica il subset essenziale */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:flex"
          onClick={() => {
            if (!messages || messages.length === 0) return;
            const firstId = messages[0].id;
            toggleFlag.mutate({ id: firstId, flag: "starred", value: !hasStarred });
          }}
          title={hasStarred ? "Rimuovi stella" : "Aggiungi stella"}
        >
          <Star className={cn("h-4 w-4", hasStarred && "fill-amber-400 text-amber-400")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:flex"
          onClick={() => archiveAll.mutate()}
          disabled={archiveAll.isPending}
          title="Archivia"
        >
          <Archive className="h-4 w-4" />
        </Button>
        {/* «Riassumi» e «Analizza» erano due icone viola qui e un bottone in
            fondo: stanno nel menu «Silvio» accanto a Rispondi. */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:flex hover:text-rose-600"
          onClick={() => trashAll.mutate()}
          disabled={trashAll.isPending}
          title="Sposta nel cestino"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="hidden md:flex"
          title="Chiudi"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {aiSummary && (
          <div className="m-4 mb-0 p-3 rounded-lg border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-violet-600" />
                <span className="text-xs font-bold uppercase tracking-wide text-violet-800">
                  Riassunto AI
                </span>
              </div>
              <button
                type="button"
                className="text-violet-600 hover:text-violet-800"
                onClick={() => setAiSummary(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-violet-900">{aiSummary.summary}</p>
            {aiSummary.action_items.length > 0 && (
              <div className="pt-2 border-t border-violet-200">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 mb-1 flex items-center gap-1">
                  <ListChecks className="h-3 w-3" />
                  Cose da fare
                </p>
                <ul className="space-y-0.5 ml-1">
                  {aiSummary.action_items.map((a, i) => (
                    <li key={i} className="text-xs text-violet-900 flex items-start gap-1.5">
                      <span className="text-violet-500 mt-0.5">→</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeAnalysis && (
          <EmailAnalysisPanel
            analysis={activeAnalysis}
            onCreateOperationalProposals={() => operationProposalsMutation.mutate()}
            creatingOperationalProposals={operationProposalsMutation.isPending}
          />
        )}

        {!activeAnalysis && showPredictiveAnalysis && predictiveAnalysis && (
          <EmailPredictivePanel prediction={predictiveAnalysis} />
        )}

        {(isLoadingEmailActionProposals || emailActionProposals.length > 0) && (
          <EmailActionProposalsPanel
            proposals={emailActionProposals}
            isLoading={isLoadingEmailActionProposals}
            onCreateOperationalProposals={() => operationProposalsMutation.mutate()}
            creatingOperationalProposals={operationProposalsMutation.isPending}
          />
        )}

        {/* Collaborazione email: chi nella company ha aperto/risposto */}
        {collabSummary.length > 0 && <ThreadCollabBanner items={collabSummary} />}

        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-24" />
          </div>
        ) : isError ? (
          /* 2026-05-26 (audit fix P1): branch errore esplicito con retry.
             Prima un fail della query cadeva nel ramo "Nessun messaggio…",
             nascondendo errori RLS/rete come se la conversazione fosse vuota. */
          <div className="p-6 m-3 rounded-lg border border-rose-200 bg-rose-50 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-600 mb-2" />
            <p className="text-sm font-semibold text-rose-900">Errore caricamento conversazione</p>
            <p className="mt-1 text-xs text-rose-700">
              {messagesError instanceof Error ? messagesError.message : "Riprova tra poco."}
            </p>
            <Button onClick={() => void refetchMessages()} variant="outline" size="sm" className="mt-3 bg-white">
              Riprova
            </Button>
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Nessun messaggio in questa conversazione.</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button onClick={onClose} variant="outline" size="sm">Torna alla lista</Button>
              <Button onClick={() => void refetchMessages()} variant="ghost" size="sm">Aggiorna</Button>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {/* Più RECENTE in alto (richiesta utente): si inverte SOLO la
                visualizzazione — `messages` resta cronologico perché la
                logica interna (lastMessage, reply, analisi AI) assume
                l'ultimo elemento = più recente. */}
            {[...messages].reverse().map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Risposte AI suggerite, quando disponibili */}
      {aiSuggestions && aiSuggestions.length > 0 && (
        <div className="border-t p-3 bg-violet-50/40 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Suggerite da AI · clicca per usarne una
            </p>
            <button
              type="button"
              className="text-violet-600 hover:text-violet-800"
              onClick={() => setAiSuggestions(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            {aiSuggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (!onReply || !messages || messages.length === 0) return;
                  const last = messages[messages.length - 1];
                  // Pre-popola la reply con il testo della suggestion
                  onReply(
                    {
                      id: last.id,
                      thread_id: last.thread_id,
                      from_email: last.from_email,
                      from_name: last.from_name,
                      to_email: last.to_email,
                      cc_emails: last.cc_emails ?? null,
                      subject: last.subject,
                      received_at: last.received_at,
                      raw_text: `${s.body}\n\n${last.raw_text ?? ""}`,
                      raw_html: null,
                    },
                    "reply",
                  );
                }}
                className="w-full text-left p-2.5 rounded-md border border-violet-200 bg-white hover:border-violet-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] capitalize border-violet-300 text-violet-700 bg-violet-50">
                    {s.tone}
                  </Badge>
                  <span className="text-xs font-medium text-foreground">{s.label}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{s.body}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Da tablet una barra sola. Prima erano dieci bottoni su due righe, e la
          riga «Aggiorna ODA · Crea task · Scrivi risposta» rifaceva «Operativo»
          (due volte) e «Rispondi». Ora: Rispondi in evidenza, Rispondi con AI,
          «A tutti» e «Inoltra» come icone, le azioni di Silvio nel menu. Su
          mobile resta la barra in basso qui sotto. */}
      {(() => {
        const ultima = messages && messages.length > 0 ? messages[messages.length - 1] : null;
        const rispondi = (mode: "reply" | "replyAll" | "forward") => {
          if (!onReply || !ultima) return;
          onReply(
            {
              id: ultima.id,
              thread_id: ultima.thread_id,
              from_email: ultima.from_email,
              from_name: ultima.from_name,
              to_email: ultima.to_email,
              cc_emails: ultima.cc_emails ?? null,
              subject: ultima.subject,
              received_at: ultima.received_at,
              raw_text: ultima.raw_text,
              raw_html: ultima.raw_html,
            },
            mode,
          );
        };
        // Cosa propone «Operativo» per questa categoria (es. «Aggiorna ODA · Crea
        // task logistica»): era la riga di bottoni, ora è la riga sotto la voce.
        const esempiOperativi = headerCategoryRaw
          ? getContextualEmailActions(headerCategoryRaw).filter((a) => a.kind === "operative").map((a) => a.label).join(" · ")
          : "";
        const silvioAlLavoro = summarizeMutation.isPending || analyzeMutation.isPending || operationProposalsMutation.isPending || suggestRepliesMutation.isPending;
        return (
          // pr-20: in basso a destra c'è il tondo di Silvio, che copriva l'ultimo bottone.
          <div className="hidden md:flex items-center gap-2 border-t p-3 pr-20 bg-muted/20">
            <Button size="sm" className="gap-1.5" disabled={!ultima} onClick={() => rispondi("reply")}>
              <Reply className="h-3.5 w-3.5" />
              Rispondi
            </Button>
            {/* MP-EMAIL-AI-01: pulsante "Rispondi con AI" (L4 Sonnet) */}
            {onAiDraftReady && ultima && (
              <AiDraftButton
                email_id={ultima.id}
                // Sotto i 1280px la lettura è larga 460px: la scritta sparisce
                // (resta l'icona di Silvio e il nome per i lettori di schermo).
                className="[&>span]:hidden xl:[&>span]:inline"
                onDraftChosen={(oggetto, corpo) => {
                  onAiDraftReady(
                    {
                      id: ultima.id,
                      thread_id: ultima.thread_id,
                      from_email: ultima.from_email,
                      from_name: ultima.from_name,
                      to_email: ultima.to_email,
                      cc_emails: ultima.cc_emails ?? null,
                      subject: ultima.subject,
                      received_at: ultima.received_at,
                      raw_text: ultima.raw_text,
                      raw_html: ultima.raw_html,
                    },
                    { oggetto, corpo },
                  );
                }}
              />
            )}
            <Button variant="outline" size="icon" className="h-9 w-9" disabled={!ultima} onClick={() => rispondi("replyAll")} aria-label="Rispondi a tutti" title="Rispondi a tutti">
              <ReplyAll className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" disabled={!ultima} onClick={() => rispondi("forward")} aria-label="Inoltra" title="Inoltra">
              <Forward className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* Non in fondo a destra: lì sopra c'è il tondo di Silvio che lo copriva. */}
                <Button variant="outline" size="sm" className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50" disabled={!ultima}>
                  {silvioAlLavoro ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  <span className="hidden xl:inline">Silvio</span>
                  <span className="sr-only xl:hidden">Silvio</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem disabled={summarizeMutation.isPending} onSelect={() => summarizeMutation.mutate()}>
                  <ListChecks className="mr-2 h-4 w-4 text-violet-600" />Riassumi il thread
                </DropdownMenuItem>
                <DropdownMenuItem disabled={analyzeMutation.isPending} onSelect={() => analyzeMutation.mutate()}>
                  <Wand2 className="mr-2 h-4 w-4 text-violet-600" />Analizza email
                </DropdownMenuItem>
                <DropdownMenuItem disabled={operationProposalsMutation.isPending} onSelect={() => operationProposalsMutation.mutate()} className="items-start">
                  <Truck className="mr-2 mt-0.5 h-4 w-4 text-blue-600" />
                  <span className="min-w-0">
                    <span className="block">Proposte operative</span>
                    {esempiOperativi && <span className="block truncate text-xs text-muted-foreground">{esempiOperativi}</span>}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={suggestRepliesMutation.isPending} onSelect={() => suggestRepliesMutation.mutate()}>
                  <Sparkles className="mr-2 h-4 w-4 text-violet-600" />Suggerisci risposte
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })()}

      {/* MOBILE-only bottom action bar — stile Spark, 5 azioni primarie + menu "Altro", rispetta safe area iOS */}
      <div
        className="md:hidden border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 px-1 pt-2 flex items-center justify-around gap-0.5 shrink-0"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={() => {
            if (!onReply || !messages || messages.length === 0) return;
            const last = messages[messages.length - 1];
            onReply(
              {
                id: last.id,
                thread_id: last.thread_id,
                from_email: last.from_email,
                from_name: last.from_name,
                to_email: last.to_email,
                cc_emails: last.cc_emails ?? null,
                subject: last.subject,
                received_at: last.received_at,
                raw_text: last.raw_text,
                raw_html: last.raw_html,
              },
              "reply",
            );
          }}
          disabled={!messages || messages.length === 0}
          aria-label="Rispondi"
        >
          <Reply className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={() => {
            if (!onReply || !messages || messages.length === 0) return;
            const last = messages[messages.length - 1];
            onReply(
              {
                id: last.id,
                thread_id: last.thread_id,
                from_email: last.from_email,
                from_name: last.from_name,
                to_email: last.to_email,
                cc_emails: last.cc_emails ?? null,
                subject: last.subject,
                received_at: last.received_at,
                raw_text: last.raw_text,
                raw_html: last.raw_html,
              },
              "forward",
            );
          }}
          disabled={!messages || messages.length === 0}
          aria-label="Inoltra"
        >
          <Forward className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={() => {
            if (!messages || messages.length === 0) return;
            const firstId = messages[0].id;
            toggleFlag.mutate({ id: firstId, flag: "starred", value: !hasStarred });
          }}
          aria-label={hasStarred ? "Rimuovi stella" : "Aggiungi stella"}
        >
          <Star className={cn("h-5 w-5", hasStarred && "fill-amber-400 text-amber-400")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={() => archiveAll.mutate()}
          disabled={archiveAll.isPending}
          aria-label="Archivia"
        >
          {archiveAll.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Archive className="h-5 w-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          onClick={() => trashAll.mutate()}
          disabled={trashAll.isPending}
          aria-label="Sposta nel cestino"
        >
          {trashAll.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full"
              aria-label="Altre azioni"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuItem
              onClick={() => summarizeMutation.mutate()}
              disabled={summarizeMutation.isPending}
            >
              {summarizeMutation.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Wand2 className="h-4 w-4 mr-2 text-violet-600" />}
              Riassumi thread con AI
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending || !messages || messages.length === 0}
            >
              {analyzeMutation.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Sparkles className="h-4 w-4 mr-2 text-violet-600" />}
              Analizza email
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => operationProposalsMutation.mutate()}
              disabled={operationProposalsMutation.isPending || !messages || messages.length === 0}
            >
              {operationProposalsMutation.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Truck className="h-4 w-4 mr-2 text-blue-600" />}
              Operativo
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => suggestRepliesMutation.mutate()}
              disabled={suggestRepliesMutation.isPending || !messages || messages.length === 0}
            >
              {suggestRepliesMutation.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Sparkles className="h-4 w-4 mr-2 text-violet-600" />}
              Suggerisci risposte
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (!onReply || !messages || messages.length === 0) return;
                const last = messages[messages.length - 1];
                onReply(
                  {
                    id: last.id,
                    thread_id: last.thread_id,
                    from_email: last.from_email,
                    from_name: last.from_name,
                    to_email: last.to_email,
                    cc_emails: last.cc_emails ?? null,
                    subject: last.subject,
                    received_at: last.received_at,
                    raw_text: last.raw_text,
                    raw_html: last.raw_html,
                  },
                  "replyAll",
                );
              }}
              disabled={!messages || messages.length === 0}
            >
              <ReplyAll className="h-4 w-4 mr-2" />
              Rispondi a tutti
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function EmailActionProposalsPanel({
  proposals,
  isLoading,
  onCreateOperationalProposals,
  creatingOperationalProposals,
}: {
  proposals: EmailActionProposalLite[];
  isLoading: boolean;
  onCreateOperationalProposals: () => void;
  creatingOperationalProposals: boolean;
}) {
  const pendingCount = proposals.filter((proposal) => proposal.status === "pending").length;
  const appliedCount = proposals.filter((proposal) => proposal.status === "applied").length;

  return (
    <div className="m-4 mb-0 rounded-lg border border-blue-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-blue-50/70 px-3 py-2">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 rounded-md bg-blue-600 p-1.5 text-white">
            <Truck className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-900">
              Azioni operative da questa email
            </p>
            <p className="text-xs text-blue-900/75">
              Ritardi ODA, DDT, acquisti e risposte fornitore restano in conferma prima di modificare dati.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {pendingCount > 0 && (
            <Badge className="bg-blue-600 text-[10px] hover:bg-blue-600">
              {pendingCount} da confermare
            </Badge>
          )}
          {appliedCount > 0 && (
            <Badge variant="outline" className="bg-white text-[10px] text-emerald-700">
              {appliedCount} applicate
            </Badge>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-blue-200 bg-white text-xs text-blue-700 hover:bg-blue-50"
            onClick={onCreateOperationalProposals}
            disabled={creatingOperationalProposals}
          >
            {creatingOperationalProposals ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Aggiorna proposte
          </Button>
        </div>
      </div>

      <div className="p-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : proposals.length === 0 ? (
          <div className="rounded-md border border-dashed bg-blue-50/30 p-4 text-sm text-muted-foreground">
            Nessuna proposta ancora creata per questa conversazione. Usa “Operativo” per far leggere la mail a Silvio e preparare azioni sicure da confermare.
          </div>
        ) : (
          <div className="space-y-2">
            {proposals.map((proposal) => (
              <ActionProposalCard key={proposal.id} proposalId={proposal.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function EmailPredictivePanel({ prediction }: { prediction: PredictiveEmailResult }) {
  // 2026-05-28: pannello collassabile come nel mockup demo. Apre/chiude i dettagli
  // (segnali + agganci) per non rubare spazio al messaggio quando l'utente vuole
  // solo leggere l'email. Default chiuso, pochissimo rumore visivo.
  const [open, setOpen] = useState(false);
  const category = emailCategoryLabel(prediction.category) ?? "Altro";
  const priorityLabel = prediction.priority === "alta"
    ? "Alta"
    : prediction.priority === "media"
      ? "Media"
      : "Bassa";
  const confidence = Math.round(prediction.confidence * 100);

  return (
    <div className="m-4 mb-0 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/80 shadow-sm">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <div className="flex items-start gap-2">
          <div className="mt-0.5 rounded-lg bg-blue-600 p-1.5 text-white shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-blue-950">
              Analisi predittiva
            </p>
            <p className="mt-0.5 truncate text-xs leading-5 text-blue-900/80">
              {prediction.priority === "alta"
                ? "Priorità alta rilevata — richiede attenzione immediata."
                : prediction.targets.length > 0
                  ? `${prediction.targets.length} aggancio${prediction.targets.length === 1 ? "" : "i"} suggerito${prediction.targets.length === 1 ? "" : "i"} (${category})`
                  : `Categoria predittiva: ${category}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              prediction.priority === "alta"
                ? "bg-orange-100 text-orange-700"
                : "bg-blue-100 text-blue-800",
            )}
          >
            {priorityLabel}
          </span>
          <span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700">
            {confidence}%
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-blue-700" />
          ) : (
            <ChevronDown className="h-4 w-4 text-blue-700" />
          )}
        </div>
      </button>

      {open && (
      <div className="grid gap-3 border-t border-blue-100 bg-white p-4 text-sm lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <ListChecks className="h-3 w-3" />
            Segnali rilevati
          </p>
          <ul className="mt-2 space-y-1">
            {(prediction.reasons.length > 0 ? prediction.reasons : ["pattern contenuto coerente"]).map((reason, index) => (
              <li key={`${reason}-${index}`} className="flex gap-2 text-xs leading-5 text-slate-800">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
            <PackageCheck className="h-3 w-3" />
            Agganci consigliati
          </p>
          {prediction.targets.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {prediction.targets.map((target) => (
                <Badge
                  key={`${target.type}-${target.label}`}
                  variant="outline"
                  className="border-emerald-200 bg-white text-[10px] font-semibold text-emerald-800"
                  title={`Confidenza ${Math.round(target.confidence * 100)}%`}
                >
                  {target.label}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs leading-5 text-emerald-950">
              Nessun aggancio automatico sicuro: resta nella categoria, senza modificare dati.
            </p>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function EmailAnalysisPanel({
  analysis,
  onCreateOperationalProposals,
  creatingOperationalProposals,
}: {
  analysis: EmailAnalysisResult;
  onCreateOperationalProposals: () => void;
  creatingOperationalProposals: boolean;
}) {
  const category = emailCategoryLabel(analysis.category) ?? "Altro";
  const priorityLabel = analysis.priority === "alta"
    ? "Alta"
    : analysis.priority === "media"
      ? "Media"
      : analysis.priority === "bassa"
        ? "Bassa"
        : "Nessuna";
  const extractedEntries = Object.entries(analysis.extracted)
    .filter(([key, value]) => {
      if (["action_items", "risk_flags", "reply_strategy", "intent", "sentiment", "operations"].includes(key)) return false;
      if (value === null || value === undefined || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
    .slice(0, 8);
  const hasOperations = analysis.operations?.domain && analysis.operations.domain !== "none";
  // Mobile: chiusa su una riga (categoria e priorità), si apre col tocco. Aperta
  // occupava mezzo schermo prima del messaggio.
  const isMobile = useIsMobile();
  const [aperta, setAperta] = useState(false);
  const mostraCorpo = !isMobile || aperta;

  return (
    <div className="m-4 mb-0 rounded-lg border border-violet-200 bg-white shadow-sm overflow-hidden max-sm:m-3 max-sm:mb-0">
      <div
        className={cn("flex flex-wrap items-start justify-between gap-2 border-b bg-violet-50/60 px-3 py-2", isMobile && "cursor-pointer flex-nowrap items-center", isMobile && !aperta && "border-b-0")}
        role={isMobile ? "button" : undefined}
        aria-expanded={isMobile ? aperta : undefined}
        onClick={isMobile ? () => setAperta((v) => !v) : undefined}
      >
        <div className="flex min-w-0 items-start gap-2 max-sm:items-center">
          <div className="mt-0.5 rounded-md bg-violet-600 p-1.5 text-white max-sm:mt-0">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-900 max-sm:whitespace-nowrap">
              Analisi AI<span className="max-sm:hidden"> email</span>
            </p>
            <p className="text-xs text-violet-800/80 max-sm:hidden">
              {analysis.intent || "Intento rilevato dalla conversazione"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 max-sm:flex-nowrap">
          <Badge variant="outline" className="bg-white text-[10px]">
            {category}
          </Badge>
          <Badge
            className={cn(
              "text-[10px] whitespace-nowrap",
              // Mobile: la priorità si mostra solo se c'è.
              priorityLabel === "Nessuna" && "max-sm:hidden",
              analysis.priority === "alta"
                ? "bg-rose-600 hover:bg-rose-600"
                : "bg-violet-600 hover:bg-violet-600",
            )}
          >
            Priorità {priorityLabel}
          </Badge>
          {isMobile && <ChevronDown className={cn("h-4 w-4 shrink-0 text-violet-700 transition-transform", aperta && "rotate-180")} />}
        </div>
      </div>

      {mostraCorpo && (
      <div className="grid gap-3 p-3 text-sm lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Riepilogo operativo
            </p>
            <p className="mt-1 text-sm leading-relaxed">{analysis.summary}</p>
          </div>

          {analysis.action_items.length > 0 && (
            <div>
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <ListChecks className="h-3 w-3" />
                Prossime azioni
              </p>
              <ul className="mt-1 space-y-1">
                {analysis.action_items.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-2 text-xs leading-snug">
                    <span className="mt-0.5 h-4 min-w-4 rounded-full bg-violet-100 text-center text-[10px] font-semibold text-violet-700">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.reply_strategy && (
            <div className="rounded-md bg-slate-50 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Strategia risposta
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{analysis.reply_strategy}</p>
            </div>
          )}

          {hasOperations && analysis.operations && (
            <EmailOperationsPanel
              operations={analysis.operations}
              onCreateOperationalProposals={onCreateOperationalProposals}
              creatingOperationalProposals={creatingOperationalProposals}
            />
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/20 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Azione consigliata
            </p>
            <p className="mt-1 text-xs font-medium">{analysis.suggested_action.replaceAll("_", " ")}</p>
          </div>

          {analysis.risk_flags.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                <AlertTriangle className="h-3 w-3" />
                Attenzioni
              </p>
              <ul className="mt-1 space-y-1">
                {analysis.risk_flags.map((risk, index) => (
                  <li key={`${risk}-${index}`} className="text-xs leading-snug text-amber-900">
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {extractedEntries.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Dati estratti
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {extractedEntries.map(([key, value]) => (
                  <Badge key={key} variant="outline" className="max-w-full bg-white text-[10px]">
                    <span className="mr-1 text-muted-foreground">{key.replaceAll("_", " ")}:</span>
                    <span className="truncate">
                      {Array.isArray(value) ? value.join(", ") : String(value)}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function operationDomainLabel(domain: string | undefined): string {
  switch (domain) {
    case "supplier_order":
      return "Ordine fornitore";
    case "supplier_delay":
      return "Ritardo consegna";
    case "supplier_confirmation":
      return "Conferma fornitore";
    case "ddt_receipt":
      return "DDT / ricezione";
    case "invoice_payment":
      return "Fattura fornitore";
    case "customer_request":
      return "Richiesta cliente";
    default:
      return "Operazione";
  }
}

function deliveryStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "confirmed":
      return "Confermata";
    case "delayed":
      return "In ritardo";
    case "partial":
      return "Parziale";
    case "blocked":
      return "Bloccata";
    default:
      return "Da verificare";
  }
}

function EmailOperationsPanel({
  operations,
  onCreateOperationalProposals,
  creatingOperationalProposals,
}: {
  operations: EmailOperationsInsight;
  onCreateOperationalProposals: () => void;
  creatingOperationalProposals: boolean;
}) {
  const confidence = typeof operations.confidence === "number"
    ? Math.round(operations.confidence * 100)
    : null;
  const supplierLabel = operations.supplier?.name || operations.supplier?.email || "Fornitore da confermare";
  const poLabel = operations.purchase_order?.number || operations.purchase_order?.reference_text || "ODA non agganciato";
  const newDate = operations.delivery?.new_date;
  const oldDate = operations.delivery?.original_date;
  const hasDraft = Boolean(operations.draft_email?.to && operations.draft_email?.subject);
  const actions = operations.recommended_actions ?? [];
  const items = operations.items ?? [];

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 rounded-md bg-blue-600 p-1.5 text-white">
            <Truck className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-900">
              Operativo acquisti / logistica
            </p>
            <p className="text-xs text-blue-900/80">
              {operationDomainLabel(operations.domain)}
              {confidence !== null ? ` · confidenza ${confidence}%` : ""}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="bg-white text-[10px] text-blue-800">
          {deliveryStatusLabel(operations.delivery?.status)}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-white/80 p-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <PackageCheck className="h-3 w-3" />
            Fornitore
          </p>
          <p className="mt-1 truncate text-xs font-medium">{supplierLabel}</p>
        </div>
        <div className="rounded-md bg-white/80 p-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ClipboardCheck className="h-3 w-3" />
            Ordine / DDT
          </p>
          <p className="mt-1 truncate text-xs font-medium">
            {poLabel}
            {operations.ddt?.number ? ` · DDT ${operations.ddt.number}` : ""}
          </p>
        </div>
      </div>

      {(newDate || oldDate || operations.delivery?.reason) && (
        <div className="mt-2 rounded-md border border-blue-100 bg-white p-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarClock className="h-3 w-3" />
            Consegna
          </p>
          <p className="mt-1 text-xs">
            {oldDate ? `Prima: ${oldDate}` : "Data precedente non indicata"}
            {newDate ? ` · Nuova: ${newDate}` : ""}
            {operations.delivery?.delay_days ? ` · Ritardo: ${operations.delivery.delay_days} giorni` : ""}
          </p>
          {operations.delivery?.reason && (
            <p className="mt-1 text-xs text-muted-foreground">{operations.delivery.reason}</p>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-2 rounded-md border border-blue-100 bg-white p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Materiali rilevati
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {items.slice(0, 4).map((item, index) => (
              <Badge key={index} variant="outline" className="bg-white text-[10px]">
                {item.description || "Materiale"}
                {item.quantity ? ` · ${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : ""}
              </Badge>
            ))}
            {items.length > 4 && (
              <Badge variant="secondary" className="text-[10px]">
                +{items.length - 4}
              </Badge>
            )}
          </div>
        </div>
      )}

      {actions.length > 0 && (
        <div className="mt-2 space-y-1">
          {actions.slice(0, 3).map((action, index) => (
            <div key={index} className="flex items-start gap-2 rounded-md bg-white/80 p-2 text-xs">
              <span className="mt-0.5 h-4 min-w-4 rounded-full bg-blue-100 text-center text-[10px] font-semibold text-blue-700">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{action.label || action.type || "Azione operativa"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {action.requires_confirmation === false ? "Può essere automatizzata" : "Richiede conferma prima di applicare"}
                  {action.risk ? ` · rischio ${action.risk}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasDraft && (
        <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 p-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-orange-800">
            <Send className="h-3 w-3" />
            Bozza email pronta
          </p>
          <p className="mt-1 truncate text-xs font-medium">{operations.draft_email?.subject}</p>
          <p className="text-[11px] text-orange-900/80">A: {operations.draft_email?.to}</p>
        </div>
      )}

      <Button
        type="button"
        size="sm"
        className="mt-3 w-full gap-1.5 bg-blue-600 hover:bg-blue-700"
        onClick={onCreateOperationalProposals}
        disabled={creatingOperationalProposals}
      >
        {creatingOperationalProposals ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        Crea proposte da confermare
      </Button>
    </div>
  );
}

function MessageBubble({ message }: { message: MessageRow }) {
  // 2026-05-26: sanitize email-friendly. PRIMA il config era troppo aggressivo:
  //   - FORBID_TAGS["style"] → strippava <style> inline → tabelle Meta perdevano
  //     spacing, bottoni perdevano background colors
  //   - FORBID_ATTR["style"] → strippava style="..." inline → CTA "Vedi
  //     transazione" diventava testo nudo invece di bottone blu
  // ORA il config:
  //   - Mantiene <style> nel <head> di email HTML (sanitize CSS via DOMPurify)
  //   - Mantiene style="..." inline (è dove Meta/Mailchimp/etc. mettono il
  //     visual styling — è safe perché non può eseguire JS)
  //   - Continua a bloccare script, iframe, object, embed, form (XSS surface)
  //   - Continua a bloccare on* event handlers (onclick, onerror, ecc.)
  //   - Limita protocolli a http/https/mailto/tel/cid (no javascript:)
  //   - Forza target="_blank" su tutti gli <a> per non rompere la nav app
  const sanitizedHtml = useMemo(() => {
    if (!message.raw_html) return null;
    // Hook DOMPurify:
    //  • <a>  → target=_blank + rel=noopener (non rompe la nav dell'app)
    //  • <img> → promuove le immagini "lazy-load" a src reale.
    //    PROBLEMA UTENTE ("in alcune email non mostra le foto"): moltissime
    //    newsletter (Meta, Google, Apple, Mailchimp, Stripe, ecc.) mettono un
    //    placeholder 1×1 in `src=` e l'URL vero in `data-src`/`data-srcset`,
    //    contando sul lazy-loader JS della webmail. Noi quello JS lo blocchiamo
    //    per sicurezza → senza questa promozione le foto restavano vuote.
    //    SICUREZZA: promuoviamo SOLO URL http(s) o protocol-relative (`//host`),
    //    mai `javascript:`/`data:`-script → la promozione avviene DOPO la
    //    sanitizzazione, quindi il controllo URI lo rifacciamo qui a mano.
    const firstRemoteUrl = (el: Element, attrs: string[]): string | null => {
      for (const a of attrs) {
        const v = el.getAttribute(a)?.trim();
        if (v && /^(https?:)?\/\//i.test(v)) return v;
      }
      return null;
    };
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
        return;
      }
      if (node.tagName === "IMG") {
        const src = node.getAttribute("src")?.trim() ?? "";
        const looksLikeSpacer = /spacer|blank\.|transparent|pixel|1x1|\/s\.gif|clear\.gif/i.test(src);
        const srcIsPlaceholder = src === "" || src.startsWith("data:") || looksLikeSpacer;
        if (srcIsPlaceholder) {
          const real = firstRemoteUrl(node, [
            "data-src", "data-original", "data-lazy-src", "data-lazy",
            "data-url", "data-image-src", "data-srcurl", "data-echo",
          ]);
          if (real) node.setAttribute("src", real);
        }
        if (!node.getAttribute("srcset")?.trim()) {
          const dss = node.getAttribute("data-srcset")?.trim();
          if (dss) node.setAttribute("srcset", dss);
        }
        // Privacy + anti-hotlink: non inviare l'URL dell'app come referrer
        // agli host delle immagini (alcuni CDN bloccano referrer esterni).
        if (!node.getAttribute("referrerpolicy")) {
          node.setAttribute("referrerpolicy", "no-referrer");
        }
      }
    });
    const clean = DOMPurify.sanitize(message.raw_html, {
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "textarea"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onmouseout", "onfocus", "onblur", "onchange", "onsubmit", "onkeydown", "onkeyup", "onkeypress"],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
      // Mantieni style + class — sono il modo standard delle email HTML di
      // veicolare il visual layout (tabelle, bottoni, sfondi). Niente JS qui.
      ADD_TAGS: ["style"],
      ADD_ATTR: ["style", "class", "id", "bgcolor", "align", "valign", "cellpadding", "cellspacing", "border", "width", "height"],
    });
    DOMPurify.removeAllHooks();
    return clean;
  }, [message.raw_html]);

  const attachments = Array.isArray(message.attachments)
    ? (message.attachments as Array<{ filename?: string; size?: number; mime?: string }>)
    : [];

  const senderLabel = message.from_name || message.from_email || "(sconosciuto)";
  const ts = format(new Date(message.received_at), "d MMM yyyy 'alle' HH:mm", { locale: it });
  const category = emailCategoryLabel(message.ai_category);
  const highPriority = isHighPriority(message.ai_priority);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{senderLabel}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {message.from_email && (
              <span>&lt;{message.from_email}&gt;</span>
            )}
            {message.to_email && (
              <span className="ml-2">→ {message.to_email}</span>
            )}
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">{ts}</span>
      </div>

      {/* MP-EMAIL-AI-17: marca PEC (valore legale) + stato di consegna */}
      {message.is_pec && (
        <div className="px-4 py-2 bg-violet-50/60 border-b border-violet-100">
          <PecBadge isPec={message.is_pec} pecTipo={message.pec_tipo} pecStato={message.pec_stato} />
        </div>
      )}

      {/* MP-EMAIL-AI-16: avviso di rischio (phishing / frode IBAN) — avvisa, non blocca */}
      <RischioBanner message={message} />

      {(message.ai_summary || highPriority) && (
        <div className="px-4 py-2 bg-violet-50 border-b border-violet-200 flex items-start gap-2">
          {highPriority ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-violet-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            {category && (
              <Badge variant="outline" className="text-[10px] mb-1 bg-white">
                {category}
              </Badge>
            )}
            <p className="text-xs text-violet-900 leading-snug">
              {sanitizeAiSummary(message.ai_summary) || "Questa email richiede attenzione entro 24 ore."}
            </p>
          </div>
        </div>
      )}

      {sanitizedHtml ? (
        /* 2026-05-26: niente più `prose prose-sm` per il rendering HTML email.
           Tailwind Typography sovrascriveva font-family, line-height, max-width
           e regole tabella → email Meta/Mailchimp/etc. con layout templated
           appariva sgualcita. Ora un container "email-html" dedicato che:
            - resetta selettivamente i conflitti app vs email
            - rispetta lo styling inline (table-layout: fixed, bgcolor, ecc.)
            - confina la larghezza max al pannello senza spezzare il design
            - usa overflow-x-auto così tabelle larghe scrollano invece di
              andare oltre il pannello viewer */
        <div className="email-html-wrapper overflow-x-auto p-4 bg-white">
          <div
            className="email-html text-sm text-slate-900"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        </div>
      ) : (
        <div className="p-4">
          {message.raw_text ? (
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
              {message.raw_text}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">(messaggio vuoto)</p>
          )}
        </div>
      )}

      {attachments.length > 0 && (
        <>
          <Separator />
          <div className="p-3 flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-muted/20 text-xs"
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium truncate max-w-[200px]">
                  {a.filename || `allegato-${i + 1}`}
                </span>
                {a.size && (
                  <span className="text-muted-foreground">
                    {(a.size / 1024).toFixed(0)} KB
                  </span>
                )}
              </div>
            ))}
          </div>
          {/* MP-EMAIL-AI-06: estrazione dati da allegati PDF → bozza gestionale */}
          <DocumentoEstrattoPanel emailId={message.id} attachments={attachments} />
        </>
      )}
      {/* MP-EMAIL-AI-08: richiesta preventivo → bozza opportunità (anche senza allegati) */}
      <OpportunitaEmailPanel emailId={message.id} />
      {/* MP-EMAIL-AI-10: collega l'email a cantieri/pratiche */}
      <CollegamentiEmailPanel emailId={message.id} threadId={message.thread_id} />
      {/* MP-EMAIL-AI-11: rileva appuntamento → bozza evento */}
      <EventoEmailPanel emailId={message.id} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// ThreadCollabBanner — chi nella company ha aperto/risposto al thread
// ───────────────────────────────────────────────────────────────

const ACTION_LABEL: Record<EmailActivityAction, string> = {
  viewed: "ha aperto",
  replied: "ha risposto",
  forwarded: "ha inoltrato",
  archived: "ha archiviato",
  trashed: "ha cestinato",
  starred: "ha contrassegnato",
};

const ACTION_TONE: Record<EmailActivityAction, string> = {
  viewed: "text-slate-600",
  replied: "text-emerald-700",
  forwarded: "text-blue-700",
  archived: "text-slate-500",
  trashed: "text-rose-600",
  starred: "text-amber-600",
};

function relativeTime(value: string): string {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "—";
  const diff = Date.now() - ts;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h fa`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "giorno" : "giorni"} fa`;
  return new Date(value).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ThreadCollabBanner({
  items,
}: {
  items: ReturnType<typeof summarizeThreadActivity>;
}) {
  if (items.length === 0) return null;
  // Mostro max 5 + counter "altri"
  const visible = items.slice(0, 5);
  const hidden = items.length - visible.length;

  return (
    <div className="px-3 py-2 bg-blue-50/60 border-b border-blue-100">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
          {items.length}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-900">
            Collaborazione team
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-snug text-slate-700">
            {visible.map((item) => {
              const tone = ACTION_TONE[item.last_action] ?? "text-slate-600";
              const label = ACTION_LABEL[item.last_action] ?? "ha interagito";
              return (
                <span
                  key={item.user_id}
                  className="inline-flex items-center gap-1.5"
                  title={`${item.user_name ?? "Membro team"} · ${label} il ${new Date(item.last_at).toLocaleString("it-IT")}${item.last_email_address ? ` da ${item.last_email_address}` : ""}`}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white",
                      avatarColor(item.user_name),
                    )}
                  >
                    {initials(item.user_name)}
                  </span>
                  <span className="font-medium text-slate-900">
                    {item.user_name ?? "Membro team"}
                  </span>
                  <span className={tone}>{label}</span>
                  <span className="text-slate-500">{relativeTime(item.last_at)}</span>
                  {item.last_email_address && (
                    <span className="rounded bg-white px-1 text-[10px] text-slate-500 border border-slate-100">
                      {item.last_email_address}
                    </span>
                  )}
                </span>
              );
            })}
            {hidden > 0 && (
              <span className="text-slate-500">+ altri {hidden}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Determina un colore avatar deterministicamente dal nome. */
function avatarColor(name: string | null): string {
  if (!name) return "bg-slate-500";
  const palette = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-fuchsia-500",
    "bg-orange-500",
  ];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
  return palette[hash % palette.length];
}
