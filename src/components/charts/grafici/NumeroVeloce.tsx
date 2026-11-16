/**
 * Riquadro di un numero veloce (16/11/2026): etichetta piccola, cifra, nota sotto, entrata a
 * cascata. Lo stesso nelle fatture emesse e ricevute, in Prima nota e nello Scadenzario, al
 * posto delle testate blu. Colori del tema: funziona anche in scuro.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { formatEuroRiquadro } from "@/lib/controlloGestione/formatCG";
import { Comparsa } from "./comune";

export function NumeroVeloce({
  etichetta, valore, testo, nota, tono = "neutro", extra, indice = 0, onClick, attivo, titolo,
}: {
  etichetta: string;
  /** Importo in euro: si scrive compatto, pieno nel titolo. */
  valore?: number;
  /** Al posto dell'importo (un conteggio, «…» mentre carica). */
  testo?: string;
  nota?: ReactNode;
  tono?: "neutro" | "buono" | "cattivo" | "attenzione";
  extra?: ReactNode;
  indice?: number;
  /** Se c'è, il riquadro è un filtro: si preme e si accende. */
  onClick?: () => void;
  attivo?: boolean;
  titolo?: string;
}) {
  const cifra = testo ?? (valore != null ? formatEuroRiquadro(valore) : "—");
  const corpo = (
    <>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{etichetta}</p>
      <div className="mt-0.5 flex items-center gap-1.5">
        <p
          className={cn(
            "truncate text-base font-bold tabular-nums leading-tight",
            tono === "buono" && "text-emerald-600 dark:text-emerald-400",
            tono === "cattivo" && "text-rose-600 dark:text-rose-400",
            tono === "attenzione" && "text-amber-600 dark:text-amber-400",
          )}
          title={titolo ?? (valore != null && testo == null ? formatCurrency(valore) : undefined)}
        >
          {cifra}
        </p>
        {extra}
      </div>
      {nota && <p className="truncate text-[10px] text-muted-foreground">{nota}</p>}
    </>
  );
  const classi = cn(
    "block w-full min-w-0 rounded-xl border bg-card px-3 py-2.5 text-left",
    onClick && "transition-colors hover:bg-muted/50",
    attivo && "border-primary/50 ring-1 ring-primary/30",
  );
  return (
    <Comparsa indice={indice} className="min-w-0">
      {onClick ? (
        <button type="button" onClick={onClick} aria-pressed={attivo} className={classi}>{corpo}</button>
      ) : (
        <div className={classi}>{corpo}</div>
      )}
    </Comparsa>
  );
}
