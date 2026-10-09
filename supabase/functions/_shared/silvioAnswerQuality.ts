import { visibleAiAnswer } from "./visibleAiAnswer.ts";

/** Shared instructions stay in the cached prefix; no extra provider request. */
export const SILVIO_ANSWER_QUALITY_RULES = `
# QUALITÀ DELLA RISPOSTA
- Rispondi alla richiesta concreta, in italiano naturale. Interpreta refusi e frasi brevi dal contesto senza correggere la scrittura dell'utente. Per un dato, un saluto o una conferma bastano una o tre frasi; per un piano o un rapporto completo dai il dettaglio richiesto. Non aggiungere titoli, sezioni o un prossimo passo artificiale a ogni risposta.
- Apri con il risultato e la sua conseguenza pratica. Usa tabelle solo per confronti e liste solo per azioni distinte. Una proposta deve indicare cosa fare e perché, non formule vaghe come "ottimizzare la gestione".
- Nelle domande successive mantieni soggetto, periodo e criterio già concordati. Lo storico ricorda la conversazione, NON certifica importi o stati attuali: rileggi i dati quando l'utente chiede "oggi", "ora", un aggiornamento o una nuova decisione. Se due soggetti restano realmente ambigui, fai una sola domanda mirata prima di agire.
- Per dati aziendali usa risultati verificati nel turno corrente, precisando periodo, ambito e copertura quando cambiano il significato. Un elenco vuoto, un errore, un valore null o un accesso non consentito NON equivalgono a zero né a "tutto a posto". Distingui fatto, dato mancante e ipotesi.
- Non sommare un totale alle sue componenti, importi preventivati e consuntivi, fatture e pagamenti già collegati, né valori di periodi diversi. Specifica IVA inclusa/esclusa solo se verificata. Per uno scostamento indica riferimento e unità; non chiamare margine il saldo da incassare.
- Se il risultato segnala copertura parziale o dati tagliati, dichiara il limite accanto alla conclusione. Non ricavare un totale complessivo dal campione, non affermare che hai elencato tutto e non promettere dati che non hai letto. Usa eventuali totali espliciti con la copertura dichiarata dalla fonte.
- Distingui sempre proposta, bozza salvata, operazione eseguita, richiesta accettata e consegna verificata. Riferisci il risultato effettivo; non dire "fatto", "inviato" o "consegnato" sulla sola base della richiesta o di una proposta in attesa.
- Nelle bozze scrivi direttamente il testo utilizzabile. Nei consigli presenta la scelta, la ragione concreta e il limite che potrebbe cambiarla. Rendi visibili i dati mancanti senza ripetere premesse, strumenti interni o avvertenze generiche.
`;

const TECHNICAL_ERROR = /^(?:[⚠️💳⛔⏳]+\s*)?(?:c['’]è stato un problema tecnico|il servizio ai è temporaneamente|credito (?:ai )?(?:finito|esaurito)|questa richiesta è già in elaborazione|ho fermato il nuovo tentativo|ho raggiunto il limite di tempo|non sono riuscito a (?:completare l['’]analisi|comporre una risposta utile|formulare una risposta)|non è disponibile una risposta leggibile|mi dispiace(?:\s+florin)?,?\s+ho (?:avuto|riscontrato) un problema)/iu;

/** Keep readable previous turns, excluding live placeholders and failed replies. */
export function silvioHistoryContent(content: unknown, options: {
  assistant: boolean;
  streaming?: boolean | null;
  maxChars?: number;
}): string | null {
  if (typeof content !== "string" || !content.trim()) return null;
  if (options.assistant && options.streaming) return null;
  const text = (options.assistant ? visibleAiAnswer(content) : content).trim();
  const errorText = text.replace(/^mi dispiace(?:\s+florin)?,?\s+/iu, "");
  if (!text || (options.assistant && (/^(?:\.{1,3}|…)$/.test(text) || TECHNICAL_ERROR.test(errorText)))) return null;
  const limit = options.maxChars ?? (options.assistant ? 1500 : 4000);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n[Messaggio precedente parziale: non contiene tutto il dettaglio.]`;
}

export function silvioHistoryMessages(rows: ReadonlyArray<{
  id?: string;
  sender_id: string;
  content: unknown;
  streaming?: boolean | null;
}>, options: {
  assistantSenderId: string;
  currentSenderId: string;
  currentContent: string;
  currentMessageId?: string | null;
  otherSenderPrefix?: string;
}): Array<{ role: "assistant" | "user"; content: string }> {
  return rows.flatMap((row, index) => {
    // The current request is appended separately and must never be truncated as history.
    if (row.sender_id === options.currentSenderId &&
      (options.currentMessageId ? row.id === options.currentMessageId :
        index === rows.length - 1 && row.content === options.currentContent)) return [];
    const assistant = row.sender_id === options.assistantSenderId;
    const content = silvioHistoryContent(row.content, { assistant, streaming: row.streaming });
    return content ? [{
      role: assistant ? "assistant" as const : "user" as const,
      content: !assistant && row.sender_id !== options.currentSenderId && options.otherSenderPrefix
        ? `${options.otherSenderPrefix}${content}` : content,
    }] : [];
  });
}

export const SILVIO_PARTIAL_RESULT_WARNING = "Risultato parziale per il limite di lettura: il riepilogo conserva i dati disponibili, ma gli elenchi e i testi possono essere incompleti. Non calcolare totali dal campione e non dichiarare completa l'analisi. I totali espliciti valgono solo per l'ambito e la copertura indicati dalla fonte.";

function compactResult(value: unknown, depth: number, stringLimit: number, entryLimit: number): unknown {
  if (typeof value === "string") return value.length > stringLimit ? `${value.slice(0, stringLimit)}… [testo parziale]` : value;
  if (!value || typeof value !== "object") return value;
  if (depth === 0) return { _silvio_omitted: true };
  if (Array.isArray(value)) {
    // Short warning lists stay intact. Longer datasets explicitly remain samples.
    const keep = value.length <= 8 && value.every(v => v === null || typeof v !== "object") ? value.length : 3;
    const sample = value.slice(0, keep).map(v => compactResult(v, depth - 1, stringLimit, entryLimit));
    return value.length <= keep ? sample : { _silvio_partial_array: true, available_items: value.length, sample };
  }
  const entries = Object.entries(value);
  // Scalars and quality/outcome metadata precede large row collections.
  entries.sort(([a, x], [b, y]) => {
    const priority = (key: string, v: unknown) => /error|warning|quality|coverage|copertura|total|totale|count|conteggio|proposal|risk|review|success|^ok$/i.test(key) ? 0 : v === null || typeof v !== "object" ? 1 : 2;
    return priority(a, x) - priority(b, y);
  });
  const result = Object.fromEntries(entries.slice(0, entryLimit).map(([key, v]) => [key, compactResult(v, depth - 1, stringLimit, entryLimit)]));
  if (entries.length > entryLimit) result._silvio_omitted_fields = entries.length - entryLimit;
  return result;
}

/** Never hand the model a silently cut JSON object. Original tool/audit data is untouched. */
export function silvioToolResultForPrompt(result: unknown, maxChars = 8000): string {
  const raw = JSON.stringify(result) ?? "null";
  const budget = Math.max(512, Math.floor(maxChars));
  if (raw.length <= budget) return raw;
  for (const [depth, stringLimit, entryLimit] of [[5, 3000, 32], [5, 1600, 32], [5, 800, 32], [4, 320, 24], [3, 160, 16], [2, 40, 8]]) {
    const encoded = JSON.stringify({
      _silvio_partial_result: true,
      warning: SILVIO_PARTIAL_RESULT_WARNING,
      summary: compactResult(result, depth, stringLimit, entryLimit),
    });
    if (encoded.length <= budget) return encoded;
  }
  return JSON.stringify({ _silvio_partial_result: true, warning: SILVIO_PARTIAL_RESULT_WARNING });
}

export function silvioAnswerWasInterrupted(finishReason: unknown): boolean {
  return finishReason === "length" || finishReason === "max_tokens";
}

export function silvioToolContextIsPartial(promptResult: string): boolean {
  return promptResult.startsWith('{"_silvio_partial_result":true,');
}

export function silvioCompletionNotice(answer: string, finishReason: unknown, partialToolContext = false): string {
  if (silvioAnswerWasInterrupted(finishReason)) {
    return `${answer.trim()}\n\nLa risposta si è interrotta prima della fine. Il dettaglio è parziale: non considero completata l’analisi.`;
  }
  if (partialToolContext) {
    return `${answer.trim()}\n\nIl dettaglio letto è parziale: l’elenco potrebbe essere incompleto. Considera i totali solo per l’ambito e la copertura indicati.`;
  }
  return answer;
}
