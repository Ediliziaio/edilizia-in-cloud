/**
 * SimKpiBar — striscia di metric card riassuntive dell'editor simulazione.
 *
 * 5 KPI affiancate (responsive) lette dallo `SimulazioneRisultato`, con gerarchia
 * e colore semantico (non più 5 card grigie identiche):
 *   - Costo totale — neutra (slate), icona in chip.
 *   - Ricavo — accento blu (sky).
 *   - Margine NETTO — EROE: la card si colora in base al valore (verde ≥20%,
 *     ambra 5–20%, rosso <10%); mostra % grande + valore € sotto. Quando il
 *     ricavo è 0 (simulazione vuota) mostra "—" neutro, mai "0%" allarmante.
 *   - Prezzo cliente — evidenziata (accento primary), è il numero per il cliente;
 *     sotto l'aliquota IVA inclusa.
 *   - Rata — accento sky; "—" se nessun finanziamento.
 *
 * Sotto-riga compatta "Sconto" / "Spese generali" se > 0.
 *
 * Card su `bg-card border rounded-xl`: label muted piccola, numero grande
 * (text-2xl font-semibold), icona colorata in un chip in alto a destra. Numeri
 * sempre arrotondati via formatCurrency. Dark-mode supportato.
 */
import type { ComponentType } from "react";
import { Banknote, TrendingUp, Wallet, Receipt, CalendarClock, Percent, Layers } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { SimulazioneRisultato } from "@/lib/simulatore/tipi";

interface SimKpiBarProps {
  risultato: SimulazioneRisultato;
  /** Aliquota IVA attiva, mostrata come sottotitolo del prezzo cliente. */
  ivaRate: number;
}

type Tone = "neutral" | "sky" | "emerald" | "amber" | "rose" | "primary";

/** Palette per tono: chip icona + (opzionale) sfondo/bordo card per le card "tinte". */
const CHIP: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400",
  primary: "bg-primary/15 text-primary",
};

/** Card "tinte" (margine eroe + prezzo cliente): sfondo + bordo + colore numero. */
const FILLED: Record<Tone, { card: string; value: string }> = {
  neutral: { card: "", value: "" },
  sky: { card: "", value: "" },
  emerald: {
    card: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/30",
    value: "text-emerald-700 dark:text-emerald-300",
  },
  amber: {
    card: "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30",
    value: "text-amber-700 dark:text-amber-300",
  },
  rose: {
    card: "border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/30",
    value: "text-rose-700 dark:text-rose-300",
  },
  primary: {
    card: "border-primary/30 bg-primary/5 ring-1 ring-primary/15 dark:bg-primary/10",
    value: "text-primary",
  },
};

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  /** Tono del chip icona. */
  chipTone?: Tone;
  /** Se valorizzato, la card è "tinta" (sfondo + numero colorati). */
  fillTone?: Tone;
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  chipTone = "neutral",
  fillTone,
}: MetricCardProps) {
  const fill = fillTone ? FILLED[fillTone] : null;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-colors",
        fill?.card,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
          {label}
        </span>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            CHIP[chipTone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p
        className={cn(
          "mt-2 text-xl font-semibold leading-tight tabular-nums sm:text-2xl",
          fill?.value,
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{hint}</p>
      ) : null}
    </div>
  );
}

function fmtPct(pct: number): string {
  return `${(Math.round(pct * 10) / 10).toLocaleString("it-IT")}%`;
}

/** Semaforo margine per la card eroe: verde ≥20%, ambra 5–20%, rosso <5%. */
function margineTone(pct: number): Tone {
  if (pct >= 20) return "emerald";
  if (pct >= 5) return "amber";
  return "rose";
}

export function SimKpiBar({ risultato, ivaRate }: SimKpiBarProps) {
  const hasSpese = risultato.spese_generali > 0;
  const hasSconto = risultato.sconto_valore > 0;
  // Simulazione "vuota": nessun ricavo → il margine % non è significativo (mostriamo "—").
  const hasRicavo = risultato.ricavo_imponibile > 0;
  const margineToneValue = hasRicavo ? margineTone(risultato.margine_pct) : "neutral";

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Costo totale"
          value={formatCurrency(risultato.costo_totale)}
          hint={hasSpese ? `+ spese ${formatCurrency(risultato.spese_generali)}` : "diretto"}
          icon={Wallet}
          chipTone="neutral"
        />
        <MetricCard
          label="Ricavo"
          value={formatCurrency(risultato.ricavo_imponibile)}
          hint={hasSconto ? `− sconto ${formatCurrency(risultato.sconto_valore)}` : "imponibile"}
          icon={Banknote}
          chipTone="sky"
        />
        <MetricCard
          label="Margine"
          value={hasRicavo ? fmtPct(risultato.margine_pct) : "—"}
          hint={hasRicavo ? formatCurrency(risultato.margine_valore) : "nessun ricavo"}
          icon={TrendingUp}
          chipTone={margineToneValue}
          fillTone={margineToneValue}
        />
        <MetricCard
          label="Prezzo cliente"
          value={formatCurrency(risultato.prezzo_cliente)}
          hint={`IVA ${fmtPct(ivaRate)} inclusa`}
          icon={Receipt}
          chipTone="primary"
          fillTone="primary"
        />
        <MetricCard
          label="Rata"
          value={risultato.rata_mensile != null ? formatCurrency(risultato.rata_mensile) : "—"}
          hint={risultato.rata_mensile != null ? "al mese" : "nessun finanziamento"}
          icon={CalendarClock}
          chipTone={risultato.rata_mensile != null ? "sky" : "neutral"}
        />
      </div>

      {/* Sotto-riga compatta: sconto / spese generali se presenti. */}
      {hasSconto || hasSpese ? (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
          {hasSconto ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 tabular-nums">
              <Percent className="h-3.5 w-3.5 text-rose-500" />
              Sconto {formatCurrency(risultato.sconto_valore)}
            </span>
          ) : null}
          {hasSpese ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 tabular-nums">
              <Layers className="h-3.5 w-3.5 text-slate-500" />
              Spese generali {formatCurrency(risultato.spese_generali)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
