/**
 * VerificationResultCard — FASE 5.3
 * Mostra il risultato della verifica AI con discrepanze interattive.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { JSX } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

export interface Discrepancy {
  id?: string;
  type: string;
  severity: "critical" | "warning" | "info";
  item_reference: string;
  field_name: string;
  expected_value: string;
  actual_value: string;
  explanation: string;
  suggestion: string;
  confidence: number;
  resolution_status?: string;
  resolution_notes?: string;
}

export interface VerificationData {
  verification_id?: string;
  result: "match" | "mismatch" | "partial_match";
  confidence_score: number;
  summary: string;
  total_items_checked: number;
  items_matched: number;
  items_mismatched: number;
  items_missing: number;
  items_extra: number;
  discrepancies: Discrepancy[];
  recommendations?: string[];
  price_analysis?: {
    client_total: number;
    supplier_total: number;
    difference: number;
    difference_percent: number;
    price_note: string;
  };
  processing_time_ms?: number;
  tokens_used?: number;
}

export interface VerificationResultCardProps {
  data: VerificationData;
  showActions?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const RESULT_CONFIG = {
  match: {
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-800",
    label: "Tutto coincide!",
  },
  partial_match: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    border: "border-amber-200 dark:border-amber-800",
    label: "Trovate discrepanze",
  },
  mismatch: {
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-950/20",
    border: "border-red-200 dark:border-red-800",
    label: "Documenti non corrispondenti",
  },
} as const;

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critico",
  warning: "Avviso",
  info: "Info",
};

const TYPE_LABELS: Record<string, string> = {
  quantity_mismatch: "Quantità",
  measurement_mismatch: "Misure",
  material_mismatch: "Materiale",
  color_mismatch: "Colore/Finitura",
  model_mismatch: "Modello/Tipo",
  accessory_missing: "Accessorio mancante",
  accessory_extra: "Accessorio extra",
  price_mismatch: "Prezzo",
  item_missing: "Articolo mancante",
  item_extra: "Articolo extra",
  specification_mismatch: "Specifica tecnica",
  delivery_mismatch: "Consegna",
  other: "Altro",
};

// ── Component ─────────────────────────────────────────────────────────────

export function VerificationResultCard({
  data,
  showActions = true,
}: VerificationResultCardProps): JSX.Element {
  const config = RESULT_CONFIG[data.result] || RESULT_CONFIG.mismatch;
  const Icon = config.icon;
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (idx: number): void => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Sort discrepancies by severity (critical first)
  const sortedDiscrepancies = [...data.discrepancies].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  });

  return (
    <div className="space-y-4">
      {/* Header Result */}
      <Card className={`${config.border} ${config.bg}`}>
        <CardContent className="py-4 flex items-center gap-4">
          <Icon className={`h-10 w-10 ${config.color} shrink-0`} />
          <div className="flex-1">
            <p className={`text-lg font-semibold ${config.color}`}>
              Verifica Completata — {config.label}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">{data.summary}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold">{Math.round(data.confidence_score)}%</p>
            <p className="text-xs text-muted-foreground">Confidenza</p>
          </div>
        </CardContent>
      </Card>

      {/* Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CounterCard label="Verificati" value={data.total_items_checked} color="text-foreground" />
        <CounterCard label="Corrispondenti" value={data.items_matched} color="text-emerald-600" />
        <CounterCard label="Discrepanze" value={data.items_mismatched} color="text-amber-600" />
        <CounterCard label="Mancanti" value={data.items_missing} color="text-red-600" />
      </div>

      {/* Price Analysis */}
      {data.price_analysis && (
        <Card>
          <CardContent className="py-3">
            <p className="text-sm font-medium mb-2">Analisi Prezzi</p>
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Commessa Cliente</p>
                <p className="font-medium">{data.price_analysis.client_total.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Fornitore</p>
                <p className="font-medium">{data.price_analysis.supplier_total.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Differenza</p>
                <p className={`font-medium ${data.price_analysis.difference > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {data.price_analysis.difference > 0 ? "+" : ""}
                  {data.price_analysis.difference.toFixed(2)} ({data.price_analysis.difference_percent.toFixed(1)}%)
                </p>
              </div>
            </div>
            {data.price_analysis.price_note && (
              <p className="text-xs text-muted-foreground mt-2">{data.price_analysis.price_note}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Discrepancies Table */}
      {sortedDiscrepancies.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Discrepanze ({sortedDiscrepancies.length})</p>
          <div className="space-y-2">
            {sortedDiscrepancies.map((d, idx) => (
              <DiscrepancyRow
                key={idx}
                discrepancy={d}
                expanded={expandedRows.has(idx)}
                onToggle={() => toggleRow(idx)}
                showActions={showActions}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations && data.recommendations.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <p className="text-sm font-medium mb-2">Raccomandazioni AI</p>
            <ul className="space-y-1.5">
              {data.recommendations.map((rec, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-primary shrink-0">•</span>
                  {rec}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Meta */}
      {(data.processing_time_ms || data.tokens_used) && (
        <p className="text-xs text-muted-foreground text-right">
          {data.processing_time_ms && `${(data.processing_time_ms / 1000).toFixed(1)}s`}
          {data.processing_time_ms && data.tokens_used && " · "}
          {data.tokens_used && `${data.tokens_used} token`}
        </p>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function CounterCard({ label, value, color }: { label: string; value: number; color: string }): JSX.Element {
  return (
    <Card>
      <CardContent className="py-3 text-center">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

interface DiscrepancyRowProps {
  discrepancy: Discrepancy;
  expanded: boolean;
  onToggle: () => void;
  showActions: boolean;
}

function DiscrepancyRow({ discrepancy: d, expanded, onToggle, showActions }: DiscrepancyRowProps): JSX.Element {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [resolutionNotes, setResolutionNotes] = useState("");

  const resolveMutation = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      if (!d.id) return;
      const { error } = await supabase
        .from("verification_discrepancies")
        .update({
          resolution_status: status,
          resolution_notes: resolutionNotes || null,
          resolved_by: user?.id || null,
          resolved_at: new Date().toISOString(),
        } as Record<string, unknown>)
        .eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Discrepanza aggiornata");
      setResolutionNotes("");
      queryClient.invalidateQueries({ queryKey: ["purchase-order-verifications"] });
      queryClient.invalidateQueries({ queryKey: ["verification-discrepancies"] });
    },
    onError: () => toast.error("Errore nell'aggiornamento"),
  });

  const isResolved = d.resolution_status === "accepted" || d.resolution_status === "rejected" || d.resolution_status === "resolved";

  return (
    <div className={`rounded-lg border p-3 ${isResolved ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`text-xs border-0 ${SEVERITY_BADGE[d.severity] || ""}`}>
            {SEVERITY_LABELS[d.severity] || d.severity}
          </Badge>
          <span className="text-sm font-medium">{d.item_reference}</span>
          <span className="text-xs text-muted-foreground">— {d.field_name}</span>
          {isResolved && (
            <Badge variant="outline" className="text-xs">
              {d.resolution_status === "accepted" ? "Accettata" : d.resolution_status === "rejected" ? "Rifiutata" : "Risolta"}
            </Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>

      {/* Values row (always visible) */}
      <div className="flex items-center gap-4 mt-2 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Atteso:</span>
          <span className="font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded text-xs">
            {d.expected_value}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Ricevuto:</span>
          <span className="font-mono text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded text-xs">
            {d.actual_value}
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 space-y-2 border-t pt-2">
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Tipo:</strong> {TYPE_LABELS[d.type] || d.type}</p>
            <p><strong>Spiegazione:</strong> {d.explanation}</p>
            <p><strong>Suggerimento:</strong> {d.suggestion}</p>
            <p><strong>Confidenza:</strong> {d.confidence}%</p>
          </div>

          {/* Actions */}
          {showActions && d.id && !isResolved && (
            <div className="flex items-center gap-2 pt-1">
              <Input
                placeholder="Note (opzionale)..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="flex-1 h-8 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8"
                onClick={() => resolveMutation.mutate({ status: "accepted" })}
                disabled={resolveMutation.isPending}
              >
                Accetta
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 text-red-600"
                onClick={() => resolveMutation.mutate({ status: "rejected" })}
                disabled={resolveMutation.isPending}
              >
                Rifiuta
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 text-emerald-600"
                onClick={() => resolveMutation.mutate({ status: "resolved" })}
                disabled={resolveMutation.isPending}
              >
                Risolto
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
