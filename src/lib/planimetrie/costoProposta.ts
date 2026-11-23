import { FONTE_INDICATIVA } from "./prezziProposti";
import { importiLavorazioni, studioVariante } from "./studioImmobiliare";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

/** I due importi a confronto; null se la proposta non è una variante o non ha lavorazioni. */
export function costoDellaProposta(prima: Planimetria, dopo: Planimetria, ambito: string, quota: <T extends ReturnType<typeof studioVariante>["righe"]>(r: T) => T) {
  const variante = ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : null;
  if (!variante) return null;
  const esiste = (d: Planimetria) => d.livelli.some((l) => l.proposte.some((p) => p.id === variante));
  if (!esiste(dopo)) return null;
  const nuove = quota(studioVariante(dopo, variante).righe);
  if (!nuove.length) return null;
  const vecchie = esiste(prima) ? quota(studioVariante(prima, variante).righe) : [];
  const a = importiLavorazioni(vecchie), b = importiLavorazioni(nuove);
  return { lavorazioni: nuove.length, prima: a.importo ?? 0, dopo: b.importo, daQuotare: b.daQuotare, daMisurare: b.daMisurare,
    indicative: nuove.filter((r) => r.prezzo?.fonte === FONTE_INDICATIVA).length };
}

