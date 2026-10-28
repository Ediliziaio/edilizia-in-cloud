/**
 * Il JSON che il modello risponde, quando c'è.
 *
 * Il 28/10/2026 cinque allegati erano fermi su `parse_failed` — uno con
 * quattordici tentativi, ognuno una chiamata Sonnet pagata sullo stesso PDF.
 * Tutte le risposte cominciavano con ```json e un oggetto scritto in bella
 * copia: con `max_tokens: 1500` lo schema chiesto dal prompt (un oggetto
 * valore/conf per campo, più l'array delle righe) non ci sta, la risposta si
 * tronca a metà e il vecchio `visText.match(/\{[\s\S]*\}/)` si fermava
 * all'ultima graffa interna — un frammento che JSON.parse non accetta.
 *
 * Qui si leva la staccionata markdown e si prende l'oggetto con le graffe
 * bilanciate (le graffe dentro le stringhe non contano). Se non si bilancia,
 * la risposta è tronca e lo si dice: `{ json: null, troncato: true }`. Chi
 * chiama lo registra come esito, invece di ripagare la stessa estrazione.
 */
export interface JsonDalModello {
  json: string | null;
  troncato: boolean;
}

export function jsonDalModello(testo: string | null | undefined): JsonDalModello {
  const pulito = togliStaccionata(String(testo ?? ""));
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

/** ```json … ``` — la staccionata markdown attorno alla risposta. */
function togliStaccionata(testo: string): string {
  const conFence = testo.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  return (conFence ? conFence[1] : testo).trim();
}
