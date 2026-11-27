/**
 * Il messaggio di un errore da mostrare all'utente, qualunque cosa sia stata lanciata.
 *
 * Il 27/11/2026 un'impresa cliente ha premuto «Riporta da incassare» e ha letto
 * «Non sono riuscito a riportarla da incassare — [object Object]». Il database aveva
 * risposto in italiano («Questa fattura è stata incassata dallo scadenzario: annulla
 * prima l'incasso dallo scadenzario.»), ma `if (error) throw error` lancia un
 * PostgrestError, che non è un `Error`, e il vecchio ripiego `String(e)` (quando
 * `e` non è un `Error`) ne faceva «[object Object]».
 *
 * Qui:
 * - il messaggio si legge da un `Error`, da un oggetto con `message` (PostgrestError,
 *   AuthError), dal campo `error` di un corpo JSON, da una stringa;
 * - un messaggio italiano scritto dal database (RAISE con P0001, 23514, 42501, P0002)
 *   passa com'è, con `details` e `hint` quando aggiungono qualcosa;
 * - un messaggio tecnico inglese diventa una frase: i messaggi grezzi di Postgres con le
 *   regole di `userErrorMessage`, gli altri con quelle di `erroreLeggibile`;
 * - mai «[object Object]», «undefined» o JSON grezzo: in mancanza di meglio, il ripiego.
 *
 * `testoGrezzoErrore` è per chi deve RICONOSCERE l'errore (`msg.includes("NotAllowedError")`)
 * e non mostrarlo: lo stesso testo di prima, senza traduzione, ma mai «[object Object]».
 */
import { erroreLeggibile, RIPIEGO_ERRORE } from "@/lib/silvio-commessa/testoErrore";
import { sembraErrorePostgresGrezzo, userErrorMessage } from "@/lib/userErrorMessage";

type Oggetto = Record<string, unknown>;

const VUOTI = new Set(["", "undefined", "null", "[object object]", "{}", "[]"]);

function stringaUtile(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return VUOTI.has(s.toLowerCase()) ? "" : s;
}

/** Il messaggio di un corpo JSON di errore: `{ error: "…" }`, `{ message: "…" }`, `{ error: { message } }`. */
function messaggioDiCorpo(corpo: unknown): string {
  if (typeof corpo === "string") return testoDaStringa(corpo);
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return "";
  const o = corpo as Oggetto;
  const annidato = o.error && typeof o.error === "object" ? (o.error as Oggetto).message : undefined;
  return (
    stringaUtile(o.message) ||
    stringaUtile(o.error) ||
    stringaUtile(annidato) ||
    stringaUtile(o.error_description) ||
    stringaUtile(o.msg)
  );
}

/** Una stringa che è JSON non si mostra: se ne prende il messaggio, se c'è. */
function testoDaStringa(s: string): string {
  const t = stringaUtile(s);
  if (!t || !/^[[{]/.test(t)) return t;
  try {
    return messaggioDiCorpo(JSON.parse(t));
  } catch {
    return t;
  }
}

function eResponse(v: unknown): v is Response {
  return typeof Response !== "undefined" && v instanceof Response;
}

/** Il testo dell'errore com'è, senza traduzioni; "" se non ce n'è. */
function estrai(e: unknown): string {
  if (e === null || e === undefined) return "";
  if (typeof e === "string") return testoDaStringa(e);
  if (typeof e !== "object") return stringaUtile(String(e));
  const o = e as Oggetto;
  // FunctionsHttpError con il corpo già letto (un oggetto, non una Response): parla il corpo.
  const ctx = o.context;
  const dalContesto = ctx && typeof ctx === "object" && !eResponse(ctx) ? messaggioDiCorpo(ctx) : "";
  if (dalContesto) return dalContesto;
  const proprio = e instanceof Error ? testoDaStringa(e.message) : messaggioDiCorpo(o);
  return proprio;
}

/** Il testo dell'errore, per riconoscerlo: mai «[object Object]», mai tradotto. */
export function testoGrezzoErrore(e: unknown, ripiego: string = RIPIEGO_ERRORE): string {
  return estrai(e) || ripiego;
}

function traduci(testo: string, codice: string | undefined, ripiego: string): string {
  if (sembraErrorePostgresGrezzo(testo)) return userErrorMessage({ message: testo, code: codice }, ripiego);
  return erroreLeggibile(testo, ripiego);
}

/** Dettagli e suggerimento, solo se dicono qualcosa di più e non sono a loro volta tecnici. */
function aggiunte(e: unknown, testo: string): string {
  if (!e || typeof e !== "object") return "";
  const o = e as Oggetto;
  const pezzi: string[] = [];
  for (const v of [o.details, o.hint]) {
    const s = stringaUtile(v);
    if (!s || s.length > 300 || s.includes(")=(") || testo.includes(s) || pezzi.includes(s)) continue;
    if (sembraErrorePostgresGrezzo(s) || erroreLeggibile(s, "") !== s) continue;
    pezzi.push(s);
  }
  return pezzi.join(" ");
}

/** Il messaggio da mostrare all'utente. */
export function messaggioErrore(e: unknown, ripiego: string = RIPIEGO_ERRORE): string {
  const testo = estrai(e);
  if (!testo) return ripiego;
  const codice = typeof (e as Oggetto | null)?.code === "string" ? ((e as Oggetto).code as string) : undefined;
  const frase = traduci(testo, codice, ripiego);
  if (frase !== testo) return frase;
  const extra = aggiunte(e, testo);
  if (!extra) return testo;
  return `${testo}${/[.!?:]$/.test(testo) ? "" : "."} ${extra}`;
}

/**
 * Come `messaggioErrore`, ma legge anche il corpo di una FunctionsHttpError: supabase-js
 * lascia la risposta della edge function in `context` (una Response non ancora letta), e il
 * suo `error` è il messaggio vero al posto di «Edge Function returned a non-2xx status code».
 */
export async function messaggioErroreCompleto(e: unknown, ripiego: string = RIPIEGO_ERRORE): Promise<string> {
  const ctx = (e as Oggetto | null)?.context;
  if (eResponse(ctx) && !ctx.bodyUsed) {
    try {
      const testo = await ctx.clone().text();
      const dalCorpo = testoDaStringa(testo);
      if (dalCorpo) return messaggioErrore(dalCorpo, ripiego);
    } catch {
      /* corpo illeggibile: resta il messaggio dell'errore */
    }
  }
  return messaggioErrore(e, ripiego);
}
