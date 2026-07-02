import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Loader2,
  TrendingUp,
  Users,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";

/** Riga proposta nel formato accettato da ai-quote-supreme. */
export interface AdvisorLine {
  descrizione?: string;
  quantita?: number;
  prezzo_unitario?: number;
  importo?: number;
}

interface AdvisorResult {
  customer_intelligence: {
    customer_name: string | null;
    total_quotes: number;
    accepted_quotes: number;
    avg_acceptance_margin_pct: number | null;
    avg_negotiation_discount_pct: number | null;
    preferred_payment_terms: string | null;
    loyalty_score: number;
  } | null;
  similar_quotes: Array<{
    brain_doc_id: string;
    similarity: number;
    content_preview: string;
    metadata: Record<string, unknown>;
  }>;
  suggested_clauses: Array<{ category: string; title: string; content: string }>;
  pricing_strategy: {
    target_total_eur: number | null;
    suggested_discount_pct: number;
    min_acceptable_margin_pct: number;
    acceptance_band: { p20: number | null; p50: number | null; p80: number | null };
    reasoning: string[];
  };
  warnings: string[];
  confidence: number;
  requires_human_review: boolean;
}

interface Props {
  contactId: string | null;
  clientName: string;
  projectDescription: string;
  projectType: string;
  proposedLines: AdvisorLine[];
  proposedTotal: number;
  /** Margine % calcolato dal builder (null se costi interni non noti). */
  proposedMarginPct: number | null;
}

/**
 * Advisor commerciale AI (ai-quote-supreme, mode=advise): storico margini del
 * cliente, preventivi simili passati, clausole pertinenti e strategia prezzi.
 * On-demand: nessuna chiamata finché l'utente non la chiede (ha un costo AI).
 */
export function QuoteAdvisorPanel({
  contactId,
  clientName,
  projectDescription,
  projectType,
  proposedLines,
  proposedTotal,
  proposedMarginPct,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClauses, setShowClauses] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);

  const canRun = proposedTotal > 0 && proposedLines.length > 0;

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("ai-quote-supreme", {
        body: {
          mode: "advise",
          customer_id: contactId,
          customer_name: contactId ? undefined : clientName || undefined,
          project_description: projectDescription || undefined,
          project_type: projectType || undefined,
          proposed_lines: proposedLines,
          proposed_total: proposedTotal,
          proposed_margin_pct: proposedMarginPct ?? undefined,
        },
      });
      if (fnErr) {
        // Il gate pagamento risponde 402: messaggio onesto, non un errore generico.
        const msg = String(fnErr.message ?? "");
        if (msg.includes("402") || msg.toLowerCase().includes("payment")) {
          setError("Funzione AI a consumo: serve un metodo di pagamento attivo in Impostazioni → AI.");
        } else {
          setError(msg || "Analisi non riuscita. Riprova tra qualche secondo.");
        }
        return;
      }
      setResult(data as AdvisorResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analisi non riuscita. Riprova tra qualche secondo.");
    } finally {
      setLoading(false);
    }
  };

  const strategy = result?.pricing_strategy;
  const intel = result?.customer_intelligence;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          Advisor AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!result && (
          <>
            <p className="text-xs text-muted-foreground">
              Storico margini del cliente, preventivi simili già chiusi e prezzo
              target suggerito.
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={run}
              disabled={!canRun || loading}
              title={canRun ? undefined : "Aggiungi almeno una voce con importo"}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Analisi in corso…
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-1.5" /> Analizza preventivo
                </>
              )}
            </Button>
            {!canRun && (
              <p className="text-[11px] text-muted-foreground">
                Aggiungi voci con importo per attivare l'analisi.
              </p>
            )}
            {error && (
              <p className="text-xs text-destructive flex items-start gap-1">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {error}
              </p>
            )}
          </>
        )}

        {result && strategy && (
          <div className="space-y-3">
            {result.requires_human_review && (
              <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-1.5 text-xs font-medium">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                Revisione umana consigliata
              </div>
            )}

            {/* Strategia prezzi */}
            <div className="space-y-1">
              {strategy.target_total_eur != null && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">Prezzo target</span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(strategy.target_total_eur)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-muted-foreground">Sconto suggerito</span>
                <span className="tabular-nums">{strategy.suggested_discount_pct}%</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-muted-foreground">Margine minimo</span>
                <span className="tabular-nums">{strategy.min_acceptable_margin_pct}%</span>
              </div>
              {strategy.acceptance_band.p20 != null && strategy.acceptance_band.p80 != null && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">Banda accettazione</span>
                  <span className="tabular-nums text-xs">
                    {formatCurrency(strategy.acceptance_band.p20)} – {formatCurrency(strategy.acceptance_band.p80)}
                  </span>
                </div>
              )}
            </div>

            {/* Storico cliente */}
            <div className="border-t pt-2 space-y-1">
              <div className="flex items-center gap-1 text-xs font-medium">
                <Users className="h-3.5 w-3.5" /> Cliente
              </div>
              {intel ? (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Preventivi accettati</span>
                    <span className="tabular-nums">
                      {intel.accepted_quotes}/{intel.total_quotes}
                    </span>
                  </div>
                  {intel.avg_acceptance_margin_pct != null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Margine medio accettato</span>
                      <span className="tabular-nums">{Number(intel.avg_acceptance_margin_pct).toFixed(1)}%</span>
                    </div>
                  )}
                  {intel.avg_negotiation_discount_pct != null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Sconto medio negoziato</span>
                      <span className="tabular-nums">{Number(intel.avg_negotiation_discount_pct).toFixed(1)}%</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Fedeltà</span>
                    <span className="tabular-nums">{intel.loyalty_score}/100</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nessuno storico: valori prudenziali.
                </p>
              )}
            </div>

            {/* Preventivi simili */}
            {result.similar_quotes.length > 0 && (
              <div className="border-t pt-2 space-y-1">
                <div className="flex items-center gap-1 text-xs font-medium">
                  <FileText className="h-3.5 w-3.5" /> Preventivi simili ({result.similar_quotes.length})
                </div>
                {result.similar_quotes.slice(0, 3).map((q) => (
                  <p key={q.brain_doc_id} className="text-[11px] text-muted-foreground line-clamp-2">
                    <Badge variant="outline" className="mr-1 text-[10px] px-1 py-0">
                      {Math.round(q.similarity * 100)}%
                    </Badge>
                    {q.content_preview}
                  </p>
                ))}
              </div>
            )}

            {/* Clausole suggerite */}
            {result.suggested_clauses.length > 0 && (
              <div className="border-t pt-2">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium w-full"
                  onClick={() => setShowClauses((v) => !v)}
                >
                  Clausole suggerite ({result.suggested_clauses.length})
                  {showClauses ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                </button>
                {showClauses && (
                  <ul className="mt-1 space-y-1">
                    {result.suggested_clauses.map((c, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{c.title}</span> — {c.content.slice(0, 120)}
                        {c.content.length > 120 ? "…" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="space-y-1">
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}

            {/* Perché (reasoning) */}
            {strategy.reasoning.length > 0 && (
              <div className="border-t pt-2">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium w-full text-muted-foreground"
                  onClick={() => setShowReasoning((v) => !v)}
                >
                  Perché questi numeri
                  {showReasoning ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                </button>
                {showReasoning && (
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {strategy.reasoning.map((r, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground">{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-[11px] text-muted-foreground">
                Confidenza {Math.round(result.confidence * 100)}%
              </span>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={run} disabled={loading}>
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Ricalcola"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
