import type { Scrittura } from "./libroGiornale";

export function scritturaProvvisoria(s: Scrittura, esercizio: { chiuso_il: string | null; stampato_fino_al: string | null } | null | undefined): boolean {
  return esercizio !== undefined && !esercizio?.chiuso_il && !s.storno_di && !s.stornata
    && (!esercizio?.stampato_fino_al || s.data_registrazione > esercizio.stampato_fino_al);
}

export function percheScritturaNonRettificabile(s: Scrittura, stornate: ReadonlySet<string>): string | null {
  if (s.storno_di) return "È già uno storno.";
  if (stornate.has(s.id) || s.stornata) return "La scrittura è già stata stornata.";
  if (s.origine !== "manuale") return "La scrittura nasce da un documento: correggi il documento di origine e aggiorna le scritture.";
  return null;
}
