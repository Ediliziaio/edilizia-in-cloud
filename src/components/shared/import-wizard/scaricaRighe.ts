import type { RigaDaRivedere } from "@/lib/importazione/tipi";

/**
 * Le righe non importate, come erano nel file, con il motivo in una colonna in più:
 * si correggono in Excel e si reimportano. Punto e virgola e BOM, così Excel le apre
 * in colonne e con le lettere accentate giuste.
 */
export function csvRigheDaRivedere(intestazioni: string[], righeFile: string[][], daRivedere: RigaDaRivedere[]): string {
  const cella = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const motivi = new Map<number, string[]>();
  for (const r of daRivedere) motivi.set(r.riga, [...(motivi.get(r.riga) ?? []), r.motivo]);
  const righe = [...motivi.keys()].sort((a, b) => a - b).flatMap((n) => {
    const originale = righeFile[n - 2];
    if (!originale) return [];
    return [[...intestazioni.map((_, i) => originale[i] ?? ""), motivi.get(n)!.join("; ")].map(cella).join(";")];
  });
  return "﻿" + [[...intestazioni, "Motivo"].map(cella).join(";"), ...righe].join("\r\n");
}

export function scaricaRigheDaRivedere(nomeFile: string, intestazioni: string[], righeFile: string[][], daRivedere: RigaDaRivedere[]) {
  const blob = new Blob([csvRigheDaRivedere(intestazioni, righeFile, daRivedere)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeFile.replace(/\.[^.]+$/, "")} - righe da correggere.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
