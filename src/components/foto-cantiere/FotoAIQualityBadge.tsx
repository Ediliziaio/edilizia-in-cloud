/**
 * FotoAIQualityBadge — GAP 5 (Mobile cantiere AI-native)
 *
 * Componente riutilizzabile che data una foto cantiere mostra:
 *   - Quality score AI (0-10)
 *   - DPI compliance (caschi/scarpe/imbracature/occhiali)
 *   - Problemi rilevati (es. "ponteggio non a norma")
 *
 * Auto-trigger:
 *   - Se la foto ha già `ai_qualita_score` → mostra cached
 *   - Se mancante e `autoAnalyze=true` → invoca ai-foto-cantiere-quality
 *     (costo ~€0.001 per foto via gpt-4o-mini vision)
 *
 * Wire originale: prima esisteva l'edge function ma NON era chiamata da
 * nessun componente (feature ghost). Adesso compare automaticamente sotto
 * ogni foto nuova caricata, dando risposta visiva immediata sull'allineamento
 * sicurezza/qualità del cantiere.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, HardHat, Loader2, Shield, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface FotoQualityRow {
  id: string;
  ai_qualita_score: number | null;
  ai_qualita_livello: string | null;
  ai_dpi_compliance: Record<string, unknown> | null;
  ai_problemi: string[] | null;
  ai_riassunto: string | null;
  ai_analyzed_at: string | null;
}

interface AnalyzeResponse {
  success?: boolean;
  analyzed?: Array<{
    foto_id: string;
    quality_score?: number;
    dpi_compliance?: { presente?: string[]; mancante?: string[] };
    problemi?: string[];
    riassunto?: string;
  }>;
  error?: string;
}

interface Props {
  fotoId: string;
  companyId: string;
  /** Se true (default), invoca l'analisi automaticamente quando la foto non ha score */
  autoAnalyze?: boolean;
  /** Layout: 'compact' (badge solo) o 'full' (badge+dettagli inline) */
  variant?: "compact" | "full";
  className?: string;
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "bg-muted text-muted-foreground border";
  if (score >= 8) return "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (score >= 6) return "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-300";
  if (score >= 4) return "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/30 dark:text-orange-300";
  return "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/30 dark:text-rose-300";
}

function scoreLabel(score: number | null | undefined): string {
  if (score == null) return "—";
  if (score >= 8) return "Eccellente";
  if (score >= 6) return "Buono";
  if (score >= 4) return "Sufficiente";
  return "Critico";
}

export function FotoAIQualityBadge({
  fotoId,
  companyId,
  autoAnalyze = true,
  variant = "compact",
  className,
}: Props) {
  const [optimisticAnalyzed, setOptimisticAnalyzed] = useState(false);

  // Fetch corrente stato AI della foto
  const { data: foto, refetch } = useQuery({
    queryKey: ["foto-ai-quality", fotoId],
    queryFn: async (): Promise<FotoQualityRow | null> => {
      const { data, error } = await supabase
        .from("foto_cantiere" as never)
        .select("id, ai_qualita_score, ai_qualita_livello, ai_dpi_compliance, ai_problemi, ai_riassunto, ai_analyzed_at")
        .eq("id", fotoId)
        .maybeSingle();
      if (error || !data) return null;
      return data as unknown as FotoQualityRow;
    },
    staleTime: 60_000,
  });

  // Mutation per triggare analisi
  const analyze = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<AnalyzeResponse>(
        "ai-foto-cantiere-quality",
        { body: { foto_id: fotoId, company_id: companyId } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      void refetch();
    },
  });

  // Auto-trigger una sola volta se foto è caricata ma non ancora analizzata
  useEffect(() => {
    if (!foto) return;
    if (optimisticAnalyzed) return;
    if (foto.ai_qualita_score != null || foto.ai_analyzed_at != null) return;
    if (analyze.isPending) return;
    if (!autoAnalyze) return;
    setOptimisticAnalyzed(true);
    analyze.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foto, autoAnalyze]);

  // Loading state: foto query non ancora caricata
  if (!foto) {
    return null; // discreto, no spinner per non rumore
  }

  // Analisi in corso
  if (analyze.isPending) {
    return (
      <div className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
        <span>Silvio analizza…</span>
      </div>
    );
  }

  // Analisi non ancora trigger (autoAnalyze=false e mai chiamato)
  if (foto.ai_qualita_score == null) {
    return (
      <button
        type="button"
        onClick={() => analyze.mutate()}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-violet-600 hover:underline",
          className,
        )}
      >
        <Sparkles className="h-3 w-3" />
        Analizza con AI
      </button>
    );
  }

  // Risultato disponibile
  const score = foto.ai_qualita_score;
  const dpi = foto.ai_dpi_compliance ?? {};
  const dpiMancante = (Array.isArray(dpi.mancante) ? dpi.mancante : []) as string[];
  const dpiPresente = (Array.isArray(dpi.presente) ? dpi.presente : []) as string[];
  const problemi = foto.ai_problemi ?? [];
  const hasIssues = problemi.length > 0 || dpiMancante.length > 0;

  // Variante compatta: solo badge score + icona DPI
  if (variant === "compact") {
    return (
      <div className={cn("inline-flex items-center gap-1.5", className)}>
        <Badge variant="outline" className={cn("text-[10px] gap-1", scoreColor(score))}>
          <Sparkles className="h-2.5 w-2.5" />
          {score?.toFixed(1)}/10
        </Badge>
        {dpiMancante.length > 0 ? (
          <Badge variant="outline" className="text-[10px] gap-1 bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertTriangle className="h-2.5 w-2.5" />
            {dpiMancante.length} DPI
          </Badge>
        ) : dpiPresente.length > 0 ? (
          <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-300">
            <Shield className="h-2.5 w-2.5" />
            DPI ok
          </Badge>
        ) : null}
      </div>
    );
  }

  // Variante full
  return (
    <div className={cn("rounded-lg border p-3 space-y-2 bg-background", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold tabular-nums", scoreColor(score))}>
            {score?.toFixed(0)}
          </span>
          <div>
            <p className="text-xs font-medium">Qualità: {scoreLabel(score)}</p>
            {foto.ai_qualita_livello ? (
              <p className="text-[10px] text-muted-foreground">{foto.ai_qualita_livello}</p>
            ) : null}
          </div>
        </div>
        {hasIssues ? (
          <AlertTriangle className="h-4 w-4 text-rose-600" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        )}
      </div>

      {foto.ai_riassunto ? (
        <p className="text-xs text-muted-foreground leading-snug">{foto.ai_riassunto}</p>
      ) : null}

      {/* DPI inline */}
      {(dpiPresente.length > 0 || dpiMancante.length > 0) && (
        <div className="space-y-1">
          {dpiPresente.length > 0 && (
            <div className="flex items-start gap-1.5 text-[10px]">
              <HardHat className="h-3 w-3 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">DPI presenti:</span>{" "}
                <span className="text-muted-foreground">{dpiPresente.join(", ")}</span>
              </div>
            </div>
          )}
          {dpiMancante.length > 0 && (
            <div className="flex items-start gap-1.5 text-[10px]">
              <AlertTriangle className="h-3 w-3 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium text-rose-700 dark:text-rose-400">DPI MANCANTI:</span>{" "}
                <span className="text-muted-foreground">{dpiMancante.join(", ")}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Problemi rilevati */}
      {problemi.length > 0 && (
        <div className="space-y-0.5 pt-1 border-t">
          <p className="text-[10px] font-medium text-rose-700 dark:text-rose-400">
            Problemi rilevati:
          </p>
          <ul className="text-[10px] text-muted-foreground space-y-0.5">
            {problemi.slice(0, 3).map((p, i) => (
              <li key={i}>• {p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default FotoAIQualityBadge;
