import { QuoteChatResponse } from './QuoteChatResponse';
import type { QuoteChatReference } from '../../../../supabase/functions/_shared/quoteConversation';
/** Progressive disclosure of the existing diagnostic. No new executable model commands. */
export function QuoteCatalogueMessage({ content, actions, disabled, onAction, references = [] }: { content: string; actions?: string[]; disabled: boolean; onAction: (action: string) => void; references?: QuoteChatReference[] }) {
  const parts = content.split(/(?=\*\*Risultato \d+ · )/);
  if (parts.length < 2) return <QuoteChatResponse content={content} />;
  const render = (part: string) => {
    const match = /^\*\*Risultato (\d+) · ([^*]+)\*\*\n([^\n]+)\n([\s\S]*)/.exec(part);
    if (!match) return null;
    const [, number, code, meta, rest] = match;
    const original = references.find(r => r.code === code);
    const [description, ...notes] = rest.split(/\n(?=Nessun collegamento|Candidato da verificare|Nessun prezzo|Codici non restituiti)/);
    const buttons = (actions ?? []).filter(a => a.startsWith(`Collega codice ${code} alla voce `));
    return <section className="quote-catalogue-card" key={number} aria-label={`Candidato ${number}`}><small>RISULTATO {number}</small><h4>{description.slice(0, 135)}{description.length > 135 ? '…' : ''}</h4><p>{meta}</p><p className="quote-catalogue-check">{notes[0]?.split('\n\n')[0]}</p>
      <details><summary>Codice, fonte e descrizione originale</summary><code>{code}</code><p>{meta}</p><QuoteChatResponse content={original?.description ?? rest} />{original && <p>{notes[0]?.split('\n\n')[0]}</p>}</details>
      {buttons.map(action => <button key={action} disabled={disabled} onClick={() => onAction(action)}>Collega alla voce {action.match(/alla voce (\d+)/)?.[1]}</button>)}
    </section>;
  };
  return <div className="quote-catalogue-results"><p><strong>Risultati del prezzario</strong> · nessun prezzo applicato</p><details><summary>Dettagli della ricerca</summary><QuoteChatResponse content={parts[0]} /></details>{parts.slice(1, 4).map(render)}{parts.length > 4 && <details><summary>Altri {parts.length - 4} risultati</summary>{parts.slice(4).map(render)}</details>}</div>;
}
