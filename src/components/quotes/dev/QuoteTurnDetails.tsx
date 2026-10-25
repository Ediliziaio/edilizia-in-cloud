import { QuoteChatResponse } from './QuoteChatResponse';

export function QuoteTurnDetails({ warnings = [], receipt, revision, onReview }: {
  warnings?: string[]; receipt?: string; revision?: number; onReview: () => void;
}) {
  if (!warnings.length && !receipt) return null;
  const changed = receipt?.match(/^Applicato alla bozza locale: (\d+) nuove voci, (\d+) voci aggiornate\./);
  const formulas = receipt?.match(/^Salvate (\d+) proposte di formula/);
  const changedCount = changed ? Number(changed[1]) + Number(changed[2]) : 0;
  return <details className="quote-turn-details">
    <summary>
      <span>{changedCount ? `${changedCount} ${changedCount === 1 ? 'voce aggiornata' : 'voci aggiornate'} · Vedi modifiche` : formulas ? `${formulas[1]} formule da confermare` : 'Dettagli del turno'}</span>
      {!!warnings.length && <span className="quote-turn-details-count">{warnings.length} da verificare</span>}
    </summary>
    <div className="quote-turn-details-content">
      {!!warnings.length && <section aria-label="Verifiche del turno"><strong>Da verificare</strong>{warnings.map((warning, index) => <QuoteChatResponse key={index} content={warning} />)}</section>}
      {receipt && <section aria-label="Modifiche effettive alla bozza"><strong>Modifiche alla bozza{revision != null ? ` · revisione ${revision}` : ''}</strong><p className="quote-turn-receipt-text">{receipt}</p><button type="button" onClick={onReview}>Rivedi le voci</button></section>}
    </div>
  </details>;
}
