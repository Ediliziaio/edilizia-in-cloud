import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { quotePriceLabel } from '@/lib/preventivi/quoteProposalReview';
import { quantitaProposta, type WizardAiChange } from '@/lib/preventivi/wizardAiDraft';
import type { ApartmentOverride } from "@/lib/preventivi/devLombardiaApartment";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
export type EditableQuoteLine = { id: string; title: string; description: string; quantity: number | null; price: number | null; unit: string; included: boolean; issue: string | null; reference: string; originalDescription?: string; archived?: boolean };
export type QuoteLineActions = { onPatch: (id: string, patch: ApartmentOverride) => void; onReset: (id: string) => void };
export type ComputoLineMetadata = { codice: string; capitolo: string };
const numeric = (value: string) => {
  if (!value.trim()) return null;
  const n = Number(value); return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? n : null;
};

function quoteLineFields(t: ReturnType<typeof useT>, row: EditableQuoteLine, number: number, { onPatch, onReset }: QuoteLineActions) {
  return {
    description: <>
      <input aria-label={t("Titolo voce {n}", { n: number })} value={row.title} maxLength={200} onChange={e => onPatch(row.id, { title: e.target.value })} />
      <details><summary>{t("Descrizione")}</summary><textarea aria-label={t("Descrizione voce {n}", { n: number })} rows={3} maxLength={6000} value={row.description} onChange={e => onPatch(row.id, { description: e.target.value })} /></details>
    </>,
    quantity: <input aria-label={t("Quantità voce {n}", { n: number })} type="number" min="0.01" max="1000000" step="0.01" value={row.quantity ?? ''} placeholder={t("Da definire")} onChange={e => onPatch(row.id, { quantity: numeric(e.target.value) })} />,
    unit: <input key={row.unit} aria-label={t("Unità voce {n}", { n: number })} defaultValue={row.unit} maxLength={24}
      onBlur={e => { if (e.currentTarget.value !== row.unit) onPatch(row.id, { unit: e.currentTarget.value }); }}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />,
    price: <input aria-label={t("Prezzo voce {n}", { n: number })} type="number" min="0.01" max="1000000" step="0.01" value={row.price ?? ''} placeholder={t("Da definire")} onChange={e => onPatch(row.id, { price: numeric(e.target.value) })} />,
    included: <input aria-label={t("Includi voce {n}", { n: number })} type="checkbox" checked={row.included} disabled={!!row.issue} onChange={e => onPatch(row.id, { approved: e.target.checked })} />,
    reference: <>
      <small>{row.reference}</small>
      {row.originalDescription && <details><summary>{t("Testo originale del listino")}</summary><p>{row.originalDescription}</p></details>}
    </>,
    reset: <button type="button" className="chat-inline-reset" onClick={() => onReset(row.id)} aria-label={t("Ripristina voce {n}", { n: number })}>{t("Ripristina")}</button>,
  };
}
/** Compact direct edits; the parent can keep this mounted in a workbench tab. */
export default function QuoteLineEditor({ rows, onPatch, onReset }: { rows: EditableQuoteLine[] } & QuoteLineActions) {
  const t = useT();
  const elements = useRef(new Map<string, HTMLTableRowElement>());
  const previous = useRef(new Map(rows.map(row => [row.id, row])));
  const animations = useRef(new Map<string, Animation>());
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    for (const row of rows) {
      const old = previous.current.get(row.id);
      const changed = !old || old.title !== row.title || old.description !== row.description || old.quantity !== row.quantity || old.unit !== row.unit || old.price !== row.price || old.included !== row.included;
      if (!changed || row.archived) continue;
      animations.current.get(row.id)?.cancel(); animations.current.delete(row.id);
      if (reduced) continue;
      const animation = elements.current.get(row.id)?.animate?.([{ backgroundColor: '#fff0db' }, { backgroundColor: 'transparent' }], { duration: 650, easing: 'ease-out' });
      if (animation) { animations.current.set(row.id, animation); animation.onfinish = () => { if (animations.current.get(row.id) === animation) animations.current.delete(row.id); }; }
    }
    previous.current = new Map(rows.map(row => [row.id, row]));
  }, [rows]);
  useEffect(() => { const active = animations.current; return () => { active.forEach(a => a.cancel()); active.clear(); }; }, []);
  if (!rows.length) return null;
  return <section className="chat-inline-editor" aria-label={t("Voci modificabili del preventivo")}><header><h2>{t("Voci del preventivo")}</h2><p>{t("Modifica qui oppure scrivilo in chat. Gli importi si aggiornano subito. «Inclusa» non significa prezzo verificato: controlla la provenienza sotto ogni voce.")}</p></header>
    <div className="chat-inline-table"><table><thead><tr><th>{t("Voce e descrizione")}</th><th>{t("Quantità")}</th><th>{t("Unità")}</th><th>{t("Prezzo netto")}</th><th>{t("Inclusa")}</th></tr></thead>
      <tbody>{rows.map((row, i) => {
        if (row.archived) return null;
        const fields = quoteLineFields(t, row, i + 1, { onPatch, onReset });
        return <tr key={row.id} ref={element => { if (element) elements.current.set(row.id, element); else elements.current.delete(row.id); }}>
          <td><small>{t("Voce {n}", { n: i + 1 })}</small>{fields.description}{fields.reference}{fields.reset}
            {row.issue && <p className="regional-warning" role="status">{row.issue}</p>}
          </td>
          <td>{fields.quantity}</td><td>{fields.unit}</td><td>{fields.price}</td><td>{fields.included}</td>
        </tr>;
      })}</tbody>
    </table></div>
    {rows.some(r => r.archived) && <details><summary>{t("Storico voci sostituite ({n})", { n: rows.filter(r => r.archived).length })}</summary>{rows.filter(r => r.archived).map(r => <article key={r.id}><strong>{r.title}</strong><p>{r.description}</p><p>{r.issue} {t("Per ripristinare, chiedi «Mostra doppioni» nella chat.")}</p></article>)}</details>}
  </section>;
}

function unitaVisibile(unit: string) {
  return ({ mq: 'm²', mc: 'm³' } as Record<string, string>)[unit] ?? unit;
}

const labels: Record<WizardAiChange['kind'], string> = { aggiunta: 'Nuova proposta', modifica: 'Modifica proposta', esclusione: 'Esclusione proposta' };
const testoRicerca = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it');

export function QuoteComputoLines({ document, original, changes, rows, metadata, ...actions }: {
  document: ChatDocument; original: ChatDocument;
  changes: WizardAiChange[]; rows: EditableQuoteLine[]; metadata?: Record<string, ComputoLineMetadata>;
} & QuoteLineActions) {
  const t = useT();
  const [soloModifiche, setSoloModifiche] = useState(false);
  const [ricerca, setRicerca] = useState('');
  const [voceAperta, setVoceAperta] = useState<string | null>(null);
  const idDettaglio = useId();
  const before = new Map(original.lines.map(line => [line.id, line]));
  const proposed = new Map(changes.map(change => [change.id, change.kind]));
  const entries = rows.map((row, index) => {
    const line = document.lines[index];
    const previous = before.get(row.id);
    const changed = previous && (previous.title !== row.title || previous.description !== row.description || previous.quantity !== row.quantity ||
      previous.unit !== row.unit || previous.price !== row.price || previous.included !== row.included);
    const kind = proposed.get(row.id) ?? (row.archived && previous ? 'esclusione' : !previous ? 'aggiunta' : changed ? 'modifica' : undefined);
    return { row, line, previous, kind, meta: metadata?.[row.id], number: index + 1 };
  });
  const visible = entries.filter(({ row, previous }) => !row.archived || previous);
  const revisioni = visible.filter(({ kind }) => kind);
  const storico = entries.filter(({ row, previous }) => row.archived && !previous);
  const cerca = testoRicerca(ricerca.trim());
  const filtered = (soloModifiche && revisioni.length ? revisioni : visible).filter(({ row, line, meta }) => (
    !cerca || testoRicerca([row.title, row.description, meta?.capitolo, meta?.codice, line.reference?.code, line.reference?.sourceName].filter(Boolean).join(' ')).includes(cerca)
  ));
  // New suggestions lead the list. Editing a saved row keeps it in its original position.
  const ordered = [...filtered.filter(entry => !entry.previous), ...filtered.filter(entry => entry.previous)];

  return <section className="quote-computo-lines" aria-label={t("Voci del computo")}>
    <div className="quote-computo-lines-toolbar" data-has-modifiche={!!revisioni.length || undefined}>
      <label className="quote-computo-search">
        <Search size={15} aria-hidden="true" />
        <input type="search" aria-label={t("Cerca nelle voci")} placeholder={t("Cerca voce o codice")} value={ricerca} onChange={e => setRicerca(e.target.value)} />
      </label>
      {!!revisioni.length && <label className="quote-computo-line-filter">
        <input type="checkbox" checked={soloModifiche} onChange={e => setSoloModifiche(e.target.checked)} />
        {t("Solo modifiche")} <span className="tabular-nums">{revisioni.length}</span>
      </label>}
      <span className="quote-computo-lines-count" role="status">
        {ordered.length === visible.length ? t(visible.length === 1 ? "{n} voce" : "{n} voci", { n: visible.length }) : t("{n} di {totale} voci", { n: ordered.length, totale: visible.length })}
      </span>
    </div>
    <div className="quote-computo-lines-scroll">
    {ordered.length ? <table role="table" className="quote-computo-lines-table" aria-label={t("Lavorazioni del computo")}>
      <colgroup><col className="quote-cme-numero" /><col /><col className="quote-cme-quantita" /><col className="quote-cme-unita" /><col className="quote-cme-prezzo" /><col className="quote-cme-stato" /></colgroup>
      <thead><tr><th scope="col">{t("N.")}</th><th scope="col">{t("Lavorazione")}</th><th scope="col">{t("Quantità")}</th><th scope="col">{t("U.M.")}</th><th scope="col">{t("Prezzo unit. netto")}</th><th scope="col">{t("Stato")}</th></tr></thead>
      <tbody>
      {ordered.map(({ row, line, previous, kind, meta, number }) => {
        const excluded = kind === 'esclusione';
        const shown = excluded && previous ? previous : line;
        const quantity = quantitaProposta(shown);
        const estimate = shown.price == null ? shown.estimate : undefined;
        const reference = shown.reference?.id === shown.referenceId ? shown.reference : null;
        const fonte = reference ? `${reference.code} · ${reference.sourceName}` : [meta?.codice, meta?.capitolo, kind && shown.quantityBasis].filter(Boolean).join(' · ');
        const open = voceAperta === row.id;
        const fields = open && !row.archived ? quoteLineFields(t, row, number, actions) : null;
        return <Fragment key={row.id}>
          <tr className="quote-computo-line" data-kind={kind} data-open={open || undefined}>
            <td className="quote-cme-numero">{number}</td>
            <td className="quote-cme-nome"><button type="button" aria-expanded={open} aria-controls={open ? idDettaglio : undefined}
              onClick={() => setVoceAperta(open ? null : row.id)} title={shown.title}>
              <span className="quote-computo-line-heading">
                <strong>{shown.title || t("Voce da completare")}</strong>
                <ChevronDown className="quote-computo-line-chevron" size={16} aria-hidden="true" />
              </span>
              {fonte && <small className="quote-computo-line-source">{fonte}</small>}
            </button></td>
            <td className="quote-cme-quantita">{quantity == null ? t("Da confermare") : quantity.toLocaleString(intlCampo(), { maximumFractionDigits: 6 })}<span className="quote-cme-unita-mobile">{quantity != null && ` ${unitaVisibile(shown.unit)}`}</span></td>
            <td className="quote-cme-unita">{unitaVisibile(shown.unit)}</td>
            <td className="quote-cme-prezzo">{shown.price != null ? formatCurrency(shown.price) : estimate
              ? <span className="quote-cme-stima"><small>{t("Stima")}</small>{formatCurrency(estimate.low)}–{formatCurrency(estimate.high)}</span> : t("Prezzo da definire")}</td>
            <td className="quote-cme-stato">{kind ? <span className="quote-wizard-ai-change" data-kind={kind}>{t(labels[kind])}</span> : row.issue ? t("Da completare") : null}</td>
          </tr>
          {open && <tr className="quote-computo-line-detail"><td colSpan={6} id={idDettaglio}>
            {fields ? (
              <div className="quote-computo-line-fields">
                {fields.description}
                <div className="quote-computo-line-numbers">
                  <label>{t("Quantità")}{fields.quantity}</label><label>{t("Unità")}{fields.unit}</label><label>{t("Prezzo netto")}{fields.price}</label>
                </div>
                {reference && line.quantityBasis && <small>{line.quantityBasis}</small>}
                {line.price != null && <small>{quotePriceLabel(line)}{line.pricing?.basis && ` · ${line.pricing.basis}`}</small>}
                {estimate && <small>{estimate.basis} · {estimate.assumptions}</small>}
                {row.originalDescription && <details><summary>{t("Testo originale del listino")}</summary><p>{row.originalDescription}</p></details>}
                {row.issue && <p className="text-amber-800" role="status">{row.issue}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2"><label className="inline-flex items-center gap-2">{fields.included} {t("Inclusa")}</label>{fields.reset}</div>
              </div>
            ) : <p className="p-3 text-xs text-slate-600">{row.issue} {t("Per ripristinare la voce, chiedi «Mostra doppioni» in chat.")}</p>}
          </td></tr>}
        </Fragment>;
      })}
      </tbody>
    </table> : <p className="quote-computo-lines-empty">{visible.length ? t("Nessuna voce corrisponde alla ricerca.") : t("Le lavorazioni che prepari con Silvio compariranno qui.")}</p>}
    {!!storico.length && <details className="m-3 text-xs text-slate-600"><summary>{t("Storico voci sostituite ({n})", { n: storico.length })}</summary>
      {storico.map(({ row }) => <article key={row.id} className="mt-2"><strong>{row.title}</strong><p>{row.description}</p><p>{row.issue} {t("Per ripristinare, chiedi «Mostra doppioni» in chat.")}</p></article>)}
    </details>}
    </div>
  </section>;
}
