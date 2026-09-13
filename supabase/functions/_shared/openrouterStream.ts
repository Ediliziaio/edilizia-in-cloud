/**
 * openrouterStream — lettura dello stream SSE di OpenRouter (chat completions).
 *
 * Solo logica pura, senza Deno ne' fetch: cosi' i test la importano da Node e
 * il router la usa senza cambiare la forma della risposta. A fine stream
 * `rispostaDaAccumulatore` ricompone l'oggetto che una chiamata NON in stream
 * avrebbe restituito (choices[0].message.content / tool_calls, usage): tutto
 * cio' che sta a valle — costi, registro, cache — non sa che e' stato uno stream.
 *
 * Formato, dalla documentazione OpenRouter:
 *  - eventi `data: {json}` separati da una riga vuota; `data: [DONE]` chiude;
 *  - le righe che iniziano con `:` sono commenti keep-alive
 *    (`: OPENROUTER PROCESSING`): passarle a JSON.parse fa saltare il ciclo;
 *  - i tool_calls arrivano a pezzi con `index`: id e nome nel primo pezzo,
 *    gli `arguments` come frammenti di stringa da concatenare;
 *  - l'ultimo evento prima di [DONE] porta `usage` (il finish_reason compare
 *    due volte: sull'ultimo pezzo di contenuto e su quello con usage);
 *  - un errore a meta' stream arriva come evento con `error` e
 *    finish_reason "error", poi lo stream si chiude.
 */

export interface ToolCallAccumulato {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface Accumulatore {
  id: string | null;
  model: string | null;
  content: string;
  toolCalls: Map<number, ToolCallAccumulato>;
  finishReason: string | null;
  usage: Record<string, unknown> | null;
  /** Messaggio dell'evento `error`, se arrivato. */
  errore: string | null;
  /** Eventi con dati applicati (per distinguere uno stream vuoto). */
  eventi: number;
}

export function creaAccumulatore(): Accumulatore {
  return {
    id: null,
    model: null,
    content: "",
    toolCalls: new Map(),
    finishReason: null,
    usage: null,
    errore: null,
    eventi: 0,
  };
}

/**
 * Spezza il buffer grezzo in eventi SSE completi. Un evento e' un blocco di
 * righe chiuso da una riga vuota; dentro contano solo le righe `data:`
 * (piu' righe data si concatenano con "\n"). Cio' che resta dopo l'ultima
 * riga vuota e' un evento ancora incompleto e torna come `resto`.
 */
export function estraiEventiSse(buffer: string): { eventi: string[]; resto: string } {
  const blocchi = buffer.split(/\r?\n\r?\n/);
  const resto = blocchi.pop() ?? "";
  const eventi: string[] = [];
  for (const blocco of blocchi) {
    const dati: string[] = [];
    for (const riga of blocco.split(/\r?\n/)) {
      if (riga.startsWith(":")) continue; // commento keep-alive
      if (!riga.startsWith("data:")) continue; // event:, id:, retry: non ci servono
      dati.push(riga.slice(5).replace(/^ /, ""));
    }
    if (dati.length > 0) eventi.push(dati.join("\n"));
  }
  return { eventi, resto };
}

/**
 * Applica un evento all'accumulatore. Ritorna "fine" su [DONE], "dati" se ha
 * letto qualcosa, "vuoto" se l'evento non era interpretabile (si ignora).
 */
export function applicaEvento(acc: Accumulatore, evento: string): "dati" | "fine" | "vuoto" {
  const testo = evento.trim();
  if (!testo) return "vuoto";
  if (testo === "[DONE]") return "fine";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    json = JSON.parse(testo);
  } catch {
    return "vuoto";
  }
  if (!json || typeof json !== "object") return "vuoto";
  acc.eventi++;

  if (json.error) {
    const e = json.error;
    acc.errore = typeof e === "string" ? e : String(e.message ?? e.code ?? JSON.stringify(e));
  }
  if (typeof json.id === "string" && !acc.id) acc.id = json.id;
  if (typeof json.model === "string" && !acc.model) acc.model = json.model;
  if (json.usage && typeof json.usage === "object") acc.usage = json.usage;

  const scelta = Array.isArray(json.choices) ? json.choices[0] : undefined;
  if (scelta) {
    if (typeof scelta.finish_reason === "string" && scelta.finish_reason) {
      acc.finishReason = scelta.finish_reason;
    }
    const delta = scelta.delta ?? {};
    if (typeof delta.content === "string" && delta.content) acc.content += delta.content;
    if (Array.isArray(delta.tool_calls)) {
      for (const pezzo of delta.tool_calls) {
        const indice = typeof pezzo?.index === "number" ? pezzo.index : acc.toolCalls.size;
        let tc = acc.toolCalls.get(indice);
        if (!tc) {
          tc = { id: "", type: "function", function: { name: "", arguments: "" } };
          acc.toolCalls.set(indice, tc);
        }
        if (typeof pezzo?.id === "string" && pezzo.id) tc.id = pezzo.id;
        if (typeof pezzo?.function?.name === "string" && pezzo.function.name) tc.function.name = pezzo.function.name;
        if (typeof pezzo?.function?.arguments === "string") tc.function.arguments += pezzo.function.arguments;
      }
    }
  }
  return "dati";
}

/** La stessa forma di una risposta non in stream (quella che il router gia' legge). */
export function rispostaDaAccumulatore(acc: Accumulatore): {
  id: string | null;
  model: string | null;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string; tool_calls?: ToolCallAccumulato[] };
    finish_reason: string | null;
  }>;
  usage: Record<string, unknown> | null;
} {
  const toolCalls = [...acc.toolCalls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, tc], i) => ({
      ...tc,
      // Un id vuoto rompe l'abbinamento con il tool message successivo.
      id: tc.id || `call_${i}`,
    }));
  return {
    id: acc.id,
    model: acc.model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: acc.content,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: acc.finishReason,
    }],
    usage: acc.usage,
  };
}
