/**
 * VerificationHistoryCard — FASE 5.4
 * Storico verifiche AI per un OdA
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  ShieldCheck, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { VerificationResultCard, type VerificationData, type Discrepancy } from "./VerificationResultCard";

// ── Types ─────────────────────────────────────────────────────────────────

export interface VerificationHistoryCardProps {
  purchaseOrderId: string;
}

interface VerificationRecord {
  id: string;
  status: string;
  result: string | null;
  confidence_score: number | null;
  overall_summary: string | null;
  total_items_checked: number | null;
  items_matched: number | null;
  items_mismatched: number | null;
  items_missing: number | null;
  items_extra: number | null;
  ai_tokens_used: number | null;
  processing_time_ms: number | null;
  created_at: string;
  verified_at: string | null;
}

interface DiscrepancyRecord {
  id: string;
  discrepancy_type: string;
  severity: string;
  item_reference: string | null;
  field_name: string | null;
  expected_value: string | null;
  actual_value: string | null;
  ai_explanation: string | null;
  ai_suggestion: string | null;
  ai_confidence: number | null;
  resolution_status: string | null;
  resolution_notes: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const RESULT_ICONS = {
  match: { icon: CheckCircle2, color: "text-emerald-600" },
  partial_match: { icon: AlertTriangle, color: "text-amber-600" },
  mismatch: { icon: XCircle, color: "text-red-600" },
} as const;

const RESULT_LABELS: Record<string, string> = {
  match: "Corrispondente",
  partial_match: "Discrepanze",
  mismatch: "Non conforme",
};

// ── Component ─────────────────────────────────────────────────────────────

export function VerificationHistoryCard({ purchaseOrderId }: VerificationHistoryCardProps): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: verifications = [], isLoading } = useQuery({
    queryKey: ["purchase-order-verifications", purchaseOrderId],
    queryFn: async (): Promise<VerificationRecord[]> => {
      const { data, error } = await supabase
        .from("purchase_order_verifications")
        .select("id, status, result, confidence_score, overall_summary, total_items_checked, items_matched, items_mismatched, items_missing, items_extra, ai_tokens_used, processing_time_ms, created_at, verified_at")
        .eq("purchase_order_id", purchaseOrderId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as VerificationRecord[];
    },
    enabled: !!purchaseOrderId,
    staleTime: 30000,
  });

  // Fetch discrepancies only for expanded verification
  const { data: discrepancies = [] } = useQuery({
    queryKey: ["verification-discrepancies", expandedId],
    queryFn: async (): Promise<DiscrepancyRecord[]> => {
      if (!expandedId) return [];
      const { data, error } = await supabase
        .from("verification_discrepancies")
        .select("id, discrepancy_type, severity, item_reference, field_name, expected_value, actual_value, ai_explanation, ai_suggestion, ai_confidence, resolution_status, resolution_notes")
        .eq("verification_id", expandedId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as DiscrepancyRecord[];
    },
    enabled: !!expandedId,
    staleTime: 30000,
  });

  if (verifications.length === 0 && !isLoading) {
    return <></>;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Storico Verifiche AI
          <Badge variant="outline">{verifications.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-3">Caricamento...</p>
        )}
        {verifications.map((v) => {
          const isExpanded = expandedId === v.id;
          const resultConfig = v.result ? RESULT_ICONS[v.result as keyof typeof RESULT_ICONS] : null;
          const ResultIcon = resultConfig?.icon || Clock;
          const resultColor = resultConfig?.color || "text-muted-foreground";

          // Check if all discrepancies are resolved
          const allResolved = isExpanded && discrepancies.length > 0 &&
            discrepancies.every((d) => d.resolution_status !== "open");

          return (
            <div key={v.id} className="rounded-lg border">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : v.id)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-accent transition-colors rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <ResultIcon className={`h-5 w-5 ${resultColor} shrink-0`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {RESULT_LABELS[v.result || ""] || v.status}
                      </span>
                      {v.confidence_score != null && (
                        <span className="text-xs text-muted-foreground">
                          {Math.round(v.confidence_score)}%
                        </span>
                      )}
                      {allResolved && (
                        <Badge className="text-xs bg-emerald-100 text-emerald-700 border-0">
                          Tutto risolto
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(v.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                      {v.items_mismatched ? ` · ${v.items_mismatched} discrepanz${v.items_mismatched === 1 ? "a" : "e"}` : ""}
                    </p>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {isExpanded && (
                <div className="px-3 pb-3">
                  <VerificationResultCard
                    data={mapToVerificationData(v, discrepancies)}
                    showActions={true}
                  />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Map DB records to VerificationData ────────────────────────────────────

function mapToVerificationData(
  v: VerificationRecord,
  discrepancies: DiscrepancyRecord[],
): VerificationData {
  return {
    verification_id: v.id,
    result: (v.result as VerificationData["result"]) || "mismatch",
    confidence_score: v.confidence_score || 0,
    summary: v.overall_summary || "",
    total_items_checked: v.total_items_checked || 0,
    items_matched: v.items_matched || 0,
    items_mismatched: v.items_mismatched || 0,
    items_missing: v.items_missing || 0,
    items_extra: v.items_extra || 0,
    discrepancies: discrepancies.map((d): Discrepancy => ({
      id: d.id,
      type: d.discrepancy_type,
      severity: d.severity as Discrepancy["severity"],
      item_reference: d.item_reference || "",
      field_name: d.field_name || "",
      expected_value: d.expected_value || "",
      actual_value: d.actual_value || "",
      explanation: d.ai_explanation || "",
      suggestion: d.ai_suggestion || "",
      confidence: d.ai_confidence || 0,
      resolution_status: d.resolution_status || "open",
      resolution_notes: d.resolution_notes || undefined,
    })),
    processing_time_ms: v.processing_time_ms || undefined,
    tokens_used: v.ai_tokens_used || undefined,
  };
}
