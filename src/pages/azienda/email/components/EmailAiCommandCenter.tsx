import { useMemo, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  FileText,
  Loader2,
  MailSearch,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { EmailSmartCategory } from "../EmailLayout";
import {
  predictEmailReconciliation,
  type PredictiveEmailCategory,
  type PredictiveEmailResult,
} from "../lib/predictiveReconciliation";

type RawEmailRow = {
  ai_category: string | null;
  ai_priority: string | null;
  ai_summary: string | null;
  attachments: unknown;
  from_email: string | null;
  from_name: string | null;
  id: string | null;
  is_read: boolean | null;
  is_trashed: boolean | null;
  preview: string | null;
  received_at: string | null;
  subject: string | null;
  thread_id: string | null;
};

type AiQueueItem = {
  category: PredictiveEmailCategory;
  email: RawEmailRow;
  prediction: PredictiveEmailResult;
  score: number;
};

type EmailAiCommandCenterProps = {
  companyIdOverride?: string | null;
  onSelectThread: (threadId: string) => void;
  onFilterCategory: (category: EmailSmartCategory | undefined) => void;
};

function categoryFromAi(value: string | null | undefined): PredictiveEmailCategory | null {
  switch (value) {
    case "lead":
    case "lead_new":
    case "lead_followup":
      return "lead";
    case "quote":
    case "quote_request":
    case "preventivo":
    case "richiesta_preventivo":
      return "quote";
    case "cliente_esistente":
    case "customer":
      return "customer";
    case "fornitore":
    case "supplier":
    case "ddt":
      return "supplier";
    case "fattura":
    case "invoice":
      return "invoice";
    case "pratica_amministrativa":
    case "admin":
    case "documento_amministrativo":
      return "admin";
    case "support":
    case "assistenza":
    case "ticket":
      return "support";
    case "spam":
      return "spam";
    case "altro":
    case "other":
      return "other";
    default:
      return null;
  }
}

function isHighPriority(value: string | null | undefined) {
  return value === "alta" || value === "high";
}

function categoryLabel(category: PredictiveEmailCategory) {
  const labels = {
    lead: "Lead",
    quote: "Preventivo",
    customer: "Cliente",
    supplier: "Fornitore/DDT",
    invoice: "Fattura",
    admin: "Pratica",
    support: "Supporto",
    spam: "Spam",
    other: "Altro",
  } satisfies Record<PredictiveEmailCategory, string>;
  return labels[category];
}

function formatTime(value: string | null) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 24 * 60 * 60 * 1000) {
    return new Date(value).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }
  return new Date(value).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

function queueScore(row: RawEmailRow, prediction: PredictiveEmailResult) {
  let score = 0;
  if (!row.is_read) score += 8;
  if (isHighPriority(row.ai_priority) || prediction.priority === "alta") score += 28;
  if (["lead", "quote", "supplier", "invoice", "support"].includes(prediction.category)) score += 14;
  if (prediction.targets.length > 0) score += 10;
  if (row.ai_summary) score += 3;
  return score + Math.round(prediction.confidence * 10);
}

function compactRows(rows: RawEmailRow[]): AiQueueItem[] {
  const byThread = new Map<string, RawEmailRow>();
  for (const row of rows) {
    if (!row.thread_id || byThread.has(row.thread_id)) continue;
    byThread.set(row.thread_id, row);
  }

  return [...byThread.values()]
    .map((email) => {
      const prediction = predictEmailReconciliation({
        subject: email.subject,
        fromEmail: email.from_email,
        fromName: email.from_name,
        preview: email.preview,
        attachments: email.attachments,
      });
      const category = categoryFromAi(email.ai_category) ?? prediction.category;
      return {
        email,
        prediction,
        category,
        score: queueScore(email, prediction),
      };
    })
    .filter((item) => item.category !== "spam" && (item.category !== "other" || item.score >= 30))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export function EmailAiCommandCenter({
  companyIdOverride,
  onSelectThread,
  onFilterCategory,
}: EmailAiCommandCenterProps) {
  const { user, effectiveCompany } = useAuth();
  const userId = user?.id;
  const companyId = companyIdOverride ?? effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data = [], error, isError, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["email-ai-command-center", userId, companyId],
    enabled: !!userId && !!companyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("v_my_email_inbox")
        .select("id, thread_id, subject, from_email, from_name, preview, received_at, attachments, is_read, is_trashed, ai_category, ai_priority, ai_summary")
        .eq("user_id", userId!)
        .eq("company_id", companyId!)
        .eq("is_trashed", false)
        .not("thread_id", "is", null)
        .order("received_at", { ascending: false })
        .limit(180);
      if (error) throw error;
      return (data ?? []) as RawEmailRow[];
    },
  });

  const triageInbox = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("email-ai-assistant", {
        body: {
          action: "triage_inbox",
          company_id: companyId,
          limit: 50,
        },
      });
      if (error) throw error;
      const result = data as { ok?: boolean; processed?: number; error?: string };
      if (!result?.ok) throw new Error(result?.error ?? "Smistamento non riuscito");
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["email-ai-command-center"] });
      queryClient.invalidateQueries({ queryKey: ["email-threads"] });
      queryClient.invalidateQueries({ queryKey: ["email-thread-messages"] });
      toast.success("Regia Email aggiornata", {
        description: `${result.processed ?? 0} email classificate.`,
      });
    },
    onError: (error: Error) => {
      toast.error("Smistamento email non riuscito", { description: error.message });
    },
  });

  const queue = useMemo(() => compactRows(data), [data]);
  const metrics = useMemo(() => {
    const priority = queue.filter((item) => isHighPriority(item.email.ai_priority) || item.prediction.priority === "alta").length;
    const commercial = queue.filter((item) => item.category === "lead" || item.category === "quote").length;
    const supplier = queue.filter((item) => item.category === "supplier").length;
    const admin = queue.filter((item) => item.category === "invoice" || item.category === "admin").length;
    return { priority, commercial, supplier, admin };
  }, [queue]);

  return (
    <div className="hidden md:block border-b border-blue-100 bg-white px-3 py-3">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-orange-50/40 p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-950">Regia Email AI</p>
                <p className="text-[11px] leading-4 text-slate-500">
                  Smista lead, preventivi, DDT, fatture e urgenze senza aprire ogni email.
                </p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-blue-200 bg-white text-xs text-blue-700 hover:bg-blue-50"
              onClick={() => triageInbox.mutate()}
              disabled={triageInbox.isPending}
              title="Smista le email recenti con AI"
            >
              {triageInbox.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Smista
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-blue-700"
              onClick={() => void refetch()}
              disabled={isFetching}
              title="Aggiorna regia email"
            >
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <MetricPill
            label="Urgenti"
            value={metrics.priority}
            icon={AlertTriangle}
            active={metrics.priority > 0}
            onClick={() => onFilterCategory("priority")}
          />
          <MetricPill
            label="Vendita"
            value={metrics.commercial}
            icon={Users}
            active={metrics.commercial > 0}
            onClick={() => onFilterCategory("lead")}
          />
          <MetricPill
            label="Forn."
            value={metrics.supplier}
            icon={Truck}
            active={metrics.supplier > 0}
            onClick={() => onFilterCategory("supplier")}
          />
          <MetricPill
            label="Amm."
            value={metrics.admin}
            icon={ReceiptText}
            active={metrics.admin > 0}
            onClick={() => onFilterCategory("invoice")}
          />
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Da gestire
            </p>
            <Badge variant="outline" className="h-5 border-blue-100 bg-white text-[10px] text-blue-700">
              {queue.length}
            </Badge>
          </div>

          {isLoading ? (
            <div className="space-y-1.5">
              <div className="h-12 animate-pulse rounded-xl bg-white/80" />
              <div className="h-12 animate-pulse rounded-xl bg-white/80" />
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
              Non riesco a leggere la coda AI adesso.
              <button type="button" className="ml-1 font-semibold underline" onClick={() => void refetch()}>
                Riprova
              </button>
              {error instanceof Error && <p className="mt-1 line-clamp-2 text-[11px] opacity-80">{error.message}</p>}
            </div>
          ) : queue.length === 0 ? (
            <div className="rounded-xl border border-dashed border-blue-100 bg-white/80 p-3 text-xs text-slate-500">
              Nessuna email critica recente. Le nuove email verranno lette e smistate qui.
            </div>
          ) : (
            queue.slice(0, 3).map((item) => (
              <button
                key={item.email.thread_id}
                type="button"
                className="w-full rounded-xl border border-white bg-white/90 p-2 text-left shadow-sm transition hover:border-blue-200 hover:bg-white"
                onClick={() => item.email.thread_id && onSelectThread(item.email.thread_id)}
              >
                <div className="flex items-start gap-2">
                  <MailSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {item.email.from_name || item.email.from_email || "Mittente sconosciuto"}
                      </p>
                      <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                        {formatTime(item.email.received_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-600">
                      {item.email.subject || "(senza oggetto)"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge className={cn(
                        "h-5 rounded-full px-2 text-[9px]",
                        item.prediction.priority === "alta" || isHighPriority(item.email.ai_priority)
                          ? "bg-orange-600 hover:bg-orange-600"
                          : "bg-blue-600 hover:bg-blue-600",
                      )}>
                        {categoryLabel(item.category)}
                      </Badge>
                      {item.prediction.targets.slice(0, 1).map((target) => (
                        <Badge key={target.type} variant="outline" className="h-5 rounded-full border-emerald-100 bg-emerald-50 px-2 text-[9px] text-emerald-700">
                          <FileText className="mr-1 h-2.5 w-2.5" />
                          {target.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MetricPill({
  active,
  icon: Icon,
  label,
  onClick,
  value,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  value: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-2 py-2 text-left transition",
        active
          ? "border-blue-200 bg-white text-blue-900 shadow-sm"
          : "border-white/80 bg-white/70 text-slate-500 hover:bg-white",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <p className="mt-1 text-sm font-bold leading-none">{value}</p>
      <p className="mt-0.5 truncate text-[10px]">{label}</p>
    </button>
  );
}
