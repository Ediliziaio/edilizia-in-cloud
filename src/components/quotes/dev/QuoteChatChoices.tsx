import { Check, ArrowUpRight } from "lucide-react";
import type { QuoteChatChoice } from "../../../../supabase/functions/_shared/quoteChoices";

export function QuoteChatChoices({ choices, selectedId, active, busy, draftText = "", hideCaption = false, onChoose, onCustomize }: {
  choices: QuoteChatChoice[]; selectedId?: string; active: boolean; busy: boolean;
  draftText?: string; hideCaption?: boolean;
  onChoose: (choice: QuoteChatChoice) => void; onCustomize: () => void;
}) {
  if (!choices.length) return null;
  const locked = !active || busy || !!selectedId;
  return <div className="quote-chat-choices" data-settled={!!selectedId}>
    {(!hideCaption || selectedId || !active) && <span className="quote-choice-caption">{selectedId ? "Scelta inviata in chat" : active ? "Scegli come proseguire" : "Alternative di un passaggio precedente"}</span>}
    <div className="quote-choice-options" role="group" aria-label="Alternative proposte">
      {choices.map((choice, index) => <button type="button" key={choice.id} aria-pressed={selectedId === choice.id} disabled={locked || !!draftText.trim() && draftText.length + choice.reply.length + 2 > 3000}
        className="quote-choice-pill" style={{ animationDelay: `${index * 45}ms` }} onClick={() => onChoose(choice)}>
        <span className="quote-choice-icon" aria-hidden="true">{selectedId === choice.id ? <Check size={14} /> : <ArrowUpRight size={14} />}</span><span>{choice.label}</span>
      </button>)}
    </div>
    {active && !selectedId && <button type="button" className="quote-choice-custom" aria-label="Un’altra soluzione? Scrivila tu" disabled={busy} onClick={onCustomize}>Altra risposta</button>}
    {active && !selectedId && !!draftText.trim() && <p className="quote-choice-note">La scelta si aggiunge al testo che hai scritto, senza inviarlo.</p>}
  </div>;
}
