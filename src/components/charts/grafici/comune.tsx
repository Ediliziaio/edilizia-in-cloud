/**
 * Pezzi comuni ai grafici del Controllo di Gestione: stessa veste ovunque
 * (fondo a puntini, area sfumata, linea con ombra, tooltip a scheda) e
 * comparsa a cascata dei riquadri. I colori vengono dalle variabili del tema
 * (--chart-N, --border…), così il tema scuro funziona da solo.
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";

export const COLORI_GRAFICO = {
  blu: "hsl(var(--chart-1))",
  verde: "hsl(var(--chart-2))",
  arancio: "hsl(var(--chart-3))",
  viola: "hsl(var(--chart-4))",
  rosso: "hsl(var(--chart-5))",
} as const;

export const TESTO_ASSE = { fontSize: 11, fill: "hsl(var(--muted-foreground))" } as const;

/** Etichette brevi sugli assi: «−200k €», «1,2M €». */
export const euroAsse = (v: number) => formatCurrencyCompact(v);

/** Id SVG validi anche da useId (che contiene i due punti). */
export const idSvg = (base: string) => base.replace(/[^a-zA-Z0-9_-]/g, "");

/**
 * Le <defs> di un grafico: sfumatura per l'area, puntini per il fondo, ombra
 * per la linea. Si chiama come funzione (non come componente) così recharts
 * trova un vero <defs> tra i figli.
 *
 * L'ombra è in userSpaceOnUse: con la regione calcolata sul riquadro della
 * linea, una linea piatta (altezza zero) sparirebbe del tutto.
 */
export function defsGrafico(id: string, colori: Record<string, string>) {
  return (
    <defs>
      {Object.entries(colori).map(([nome, colore]) => (
        <linearGradient key={nome} id={`${id}-sfuma-${nome}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colore} stopOpacity={0.32} />
          <stop offset="70%" stopColor={colore} stopOpacity={0.06} />
          <stop offset="100%" stopColor={colore} stopOpacity={0} />
        </linearGradient>
      ))}
      {Object.entries(colori).map(([nome, colore]) => (
        <linearGradient key={`b-${nome}`} id={`${id}-barra-${nome}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colore} stopOpacity={0.95} />
          <stop offset="100%" stopColor={colore} stopOpacity={0.55} />
        </linearGradient>
      ))}
      <pattern id={`${id}-punti`} width="12" height="12" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="1" fill="hsl(var(--muted-foreground))" fillOpacity={0.22} />
      </pattern>
      <filter id={`${id}-ombra`} filterUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
        <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="hsl(var(--foreground))" floodOpacity={0.14} />
      </filter>
    </defs>
  );
}

interface VoceTooltip {
  name?: string | number;
  value?: number | string | Array<number | string>;
  color?: string;
  dataKey?: string | number | ((obj: unknown) => unknown);
  payload?: Record<string, unknown>;
}

/**
 * Tooltip a scheda: titolo, una riga per serie con il pallino del colore,
 * importi pieni (non compatti). `extra` aggiunge righe sotto (es. «rispetto
 * al mese prima»).
 */
export function TooltipScheda({
  active, payload, label, formato = formatCurrency, extra, nascondi,
}: {
  active?: boolean;
  payload?: VoceTooltip[];
  label?: string | number;
  formato?: (v: number, nome: string) => string;
  extra?: (riga: Record<string, unknown>) => ReactNode;
  /** dataKey da non elencare (serie di servizio, es. l'area sotto la linea). */
  nascondi?: string[];
}) {
  if (!active || !payload?.length) return null;
  const righe = payload.filter((p) => typeof p.value === "number" && !nascondi?.includes(String(p.dataKey)));
  if (righe.length === 0) return null;
  const riga = (payload[0]?.payload ?? {}) as Record<string, unknown>;
  return (
    <div className="min-w-[170px] rounded-xl border bg-popover/95 px-3 py-2 text-xs text-popover-foreground shadow-lg backdrop-blur-sm">
      <p className="mb-1.5 font-semibold">{label}</p>
      <ul className="space-y-1">
        {righe.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center gap-2">
            {/* Le barre hanno per colore la sfumatura («url(#…)»), che in HTML
                non vale: il pallino prende il blu delle barre. */}
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: p.color?.startsWith("url(") ? COLORI_GRAFICO.blu : p.color }}
            />
            <span className="flex-1 text-muted-foreground">{p.name}</span>
            <span className="font-semibold tabular-nums">{formato(p.value as number, String(p.name ?? ""))}</span>
          </li>
        ))}
      </ul>
      {extra?.(riga)}
    </div>
  );
}

/**
 * Riquadro che entra dal basso, uno dopo l'altro (`indice` × 60 ms). Con
 * «meno movimento» attivo nel sistema compare e basta (`motion-safe:`).
 */
export function Comparsa({
  indice = 0, className, children, as: Tag = "div",
}: {
  indice?: number;
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "li";
}) {
  const style: CSSProperties = { animationDelay: `${Math.min(indice, 12) * 60}ms` };
  return (
    <Tag
      className={cn(
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-500",
        className,
      )}
      style={style}
    >
      {children}
    </Tag>
  );
}

/** Pillola della variazione: verde se va nel verso buono, rossa se no. */
export function PillolaVariazione({
  pct, piuEMeglio = true, titolo, className, suScuro, unita = "%", neutra,
}: {
  pct: number | null;
  piuEMeglio?: boolean;
  titolo?: string;
  className?: string;
  /** Su un fondo scuro fisso (pannelli blu notte): colori chiari. */
  suScuro?: boolean;
  /** «%» (variazione relativa, predefinito) o « pt» (differenza fra due percentuali). */
  unita?: string;
  /** Senza giudizio (grigia): per numeri dove salire non è né bene né male, come la spesa. */
  neutra?: boolean;
}) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const buona = neutra || Math.abs(pct) < 0.05 ? null : (pct > 0) === piuEMeglio;
  // 15/11/2026: oltre +999% un moltiplicatore («×58» invece di «+5723%»), che si legge subito.
  const testo = unita === "%" && pct >= 1000
    ? `×${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(1 + pct / 100)}`
    : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${new Intl.NumberFormat("it-IT", { maximumFractionDigits: Math.abs(pct) >= 100 ? 0 : 1 }).format(Math.abs(pct))}${unita}`;
  return (
    <span
      title={titolo}
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none",
        !suScuro && buona === true && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        !suScuro && buona === false && "bg-rose-500/10 text-rose-700 dark:text-rose-400",
        !suScuro && buona === null && "bg-muted text-muted-foreground",
        suScuro && buona === true && "bg-emerald-400/15 text-emerald-300",
        suScuro && buona === false && "bg-rose-400/15 text-rose-300",
        suScuro && buona === null && "bg-white/10 text-white/70",
        className,
      )}
    >
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "="} {testo}
    </span>
  );
}

/** Una statistica della riga sopra il grafico: etichetta piccola, numero, nota. */
export function StatGrafico({
  etichetta, valore, nota, tono = "neutro",
}: {
  etichetta: string;
  valore: ReactNode;
  nota?: ReactNode;
  tono?: "neutro" | "buono" | "cattivo";
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{etichetta}</p>
      <p
        className={cn(
          "text-sm font-bold tabular-nums leading-tight sm:text-base",
          tono === "buono" && "text-emerald-600 dark:text-emerald-400",
          tono === "cattivo" && "text-rose-600 dark:text-rose-400",
        )}
      >
        {valore}
      </p>
      {nota && <p className="truncate text-[10px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

/** Testo della legenda nel colore del tema (con la sfumatura restava nero). */
export const testoLegenda = (valore: string) => <span className="text-muted-foreground">{valore}</span>;

/**
 * Anello di una percentuale che si riempie all'apertura (fermo con «riduci
 * movimento», vedi .anello-riempie in index.css). Verde da 60, ambra da 30,
 * rosso sotto; `soglie` per cambiarle.
 */
export function AnelloPercentuale({ pct, soglie = [30, 60], dimensione = 40 }: { pct: number; soglie?: [number, number]; dimensione?: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const colore = p >= soglie[1] ? COLORI_GRAFICO.verde : p >= soglie[0] ? COLORI_GRAFICO.arancio : COLORI_GRAFICO.rosso;
  return (
    <svg width={dimensione} height={dimensione} viewBox="0 0 40 40" className="shrink-0 -rotate-90" aria-hidden>
      <circle cx="20" cy="20" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
      <circle
        cx="20" cy="20" r={r} fill="none" stroke={colore} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)}
        className="anello-riempie"
        style={{ ["--anello-pieno" as string]: String(c) } as CSSProperties}
      />
    </svg>
  );
}
