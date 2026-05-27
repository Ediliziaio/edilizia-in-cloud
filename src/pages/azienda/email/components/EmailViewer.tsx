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
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Star, Archive, Trash2, Reply, ReplyAll, Forward,
  Paperclip, Sparkles, AlertTriangle, X, Wand2, Loader2, ListChecks,
  Truck, CalendarClock, PackageCheck, Send, ClipboardCheck, MoreHorizontal,
} from "lucide-react";
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

export function EmailViewer({ threadId, onBack, onClose, onReply }: EmailViewerProps) {
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
        .select("id, thread_id, message_id, oauth_connection_id, from_email, from_name, to_email, cc_emails, subject, received_at, raw_html, raw_text, attachments, ai_category, ai_priority, ai_summary, ai_extracted, ai_suggested_action, ai_processed_at, is_read, is_starred")
        .eq("thread_id", threadId)
        .order("received_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  // 2026-05-26: collaborazione email — chi nella company ha aperto/risposto.
  // Estrae i provider message_id del thread (univoci cross-utente) e li
  // passa al tracker. La RPC è idempotente (skip se viewed negli ultimi 5min).
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

  return (
    <>
      <div className="border-b p-2 sm:p-3 flex items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0"
          onClick={onBack}
          aria-label="Torna alla lista"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
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
        <Button
          variant="ghost"
          size="icon"
          onClick={() => summarizeMutation.mutate()}
          disabled={summarizeMutation.isPending}
          title="Riassumi thread con AI"
          className="hidden md:flex text-violet-600 hover:text-violet-700"
        >
          {summarizeMutation.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Wand2 className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending || !messages || messages.length === 0}
          title="Analizza email con AI"
          className="hidden md:flex text-violet-600 hover:text-violet-700"
        >
          {analyzeMutation.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Sparkles className="h-4 w-4" />}
        </Button>
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
            {messages.map((m) => (
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

      {/* Action bar bottom: Reply/ReplyAll/Forward (desktop only — mobile usa la mobile-bottom-bar sotto) */}
      <div className="hidden md:flex border-t p-3 bg-muted/20 flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending || !messages || messages.length === 0}
        >
          {analyzeMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          Analizza email
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
          onClick={() => operationProposalsMutation.mutate()}
          disabled={operationProposalsMutation.isPending || !messages || messages.length === 0}
        >
          {operationProposalsMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Truck className="h-3.5 w-3.5" />
          )}
          Operativo
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"
          onClick={() => suggestRepliesMutation.mutate()}
          disabled={suggestRepliesMutation.isPending || !messages || messages.length === 0}
        >
          {suggestRepliesMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Suggerisci risposte
        </Button>
        {(["reply", "replyAll", "forward"] as const).map((mode) => {
          const Icon = mode === "reply" ? Reply : mode === "replyAll" ? ReplyAll : Forward;
          const label = mode === "reply" ? "Rispondi" : mode === "replyAll" ? "A tutti" : "Inoltra";
          return (
            <Button
              key={mode}
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!messages || messages.length === 0}
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
                  mode,
                );
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          );
        })}
      </div>

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
  const category = emailCategoryLabel(prediction.category) ?? "Altro";
  const priorityLabel = prediction.priority === "alta"
    ? "Alta"
    : prediction.priority === "media"
      ? "Media"
      : "Bassa";
  const confidence = Math.round(prediction.confidence * 100);

  return (
    <div className="m-4 mb-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 rounded-lg bg-blue-600 p-1.5 text-white shadow-sm">
            <ClipboardCheck className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950">
              Riconciliazione predittiva senza AI
            </p>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">
              Classificazione immediata con regole su mittente, oggetto, testo e allegati.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="border-blue-200 bg-white text-[10px] font-semibold text-blue-800">
            {category}
          </Badge>
          <Badge
            className={cn(
              "text-[10px] font-semibold",
              prediction.priority === "alta"
                ? "bg-orange-600 hover:bg-orange-600"
                : "bg-blue-600 hover:bg-blue-600",
            )}
          >
            Priorità {priorityLabel}
          </Badge>
          <Badge variant="outline" className="border-slate-200 bg-white text-[10px] font-semibold text-slate-700">
            {confidence}%
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 p-4 text-sm lg:grid-cols-[1.1fr_0.9fr]">
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

  return (
    <div className="m-4 mb-0 rounded-lg border border-violet-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-violet-50/60 px-3 py-2">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 rounded-md bg-violet-600 p-1.5 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-violet-900">
              Analisi AI email
            </p>
            <p className="text-xs text-violet-800/80">
              {analysis.intent || "Intento rilevato dalla conversazione"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="bg-white text-[10px]">
            {category}
          </Badge>
          <Badge
            className={cn(
              "text-[10px]",
              analysis.priority === "alta"
                ? "bg-rose-600 hover:bg-rose-600"
                : "bg-violet-600 hover:bg-violet-600",
            )}
          >
            Priorità {priorityLabel}
          </Badge>
        </div>
      </div>

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
  const sanitizedHtml = useMemo(() => {
    if (!message.raw_html) return null;
    return DOMPurify.sanitize(message.raw_html, {
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "style"],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    });
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

      <div className="p-4">
        {sanitizedHtml ? (
          <div
            className="prose prose-sm max-w-none text-sm
                       prose-a:text-violet-600 prose-a:underline-offset-2
                       prose-img:rounded prose-img:my-2"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : message.raw_text ? (
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
            {message.raw_text}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground italic">(messaggio vuoto)</p>
        )}
      </div>

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
        </>
      )}
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
