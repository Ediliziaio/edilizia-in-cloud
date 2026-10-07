/**
 * Le rate del cliente nello step Economia dei Serramenti, in poco spazio (06/10/2026): una riga per rata con
 * nome, «quando», percentuale e IMPORTO in € accanto alla percentuale. Su telefono la riga sta su due righe
 * (nome, % e cestino; sotto «quando» e importo); da tablet in su è una riga sola.
 *
 * L'ultima rata chiude il conto: quando si cambia un'altra rata, l'ultima si ribilancia da sola per arrivare a
 * 100, e le percentuali scritte dall'utente nelle altre righe non si toccano. Scrivendo NELL'ultima si decide
 * quanto vale lei, e il «Totale» dice se fa 100 (le regole sono in `lib/serramenti/ratePagamento.ts`).
 * «Dividi in parti uguali» rimette tutte le rate alla stessa percentuale.
 *
 * Il componente non tiene nessuno stato: legge le rate del preventivo e dà le rate nuove a chi lo usa
 * (`onChange`), che le scrive subito nel preventivo. La forma resta {label, percentuale, when}.
 */
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/serramenti/format";
import {
  dividiInPartiUguali, importoRata, ribilanciaUltimaRata, totalePercentuali,
} from "@/lib/serramenti/ratePagamento";
import type { SrPagamentoMilestone } from "@/types/serramenti";

interface Props {
  rate: SrPagamentoMilestone[];
  /** Il totale del documento, IVA inclusa: su questo si calcola l'importo di ogni rata. */
  totale: number;
  onChange: (rate: SrPagamentoMilestone[]) => void;
}

/** Telefono: 2 righe (nome · % · cestino / quando · importo). Da tablet: nome · quando · % · importo · cestino. */
const GRIGLIA = "grid grid-cols-[minmax(0,1fr)_4.75rem_auto] gap-x-2 gap-y-1.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_5rem_6rem_2.25rem]";

export function RatePagamento({ rate, totale, onChange }: Props) {
  const ultima = rate.length - 1;
  const totalePct = totalePercentuali(rate);
  const ok = totalePct === 100;
  const scarto = Math.round(Math.abs(totalePct - 100) * 100) / 100;

  const modifica = (i: number, patch: Partial<SrPagamentoMilestone>) =>
    onChange(rate.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const scriviPercentuale = (i: number, valore: number) => {
    const prossime = rate.map((r, j) => (j === i ? { ...r, percentuale: valore } : r));
    // Nell'ultima si decide quanto vale lei; in un'altra, l'ultima chiude il conto.
    onChange(i === ultima ? prossime : ribilanciaUltimaRata(prossime));
  };

  return (
    <div className="space-y-2">
      {rate.length > 0 && (
        <div aria-hidden="true" className={cn(GRIGLIA, "px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground max-md:hidden")}>
          <span>Step</span>
          <span>Quando</span>
          <span>%</span>
          <span className="text-right">Importo</span>
          <span />
        </div>
      )}

      <ol className="space-y-2 max-md:space-y-3">
        {/* Le righe sono tutte campi controllati: la chiave per posto basta, i valori vengono dalle rate. */}
        {rate.map((r, i) => {
          const n = i + 1;
          return (
            <li key={i} className={cn(GRIGLIA, "items-center")}>
              <Input
                value={r.label}
                onChange={(e) => modifica(i, { label: e.target.value })}
                aria-label={`Nome dello step ${n}`}
                placeholder="es. Acconto alla firma"
                className="col-start-1 row-start-1 h-9 min-w-0 text-xs md:text-xs"
              />
              <Input
                value={r.when ?? ""}
                onChange={(e) => modifica(i, { when: e.target.value || null })}
                aria-label={`Quando, step ${n}`}
                placeholder="Quando: es. Consegna materiale"
                className="col-start-1 row-start-2 h-9 min-w-0 text-xs md:col-start-2 md:row-start-1 md:text-xs"
              />
              <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-1 md:col-start-3">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0} max={100} step={5}
                  value={r.percentuale}
                  onChange={(e) => scriviPercentuale(i, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  aria-label={`Percentuale dello step ${n}`}
                  className="h-9 min-w-0 px-2 text-right text-xs tabular-nums md:text-xs"
                />
                <span aria-hidden="true" className="text-xs text-muted-foreground">%</span>
              </div>
              {/* Lo stesso conto del PDF: totale IVA inclusa × percentuale. */}
              <p
                className="col-span-2 col-start-2 row-start-2 text-right text-xs font-semibold tabular-nums text-slate-800 md:col-span-1 md:col-start-4 md:row-start-1"
                title="Importo della rata, IVA inclusa"
              >
                <span className="sr-only">Importo dello step {n}, IVA inclusa: </span>
                {formatEuro(importoRata(totale, r.percentuale))}
              </p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onChange(ribilanciaUltimaRata(rate.filter((_, j) => j !== i)))}
                disabled={rate.length <= 1}
                className="col-start-3 row-start-1 h-9 w-9 justify-self-end text-rose-600 hover:bg-rose-50 md:col-start-5"
                title="Rimuovi step"
                aria-label={`Rimuovi lo step ${n}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange(ribilanciaUltimaRata([...rate, { label: "", percentuale: 0, when: null }]))}
          className="gap-1 text-xs"
        >
          <Plus className="h-3.5 w-3.5" /> Aggiungi step
        </Button>
        {rate.length >= 2 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange(dividiInPartiUguali(rate))}
            className="text-xs"
          >
            Dividi in parti uguali
          </Button>
        )}
        <div
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-bold max-md:w-full md:ml-auto",
            ok ? "text-emerald-700" : "text-amber-600",
          )}
          role="status"
          aria-live="polite"
        >
          {ok && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />}
          Totale: {totalePct}%
          {!ok && (
            <span className="ml-1 text-xs font-normal">
              ({totalePct > 100 ? `−${scarto}%` : `+${scarto}%`} per arrivare a 100%)
            </span>
          )}
          <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground md:ml-2">
            {formatEuro(importoRata(totale, totalePct))}<span className="max-sm:hidden"> IVA inclusa</span>
          </span>
        </div>
      </div>
    </div>
  );
}
