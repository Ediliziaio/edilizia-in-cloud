import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import { chiudiMarkdownParziale, QuoteChatResponse } from './QuoteChatResponse';
export type QuoteStreamingReplyHandle = { update: (text: string) => void; clear: () => void };
/** State stays here: provider fragments must not rerender the editor/PDF or be persisted. */
export const QuoteStreamingReply = forwardRef<QuoteStreamingReplyHandle, { log: RefObject<HTMLDivElement> }>(function QuoteStreamingReply({ log }, ref) {
  const [text, setText] = useState(''); const follow = useRef(true);
  useImperativeHandle(ref, () => ({
    update(next) { const element = log.current; follow.current = !element || element.scrollHeight - element.scrollTop - element.clientHeight < 100; setText(next); },
    clear() { setText(''); },
  }), [log]);
  useEffect(() => { if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight; }, [text, log]);
  if (!text) return null;
  return <article className="quote-lab-message assistant" aria-label="Risposta in elaborazione" aria-live="off"><small>Silvio sta scrivendo…</small><QuoteChatResponse content={chiudiMarkdownParziale(text)} /></article>;
});
