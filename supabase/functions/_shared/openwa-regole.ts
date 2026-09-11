/**
 * openwa-regole — logica PURA delle regole sui messaggi WhatsApp in arrivo
 * (niente Deno/Supabase: testata in vitest, usata dal webhook e dalla UI).
 *
 * Accenti, maiuscole e punteggiatura non contano ("Sì!" = "si"), e una parola
 * chiave deve comparire INTERA: con un semplice includes() la regola "no"
 * scattava dentro "buongiorno" e "nome". Le emoji restano (un 👍 è una
 * risposta).
 */

/** Minuscolo, senza accenti né punteggiatura, spazi compattati. */
export function normalizzaTesto(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\p{P}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parole che, poco prima di una parola chiave, ne ribaltano il senso. */
const NEGAZIONI = new Set(["non", "nessun", "nessuna", "niente", "mai", "nemmeno", "neanche", "neppure", "senza"]);

/**
 * La frase compare come parola/e intera/e e NON è negata: "interessato" non
 * scatta su "non sono interessato" (una delle tre parole prima è una
 * negazione). Una frase che la negazione ce l'ha dentro ("non mi interessa")
 * si cerca così com'è.
 */
function contieneFrase(testo: string, frase: string): boolean {
  if (!frase) return false;
  const t = ` ${testo} `;
  const cercata = ` ${frase} `;
  const frasiNegativa = NEGAZIONI.has(frase.split(" ")[0]);
  let da = 0;
  for (;;) {
    const i = t.indexOf(cercata, da);
    if (i < 0) return false;
    if (frasiNegativa) return true;
    const prima = t.slice(0, i).trim().split(" ").filter(Boolean).slice(-3);
    if (!prima.some((p) => NEGAZIONI.has(p))) return true;
    da = i + 1;
  }
}

export type TipoConfronto = "any" | "contains" | "equals" | "starts_with";

/**
 * Il messaggio soddisfa la condizione della regola?
 *  - any: qualsiasi risposta
 *  - contains: contiene una delle parole/frasi (intere)
 *  - equals: è esattamente una di esse
 *  - starts_with: comincia con una di esse
 */
export function testoCombacia(tipo: string, parole: string[] | null | undefined, testo: string | null | undefined): boolean {
  if (tipo === "any") return String(testo ?? "").trim().length > 0;
  const t = normalizzaTesto(testo);
  const kws = (parole ?? []).map(normalizzaTesto).filter(Boolean);
  if (!t || kws.length === 0) return false;
  if (tipo === "contains") return kws.some((k) => contieneFrase(t, k));
  if (tipo === "equals") return kws.some((k) => t === k);
  if (tipo === "starts_with") return kws.some((k) => t === k || t.startsWith(`${k} `));
  return false;
}

export interface RegolaConfronto {
  enabled: boolean;
  match_type: string;
  match_keywords: string[] | null;
}

/**
 * Le regole di una campagna si leggono come SE / ALTRIMENTI SE: decide la
 * prima attiva che combacia (le regole arrivano già nell'ordine scelto). È lo
 * stesso criterio del webhook, e serve alla schermata per dire in anticipo
 * cosa succederebbe a una risposta d'esempio.
 */
export function primaCheScatta<T extends RegolaConfronto>(regole: T[], testo: string | null | undefined): T | null {
  return regole.find((r) => r.enabled && testoCombacia(r.match_type, r.match_keywords, testo)) ?? null;
}

/** Esiti ammessi sulla bacheca della campagna (colonne "esito" della Pipeline). */
export const ESITI_CAMPAGNA = ["da_ricontattare", "appuntamento", "cliente", "non_interessato"] as const;
export type EsitoCampagna = (typeof ESITI_CAMPAGNA)[number];

export function esitoValido(e: string | null | undefined): e is EsitoCampagna {
  return !!e && (ESITI_CAMPAGNA as readonly string[]).includes(e);
}
