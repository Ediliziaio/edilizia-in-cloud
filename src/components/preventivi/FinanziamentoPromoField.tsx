/**
 * FinanziamentoPromoField — configurazione della promo finanziamento nel
 * template PDF dei moduli (sezione Opzioni): attiva/disattiva, numero rate,
 * TAN. Scrive il jsonb `finanziamento_promo` (migration 20271130000000);
 * il PDF calcola "da €X/mese" sul totale del singolo preventivo.
 *
 * Legge il valore CORRENTE dal template raw (non dal form: gli editor non
 * idratano questo campo nel loro FormState) e salva tramite la `set` del
 * form host — lo spread al salvataggio include la chiave solo se toccata,
 * quindi non sporca gli upsert altrui.
 */
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BadgeEuro } from "lucide-react";
import {
  parseFinanziamentoPromo,
  calcolaRataMensile,
  FINANZIAMENTO_RATE_OPZIONI,
  type FinanziamentoPromo,
} from "@/lib/preventivi/finanziamentoLite";
import { formatCurrency } from "@/lib/formatters";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  /** Valore raw dal template (colonna jsonb, può essere null). */
  rawValue: unknown;
  /** Scrive il nuovo jsonb nel form host (chiave finanziamento_promo). */
  onChange: (next: FinanziamentoPromo) => void;
}

export function FinanziamentoPromoField({ rawValue, onChange }: Props) {
  const t = useT();
  const parsed = parseFinanziamentoPromo(rawValue);
  const [local, setLocal] = useState<FinanziamentoPromo>(
    parsed ?? { attivo: false, rate: 24, tan_pct: 0 },
  );

  const update = (patch: Partial<FinanziamentoPromo>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange(next);
  };

  // Anteprima su un importo tipo (10.000 €) per far capire l'effetto.
  const rataEsempio = calcolaRataMensile(10000, local.rate, local.tan_pct);

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <BadgeEuro className="h-4 w-4 text-emerald-600" />
            {t("Finanziamento nel PDF")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("Mostra \"da €X/mese\" sotto il totale di ogni preventivo. Simulazione indicativa, con rimando all'approvazione della finanziaria.")}
          </p>
        </div>
        <Switch checked={local.attivo} onCheckedChange={(v) => update({ attivo: v })} />
      </div>
      {local.attivo && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">{t("Numero rate")}</Label>
            <Select value={String(local.rate)} onValueChange={(v) => update({ rate: Number(v) })}>
              <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FINANZIAMENTO_RATE_OPZIONI.map((r) => (
                  <SelectItem key={r} value={String(r)}>{t("{n} mesi", { n: r })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("TAN % (0 = tasso zero)")}</Label>
            <Input
              type="number" min={0} max={30} step={0.1}
              className="h-8 mt-1"
              value={local.tan_pct}
              onChange={(e) => update({ tan_pct: Math.max(0, parseFloat(e.target.value) || 0) })}
            />
          </div>
          <p className="col-span-2 text-[11px] text-muted-foreground">
            {t("Esempio su 10.000 €:")} <span className="font-semibold text-foreground">{t("da {importo}/mese", { importo: formatCurrency(rataEsempio) })}</span> {local.tan_pct > 0 ? t("per {n} mesi (TAN {tan}%).", { n: local.rate, tan: local.tan_pct }) : t("per {n} mesi a tasso zero.", { n: local.rate })}
          </p>
        </div>
      )}
    </div>
  );
}
