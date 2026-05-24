import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Inbox,
  ListChecks,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SMART_DOC_TYPE_EMOJI,
  SMART_DOC_TYPE_LABEL,
  buildSmartDocumentInboxAction,
  buildSmartDocumentReviewModel,
  getSmartDocumentInboxStatusTone,
  summarizeSmartDocumentInbox,
  type SmartDocumentInboxRow,
  type SmartDocumentInboxStatusTone,
  type SmartDocumentReviewField,
  type SmartDocumentReviewTone,
  type SmartValidationWarning,
} from "@/lib/documenti/smartDocumentImport";
import { cn } from "@/lib/utils";

type DocumentAnalysisRow = Pick<
  Database["public"]["Tables"]["document_analysis_results"]["Row"],
  | "id"
  | "doc_type"
  | "classification_confidence"
  | "parser_used"
  | "structured_fields"
  | "validation_warnings"
  | "status"
  | "error_message"
  | "file_name"
  | "file_size_bytes"
  | "related_entities"
  | "created_at"
>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComputoReady?: (computoId: string) => void;
  onImportNew?: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  success: "Pronto",
  completed: "Pronto",
  review_required: "Da verificare",
  needs_review: "Da verificare",
  processing: "In analisi",
  pending: "In coda",
  queued: "In coda",
  failed: "Errore",
  error: "Errore",
};

const TONE_CLASS: Record<SmartDocumentInboxStatusTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  processing: "border-blue-200 bg-blue-50 text-blue-700",
};

const REVIEW_TONE_CLASS: Record<SmartDocumentReviewTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

type RelatedSuggestion = {
  label?: string;
  entity_table?: string;
  reasoning?: string;
  rank?: number;
  scores?: {
    combined?: number;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asWarnings(value: unknown): SmartValidationWarning[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SmartValidationWarning => !!item && typeof item === "object");
}

function asRelatedSuggestions(value: unknown): RelatedSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is RelatedSuggestion => !!item && typeof item === "object")
    .slice(0, 3);
}

function toInboxRuleRow(row: DocumentAnalysisRow): SmartDocumentInboxRow {
  return {
    id: row.id,
    doc_type: row.doc_type,
    parser_used: row.parser_used,
    status: row.status,
    structured_fields: asRecord(row.structured_fields),
    validation_warnings: asWarnings(row.validation_warnings),
  };
}

function formatDate(value: string | null): string {
  if (!value) return "Data non disponibile";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "Dimensione non disponibile";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function statusIcon(tone: SmartDocumentInboxStatusTone) {
  if (tone === "error") return AlertTriangle;
  if (tone === "warning") return AlertTriangle;
  if (tone === "processing") return Clock3;
  return CheckCircle2;
}

export function SmartDocumentInboxDialog({ open, onOpenChange, onComputoReady, onImportNew }: Props) {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    data: rows = [],
    error,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["smart-document-inbox", companyId],
    enabled: open && !!companyId,
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("document_analysis_results")
        .select(
          "id,doc_type,classification_confidence,parser_used,structured_fields,validation_warnings,status,error_message,file_name,file_size_bytes,related_entities,created_at",
        )
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(30);

      if (queryError) throw queryError;
      return (data ?? []) as DocumentAnalysisRow[];
    },
  });

  const inboxRows = useMemo(() => rows.map(toInboxRuleRow), [rows]);
  const summary = useMemo(() => summarizeSmartDocumentInbox(inboxRows), [inboxRows]);
  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? rows[0] ?? null,
    [rows, selectedId],
  );

  useEffect(() => {
    if (!open) return;
    if (rows.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0].id);
    }
  }, [open, rows, selectedId]);

  const handleOpenRow = (row: DocumentAnalysisRow) => {
    const action = buildSmartDocumentInboxAction(toInboxRuleRow(row));

    if (action.kind === "computo_review") {
      if (!onComputoReady) {
        toast.error("Revisione non disponibile", {
          description: "Questo punto di ingresso non puo aprire il computo estratto.",
        });
        return;
      }
      onOpenChange(false);
      onComputoReady(action.computoUploadId);
      return;
    }

    if (action.kind === "redirect") {
      onOpenChange(false);
      navigate(action.url);
      return;
    }

    toast.info(action.label, {
      description: action.hint ?? "Apri il documento dal modulo dedicato o ripeti l'analisi se mancano dati.",
    });
  };

  const handleImportNew = () => {
    onOpenChange(false);
    onImportNew?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex flex-col gap-4 pr-8 md:flex-row md:items-start md:justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Inbox className="h-5 w-5 text-orange-500" />
                Inbox documenti AI
              </DialogTitle>
              <DialogDescription className="mt-1">
                Riprendi gli ultimi import, verifica gli scarti e apri il modulo corretto.
              </DialogDescription>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-9"
              >
                {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Aggiorna
              </Button>
              <Button type="button" size="sm" onClick={handleImportNew} className="h-9">
                <UploadCloud className="mr-2 h-4 w-4" />
                Importa
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
            <SummaryPill label="Totali" value={summary.total} />
            <SummaryPill label="Pronti" value={summary.ready} tone="success" />
            <SummaryPill label="Da verificare" value={summary.reviewRequired} tone="warning" />
            <SummaryPill label="In analisi" value={summary.processing} tone="processing" />
            <SummaryPill label="Errori" value={summary.failed} tone="error" />
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            inline
            icon={AlertTriangle}
            title="Inbox non caricata"
            description="Non riesco a leggere lo storico delle analisi. Riprova tra poco."
            action={{ label: "Riprova", onClick: () => refetch(), variant: "outline" }}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            inline
            icon={FileText}
            title="Nessun documento analizzato"
            description="Carica un computo, una fattura, un listino o una foto: qui rimarra lo storico operativo."
            action={{ label: "Importa documento", onClick: handleImportNew }}
          />
        ) : (
          <div className="grid min-h-0 md:grid-cols-[minmax(0,1fr)_390px]">
            <ScrollArea className="h-[260px] border-b md:h-[min(60vh,600px)] md:border-b-0 md:border-r">
              <div className="space-y-2 p-4">
                {rows.map((row) => (
                  <InboxResultRow
                    key={row.id}
                    row={row}
                    selected={row.id === selectedRow?.id}
                    onSelect={setSelectedId}
                    onOpen={handleOpenRow}
                  />
                ))}
              </div>
            </ScrollArea>
            <SmartDocumentReviewPanel row={selectedRow} onOpen={handleOpenRow} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryPill({
  label,
  value,
  tone = "success",
}: {
  label: string;
  value: number;
  tone?: SmartDocumentInboxStatusTone;
}) {
  return (
    <div className={cn("rounded-md border px-3 py-2", tone === "success" ? "bg-muted/40" : TONE_CLASS[tone])}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-75">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
    </div>
  );
}

function InboxResultRow({
  row,
  selected,
  onSelect,
  onOpen,
}: {
  row: DocumentAnalysisRow;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpen: (row: DocumentAnalysisRow) => void;
}) {
  const inboxRow = toInboxRuleRow(row);
  const tone = getSmartDocumentInboxStatusTone(inboxRow);
  const StatusIcon = statusIcon(tone);
  const warnings = asWarnings(row.validation_warnings);
  const docLabel = SMART_DOC_TYPE_LABEL[row.doc_type] ?? row.doc_type;
  const confidence =
    typeof row.classification_confidence === "number"
      ? `${Math.round(row.classification_confidence * 100)}%`
      : null;
  const status = STATUS_LABEL[(row.status ?? "").toLowerCase()] ?? row.status ?? "Sconosciuto";
  const action = buildSmartDocumentInboxAction(inboxRow);

  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-md border bg-background p-3 transition-colors hover:border-orange-200 hover:bg-orange-50/30 md:flex-row md:items-center md:justify-between",
        selected && "border-orange-300 bg-orange-50/50",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg" aria-hidden="true">
            {SMART_DOC_TYPE_EMOJI[row.doc_type] ?? "📁"}
          </span>
          <span className="min-w-0 truncate font-medium text-foreground">
            {row.file_name || docLabel}
          </span>
          <Badge variant="outline" className={cn("h-6", TONE_CLASS[tone])}>
            <StatusIcon className="mr-1 h-3.5 w-3.5" />
            {status}
          </Badge>
        </div>

        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{docLabel}</span>
          <span>{formatFileSize(row.file_size_bytes)}</span>
          <span>{formatDate(row.created_at)}</span>
          {confidence ? <span>Confidenza {confidence}</span> : null}
          {row.parser_used ? <span>{row.parser_used}</span> : null}
        </div>

        {row.error_message ? (
          <p className="mt-2 text-xs text-rose-700">{row.error_message}</p>
        ) : warnings.length > 0 ? (
          <p className="mt-2 line-clamp-1 text-xs text-amber-700">
            {warnings.length} avvisi: {warnings[0]?.message ?? "verifica consigliata"}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onSelect(row.id)} className="h-9">
          <ListChecks className="mr-2 h-4 w-4" />
          Review
        </Button>
        <Button type="button" size="sm" onClick={() => onOpen(row)} className="h-9">
          {action.kind === "computo_review" ? "Apri revisione" : action.label}
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SmartDocumentReviewPanel({
  row,
  onOpen,
}: {
  row: DocumentAnalysisRow | null;
  onOpen: (row: DocumentAnalysisRow) => void;
}) {
  if (!row) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Seleziona un documento per vedere la review AI.
      </div>
    );
  }

  const inboxRow = toInboxRuleRow(row);
  const review = buildSmartDocumentReviewModel(inboxRow);
  const action = buildSmartDocumentInboxAction(inboxRow);
  const suggestions = asRelatedSuggestions(row.related_entities);

  return (
    <ScrollArea className="h-[min(45vh,420px)] md:h-[min(60vh,600px)]">
      <aside className="space-y-4 p-4">
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Review AI
              </div>
              <h3 className="mt-1 line-clamp-2 font-semibold leading-snug">
                {SMART_DOC_TYPE_LABEL[row.doc_type] ?? row.doc_type}
              </h3>
            </div>
            <Badge variant="outline" className={cn(
              "h-7",
              review.reviewScore >= 80
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : review.reviewScore >= 60
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-rose-200 bg-rose-50 text-rose-700",
            )}>
              {review.reviewScore}/100
            </Badge>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <MiniMetric label="Campi" value={review.fields.length} />
            <MiniMetric label="Fonti" value={review.sourceEvidenceCount} />
            <MiniMetric label="Bassa fid." value={review.lowConfidenceCount} />
          </div>
        </div>

        {(review.missingCritical.length > 0 || review.warnings.length > 0) ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              Da verificare
            </div>
            <div className="space-y-1 text-xs">
              {review.missingCritical.map((item) => (
                <p key={item}>Manca: {item}</p>
              ))}
              {review.warnings.slice(0, 3).map((warning, index) => (
                <p key={`${warning.message}-${index}`}>{warning.message ?? "Avviso AI da controllare"}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4" />
              Dati principali presenti
            </div>
          </div>
        )}

        {review.groups.length > 0 ? (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Righe e gruppi</h4>
            {review.groups.map((group) => (
              <div key={group.path} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{group.label}</span>
                  <Badge variant="secondary">{group.count}</Badge>
                </div>
                {group.sample ? <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{group.sample}</p> : null}
              </div>
            ))}
          </section>
        ) : null}

        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campi estratti</h4>
          {review.fields.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Nessun campo strutturato disponibile: ripeti l'analisi o apri il modulo dedicato.
            </p>
          ) : (
            <div className="space-y-2">
              {review.fields.map((field) => (
                <ReviewFieldRow key={field.path} field={field} />
              ))}
            </div>
          )}
        </section>

        {suggestions.length > 0 ? (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Collegamenti suggeriti</h4>
            {suggestions.map((suggestion, index) => (
              <div key={`${suggestion.label}-${index}`} className="rounded-md border p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="line-clamp-1 font-medium">{suggestion.label ?? suggestion.entity_table ?? "Entita suggerita"}</span>
                  {typeof suggestion.scores?.combined === "number" ? (
                    <Badge variant="outline">{Math.round(suggestion.scores.combined * 100)}%</Badge>
                  ) : null}
                </div>
                {suggestion.reasoning ? <p className="mt-1 line-clamp-2 text-muted-foreground">{suggestion.reasoning}</p> : null}
              </div>
            ))}
          </section>
        ) : null}

        <Button type="button" className="w-full" onClick={() => onOpen(row)}>
          {action.kind === "computo_review" ? "Apri revisione completa" : action.label}
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      </aside>
    </ScrollArea>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background px-2 py-2">
      <div className="text-sm font-semibold leading-tight">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function ReviewFieldRow({ field }: { field: SmartDocumentReviewField }) {
  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
          <div className="mt-0.5 break-words font-medium">{field.value}</div>
        </div>
        {typeof field.confidence === "number" ? (
          <Badge variant="outline" className={cn("shrink-0", REVIEW_TONE_CLASS[field.tone])}>
            {Math.round(field.confidence * 100)}%
          </Badge>
        ) : null}
      </div>
      {field.source ? (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{field.source}</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Fonte puntuale non disponibile</p>
      )}
    </div>
  );
}
