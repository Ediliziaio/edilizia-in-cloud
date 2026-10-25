import { classifyQuoteFailure } from './quoteFailure.ts';
/** Operation events, NOT simulated tokens. Only a complete result may change a quote. */
export const QUOTE_PROGRESS = ['analysis', 'catalogue', 'composition', 'validation'] as const;
export type QuoteProgress = typeof QUOTE_PROGRESS[number];
export type QuoteProgressEvent = { type: 'progress'; turnId: string; revision: number; stage: QuoteProgress };
export type QuoteDraftEvent = { type: 'draft'; turnId: string; revision: number; stage: 0 | 1; text: string };
export type QuoteStreamEvent = QuoteProgressEvent | QuoteDraftEvent;
export function quoteEventResponse<T>(run: (emit: (stage: QuoteProgress) => void, draft: (text: string, stage: 0 | 1) => void) => Promise<T>, identity: { turnId: string; revision: number }, signal: AbortSignal, headers: HeadersInit): Response {
  const encoder = new TextEncoder(); let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: unknown) => { if (!closed && !signal.aborted) controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)); };
      void (async () => {
        try {
          let count = 0, previous = '', lastSent = 0, lastStage = -1;
          const draft = (text: string, stage: 0 | 1) => {
            if (count >= 32 || !text || text.length > 3000 || text === previous && stage === lastStage) return;
            const now = Date.now(); if (stage === lastStage && now - lastSent < 250) return;
            count++; previous = text; lastStage = stage; lastSent = now;
            send({ type: 'draft', ...identity, stage, text });
          };
          const result = await run(stage => send({ type: 'progress', ...identity, stage }), draft); send({ type: 'result', ...identity, result });
        }
        catch (error) {
          if (!closed && !signal.aborted) {
            const failure = classifyQuoteFailure(error);
            // This asynchronous catch runs after the HTTP handler returned its
            // Response: the handler's outer catch cannot observe these errors.
            console.error('[quote-chat-stream]', { code: failure.code });
            send({ type: 'error', ...identity, ...failure });
          }
        }
        finally { if (!closed) { closed = true; controller.close(); } }
      })();
    },
    cancel() { closed = true; },
  });
  const h = new Headers(headers); h.set('Content-Type', 'text/event-stream; charset=utf-8'); h.set('Cache-Control', 'no-store'); h.set('X-Accel-Buffering', 'no');
  return new Response(stream, { headers: h });
}
