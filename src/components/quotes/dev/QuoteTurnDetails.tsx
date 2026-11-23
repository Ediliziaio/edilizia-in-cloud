import { ArrowRight, ListChecks } from 'lucide-react';
import { QuoteChatResponse } from './QuoteChatResponse';

export function QuoteTurnDetails({ warnings = [], receipt, revision, onReview, compact = false }: {
  warnings?: string[]; receipt?: string; revision?: number; onReview: () => void; compact?: boolean;
}) {
  if (!warnings.length && !receipt) return null;
  const changed = receipt?.match(/^Applicato alla bozza locale: (\d+) nuove voci, (\d+) voci aggiornate\./);
  const formulas = receipt?.match(/^Salvate (\d+) proposte di formula/);
  const added = Number(changed?.[1] ?? 0);
  const updated = Number(changed?.[2] ?? 0);
  const formulaCount = Number(formulas?.[1] ?? 0);
  const proposal = [
    added && `${added} ${added === 1 ? 'nuova voce' : 'nuove voci'}`,
    updated && `${updated} ${updated === 1 ? 'voce aggiornata' : 'voci aggiornate'}`,
    formulaCount && `${formulaCount} ${formulaCount === 1 ? 'formula da confermare' : 'formule da confermare'}`,
  ].filter(Boolean).join(' · ');

  const details = <details className="quote-turn-details">
    <summary>
      <span>{compact ? warnings.length ? `Da controllare (${warnings.length})` : 'Dettagli' : proposal ? 'Dettagli della proposta' : 'Dettagli della risposta'}</span>
      {!compact && !!warnings.length && <span className="quote-turn-details-count">{warnings.length} {warnings.length === 1 ? 'punto' : 'punti'} da controllare</span>}
    </summary>
    <div className="quote-turn-details-content">
      {!!warnings.length && <section aria-label="Verifiche del turno"><strong>Da controllare</strong>{warnings.map((warning, index) => <QuoteChatResponse key={index} content={warning} />)}</section>}
      {receipt && <section aria-label="Modifiche effettive alla bozza"><strong>Modifiche alla bozza{revision != null ? ` · revisione ${revision}` : ''}</strong><p className="quote-turn-receipt-text">{receipt}</p>{!proposal && <button type="button" onClick={onReview}>Rivedi le voci</button>}</section>}
    </div>
  </details>;

  if (compact) return <section className="quote-computo-turn-result" aria-label={proposal ? 'Proposta per il computo' : 'Dettagli della risposta'}>
    {proposal && <div className="quote-computo-turn-proposal">
      <strong>{proposal}</strong>
      <button type="button" onClick={onReview} className="quote-computo-turn-review">Rivedi le voci <ArrowRight size={13} aria-hidden="true" /></button>
    </div>}
    {details}
  </section>;
  if (!proposal) return details;
  return <section className="quote-chat-proposal" aria-label="Proposta per il computo">
    <div className="quote-chat-proposal-main">
      <span className="quote-chat-proposal-icon"><ListChecks size={18} aria-hidden="true" /></span>
      <div className="quote-chat-proposal-summary">
        <strong>{formulaCount ? 'Formule proposte' : 'Proposta per il computo'}</strong>
        <span>{proposal}</span>
      </div>
      <button type="button" onClick={onReview}>Rivedi le voci <ArrowRight size={14} aria-hidden="true" /></button>
    </div>
    {details}
  </section>;
}
