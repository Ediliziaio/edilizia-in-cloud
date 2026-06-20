/**
 * SimKpiBar — striscia di metric card riassuntive dell'editor simulazione.
 *
 * 5 KPI affiancate (responsive) lette dallo `SimulazioneRisultato`:
 *   Costo totale · Ricavo · Margine (% + valore, verde) · Prezzo cliente
 *   (con l'aliquota IVA attiva) · Rata (— se nessun finanziamento).
 *
 * Stile metric card coerente con il Cruscotto: contenitore `bg-secondary`,
 * label muted 12–13px, numero ~22px. Numeri sempre arrotondati via formatCurrency.
 */
import type { ComponentType } from "react";
import { Banknote, TrendingUp, Wallet, Receipt, CalendarClock } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { SimulazioneRisultato } from "@/lib/simulatore/tipi";

interface SimKpiBarProps {
  risultato: SimulazioneRisultato;
  /** Aliquota IVA attiva, mostrata come sottotitolo del prezzo cliente. */
  ivaRate: number;
}

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  accent?: "default" | "success";
}

function MetricCard({ label, value, hint, icon: Icon, accent = "default" }: MetricCardProps) {
  return (
    <div className="rounded-lg border bg-secondary/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground sm:text-[13px]">{label}</span>
        <Icon
          className={cn(
            "h-4 w-4",
            accent === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
          )}
        />
      </div>
      <p
        className={cn(
          "mt-2 text-[21px] font-bold leading-tight tabular-nums sm:text-2xl",
          accent === "success" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function fmtPct(pct: number): string {
  return `${(Math.round(pct * 10) / 10).toLocaleString("it-IT")}%`;
}

export function SimKpiBar({ risultato, ivaRate }: SimKpiBarProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <MetricCard
        label="Costo totale"
        value={formatCurrency(risultato.costo_totale)}
        icon={Wallet}
      />
      <MetricCard
        label="Ricavo"
        value={formatCurrency(risultato.ricavo_imponibile)}
        hint="imponibile"
        icon={Banknote}
      />
      <MetricCard
        label="Margine"
        value={fmtPct(risultato.margine_pct)}
        hint={formatCurrency(risultato.margine_valore)}
        icon={TrendingUp}
        accent="success"
      />
      <MetricCard
        label="Prezzo cliente"
        value={formatCurrency(risultato.prezzo_cliente)}
        hint={`IVA ${fmtPct(ivaRate)} inclusa`}
        icon={Receipt}
      />
      <MetricCard
        label="Rata"
        value={risultato.rata_mensile != null ? formatCurrency(risultato.rata_mensile) : "—"}
        hint={risultato.rata_mensile != null ? "al mese" : "nessun finanziamento"}
        icon={CalendarClock}
      />
    </div>
  );
}
