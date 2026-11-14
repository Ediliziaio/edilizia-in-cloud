/**
 * Il riquadro di un numero, uguale nella Dashboard Operativa e nel Cruscotto
 * Economico (08/11/2026).
 *
 * Prima ogni pagina aveva il suo: la Dashboard Operativa riquadri bianchi con
 * un colore per tipo (blu i lavori, ambra le consegne, viola gli appuntamenti,
 * verde acqua l'assistenza), il Cruscotto un pannello blu notte con le cifre
 * in bianco e accanto riquadri col filo colorato. Sembravano due prodotti, e
 * il colore non voleva dire niente: il blu dei lavori non era una buona o una
 * cattiva notizia.
 *
 * Qui il colore dice solo lo stato — verde va bene, ambra attenzione, rosso
 * problema, grigio nessun giudizio — sul filo a sinistra e sulla cifra.
 * Sotto la cifra: il periodo a cui si riferisce (sempre scritto), una riga di
 * contesto e, se ci sono i dati, la tendenza degli ultimi mesi.
 */
import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PillolaVariazione, idSvg } from "@/components/charts/grafici/comune";

export type TonoNumero = "neutro" | "buono" | "attenzione" | "male";

// 14/11/2026: colori del tema (anche scuro) e un velo del colore dello stato
// in alto a destra; la linea della tendenza ha l'area sfumata e si disegna
// all'apertura (ferma con «meno movimento»).
const STILE: Record<TonoNumero, { valore: string; filo: string; linea: string; velo: string }> = {
  neutro: { valore: "text-foreground", filo: "bg-slate-300 dark:bg-slate-600", linea: "#94a3b8", velo: "from-slate-400/0" },
  buono: { valore: "text-emerald-700 dark:text-emerald-400", filo: "bg-gradient-to-b from-emerald-400 to-emerald-600", linea: "#10b981", velo: "from-emerald-500/[0.07]" },
  attenzione: { valore: "text-amber-700 dark:text-amber-400", filo: "bg-gradient-to-b from-amber-300 to-amber-500", linea: "#f59e0b", velo: "from-amber-500/[0.07]" },
  male: { valore: "text-red-700 dark:text-red-400", filo: "bg-gradient-to-b from-red-400 to-red-600", linea: "#ef4444", velo: "from-red-500/[0.07]" },
};

/**
 * La tendenza in una riga: nessun asse, nessuna etichetta, l'ultimo punto
 * marcato, un'area sfumata sotto. Serve a dire «sale», «scende», «è fermo»
 * prima di leggere. Con meno di due valori, o tutti a zero, non si disegna.
 */
export function Tendenza({ valori, colore, etichetta }: { valori: number[]; colore: string; etichetta: string }) {
  const id = idSvg(useId());
  const punti = valori.filter((v) => Number.isFinite(v));
  if (punti.length < 2 || punti.every((v) => v === 0)) return null;
  const L = 96;
  const H = 28;
  const min = Math.min(...punti);
  const max = Math.max(...punti);
  const ampiezza = max - min || 1;
  const xy = punti.map((v, i) => [
    (i / (punti.length - 1)) * (L - 6) + 3,
    H - 4 - ((v - min) / ampiezza) * (H - 8),
  ]);
  const d = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${xy[xy.length - 1][0].toFixed(1)},${H} L${xy[0][0].toFixed(1)},${H} Z`;
  const [ux, uy] = xy[xy.length - 1];
  return (
    <svg width={L} height={H} viewBox={`0 0 ${L} ${H}`} role="img" aria-label={etichetta} className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={`${id}-t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colore} stopOpacity={0.28} />
          <stop offset="100%" stopColor={colore} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id}-t)`} className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700 motion-safe:fill-mode-both" />
      <path d={d} fill="none" stroke={colore} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="tendenza-traccia" />
      <circle cx={ux} cy={uy} r={4.5} fill={colore} fillOpacity={0.18} />
      <circle cx={ux} cy={uy} r={2.5} fill={colore} />
    </svg>
  );
}

export function RiquadroNumero({
  etichetta, valore, periodo, contesto, tono = "neutro", to, onClick, tendenza, etichettaTendenza, variazione,
}: {
  etichetta: string;
  valore: string;
  /** A che periodo si riferisce la cifra: «questo mese», «a oggi», «prossimi 7 giorni». */
  periodo: string;
  contesto?: ReactNode;
  tono?: TonoNumero;
  /** Dove si va a vedere le righe che fanno il numero. */
  to?: string;
  /** In alternativa a `to`: apre un pannello con le righe (es. il dettaglio del venduto). */
  onClick?: () => void;
  /** Gli ultimi mesi, dal più vecchio al più recente. */
  tendenza?: number[];
  etichettaTendenza?: string;
  /** Variazione % contro il periodo prima: pillola verde/rossa accanto al periodo. */
  variazione?: { pct: number | null; piuEMeglio?: boolean; nota?: string };
}) {
  const stile = STILE[tono];
  const corpo = (
    <>
      <span className={cn("absolute inset-y-0 left-0 w-1", stile.filo)} aria-hidden />
      <span className={cn("pointer-events-none absolute inset-0 bg-gradient-to-bl via-transparent to-transparent", stile.velo)} aria-hidden />
      <div className="relative min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          {/* L'etichetta va a capo invece di troncarsi: a 375px «Scaduto da
              incassare» diventava «SCADUTO DA IN…», che non dice cosa sia. */}
          <p className="text-[11px] font-semibold uppercase leading-3.5 tracking-wide text-muted-foreground">{etichetta}</p>
          {(to || onClick) && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition group-hover:text-primary motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" aria-hidden />}
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <p className={cn("min-w-0 truncate text-xl font-bold leading-none tracking-tight tabular-nums md:text-2xl", stile.valore)}>{valore}</p>
          {tendenza && (
            <span className="hidden sm:block">
              <Tendenza valori={tendenza} colore={stile.linea} etichetta={etichettaTendenza ?? `Andamento di ${etichetta}`} />
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <p className="text-[11px] font-medium text-muted-foreground/80">{periodo}</p>
          {variazione && (
            <PillolaVariazione pct={variazione.pct} piuEMeglio={variazione.piuEMeglio ?? true} titolo={variazione.nota} />
          )}
        </div>
        {contesto && <div className="mt-0.5 hidden text-[11px] leading-4 text-muted-foreground sm:block">{contesto}</div>}
      </div>
    </>
  );
  const classi = "group relative flex min-w-0 overflow-hidden rounded-xl border bg-card py-3 pl-4 pr-3 shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-500 motion-safe:fill-mode-both";
  const attivo = "transition hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  if (onClick && !to) {
    return <button type="button" onClick={onClick} className={cn(classi, attivo, "w-full text-left")}>{corpo}</button>;
  }
  return to ? (
    <Link
      to={to}
      className={cn(classi, attivo)}
    >
      {corpo}
    </Link>
  ) : (
    <div className={classi}>{corpo}</div>
  );
}
