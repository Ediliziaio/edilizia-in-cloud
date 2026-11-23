/**
 * Quando una riga di listino o di storico è «la stessa lavorazione» di una voce del preventivo.
 *
 * Prudente di proposito: un prezzo agganciato alla voce sbagliata è peggio di un prezzo mancante.
 * - stesso codice → corrisponde (se l'unità è diversa lo si dice, e quel prezzo non si usa);
 * - senza codice → stessa unità, stessi numeri nel testo (formati, spessori, diametri), stesso perimetro
 *   (sola posa ≠ fornitura e posa) e descrizioni che condividono almeno il 60% delle parole.
 */
import { normalizzaTesto } from "@/lib/distinta/generaDistinta";
import { catalogueUnit } from "../../../../supabase/functions/_shared/quoteCatalogue";

const unitaViste = new Map<string, string>();
export const unitaConfrontabile = (s: string | null | undefined): string => {
  const u = (s ?? "").trim();
  if (!u) return "";
  let n = unitaViste.get(u);
  if (n === undefined) {
    const c = catalogueUnit(u);
    n = c === "corpo" || c === "ac" ? "a corpo" : c;
    if (unitaViste.size > 2000) unitaViste.clear();
    unitaViste.set(u, n);
  }
  return n;
};

const codiceConfrontabile = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[\s._/-]+/g, "");

const VUOTE = new Set("di del della delle dei degli da dal con per il la le gli lo una uno un in su e ed o a al alla compreso compresa inclusa incluso ogni onere tipo".split(" "));
const parole = (testo: string) => new Set(testo.split(" ").filter(p => p.length > 2 && !VUOTE.has(p)));
// Senza confini di parola: in «60x60» le cifre stanno attaccate alla x, e sono proprio quelle che contano.
const cifre = (testo: string) => (testo.match(/\d+(?:\.\d+)?/g) ?? []).sort().join(" ");

function perimetro(testo: string): string {
  const fornitura = /\bfornitur\w*\b/.test(testo);
  const posa = /\b(posa|installazion\w*|montaggio)\b/.test(testo);
  return fornitura ? (posa ? "fornitura e posa" : "fornitura") : posa ? "posa" : "";
}

export function somiglianza(a: string, b: string): number {
  return sovrapposizione(parole(a), parole(b));
}
function sovrapposizione(primo: Set<string>, secondo: Set<string>): number {
  if (!primo.size || !secondo.size) return 0;
  let comuni = 0;
  for (const p of primo) if (secondo.has(p)) comuni++;
  return comuni / (primo.size + secondo.size - comuni);
}

export const SOGLIA_DESCRIZIONE = 0.6;

export interface Confrontabile { codice: string; descrizione: string; unita: string }
export type Corrispondenza = { modo: "codice" | "descrizione"; unitaDiversa: boolean };

// Ogni testo si prepara una volta sola: 600 voci contro 4.500 righe sono milioni di confronti, non milioni di normalizzazioni.
type Preparato = { testo: string; cifre: string; perimetro: string; parole: Set<string> };
const preparati = new Map<string, Preparato>();
function prepara(descrizione: string): Preparato {
  let p = preparati.get(descrizione);
  if (!p) {
    const testo = normalizzaTesto(descrizione);
    p = { testo, cifre: cifre(testo), perimetro: perimetro(testo), parole: parole(testo) };
    if (preparati.size > 20_000) preparati.clear();
    preparati.set(descrizione, p);
  }
  return p;
}

export function corrispondenza(voce: Confrontabile, riga: Confrontabile): Corrispondenza | null {
  const uv = unitaConfrontabile(voce.unita), ur = unitaConfrontabile(riga.unita);
  const cv = codiceConfrontabile(voce.codice), cr = codiceConfrontabile(riga.codice);
  // Un codice di due caratteri («A1») ricorre in listini diversi: da solo non identifica una lavorazione.
  if (cv.length >= 3 && cv === cr) return { modo: "codice", unitaDiversa: !!uv && !!ur && uv !== ur };
  if (!uv || uv !== ur) return null;
  const v = prepara(voce.descrizione), r = prepara(riga.descrizione);
  if (!v.testo || !r.testo) return null;
  if (v.cifre !== r.cifre) return null;
  if (v.perimetro && r.perimetro && v.perimetro !== r.perimetro) return null;
  if (v.testo !== r.testo && sovrapposizione(v.parole, r.parole) < SOGLIA_DESCRIZIONE) return null;
  return { modo: "descrizione", unitaDiversa: false };
}

/** Ciò da cui dipende il recupero dei prezzi di una voce: se non cambia, l'abbinamento si riusa. */
export const improntaVoce = (v: Confrontabile): string =>
  [codiceConfrontabile(v.codice), normalizzaTesto(v.descrizione), unitaConfrontabile(v.unita)].join("|");
