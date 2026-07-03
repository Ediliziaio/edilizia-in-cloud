/**
 * FinanziamentoQuoteToggle — interruttore PER-PREVENTIVO della rata nel PDF.
 *
 * Prima il toggle appariva SEMPRE con un testo astratto ("vale solo se la
 * promo è attiva nel template"): il venditore non poteva sapere se la promo
 * fosse configurata, e accenderlo poteva essere un no-op silenzioso. Ora:
 *   - se la company NON ha configurato la promo nel template → NON compare
 *     (niente scelta finta);
 *   - se è configurata → mostra la rata CONCRETA calcolata sul totale attuale,
 *     così il venditore vede esattamente cosa uscirà, e può spegnerla per i
 *     clienti che pagano subito.
 */
import { Switch } from "@/components/ui/switch";
import { BadgeEuro } from "lucide-react";
import {
  parseFinanziamentoPromo,
  calcolaRataMensile,
} from "@/lib/preventivi/finanziamentoLite";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  /** Valore grezzo finanziamento_promo dal template del modulo. */
  rawPromo: unknown;
  /** Totale del preventivo corrente (per la rata di anteprima). */
  total: number;
  /** null/true = mostra, false = nascondi (default mostra se promo attiva). */
  value: boolean | null | undefined;
  onChange: (next: boolean) => void;
}

export function FinanziamentoQuoteToggle({ rawPromo, total, value, onChange }: Props) {
  const promo = parseFinanziamentoPromo(rawPromo);
  if (!promo) return null; // company senza promo → nessun toggle fuorviante

  const rata = calcolaRataMensile(total, promo.rate, promo.tan_pct);
  const checked = value !== false;

  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <BadgeEuro className="h-3.5 w-3.5 text-emerald-600" />
          Mostra la rata nel PDF
        </span>
        <span className="block text-[10px] text-muted-foreground">
          {rata > 0
            ? `“da ${formatCurrency(rata)}/mese” in ${promo.rate} rate${promo.tan_pct > 0 ? ` (TAN ${promo.tan_pct}%)` : " a tasso zero"} — spegni per chi paga subito.`
            : `Aggiungi voci al computo per calcolare la rata (${promo.rate} rate).`}
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
