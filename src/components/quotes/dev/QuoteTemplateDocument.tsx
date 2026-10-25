import { useEffect, useRef, useState } from 'react';
import { QuoteTemplatePreview, type TemplatePreviewDocument } from '../QuoteTemplatePreview';
import type { QuoteTemplate } from '@/types/quoteTemplate';
import { DEFAULT_TEMPLATE } from '@/types/quoteTemplate';
import { resolveQuoteTemplatePreview } from '@/lib/quoteTemplatePreview';
import { templateAssetUrl } from '@/pages/azienda/marketing/QuoteBuilder/helpers';
import { formatCurrency } from '@/lib/formatters';

export type QuoteWorkspaceTemplates = { templates: QuoteTemplate[]; defaultId?: string; brandColor?: string | null; logo?: string | null; logoLight?: string | null; loading?: boolean; error?: boolean; retry?: () => void };
// eslint-disable-next-line react-refresh/only-export-components -- pure selector shared by the local chat commands
export function workspaceOfferTemplates(library?: QuoteWorkspaceTemplates) {
  return (library?.templates ?? []).filter(t => t.is_active !== false && (t.kind ?? 'offerta') === 'offerta');
}
/** Same visual component as Settings > quote models, with live data instead of samples.
 * No PDF endpoint: that preview mode currently uses fictitious line items. */
export function QuoteTemplateDocument({ library, templateId, data, companyName, incomplete, awaiting, pending = [], onModels, onReview, focusWork = false }: {
  library?: QuoteWorkspaceTemplates; templateId?: string | null; data: TemplatePreviewDocument; companyName: string;
  incomplete: number; awaiting: number; onModels?: () => void; onReview: () => void; focusWork?: boolean;
  pending?: Array<{ id: string; title: string; quantity: number | null; unit: string; price: number | null }>;
}) {
  const host = useRef<HTMLDivElement>(null); const detail = useRef<HTMLDivElement>(null); const [scale, setScale] = useState(.65);
  useEffect(() => { if (focusWork && host.current && detail.current) host.current.scrollTop += detail.current.getBoundingClientRect().top - host.current.getBoundingClientRect().top - 12; }, [focusWork, templateId, library?.defaultId, library?.loading, scale]);
  useEffect(() => { if (!host.current || typeof ResizeObserver === 'undefined') return; const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, Math.max(.2, (entry.contentRect.width - 24) / 595)))); observer.observe(host.current); return () => observer.disconnect(); }, []);
  const offers = workspaceOfferTemplates(library);
  const selected = templateId === null ? undefined : offers.find(t => t.id === (templateId ?? library?.defaultId));
  const missing = !!templateId && !selected;
  const template = resolveQuoteTemplatePreview(selected ?? { ...DEFAULT_TEMPLATE, name: 'Preventivo classico', layout: 'classic' }, library?.templates ?? [], library?.brandColor);
  const cover = !!(template.cover_title?.trim() || template.cover_subtitle?.trim() || (template.show_cover_image && template.cover_image_url));
  const productIds = selected?.linked_product_ids ?? []; const sectionIds = selected?.linked_section_ids ?? [];
  const blocks = [...productIds, ...sectionIds].flatMap(id => {
    const block = library?.templates.find(t => t.id === id && t.is_active !== false && (productIds.includes(id) ? t.kind === 'prodotto' : t.kind === 'sezione'));
    return block ? [{ id, title: block.name, text: block.kind === 'prodotto' ? [block.product_short_description, block.product_long_description].filter(Boolean).join('\n\n') : block.body_html ?? '', image: block.kind === 'prodotto' ? templateAssetUrl(block.product_image_url) : undefined, specs: block.kind === 'prodotto' ? block.product_specs : undefined }] : [];
  });
  const props = { template, documentData: { ...data, blocks }, companyName, scale, logoSrc: templateAssetUrl(template.logo_url || library?.logo), logoLightSrc: library?.logoLight ?? undefined, coverSrc: templateAssetUrl(template.cover_image_url) };
  return <section className="quote-template-document" aria-label="Anteprima del modello aziendale">
    <header><div><h2>Anteprima preventivo</h2><p>{library?.loading ? 'Caricamento modelli aziendali…' : template.name} <span>· {template.layout}</span></p></div>{onModels && <button onClick={onModels}>Cambia modello</button>}</header>
    <div className="quote-template-review"><p><strong>{data.rows.length}</strong> confermate <span>· {incomplete} da completare · {awaiting} da confermare</span></p><button onClick={onReview}>Rivedi voci ↗</button></div>
    {!!pending.length && <details open={focusWork || undefined} className="quote-template-pending"><summary>{pending.length} proposte fuori dal documento</summary><section aria-label="Proposte non incluse nel parziale">{pending.map(row => <p key={row.id}><strong>{row.title}</strong><span>{row.quantity == null ? 'Quantità da definire' : `${row.quantity.toLocaleString('it-IT')} ${row.unit}`} · {row.price == null ? 'Prezzo da definire' : `${formatCurrency(row.price)} · da confermare`}</span></p>)}<button onClick={onReview}>Completa le voci</button></section></details>}
    {(missing || library?.error) && <div role="alert" className="quote-memory-warning">{missing ? 'Il modello salvato non è più disponibile. Mostro il classico, senza cambiare la scelta salvata.' : 'Non riesco a leggere i modelli aziendali. Mostro il classico, non una copia del modello mancante.'}{library?.retry && <button onClick={library.retry}>Riprova modelli</button>}</div>}
    {cover && <div className="quote-document-navigation" aria-label="Scorciatoie nel documento"><button onClick={() => { if (host.current) host.current.scrollTop = 0; }}>Vedi copertina</button><button onClick={() => { if (host.current && detail.current) host.current.scrollTop += detail.current.getBoundingClientRect().top - host.current.getBoundingClientRect().top - 12; }}>Vai alle lavorazioni ↓</button></div>}
    <div ref={host} className="quote-template-scroll" tabIndex={0} aria-label="Documento nel template scelto">
      {cover && <div className="quote-template-sheet"><QuoteTemplatePreview {...props} page="cover" /></div>}
      <div ref={detail} className="quote-template-sheet"><QuoteTemplatePreview {...props} page="detail" /></div>
    </div>
    <footer><div><span>{data.rows.length ? data.taxPending || data.gross == null ? 'Parziale netto · IVA da definire' : data.displayGross ? 'Totale IVA compresa' : 'Imponibile netto + IVA' : 'Nessun importo confermato'}</span><strong aria-live="polite">{data.rows.length ? formatCurrency(data.displayGross && !data.taxPending && data.gross != null ? data.gross : data.net) : 'Da determinare'}</strong></div>{!data.taxPending && data.tax != null && data.gross != null && <p>Netto {formatCurrency(data.net)} · IVA {formatCurrency(data.tax)} · Totale {formatCurrency(data.gross)}</p>}<p>Stesso modello della libreria preventivi, con i dati di questa bozza. Anteprima HTML, non il PDF definitivo. Nessun salvataggio nel gestionale o invio ai clienti.</p></footer>
  </section>;
}
