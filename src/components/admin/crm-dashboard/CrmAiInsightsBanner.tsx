/**
 * Banner "Riepilogo AI" della Dashboard commerciale.
 *
 * Riceve dalla pagina lo snapshot delle metriche già calcolate (`metrics`) e,
 * SU RICHIESTA (bottone — niente chiamate AI automatiche ad ogni caricamento),
 * invoca l'edge function crm-ai-insights che restituisce 3-5 insight azionabili.
 * Best-effort: errori/funzione non deployata → messaggio neutro, niente crash.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw, Lightbulb } from "lucide-react";

export function CrmAiInsightsBanner({ metrics }: { metrics: Record<string, unknown> }) {
  const [insights, setInsights] = useState<string[] | null>(null);
  const [errored, setErrored] = useState(false);

  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ insights?: string[] }>("crm-ai-insights", {
        body: { metrics },
      });
      if (error) throw error;
      return Array.isArray(data?.insights) ? data.insights : [];
    },
    onSuccess: (d) => {
      setInsights(d);
      setErrored(false);
    },
    onError: () => setErrored(true),
  });

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Riepilogo AI del periodo
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className="h-8 gap-1.5"
          >
            {m.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : insights ? (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {insights ? "Rigenera" : "Genera"}
          </Button>
        </div>

        <div className="mt-3 text-sm">
          {m.isPending ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> L'AI sta leggendo i tuoi numeri…
            </p>
          ) : insights && insights.length > 0 ? (
            <ul className="space-y-1.5">
              {insights.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          ) : insights ? (
            <p className="text-muted-foreground">Non ci sono ancora abbastanza dati per un riepilogo utile.</p>
          ) : errored ? (
            <p className="text-muted-foreground">Riepilogo AI non disponibile al momento.</p>
          ) : (
            <p className="text-muted-foreground">
              Premi <strong>Genera</strong> per far analizzare all'AI i numeri della dashboard: rischi, opportunità e
              prossime mosse, in 3-5 frasi.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
