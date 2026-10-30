/**
 * Legge la risposta JSON di un modello (30/10/2026).
 *
 * Le funzioni che leggono documenti ricevono dal modello un JSON, a volte dentro
 * una recinzione di codice (```json … ```) o con una frase prima e dopo. Ognuna
 * lo gestiva a modo suo: generic-doc-ai-extract e ai-importa-condizioni con lo
 * stesso ripiego copiato, ai-fattura-ricevuta-ocr con un `JSON.parse` nudo che alla
 * prima recinzione rispondeva «OCR ha restituito JSON invalido», e
 * email-ai-estrai-allegato con una versione più attenta (graffe bilanciate) nata
 * da un guasto vero. Ora c'è un'implementazione sola. Il router AI già ritenta su
 * un altro modello se la risposta non è JSON; qui si gestisce solo la forma.
 */

export interface OggettoBilanciato {
  json: string | null;
  troncato: boolean;
}

/** ```json … ``` — la recinzione di codice attorno alla risposta. */
function senzaRecinzione(testo: string): string {
  const conRecinzione = testo.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  return (conRecinzione ? conRecinzione[1] : testo).trim();
}

/**
 * Il primo oggetto { … } del testo, con le graffe bilanciate (quelle dentro le
 * stringhe non contano), senza la recinzione di codice.
 *
 * Il 28/10/2026 cinque allegati email erano fermi su `parse_failed` — uno con
 * quattordici tentativi, ognuno una chiamata pagata sullo stesso PDF. Tutte le
 * risposte cominciavano con ```json e un oggetto in bella copia, ma con
 * `max_tokens: 1500` lo schema chiesto non ci stava, la risposta si troncava a
 * metà e il vecchio `match(/{[\s\S]*}/)` si fermava all'ultima graffa interna:
 * un frammento che JSON.parse non accetta. Se le graffe non si chiudono la risposta
 * è tronca e lo si dice (`troncato: true`): chi chiama lo registra come esito,
 * invece di ripagare la stessa estrazione.
 */
export function oggettoBilanciato(testo: string | null | undefined): OggettoBilanciato {
  const pulito = senzaRecinzione(String(testo ?? ""));
  const inizio = pulito.indexOf("{");
  if (inizio < 0) return { json: null, troncato: false };

  let profondita = 0;
  let inStringa = false;
  let scappato = false;
  for (let i = inizio; i < pulito.length; i++) {
    const c = pulito[i];
    if (inStringa) {
      if (scappato) scappato = false;
      else if (c === "\\") scappato = true;
      else if (c === '"') inStringa = false;
      continue;
    }
    if (c === '"') inStringa = true;
    else if (c === "{") profondita++;
    else if (c === "}") {
      profondita--;
      if (profondita === 0) return { json: pulito.slice(inizio, i + 1), troncato: false };
    }
  }
  // Graffe aperte e mai chiuse: la risposta si è interrotta.
  return { json: null, troncato: true };
}

function comeOggetto(testo: string): Record<string, unknown> | null {
  try {
    const valore: unknown = JSON.parse(testo);
    return valore && typeof valore === "object" && !Array.isArray(valore) ? (valore as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Un oggetto JSON dalla risposta del modello, oppure null. Prova nell'ordine: il
 * testo così com'è, poi il primo oggetto a graffe bilanciate (recinzione di codice
 * e frasi attorno non contano). Una risposta che è una lista, un numero o un testo
 * non è un oggetto: null.
 */
export function leggiJsonDalModello(risposta: unknown): Record<string, unknown> | null {
  if (typeof risposta !== "string") return null;
  const testo = risposta.trim();
  if (!testo) return null;
  const diretto = comeOggetto(testo);
  if (diretto) return diretto;
  // Una lista di oggetti non è «un oggetto»: niente primo elemento al suo posto.
  if (senzaRecinzione(testo).startsWith("[")) return null;
  const { json } = oggettoBilanciato(testo);
  return json ? comeOggetto(json) : null;
}
