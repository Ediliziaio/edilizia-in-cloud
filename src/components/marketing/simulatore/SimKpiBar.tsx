/**
 * SimKpiBar — striscia di metric card riassuntive dell'editor simulazione.
 *
 * 5 KPI affiancate (responsive) lette dallo `SimulazioneRisultato`:
 *   Costo totale (con spese generali se >0) · Ricavo (con sconto se >0) ·
 *   Margine NETTO (% + valore, semaforo verde/giallo/rosso) · Prezzo cliente
 *   (con l'aliquota IVA attiva) · Rata (— se nessun finanziamento).
 *
 * Il "Margine" mostra il margine NETTO (`margine_pct`/`margine_valore`, già al
 * netto di sconto e spese generali) col colore a semaforo: verde ≥25%, giallo
 * 10–25%, rosso <10%.
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

type Accent = "default" | "success" | "warning" | "danger";

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  accent?: Accent;
}

const ACCENT_ICON: Record<Accent, string> = {
  default: "text-muted-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-rose-600 dark:text-rose-400",
};

const ACCENT_VALUE: Record<Accent, string> = {
  default: "",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-rose-600 dark:text-rose-400",
};

function MetricCard({ label, value, hint, icon: Icon, accent = "default" }: MetricCardProps) {
  return (
    <div className="rounded-lg border bg-secondary/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground sm:text-[13px]">{label}</span>
        <Icon className={cn("h-4 w-4", ACCENT_ICON[accent])} />
      </div>
      <p
        className={cn(
          "mt-2 text-[21px] font-bold leading-tight tabular-nums sm:text-2xl",
          ACCENT_VALUE[accent],
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

/** Semaforo margine: verde ≥25%, giallo 10–25%, rosso <10%. */
function margineAccent(pct: number): Accent {
  if (pct >= 25) return "success";
  if (pct >= 10) return "warning";
  return "danger";
}

export function SimKpiBar({ risultato, ivaRate }: SimKpiBarProps) {
  const hasSpese = risultato.spese_generali > 0;
  const hasSconto = risultato.sconto_valore > 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <MetricCard
        label="Costo totale"
        value={formatCurrency(risultato.costo_totale)}
        hint={hasSpese ? `+ spese ${formatCurrency(risultato.spese_generali)}` : undefined}
        icon={Wallet}
      />
      <MetricCard
        label="Ricavo"
        value={formatCurrency(risultato.ricavo_imponibile)}
        hint={hasSconto ? `− sconto ${formatCurrency(risultato.sconto_valore)}` : "imponibile"}
        icon={Banknote}
      />
      <MetricCard
        label="Margine"
        value={fmtPct(risultato.margine_pct)}
        hint={formatCurrency(risultato.margine_valore)}
        icon={TrendingUp}
        accent={margineAccent(risultato.margine_pct)}
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
