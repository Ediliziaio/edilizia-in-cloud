import type { RigaScelta } from "./scegliVoci";

/**
 * Le voci usate di recente nel popup del listino: stanno nel browser, per azienda e per preventivatore.
 * Si conserva solo quale voce è, mai prezzi e costi: all'apertura si rileggono dal listino, così una voce
 * cambiata ha il prezzo nuovo e una tolta sparisce. Il prezzario regionale fa eccezione: non è dell'azienda
 * e non si può rileggere senza cercarlo, quindi la sua riga resta com'è.
 */
export interface VoceRecente { chiave: string; riga?: RigaScelta }

const MASSIMO = 30;
const chiave = (azienda: string, verticale: string) => `eic.vociRecenti.${azienda}.${verticale}`;

export function leggiVociRecenti(azienda: string | null | undefined, verticale: string): VoceRecente[] {
  if (!azienda) return [];
  try {
    const dati: unknown = JSON.parse(localStorage.getItem(chiave(azienda, verticale)) ?? "[]");
    if (!Array.isArray(dati)) return [];
    return (dati as VoceRecente[]).filter((v) => typeof v?.chiave === "string"
      && (!v.chiave.startsWith("prezzario-") || (typeof v.riga?.prezzo === "number" && !!v.riga.voce)));
  } catch {
    return [];
  }
}

/** Le ultime in cima, senza doppioni. Il capitolo non si conserva: la prossima volta può essere un altro. */
export function registraVociRecenti(azienda: string | null | undefined, verticale: string, usate: readonly RigaScelta[]): VoceRecente[] {
  const prima = leggiVociRecenti(azienda, verticale);
  if (!azienda) return prima;
  const nuove = usate.map(({ sezione: _sezione, voce: { capitolo_nome: _capitolo, quantita: _quantita, ...voce }, ...riga }): VoceRecente =>
    riga.chiave.startsWith("prezzario-") ? { chiave: riga.chiave, riga: { ...riga, voce } } : { chiave: riga.chiave });
  const chiavi = new Set(nuove.map((v) => v.chiave));
  const dopo = [...nuove, ...prima.filter((v) => !chiavi.has(v.chiave))].slice(0, MASSIMO);
  try {
    localStorage.setItem(chiave(azienda, verticale), JSON.stringify(dopo));
  } catch {
    // Senza memoria del browser il popup funziona uguale, solo senza questo elenco.
  }
  return dopo;
}
