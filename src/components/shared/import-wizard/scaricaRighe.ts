import type { RigaDaRivedere } from "@/lib/importazione/tipi";

/**
 * Le righe non importate, come erano nel file, con il motivo in una colonna in più:
 * si correggono in Excel e si reimportano. Punto e virgola e BOM, così Excel le apre
 * in colonne e con le lettere accentate giuste.
 */
/** `numeri[i]` è il numero nel file della riga `righeFile[i]`; senza, la riga i è la i+2 (dopo l'intestazione). */
export function csvRigheDaRivedere(intestazioni: string[], righeFile: string[][], daRivedere: RigaDaRivedere[], numeri?: number[]): string {
  const cella = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const perNumero = new Map<number, string[]>(righeFile.map((r, i) => [numeri?.[i] ?? i + 2, r]));
  const motivi = new Map<number, string[]>();
  for (const r of daRivedere) motivi.set(r.riga, [...(motivi.get(r.riga) ?? []), r.motivo]);
  const righe = [...motivi.keys()].sort((a, b) => a - b).flatMap((n) => {
    const originale = perNumero.get(n);
    if (!originale) return [];
    return [[...intestazioni.map((_, i) => originale[i] ?? ""), motivi.get(n)!.join("; ")].map(cella).join(";")];
  });
  return "﻿" + [[...intestazioni, "Motivo"].map(cella).join(";"), ...righe].join("\r\n");
}

export function scaricaRigheDaRivedere(nomeFile: string, intestazioni: string[], righeFile: string[][], daRivedere: RigaDaRivedere[], numeri?: number[]) {
  const blob = new Blob([csvRigheDaRivedere(intestazioni, righeFile, daRivedere, numeri)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeFile.replace(/\.[^.]+$/, "")} - righe da correggere.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
