import type { Scrittura } from "./libroGiornale";

export function percheScritturaNonRettificabile(s: Scrittura, stornate: ReadonlySet<string>): string | null {
  if (s.storno_di) return "È già uno storno.";
  if (stornate.has(s.id) || s.stornata) return "La scrittura è già stata stornata.";
  if (s.origine !== "manuale") return "La scrittura nasce da un documento: correggi il documento di origine e aggiorna le scritture.";
  return null;
}
