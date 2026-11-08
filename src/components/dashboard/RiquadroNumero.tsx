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
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type TonoNumero = "neutro" | "buono" | "attenzione" | "male";

const STILE: Record<TonoNumero, { valore: string; filo: string; linea: string }> = {
  neutro: { valore: "text-slate-900", filo: "bg-slate-200", linea: "#94a3b8" },
  buono: { valore: "text-emerald-700", filo: "bg-emerald-500", linea: "#10b981" },
  attenzione: { valore: "text-amber-700", filo: "bg-amber-400", linea: "#f59e0b" },
  male: { valore: "text-red-700", filo: "bg-red-500", linea: "#ef4444" },
};

/**
 * La tendenza in una riga: nessun asse, nessuna etichetta, l'ultimo punto
 * marcato. Serve a dire «sale», «scende», «è fermo» prima di leggere.
 * Con meno di due valori, o tutti a zero, non si disegna.
 */
export function Tendenza({ valori, colore, etichetta }: { valori: number[]; colore: string; etichetta: string }) {
  const punti = valori.filter((v) => Number.isFinite(v));
  if (punti.length < 2 || punti.every((v) => v === 0)) return null;
  const L = 96;
  const H = 24;
  const min = Math.min(...punti);
  const max = Math.max(...punti);
  const ampiezza = max - min || 1;
  const xy = punti.map((v, i) => [
    (i / (punti.length - 1)) * (L - 4) + 2,
    H - 3 - ((v - min) / ampiezza) * (H - 6),
  ]);
  const d = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [ux, uy] = xy[xy.length - 1];
  return (
    <svg width={L} height={H} viewBox={`0 0 ${L} ${H}`} role="img" aria-label={etichetta} className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke={colore} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ux} cy={uy} r={2.5} fill={colore} />
    </svg>
  );
}

export function RiquadroNumero({
  etichetta, valore, periodo, contesto, tono = "neutro", to, onClick, tendenza, etichettaTendenza,
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
}) {
  const stile = STILE[tono];
  const corpo = (
    <>
      <span className={cn("absolute inset-y-0 left-0 w-1", stile.filo)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          {/* L'etichetta va a capo invece di troncarsi: a 375px «Scaduto da
              incassare» diventava «SCADUTO DA IN…», che non dice cosa sia. */}
          <p className="text-[11px] font-medium uppercase leading-3.5 tracking-wide text-slate-500">{etichetta}</p>
          {(to || onClick) && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-primary" aria-hidden />}
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <p className={cn("min-w-0 truncate text-xl font-bold leading-none tabular-nums md:text-2xl", stile.valore)}>{valore}</p>
          {tendenza && (
            <span className="hidden sm:block">
              <Tendenza valori={tendenza} colore={stile.linea} etichetta={etichettaTendenza ?? `Andamento di ${etichetta}`} />
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[11px] font-medium text-slate-400">{periodo}</p>
        {contesto && <div className="mt-0.5 hidden text-[11px] leading-4 text-slate-500 sm:block">{contesto}</div>}
      </div>
    </>
  );
  const classi = "group relative flex min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-3 shadow-sm";
  const attivo = "transition hover:border-slate-300 hover:bg-slate-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
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
