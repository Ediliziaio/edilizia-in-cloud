/**
 * FinanziamentoQuoteToggle — la rata nel PDF, scelta PER-PREVENTIVO.
 *
 * Prima il toggle appariva SEMPRE con un testo astratto ("vale solo se la
 * promo è attiva nel template"): il venditore non poteva sapere se la promo
 * fosse configurata, e accenderlo poteva essere un no-op silenzioso. Ora:
 *   - se la company NON ha configurato la promo nel template → NON compare
 *     (niente scelta finta);
 *   - se è configurata → mostra la rata CONCRETA calcolata sul totale attuale,
 *     così il venditore vede esattamente cosa uscirà, e può spegnerla per i
 *     clienti che pagano subito;
 *   - acceso, sotto l'interruttore si sceglie il NUMERO DI RATE (06/10/2026):
 *     una fila di tasti con la rata di ciascuno già scritta, così si confronta
 *     e si sceglie con un tocco. Finché non se ne sceglie uno vale quello del
 *     modello; il TAN è sempre quello del modello.
 */
import { Switch } from "@/components/ui/switch";
import { BadgeEuro } from "lucide-react";
import {
  parseFinanziamentoPromo,
  calcolaRataMensile,
  opzioniRate,
  rateDelPreventivo,
} from "@/lib/preventivi/finanziamentoLite";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Props {
  /** Valore grezzo finanziamento_promo dal template del modulo. */
  rawPromo: unknown;
  /** Totale del preventivo corrente (per la rata di anteprima). */
  total: number;
  /** null/true = mostra, false = nascondi (default mostra se promo attiva). */
  value: boolean | null | undefined;
  onChange: (next: boolean) => void;
  /** Le rate scelte per questo preventivo (null/undefined = quelle del modello). */
  rateScelte?: number | null;
  /** Se c'è, sotto l'interruttore compare la scelta del numero di rate. */
  onChangeRate?: (rate: number) => void;
}

export function FinanziamentoQuoteToggle({ rawPromo, total, value, onChange, rateScelte, onChangeRate }: Props) {
  const promo = parseFinanziamentoPromo(rawPromo);
  if (!promo) return null; // company senza promo → nessun toggle fuorviante

  const checked = value !== false;
  const scelte = rateDelPreventivo(rateScelte);
  const rate = scelte ?? promo.rate;
  const rata = calcolaRataMensile(total, rate, promo.tan_pct);

  return (
    <div className="rounded-lg border">
      <label className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <BadgeEuro className="h-3.5 w-3.5 text-emerald-600" />
            Mostra la rata nel PDF
          </span>
          <span className="block text-[10px] text-muted-foreground">
            {rata > 0 ? (
              <>
                <span className="max-sm:hidden">
                  {`“da ${formatCurrency(rata)}/mese” in ${rate} rate${promo.tan_pct > 0 ? ` (TAN ${promo.tan_pct}%)` : " a tasso zero"} — spegni per chi paga subito.`}
                </span>
                {/* Telefono: la rata e basta. */}
                <span className="sm:hidden">{`da ${formatCurrency(rata)}/mese · ${rate} rate`}</span>
              </>
            ) : (
              `Aggiungi voci al computo per calcolare la rata (${rate} rate).`
            )}
          </span>
        </span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </label>

      {checked && onChangeRate && (
        <div className="border-t px-3 py-2">
          <p className="mb-1.5 text-[11px] font-medium text-slate-700">Numero di rate</p>
          <div role="group" aria-label="Numero di rate" className="flex flex-wrap gap-1.5">
            {opzioniRate(promo.rate, scelte).map((n) => {
              const rataN = calcolaRataMensile(total, n, promo.tan_pct);
              const attivo = n === rate;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={attivo}
                  onClick={() => onChangeRate(n)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-left leading-tight transition-colors",
                    attivo
                      ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50",
                  )}
                >
                  <span className="block text-xs font-semibold">{`${n} rate`}</span>
                  <span className="block text-[10px] tabular-nums text-muted-foreground">
                    {rataN > 0 ? `${formatCurrency(rataN)}/mese` : "—"}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Telefono no: la nota sul TAN è per chi sta alla scrivania. */}
          <p className="mt-1.5 text-[10px] text-muted-foreground max-sm:hidden">
            {promo.tan_pct > 0 ? `TAN ${promo.tan_pct}%` : "Tasso zero"}, come nel modello.
            {scelte != null && scelte !== promo.rate ? ` Il modello propone ${promo.rate} rate.` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
