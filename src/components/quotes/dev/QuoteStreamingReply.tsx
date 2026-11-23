import { forwardRef, useImperativeHandle, useLayoutEffect, useState, type RefObject } from 'react';
import { SilvioAvatar } from '@/components/silvio/SilvioAvatar';
import { PixelDotsLoader } from '@/components/ui/ai-agent-response';
import { chiudiMarkdownParziale, QuoteChatResponse } from './QuoteChatResponse';

export type QuoteStreamingReplyHandle = { update: (text: string) => void; clear: () => void };
type Props = {
  status?: string;
  elapsedSeconds?: number;
  showProgress?: boolean;
  log?: RefObject<HTMLDivElement>;
  follow?: boolean;
  inline?: boolean;
};

/** Keep streamed text local to this component so it does not refresh the PDF or enter the saved chat. */
export const QuoteStreamingReply = forwardRef<QuoteStreamingReplyHandle, Props>(function QuoteStreamingReply(
  { status, elapsedSeconds, showProgress, log, follow, inline }, ref,
) {
  const [text, setText] = useState('');
  const hasText = !!text.trim();
  const label = hasText && !showProgress ? 'Silvio sta scrivendo…' : status;

  useImperativeHandle(ref, () => ({
    update: setText,
    clear() { setText(''); },
  }), []);
  useLayoutEffect(() => {
    const element = log?.current;
    if (follow && element) element.scrollTo?.({ top: element.scrollHeight, behavior: 'auto' });
  }, [text, label, follow, log]);

  if (!label && !hasText) return null;
  const Wrapper = inline ? 'div' : 'article';
  return <Wrapper role={inline ? 'group' : undefined} className={inline ? 'quote-live-reply quote-live-reply-inline' : 'quote-lab-message assistant quote-live-reply'} aria-label="Risposta in elaborazione" aria-live="off">
    <div className="quote-message-author"><SilvioAvatar size={24} bg="navy" title="" />Silvio</div>
    {hasText && <div className="quote-live-reply-text"><QuoteChatResponse content={chiudiMarkdownParziale(text)} /></div>}
    <div className="quote-live-reply-status">
      <PixelDotsLoader className="text-orange-600" />
      <span className="quote-live-reply-label" role="status" aria-live="polite" aria-atomic="true">
        <span key={label}>{label}</span>
      </span>
      {elapsedSeconds !== undefined && <span className="quote-live-reply-time" aria-hidden="true">{elapsedSeconds}s</span>}
    </div>
  </Wrapper>;
});
