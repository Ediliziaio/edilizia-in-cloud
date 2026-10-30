// src/components/orders/generali/PercorsoGenerale.tsx
// In cima a una commessa che sta dentro una generale: la strada per tornare alla generale
// e per passare alle commesse sorelle (precedente, successiva, oppure una qualsiasi dall'elenco).
// Se la commessa non è dentro una generale, o la lettura fallisce, non mostra niente.
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGeneraleDellaCommessa, useRiepilogoGenerale } from "@/hooks/useCommesseGenerali";
import { nomeCriterio, useQuoteCostiComuni } from "@/hooks/useQuoteCostiComuni";
import { DEFINIZIONI_MODELLI, formattaEuro } from "@/lib/orders/commesseGenerali";
import { cn } from "@/lib/utils";

export function PercorsoGenerale({ orderId }: { orderId: string }) {
  const { data: g } = useGeneraleDellaCommessa(orderId);
  const navigate = useNavigate();
  const { data: r } = useRiepilogoGenerale(g?.id);
  const quote = useQuoteCostiComuni(r);
  if (!g) return null;
  const figlia = r?.figlie.find((f) => f.id === orderId) ?? null;
  const quota = quote?.perFiglia.get(orderId) ?? null;
  const mostraQuota = !!quote && quote.totale > 0 && !!quota && !!r?.permessi.margini && !figlia?.divisa;
  const pieno = figlia?.margine != null && quota ? figlia.margine - quota.importo : null;

  const def = g.modello ? DEFINIZIONI_MODELLI[g.modello] : null;
  const indice = g.sorelle.findIndex((s) => s.id === orderId);
  const prima = indice > 0 ? g.sorelle[indice - 1] : null;
  const dopo = indice >= 0 && indice < g.sorelle.length - 1 ? g.sorelle[indice + 1] : null;
  const etichetta = (s: { codice: string | null; nome: string }) => [s.codice, s.nome].filter(Boolean).join(" · ");
  const vai = (id: string) => navigate(`/azienda/ordini/${id}`);

  return (
    <nav aria-label="Commessa generale" className="px-3 pt-2 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-2 py-1.5">
        <Link
          to={`/azienda/ordini/${g.id}`}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-muted"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">
            <span className="text-muted-foreground">{def ? `${def.nome}: ` : "Parte di "}</span>
            <span className="font-medium">{[g.codice, g.nome].filter(Boolean).join(" · ")}</span>
          </span>
        </Link>

        {g.sorelle.length > 1 && indice >= 0 && (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              disabled={!prima} onClick={() => prima && vai(prima.id)}
              aria-label={prima ? `Precedente: ${etichetta(prima)}` : "Nessuna precedente"}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={orderId} onValueChange={vai}>
              <SelectTrigger className="h-7 w-auto min-w-[7rem] max-w-[16rem] gap-1 text-xs" aria-label={`Vai a un altro ${def?.figlia.una ?? "lavoro"}`}>
                <SelectValue>
                  {indice + 1} di {g.sorelle.length}
                  <span className="hidden sm:inline"> · {def?.figlia.tante.toLowerCase() ?? "commesse"}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end" className="max-h-80">
                {g.sorelle.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">{etichetta(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost" size="icon" className="h-7 w-7"
              disabled={!dopo} onClick={() => dopo && vai(dopo.id)}
              aria-label={dopo ? `Successiva: ${etichetta(dopo)}` : "Nessuna successiva"}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      {mostraQuota && (
        // La parte dei costi registrati sulla generale (terreno, oneri, costi di cantiere) che tocca a questa commessa.
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border border-dashed bg-muted/30 px-3 py-1.5 text-xs">
          <span>
            Quota dei costi comuni: <span className="font-medium tabular-nums">{formattaEuro(quota!.importo)}</span>
            <span className="text-muted-foreground"> ({Math.round(quota!.parte * 1000) / 10}% di {formattaEuro(quote!.totale)}, {nomeCriterio(quote!.criterio)})</span>
          </span>
          {figlia?.margine != null && pieno !== null && (
            <span>
              Margine diretto <span className="tabular-nums">{formattaEuro(figlia.margine)}</span> → margine pieno{" "}
              <span className={cn("font-semibold tabular-nums", pieno < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400")}>{formattaEuro(pieno)}</span>
            </span>
          )}
        </p>
      )}
    </nav>
  );
}
