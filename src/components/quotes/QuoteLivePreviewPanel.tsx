import { useState } from "react";
import { Eye, FileText, Image as ImageIcon } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { DEFAULT_TEMPLATE, type QuoteTemplate } from "@/types/quoteTemplate";
import type { QuoteItemPro } from "@/types/quoteItem";
import { recalcPhaseAmounts, paymentPlanError, type QuotePaymentPhase } from "@/lib/preventivi/paymentTerms";
import { substituteMergeTags, type MergeContext } from "../../../supabase/functions/_shared/quoteTemplateComposer";

export interface QuoteLivePreviewProps {
  template: Partial<QuoteTemplate>;
  companyName: string;
  clientName: string;
  clientAddress?: string;
  title: string;
  description?: string;
  siteAddress?: string;
  validityDays: number;
  items: QuoteItemPro[];
  showImages?: boolean;
  imageForItem?: (item: QuoteItemPro) => string | null | undefined;
  showMeasurements?: boolean;
  subtotal: number;
  net: number;
  total: number;
  vatBreakdown: Record<string, number>;
  discountPercent: number;
  manualPrice: boolean;
  showPrices: boolean;
  onlyTotal: boolean;
  showDiscounts: boolean;
  notes?: string;
  showNotes: boolean;
  showConditions: boolean;
  showSignature: boolean;
  paymentMethod: string;
  paymentPhases: QuotePaymentPhase[];
  logoSrc?: string | null;
  coverSrc?: string | null;
  mergeContext?: MergeContext;
}

/** Anteprima locale reattiva, senza salvataggi né richieste di generazione PDF.
 * È una composizione di lettura: non promette l'impaginazione del renderer PDF. */
export function QuoteLivePreviewPanel(props: QuoteLivePreviewProps) {
  const [page, setPage] = useState<"cover" | "offer">("offer");
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const t = { ...DEFAULT_TEMPLATE, ...props.template };
  const visibleItems = props.items.filter((item) => item.mostra_nel_pdf !== false);
  const prices = props.showPrices && !props.onlyTotal && !props.manualPrice;
  const today = new Date();
  const expiry = new Date(today);
  expiry.setDate(expiry.getDate() + props.validityDays);
  const phases = recalcPhaseAmounts(props.paymentPhases, props.total);
  const plan = [props.paymentMethod, ...phases.map((p) => `${p.label}: ${p.percent}% — ${formatCurrency(p.amount)}`)].filter(Boolean).join("\n");
  const context: MergeContext = {
    cliente: { nome: props.clientName.split(" ")[0] || "Nome cliente", cognome: props.clientName.split(" ").slice(1).join(" "), nome_completo: props.clientName || "Nome cliente", indirizzo: props.clientAddress },
    cantiere: { indirizzo: props.siteAddress },
    azienda: { ragione_sociale: props.companyName },
    preventivo: { data: today.toLocaleDateString("it-IT"), scadenza: expiry.toLocaleDateString("it-IT"), totale: formatCurrency(props.total), subtotale: formatCurrency(props.subtotal), iva: formatCurrency(props.total - props.net), piano_pagamenti: plan || t.payment_terms_text || "come da condizioni di pagamento concordate" },
    data: { oggi: today.toLocaleDateString("it-IT"), anno: String(today.getFullYear()) },
    ...props.mergeContext,
  };
  const copy = (text: string | null | undefined) => substituteMergeTags(text ?? "", context).replace(/\*/g, "");
  const primary = t.primary_color;
  const meta = <div className="grid grid-cols-2 gap-4 border-t border-current/15 pt-4 text-xs">
    {t.show_client_details && <div><p className="mb-1 opacity-60">PREPARATO PER</p><p className="font-semibold">{props.clientName || "Nome del cliente"}</p><p className="mt-1 whitespace-pre-line opacity-75">{props.clientAddress}</p></div>}
    <div><p className="mb-1 opacity-60">IL TUO PROGETTO</p><p className="font-semibold">{props.title || "Titolo del progetto"}</p><p className="mt-1 opacity-75">{props.siteAddress}</p>{t.show_validity_date && <p className="mt-2 opacity-75">Validità: {props.validityDays} giorni</p>}</div>
  </div>;
  const logo = t.show_logo && props.logoSrc && failedLogo !== props.logoSrc
    ? <img src={props.logoSrc} onError={() => setFailedLogo(props.logoSrc ?? null)} alt={props.companyName} className="mb-3 max-h-10 max-w-36 object-contain" /> : null;

  return (
    <section aria-label="Anteprima live dell'offerta" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4 text-orange-600" /> Anteprima live</h2><span className="flex items-center gap-1.5 text-[11px] text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Dati aggiornati</span></div>
        <p className="mt-1 truncate text-xs text-slate-500">{t.name}</p>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" aria-label="Vista anteprima">
          {([['cover', 'Copertina', ImageIcon], ['offer', 'Offerta', FileText]] as const).map(([key, label, Icon]) => <button key={key} type="button" aria-pressed={page === key} onClick={() => setPage(key)} className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${page === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
        </div>
      </div>
      <div className="max-h-[min(55vh,calc(100dvh-400px))] overflow-y-auto overscroll-contain bg-slate-100 p-3" tabIndex={0} aria-label="Documento in anteprima">
        <article className="min-h-[420px] break-words bg-white shadow-sm" style={{ color: t.text_color, fontFamily: t.font_family === 'times' ? 'Georgia, serif' : 'Arial, sans-serif' }}>
          {page === 'cover' ? <div className="relative flex min-h-[490px] flex-col justify-between overflow-hidden p-7 text-white" style={{ backgroundColor: primary }}>
            {t.show_cover_image && props.coverSrc && failedCover !== props.coverSrc && <><img alt="" src={props.coverSrc} onError={() => setFailedCover(props.coverSrc ?? null)} className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-b from-slate-950/45 via-slate-950/40 to-slate-950/95" /></>}
            <div className="relative">{logo}<p className="text-xs font-semibold tracking-widest">{props.companyName}</p><p className="mt-2 text-[10px] uppercase tracking-[.2em]">Proposta commerciale</p></div>
            <div className="relative mt-16"><h3 className="text-3xl font-semibold leading-tight">{copy(t.cover_title) || props.title || 'Il tuo progetto, la nostra proposta'}</h3><p className="mb-8 mt-4 whitespace-pre-line text-sm leading-relaxed text-white/85">{copy(t.cover_subtitle || t.cover_tagline)}</p>{meta}</div>
          </div> : <div className="p-6 text-xs leading-relaxed">
            <header className="mb-5 border-b-4 pb-4" style={{ borderColor: primary }}>{logo}<p className="font-bold" style={{ color: primary }}>{props.companyName}</p><h3 className="mt-4 text-xl font-semibold">{props.title || 'La tua offerta'}</h3>{props.description && <p className="mt-2 whitespace-pre-line text-slate-500">{props.description}</p>}</header>
            {meta}
            {!props.onlyTotal && <><h4 className="mb-2 mt-6 font-semibold" style={{ color: primary }}>Prodotti e lavorazioni</h4>
            {visibleItems.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-slate-400">Aggiungi un prodotto o una lavorazione: li vedrai qui.</p> : <div>
              {visibleItems.map((item, index) => <div key={item.id ?? `${item.client_temp_id ?? 'line'}-${index}`} className="border-b p-2.5" style={{ backgroundColor: t.table_zebra && index % 2 === 0 ? t.accent_color : undefined }}>
                {props.showImages && props.imageForItem?.(item) && <img src={props.imageForItem(item)!} alt="" className="mb-2 h-16 w-16 rounded object-contain" />}
                <div className="flex items-start justify-between gap-3"><p className="min-w-0 font-semibold">{item.name || 'Descrizione da completare'}</p>{prices && !['nota', 'subtotale'].includes(item.item_category) && <span className="shrink-0 tabular-nums">{formatCurrency(item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100))}</span>}</div>
                {item.description && <p className="mt-1 whitespace-pre-line text-[11px] text-slate-600">{item.description}</p>}
                {!['nota', 'subtotale'].includes(item.item_category) && <p className="mt-1 text-[10px] text-slate-500">{item.quantity} {item.unit_of_measure || 'pz'}{prices && ` × ${formatCurrency(item.unit_price)}`}{prices && props.showDiscounts && item.discount_percent > 0 && ` · Sconto ${item.discount_percent}%`}</p>}
                {props.showMeasurements && item.misura_x && item.misura_y ? <p className="text-[10px] text-slate-500">Misure: {item.misura_x} × {item.misura_y} mm</p> : null}
                {item.item_category === 'subtotale' && !props.manualPrice && <p className="text-right font-semibold">{formatCurrency(visibleItems.slice(0, index).filter((row) => !row.is_optional).reduce((sum, row) => sum + row.quantity * row.unit_price * (1 - (row.discount_percent || 0) / 100), 0))}</p>}
                {item.is_optional && <p className="mt-1 text-[10px] font-medium text-amber-700">Opzionale · escluso dal totale</p>}
              </div>)}
            </div>}</>}
            <div className="mt-6 space-y-2">
              <>
                <div className="flex justify-between gap-3"><span>{props.manualPrice ? 'Prezzo concordato' : 'Subtotale'}</span><span>{formatCurrency(props.subtotal)}</span></div>
                {props.discountPercent > 0 && <div className="flex justify-between gap-3 text-emerald-700"><span>Sconto {props.discountPercent}%</span><span>−{formatCurrency(props.subtotal - props.net)}</span></div>}
                {props.discountPercent > 0 && <div className="flex justify-between"><span>Imponibile</span><span>{formatCurrency(props.net)}</span></div>}
                {Object.entries(props.vatBreakdown).map(([rate, amount]) => <div key={rate} className="flex justify-between gap-3 text-slate-500"><span>IVA {rate}%</span><span>{formatCurrency(amount)}</span></div>)}
              </>
              <div className="flex items-center justify-between gap-3 rounded-lg p-4 text-white" style={{ backgroundColor: primary }}><span>Totale IVA inclusa</span><strong className="text-lg tabular-nums" data-testid="live-quote-total">{formatCurrency(props.total)}</strong></div>
            </div>
            {t.show_payment_terms && (plan || t.payment_terms_text) && <PreviewText title="Pagamenti" text={plan || copy(t.payment_terms_text)} />}
            {t.show_delivery_terms && t.delivery_terms_text && <PreviewText title="Tempi e consegna" text={copy(t.delivery_terms_text)} />}
            {props.showNotes && t.show_notes && props.notes && <PreviewText title="Note per il cliente" text={props.notes} />}
            {props.showConditions && t.show_contractual_terms && t.contractual_terms_text && <PreviewText title="Condizioni" text={copy(t.contractual_terms_text)} />}
            {props.showConditions && t.show_legal_terms && t.legal_terms_text && <PreviewText title="Termini legali" text={copy(t.legal_terms_text)} />}
            {props.showSignature && <div className="mt-8 border-b pb-6 text-slate-400">Data e firma per accettazione</div>}
            {t.footer_text && <p className="mt-6 border-t pt-3 text-[10px] text-slate-400">{copy(t.footer_text)}</p>}
          </div>}
        </article>
      </div>
      <div className="space-y-1 border-t px-4 py-3 text-[11px] leading-relaxed text-slate-500">
        <div className="mb-2 flex items-center justify-between gap-2 text-slate-900"><span>Totale IVA inclusa</span><strong className="text-base tabular-nums">{formatCurrency(props.total)}</strong></div>
        <p>Bozza visiva, non il PDF definitivo. «Salva e apri PDF» salva il preventivo e genera il documento con impaginazione e allegati.</p>
        {paymentPlanError(props.paymentPhases) && <p role="alert" className="text-amber-700">{paymentPlanError(props.paymentPhases)}</p>}
        {props.manualPrice && <p className="text-orange-700">Prezzo manuale attivo: il totale non segue la somma delle righe.</p>}
        {props.items.some((item) => item.mostra_nel_pdf === false && !item.is_optional) && <p className="text-orange-700">Le righe nascoste nel PDF restano incluse nel calcolo del totale.</p>}
      </div>
    </section>
  );
}

function PreviewText({ title, text }: { title: string; text: string }) {
  // Rendering testuale sicuro: mai eseguire HTML proveniente dai template.
  const lines = text.replace(/<br\s*\/?\s*>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]*>/g, "").split("\n");
  return <section className="mt-5"><h4 className="font-semibold">{title}</h4><div className="mt-1 text-slate-600">{lines.map((line, index) => /^#{1,6}\s/.test(line)
    ? <h5 key={index} className="mb-1 mt-3 font-semibold">{line.replace(/^#{1,6}\s+/, "")}</h5>
    : <p key={index} className={line.trim() ? "whitespace-pre-wrap" : "h-2"}>{line}</p>)}</div></section>;
}
