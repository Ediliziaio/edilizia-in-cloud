import { costruisciDatiEdile } from '@/components/preventivi/pdf/adattatoreEdile';
import { MODULI_EDILI } from '@/components/preventivi/pdf/moduliEdili';
import { CAPITOLI_EDILI } from '@/components/preventivi/pdf/ordineCapitoli';
import { bagniConfirmedRows, type LocalBagniDraft } from './quoteBagniBridge';
import { calcTotaliComputo } from '@/lib/bagni/calcoli';
import type { ChatDocument } from './quoteChatDocument';
import type { QuoteProject } from './quoteProject';
import { quotePriceLabel, quoteHasIndicativePrices } from './quoteProposalReview';
import { quoteDocumentNotes } from './quoteDocumentNotes';
import { quoteScheduleDocumentText, quoteScheduleTimeline } from './quoteSchedule';
import type { DocEdileDati } from '@/components/preventivi/pdf/documentoEdileTipi';
import type { BgnTemplatePdf } from '@/types/bagni';
import type { AziendaComune } from '@/components/preventivi/pdf/adattatoreEdile';
export type LocalQuotePdfAppearance = { template: BgnTemplatePdf; company?: AziendaComune; preview?: boolean };
const preparedImages = new Map<string, Promise<LocalQuotePdfAppearance>>();
/** Uses the production image conversion (including WebP and bounded loading),
 * cached independently of line edits. Never sends the quote to an endpoint. */
export function prepareLocalQuoteAppearance(appearance: LocalQuotePdfAppearance): Promise<LocalQuotePdfAppearance> {
  const key = JSON.stringify([appearance.template, appearance.company]);
  const existing = preparedImages.get(key); if (existing) return existing;
  const pending = (async () => {
    const [{ immaginiDelModello }, { toDataUrl }] = await Promise.all([import('@/components/preventivi/pdf/immaginiDocumento'), import('@/lib/serramenti/pdfImageUtils')]);
    const [images, logo, companyLogo, about] = await Promise.all([
      immaginiDelModello('bagni', appearance.template as unknown as Record<string, unknown>, appearance.company?.logo_chiaro_url, appearance.template.company_id),
      toDataUrl(appearance.template.logo_url), toDataUrl(appearance.company?.logo_url), toDataUrl(appearance.template.chi_siamo_foto_url),
    ]);
    if ((appearance.template.pdf_cover_image_url || appearance.template.cover_image_url) && !images.pdf_cover_image_url) throw new Error('La foto di copertina del modello non è caricabile. Verifica il file e aggiorna il modello; la bozza resta intatta.');
    return { ...appearance, template: { ...appearance.template, ...images, logo_url: logo, chi_siamo_foto_url: about } as BgnTemplatePdf,
      company: appearance.company ? { ...appearance.company, logo_url: companyLogo, logo_chiaro_url: images.logo_chiaro_url as string | null } : undefined };
  })();
  preparedImages.set(key, pending);
  if (preparedImages.size > 4) preparedImages.delete(preparedImages.keys().next().value!);
  void pending.catch(() => { if (preparedImages.get(key) === pending) preparedImages.delete(key); });
  return pending;
}

/** Shared production layout, entirely local data. No hooks, query, upload,
 * imported default fixture prices, legal promises, signatures or remote assets. */
export function buildLocalQuotePdfData(doc: ChatDocument, draft: LocalBagniDraft, project: QuoteProject, companyId: string, companyName: string, appearance?: LocalQuotePdfAppearance, scheduleScope?: string): DocEdileDati {
  if (appearance && (appearance.template.company_id !== companyId || appearance.template.pdf_blocchi?.modulo_intervento !== draft.modelId)) throw new Error('Il modello grafico non corrisponde all’azienda o all’intervento.');
  const rows = bagniConfirmedRows(doc, companyId, draft);
  if (!rows.length && !appearance?.preview) throw new Error('Includi almeno una voce con quantità e prezzo prima di esportare la bozza.');
  const totals = calcTotaliComputo(rows, { iva_pct: draft.iva ?? 0, sconto_pct: 0 });
  const chapters = totals.perCapitolo.map(cap => ({ nome: cap.nome, subtotale: cap.imponibile, voci: rows.filter(r => r.capitolo_nome === cap.nome).map(r => ({
    id: r.id, descrizione: r.descrizione, descrizione_estesa: r.descrizione_estesa, unita_misura: r.unita_misura, quantita: r.quantita, prezzo_unitario: r.prezzo_unitario,
    importo: Math.round(r.quantita * r.prezzo_unitario * (1 - r.sconto_pct / 100) * 100) / 100,
    fonte: `${quotePriceLabel(doc.lines.find(l => l.id === r.id)!)}${r.sconto_pct ? ` - sconto riga ${r.sconto_pct}%` : ''}`,
  })) }));
  const pending = doc.lines.filter(l => !l.supersededBy?.length).length - rows.length;
  const scheduleText = scheduleScope ? quoteScheduleDocumentText(project.schedule, scheduleScope) : undefined;
  const note = `BOZZA LOCALE PRELIMINARE. ${quoteHasIndicativePrices(doc) ? 'Contiene importi indicativi o dimostrativi, non prezzi verificati.' : 'Prezzi e corrispondenze tecniche da verificare.'} ${pending} lavorazioni non incluse nel parziale. ${draft.iva == null ? 'IVA da definire; il totale riportato è netto.' : 'Aliquota inserita dall’utente, requisiti da verificare.'} Non costituisce documento emesso o accettato.\n${quoteDocumentNotes(doc, project.notes, project.proposalNotes).notes}${scheduleText ? `\n${scheduleText}` : ''}`;
  const data = costruisciDatiEdile({ modulo: MODULI_EDILI.bagni, progetto: {
    code: 'BOZZA LOCALE', tipo_intervento: doc.title, cliente_nome: draft.clientName || 'Cliente da definire', cliente_cognome: null,
    cantiere_indirizzo: project.address || null, cantiere_citta: null, cantiere_cap: null, cantiere_provincia: null,
    immobile_tipo: project.propertyType || null, immobile_superficie_mq: null, immobile_anno: null, immobile_piani: null, mostra_finanziamento: false,
  }, template: appearance ? appearance.template as unknown as Record<string, unknown> : { pdf_cover_hero: doc.title, pdf_cover_eyebrow: 'BOZZA LOCALE - DA VERIFICARE', pdf_cover_subhero: 'Proposta preliminare, non documento contrattuale', condizioni_legali_attivo: false }, azienda: { ...appearance?.company, name: companyName }, capitoli: chapters, totali: {
    imponibileLordo: totals.imponibile, imponibile: totals.imponibile, scontoEur: 0, scontoPct: 0, iva: totals.iva, ivaPct: draft.iva ?? 0, totale: totals.totale,
    costoTot: 0, margineEur: null, marginePct: null, detrazionePct: 0, detrazioneEur: 0,
  }, media: [], opzioniComputo: { livello: 'dettagliato', mostraPrezzi: true, mostraQta: true, mostraSubtotali: true }, schedaModulo: [{ etichetta: 'Stato documento', valore: note }] });
  data.bozzaLocale = { ivaDaDefinire: draft.iva == null };
  const confirmedPhases = scheduleText && project.schedule ? quoteScheduleTimeline(project.schedule.proposal, project.schedule.startDate).rows.map(row => ({
    fase: row.title, durata: `${row.minDays}–${row.maxDays} ${row.kind === 'wait' ? 'giorni solari di attesa' : 'giorni lavorativi'}`,
    descrizione: `Ipotesi preliminare, non prenotazione. ${row.basis}`,
  })) : [];
  // A template's sample phases are not this project's confirmed schedule.
  data.modello.cronoprogramma = confirmedPhases;
  data.modello.mostraCronoprogramma = confirmedPhases.length > 0;
  // The compact preview truncates long descriptions, the exported document
  // must preserve qualifications and exclusions written in the actual rows.
  for (const cap of data.capitoli) for (const voce of cap.voci) {
    voce.dettaglio = doc.lines.find(line => line.id === voce.id)?.description || null;
  }
  if (appearance) {
    // The production adapter owns every visual choice, including order, custom
    // photos and company branding. The only override is confidentiality: an AI
    // draft is not a signed/issued contract and never exposes internal margins.
    data.modello.mostraMargine = false;
    data.modello.finanziamentoPromo = null; data.mostraFinanziamento = false;
    return data;
  }
  // Match the existing shared typography/layout without inheriting default
  // company claims or fetching images/fonts during local draft generation.
  data.modello.ordineCapitoli = CAPITOLI_EDILI.map(c => ({ chiave: c.chiave, visibile: ['apertura', 'piano', 'investimento'].includes(c.chiave) }));
  data.modello.copertina.immagineUrl = null; data.modello.copertina.logoUrl = null;
  data.azienda.logoUrl = null; data.azienda.logoChiaroUrl = null;
  data.modello.fotoChiusura = null; data.modello.fotoRiempimento = {};
  data.modello.galleriaLavori = []; data.modello.pagineLibere = [];
  for (const block of Object.values(data.modello.blocchi)) { block.foto = []; block.voci = []; }
  data.modello.condizioniLegali = []; data.modello.clausoleDaApprovare = []; data.modello.conRecesso = false;
  data.modello.pagamentoHtml = null; data.modello.giorniValidita = null; data.modello.testoValidita = 'Misure, prezzi, imposte e condizioni da verificare prima dell’offerta definitiva.';
  data.modello.mostraMargine = false;
  data.modello.testimonianze = []; data.azienda.votiOnline = [];
  data.modello.finanziamentoPromo = null; data.mostraFinanziamento = false;
  return data;
}
