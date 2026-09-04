/**
 * Lo scostamento di UNA voce di computo dal prezzario regionale, compatto
 * abbastanza da stare accanto al prezzo senza rubare la scena.
 *
 * Mostra il verdetto solo quando c'è; quando non c'è dice quale delle tre cose
 * è successa — voce non trovata, unità non confrontabile, prezzo assente —
 * invece di sparire lasciando credere che sia tutto in ordine.
 */
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { tonoScostamento, type ConfrontoVoce } from "@/lib/prezzario/confronto";

const MOTIVO_TESTO: Record<NonNullable<ConfrontoVoce["motivo"]>, string> = {
  "nessuna-corrispondenza": "Nessuna voce simile nel prezzario regionale",
  "unita-diversa": "Voce simile trovata, ma con un'altra unità di misura: confrontarle non direbbe niente",
  "prezzo-mancante": "La voce del prezzario non ha un prezzo",
};

export function ScostamentoVoce({ confronto }: { confronto: ConfrontoVoce | undefined }) {
  if (!confronto) return null;

  if (confronto.scostamentoPct == null) {
    const testo = confronto.motivo ? MOTIVO_TESTO[confronto.motivo] : "Non confrontabile";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-[10px] text-muted-foreground">—</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs">
          {testo}
          {confronto.riferimento && (
            <span className="mt-1 block opacity-80">
              {confronto.riferimento.codice ? `${confronto.riferimento.codice} · ` : ""}
              {confronto.riferimento.descrizione.slice(0, 90)}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  const tono = tonoScostamento(confronto.scostamentoPct);
  const colore =
    tono === "sopra" ? "border-amber-200 bg-amber-50 text-amber-700"
      : tono === "sotto" ? "border-sky-200 bg-sky-50 text-sky-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const segno = confronto.scostamentoPct > 0 ? "+" : "";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={`gap-1 text-[10px] font-medium tabular-nums ${colore}`}>
          {confronto.confidenza === "probabile" && <Sparkles className="h-2.5 w-2.5" />}
          {segno}{confronto.scostamentoPct.toFixed(0)}%
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] space-y-1 text-xs">
        <p>
          A prezzario:{" "}
          <strong>{formatCurrency(confronto.riferimento?.prezzo ?? 0)}</strong>
          {confronto.riferimento?.unita_misura ? `/${confronto.riferimento.unita_misura}` : ""}
        </p>
        <p>
          Differenza su questa riga:{" "}
          <strong>{formatCurrency(confronto.scostamentoEuro ?? 0)}</strong>
        </p>
        {confronto.riferimento && (
          <p className="opacity-80">
            {confronto.riferimento.codice ? `${confronto.riferimento.codice} · ` : ""}
            {confronto.riferimento.descrizione.slice(0, 90)}
          </p>
        )}
        {confronto.confidenza === "probabile" && (
          <p className="opacity-80">
            Corrispondenza trovata per somiglianza della descrizione, non per codice:
            controlla che sia davvero la stessa lavorazione.
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
