/**
 * Evidenza live per i campi obbligatori nei pannelli specializzati del flow
 * builder: stessa veste del ramo generico (ring + messaggio), così un campo
 * dimenticato si vede MENTRE si compila e non alla pubblicazione.
 */
import type { ReactNode } from "react";

export const campoVuoto = (v: unknown): boolean =>
  Array.isArray(v) ? v.length === 0 : v == null || (typeof v === "string" && v.trim() === "");

export function EvidenzaObbligatoria({ mostra, children }: { mostra: boolean; children: ReactNode }) {
  if (!mostra) return <>{children}</>;
  return (
    <div className="-mx-2 rounded-lg bg-destructive/5 p-2 ring-1 ring-destructive/40">
      {children}
      <p className="mt-1 text-[11px] font-medium text-destructive">Campo obbligatorio: da compilare prima di pubblicare.</p>
    </div>
  );
}
