import { ArrowRight, ListChecks } from 'lucide-react';
import { QuoteChatResponse } from './QuoteChatResponse';
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function QuoteTurnDetails({ warnings = [], receipt, revision, onReview, compact = false }: {
  warnings?: string[]; receipt?: string; revision?: number; onReview: () => void; compact?: boolean;
}) {
  const t = useT();
  if (!warnings.length && !receipt) return null;
  const changed = receipt?.match(/^Applicato alla bozza locale: (\d+) nuove voci, (\d+) voci aggiornate\./);
  const formulas = receipt?.match(/^Salvate (\d+) proposte di formula/);
  const added = Number(changed?.[1] ?? 0);
  const updated = Number(changed?.[2] ?? 0);
  const formulaCount = Number(formulas?.[1] ?? 0);
  const proposal = [
    added && t(added === 1 ? "{n} nuova voce" : "{n} nuove voci", { n: added }),
    updated && t(updated === 1 ? "{n} voce aggiornata" : "{n} voci aggiornate", { n: updated }),
    formulaCount && t(formulaCount === 1 ? "{n} formula da confermare" : "{n} formule da confermare", { n: formulaCount }),
  ].filter(Boolean).join(' · ');

  const details = <details className="quote-turn-details">
    <summary>
      <span>{compact ? warnings.length ? t("Da controllare ({n})", { n: warnings.length }) : t("Dettagli") : proposal ? t("Dettagli della proposta") : t("Dettagli della risposta")}</span>
      {!compact && !!warnings.length && <span className="quote-turn-details-count">{t(warnings.length === 1 ? "{n} punto da controllare" : "{n} punti da controllare", { n: warnings.length })}</span>}
    </summary>
    <div className="quote-turn-details-content">
      {!!warnings.length && <section aria-label={t("Verifiche del turno")}><strong>{t("Da controllare")}</strong>{warnings.map((warning, index) => <QuoteChatResponse key={index} content={warning} />)}</section>}
      {receipt && <section aria-label={t("Modifiche effettive alla bozza")}><strong>{revision != null ? t("Modifiche alla bozza · revisione {n}", { n: revision }) : t("Modifiche alla bozza")}</strong><p className="quote-turn-receipt-text">{receipt}</p>{!proposal && <button type="button" onClick={onReview}>{t("Rivedi le voci")}</button>}</section>}
    </div>
  </details>;

  if (compact) return <section className="quote-computo-turn-result" aria-label={proposal ? t("Proposta per il computo") : t("Dettagli della risposta")}>
    {proposal && <div className="quote-computo-turn-proposal">
      <strong>{proposal}</strong>
      <button type="button" onClick={onReview} className="quote-computo-turn-review">{t("Rivedi le voci")} <ArrowRight size={13} aria-hidden="true" /></button>
    </div>}
    {details}
  </section>;
  if (!proposal) return details;
  return <section className="quote-chat-proposal" aria-label={t("Proposta per il computo")}>
    <div className="quote-chat-proposal-main">
      <span className="quote-chat-proposal-icon"><ListChecks size={18} aria-hidden="true" /></span>
      <div className="quote-chat-proposal-summary">
        <strong>{formulaCount ? t("Formule proposte") : t("Proposta per il computo")}</strong>
        <span>{proposal}</span>
      </div>
      <button type="button" onClick={onReview}>{t("Rivedi le voci")} <ArrowRight size={14} aria-hidden="true" /></button>
    </div>
    {details}
  </section>;
}
