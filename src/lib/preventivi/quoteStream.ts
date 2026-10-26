import { QUOTE_PROGRESS, type QuoteStreamEvent } from '../../../supabase/functions/_shared/quoteStream';
import { publicQuoteFailure } from '../../../supabase/functions/_shared/quoteFailure';
import { segnalaCreditoEsaurito } from '../creditoEsaurito';
export const quoteProgressLabel = { analysis: 'Leggo il progetto e le scelte già fatte', catalogue: 'Cerco e verifico i riferimenti nel prezzario', composition: 'Compongo la risposta con i riferimenti trovati', validation: 'Controllo proposte, esclusioni e riferimenti' };
/** Bounded SSE reader: no partial JSON, tool arguments or prose ever mutate the draft. */
export async function readQuoteStream(response: Response, identity: { turnId: string; revision: number }, signal: AbortSignal, progress?: (event: QuoteStreamEvent) => void): Promise<unknown> {
  const reader = response.body?.getReader(); if (!reader) throw new Error('Flusso AI mancante.');
  const decoder = new TextDecoder(); let buffer = '', bytes = 0, count = 0, final: unknown, completed = false;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const parse = (frame: string) => {
    if (!frame.trim() || frame.startsWith(':')) return;
    if (++count > 48 || completed) throw new Error('Sequenza AI non valida.');
    const data = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    const event = JSON.parse(data);
    if (!event || event.turnId !== identity.turnId || event.revision !== identity.revision) throw new Error('Avanzamento non riferito al turno corrente.');
    if (event.type === 'progress' && QUOTE_PROGRESS.includes(event.stage)) progress?.({ type: 'progress', ...identity, stage: event.stage });
    else if (event.type === 'draft' && [0, 1].includes(event.stage) && typeof event.text === 'string' && event.text.length <= 3000) progress?.({ type: 'draft', ...identity, stage: event.stage, text: event.text });
    else if (event.type === 'result') { final = event.result; completed = true; }
    else if (event.type === 'error') {
      const failure = publicQuoteFailure(event.code);
      // Nel flusso l'errore arriva come evento, non come 402: la finestra di ricarica si apre da qui.
      if (failure.code === 'AI_COMPANY_CREDIT') segnalaCreditoEsaurito({ portafoglio: 'ai', messaggio: failure.message });
      throw Object.assign(new Error(failure.message), { code: failure.code });
    }
    else throw new Error('Evento AI non riconosciuto.');
  };
  try {
    while (true) {
      signal.throwIfAborted(); const { done, value } = await reader.read(); signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength; if (bytes > 700_000) throw new Error('Risposta AI troppo grande.');
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
      let end: number; while ((end = buffer.indexOf('\n\n')) >= 0) { parse(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
    }
    buffer += decoder.decode();
    if (buffer.trim() || !completed) throw new Error('Risposta AI incompleta. La bozza è invariata.');
    return final;
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
