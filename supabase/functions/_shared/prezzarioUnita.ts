/**
 * Unità di misura dei prezzari regionali (05/11/2026).
 *
 * In `prezzario_voce` 16 prezzari su 19 (circa 330.000 voci) sono stati
 * importati SENZA unità di misura: il parser la trattava come facoltativa e
 * importava anche quando non riconosceva la colonna. L'unità restava solo nel
 * testo, a volte composta: Marche 02.03.017* demolizione solai = 3,18 € «al m²
 * per ogni cm di spessore». Presa per «al m²» sbaglia di 20 volte.
 *
 * Qui due regole condivise, pure (nessuna dipendenza), usate dalla pagina admin
 * dei prezzari, dall'edge function `prezzario-import` e dal computo:
 *
 * - `controlloUnitaMisura`: sotto il 90% di voci valide con l'unità, l'import si
 *   ferma, salvo conferma esplicita. Il 90% lascia passare la Lombardia 2025
 *   (93,6%, le voci senza unità sono righe davvero prive) e ferma i prezzari
 *   con la colonna non riconosciuta (0%).
 * - `fraseDiMisura`: la frase della descrizione che dice come si misura la voce,
 *   da MOSTRARE a chi sceglie l'unità a mano. Non deduce l'unità: un'espressione
 *   regolare sbaglierebbe (le descrizioni citano densità come «Kg/m³ 13,5»), e
 *   un'unità sbagliata è peggio di una mancante.
 */

/** Quota minima di voci valide con l'unità di misura perché l'import proceda senza conferma. */
export const QUOTA_MINIMA_UNITA = 0.9;

export interface VocePerControlloUnita {
  descrizione?: string | null;
  prezzo?: number | string | null;
  unita_misura?: string | null;
  /** Righe già scartate dal parser (senza descrizione o prezzo): non contano. */
  errors?: string[];
}

export interface ControlloUnita {
  /** Voci che verrebbero importate (descrizione presente e prezzo numerico > 0). */
  valide: number;
  conUnita: number;
  senzaUnita: number;
  /** conUnita / valide, 1 se non ci sono voci valide. */
  quota: number;
  /** true quando l'import va fermato salvo conferma esplicita. */
  bloccante: boolean;
}

const unitaPresente = (u: unknown): boolean => typeof u === "string" && u.trim() !== "";

function voceValida(v: VocePerControlloUnita): boolean {
  if (v.errors && v.errors.length > 0) return false;
  const descrizione = typeof v.descrizione === "string" ? v.descrizione.trim() : "";
  const prezzo = typeof v.prezzo === "string" ? Number(v.prezzo) : v.prezzo;
  return descrizione !== "" && typeof prezzo === "number" && Number.isFinite(prezzo) && prezzo > 0;
}

export function controlloUnitaMisura(voci: readonly VocePerControlloUnita[]): ControlloUnita {
  let valide = 0;
  let conUnita = 0;
  for (const v of voci) {
    if (!v || !voceValida(v)) continue;
    valide++;
    if (unitaPresente(v.unita_misura)) conUnita++;
  }
  const quota = valide === 0 ? 1 : conUnita / valide;
  return { valide, conUnita, senzaUnita: valide - conUnita, quota, bloccante: valide > 0 && quota < QUOTA_MINIMA_UNITA };
}

/** Il messaggio per chi importa: quante voci mancano e cosa fare. */
export function messaggioUnitaMancanti(c: ControlloUnita): string {
  const pct = Math.round((1 - c.quota) * 100);
  return `${c.senzaUnita.toLocaleString("it-IT")} voci su ${c.valide.toLocaleString("it-IT")} (${pct}%) non hanno l'unità di misura. ` +
    "Di solito la colonna del file ha un'intestazione che non viene riconosciuta: rinominala (per esempio «U.M.» o «Unità di misura») e ricarica il file. " +
    "Importare così vuol dire che chi userà queste voci dovrà indovinare l'unità.";
}

// Le frasi che nei prezzari dicono come si misura una voce.
// Dopo l'unità niente `\b`: «²» e «³» non sono lettere, e «al m² per» non lo farebbe scattare.
const INDIZI_MISURA = /(?:^|[^\p{L}\d])(misura(?:t[aoie]|zione)?|valutat[aoie]|computat[aoie]|contabilizzat[aoie]|per ogni|cadaun[oa]|a corpo|al (?:m[²³23]?|mq|mc|ml|metro|kg|chilogrammo|quintale|t|tonnellata|litro|giorno|ora))(?=$|[^\p{L}\d])/iu;

/**
 * La frase che dice come si misura la voce, se il testo ne ha una; altrimenti
 * la parte finale della descrizione (dove i prezzari mettono la variante).
 * Solo da mostrare: non è un'unità e non va salvata come tale.
 */
export function fraseDiMisura(descrizione: string | null | undefined, max = 220): string {
  const testo = String(descrizione ?? "").replace(/\s+/g, " ").trim();
  if (!testo) return "";
  const frasi = testo.split(/(?<=[.;])\s+/).map((f) => f.trim()).filter(Boolean);
  // L'ultima frase con un indizio: la regola di misura sta di solito in fondo.
  const conIndizio = [...frasi].reverse().find((f) => INDIZI_MISURA.test(f));
  const scelta = conIndizio ?? frasi[frasi.length - 1] ?? testo;
  if (scelta.length <= max) return scelta;
  return `…${scelta.slice(scelta.length - max + 1).trimStart()}`;
}
