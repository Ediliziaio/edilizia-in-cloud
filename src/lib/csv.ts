/**
 * CSV "da Excel italiano": separatore punto e virgola, BOM UTF-8 così le
 * accentate non diventano geroglifici, valori con virgolette raddoppiate.
 */
export interface ColonnaCsv<T> {
  label: string;
  valore: (riga: T) => string | number | null | undefined;
}

function cella(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Un valore che inizia con = + - @ verrebbe eseguito da Excel come formula.
  const sicuro = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(sicuro) ? `"${sicuro.replace(/"/g, '""')}"` : sicuro;
}

export function costruisciCsv<T>(righe: readonly T[], colonne: readonly ColonnaCsv<T>[]): string {
  const testata = colonne.map((c) => cella(c.label)).join(";");
  const corpo = righe.map((r) => colonne.map((c) => cella(c.valore(r))).join(";"));
  return [testata, ...corpo].join("\r\n");
}

/** Avvia il download nel browser. */
export function scaricaCsv(nomeFile: string, contenuto: string): void {
  const blob = new Blob(["﻿" + contenuto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFile.endsWith(".csv") ? nomeFile : `${nomeFile}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
