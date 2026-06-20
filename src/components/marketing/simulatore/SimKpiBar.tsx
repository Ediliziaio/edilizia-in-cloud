/**
 * SimKpiBar — striscia di metric card riassuntive dell'editor simulazione.
 *
 * 5 KPI affiancate (responsive) lette dallo `SimulazioneRisultato`, con gerarchia
 * e colore di brand (non più 5 card grigie identiche):
 *   - Costo totale — neutra, icona in chip muted.
 *   - Ricavo — accento brand (primary).
 *   - Margine NETTO — EROE: la card si colora in base al valore via palette chart
 *     (verde chart-2 ≥20%, arancio chart-3 5–20%, rosso chart-5 <5%); mostra %
 *     grande + valore € sotto. Quando il ricavo è 0 (simulazione vuota) mostra
 *     "—" neutro, mai "0%" allarmante.
 *   - Prezzo cliente — evidenziata (accento primary), è il numero per il cliente;
 *     sotto l'aliquota IVA inclusa.
 *   - Rata — accento brand (primary); "—" se nessun finanziamento.
 *
 * Sotto-riga compatta "Sconto" / "Spese generali" se > 0.
 *
 * Card su `bg-card border rounded-xl`: label muted piccola, numero grande
 * (text-2xl font-semibold), icona colorata in un chip in alto a destra. Numeri
 * sempre arrotondati via formatCurrency. Dark-mode supportato.
 */
import type { ComponentType } from "react";
import { Banknote, TrendingUp, Wallet, Receipt, CalendarClock, Percent, Layers, HandCoins } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { SimulazioneRisultato } from "@/lib/simulatore/tipi";

interface SimKpiBarProps {
  risultato: SimulazioneRisultato;
  /** Aliquota IVA attiva, mostrata come sottotitolo del prezzo cliente. */
  ivaRate: number;
}

/**
 * Tono del chip icona: brand (`primary`) per le card in risalto, neutro per le
 * informative. Niente colori hardcoded: si appoggia ai token tema (white-label).
 */
type ChipTone = "neutral" | "primary";

const CHIP: Record<ChipTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
};

/**
 * Semaforo margine (l'UNICA card con colore semantico): verde ≥20%, arancio
 * 5–20%, rosso <5%. Reso via palette chart ufficiale così resta coerente col
 * brand e con il dark-mode (i token --chart-N hanno la variante .dark).
 */
type Semaforo = "buono" | "medio" | "perdita";

/** Var CSS chart per il semaforo: verde chart-2, arancio chart-3, rosso chart-5. */
function semaforoVar(s: Semaforo): string {
  if (s === "buono") return "var(--chart-2)";
  if (s === "medio") return "var(--chart-3)";
  return "var(--chart-5)";
}

interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  /** Tono del chip icona (brand o neutro). */
  chipTone?: ChipTone;
  /** Card "prezzo cliente": evidenziata con accento brand (primary). */
  highlight?: boolean;
  /** Card "margine": colore semantico via palette chart (sfondo + numero). */
  semaforo?: Semaforo;
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  chipTone = "neutral",
  highlight,
  semaforo,
}: MetricCardProps) {
  // Margine: tinta semantica derivata dal token chart (sfondo 8% + bordo 30%).
  const hsl = semaforo ? `hsl(${semaforoVar(semaforo)})` : undefined;
  const semaforoStyle = hsl
    ? {
        backgroundColor: `hsl(${semaforoVar(semaforo!)} / 0.08)`,
        borderColor: `hsl(${semaforoVar(semaforo!)} / 0.30)`,
      }
    : undefined;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-colors",
        highlight && "border-primary/30 bg-primary/5 ring-1 ring-primary/15 dark:bg-primary/10",
      )}
      style={semaforoStyle}
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
          // Per il margine il chip riprende il colore semantico chart.
          style={hsl ? { backgroundColor: `hsl(${semaforoVar(semaforo!)} / 0.12)`, color: hsl } : undefined}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p
        className={cn(
          "mt-2 text-xl font-semibold leading-tight tabular-nums sm:text-2xl",
          highlight && "text-primary",
        )}
        style={hsl ? { color: hsl } : undefined}
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

/** Semaforo margine per la card eroe: verde ≥20%, arancio 5–20%, rosso <5%. */
function margineSemaforo(pct: number): Semaforo {
  if (pct >= 20) return "buono";
  if (pct >= 5) return "medio";
  return "perdita";
}

export function SimKpiBar({ risultato, ivaRate }: SimKpiBarProps) {
  const hasSpese = risultato.spese_generali > 0;
  const hasSconto = risultato.sconto_valore > 0;
  const hasProvvigioni = risultato.provvigioni_totale > 0;
  // Simulazione "vuota": nessun ricavo → il margine % non è significativo (mostriamo "—").
  const hasRicavo = risultato.ricavo_imponibile > 0;
  const margineSemaforoValue = hasRicavo ? margineSemaforo(risultato.margine_pct) : undefined;

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
          chipTone="primary"
        />
        <MetricCard
          label="Margine"
          value={hasRicavo ? fmtPct(risultato.margine_pct) : "—"}
          hint={hasRicavo ? formatCurrency(risultato.margine_valore) : "nessun ricavo"}
          icon={TrendingUp}
          semaforo={margineSemaforoValue}
        />
        <MetricCard
          label="Prezzo cliente"
          value={formatCurrency(risultato.prezzo_cliente)}
          hint={`IVA ${fmtPct(ivaRate)} inclusa`}
          icon={Receipt}
          chipTone="primary"
          highlight
        />
        <MetricCard
          label="Rata"
          value={risultato.rata_mensile != null ? formatCurrency(risultato.rata_mensile) : "—"}
          hint={risultato.rata_mensile != null ? "al mese" : "nessun finanziamento"}
          icon={CalendarClock}
          chipTone={risultato.rata_mensile != null ? "primary" : "neutral"}
        />
      </div>

      {/* Sotto-riga compatta: sconto / spese generali / provvigioni se presenti.
          Chip tenui in tinta brand; le icone di sconto/provvigioni (voci che
          erodono il margine) usano il rosso semantico chart-5. */}
      {hasSconto || hasSpese || hasProvvigioni ? (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
          {hasSconto ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 tabular-nums">
              <Percent className="h-3.5 w-3.5" style={{ color: "hsl(var(--chart-5))" }} />
              Sconto {formatCurrency(risultato.sconto_valore)}
            </span>
          ) : null}
          {hasSpese ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 tabular-nums">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              Spese generali {formatCurrency(risultato.spese_generali)}
            </span>
          ) : null}
          {hasProvvigioni ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 tabular-nums">
              <HandCoins className="h-3.5 w-3.5" style={{ color: "hsl(var(--chart-5))" }} />
              Provvigioni {formatCurrency(risultato.provvigioni_totale)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
