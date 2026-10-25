import { aiEditorDraft } from './quoteAiEditorBridge';
import type { QuoteDraft } from './quoteDraft';
import type { ChatDocument } from './quoteChatDocument';
import { calcolaTotaliPreventivo } from '@/hooks/usePreventivoCosti';
import { formatCurrency } from '@/lib/formatters';
import type { NativeComputoModule } from './wizardAiDraft';
import { calcTotaliComputo as bagni } from '@/lib/bagni/calcoli';
import { calcTotaliComputo as climatizzazione } from '@/lib/climatizzazione/calcoli';
import { calcTotaliComputo as elettrico } from '@/lib/elettrico/calcoli';
import { calcTotaliComputo as termoidraulico } from '@/lib/termoidraulico/calcoli';
import { calcTotaliComputo as pavimenti } from '@/lib/pavimenti/calcoli';
import { calcTotaliComputo as piscine } from '@/lib/piscine/calcoli';
import { calcTotaliComputo as ristrutturazione } from '@/lib/ristrutturazione/calcoli';
import { calcTotaliComputo as tetti } from '@/lib/tetti/calcoli';
const calculators = { bagni, climatizzazione, elettrico, termoidraulico, pavimenti, piscine, ristrutturazione, tetti };
export type WizardAiCommercialDraft = QuoteDraft & {
  nativeTax?: { significantGoods: boolean; significantLineIds: string[] };
};

/** Same NET prices and native calculator as the wizard. No LLM arithmetic,
 * no inferred tax treatment, no missing VAT interpreted as an exemption. */
export function wizardAiCommercial(doc: ChatDocument, metadata: WizardAiCommercialDraft, defaultVat: number | null, module?: NativeComputoModule) {
  const oldIds = new Set(metadata.items?.map(item => item.client_temp_id));
  const draft = aiEditorDraft(doc, metadata);
  const items = (draft.items ?? []).map(item => ({ ...item,
    vat_rate: oldIds.has(item.client_temp_id) ? item.vat_rate : defaultVat }));
  const works = items.filter(item => !item.is_optional && !['nota', 'subtotale', 'sconto'].includes(item.item_category));
  const manualPrice = typeof metadata.prezzoManuale === 'number' && metadata.prezzoManuale > 0;
  const taxPending = manualPrice ? metadata.prezzoManualeIvaPct == null : works.some(item => item.vat_rate == null) || !works.length;
  const classic = calcolaTotaliPreventivo(items.map(item => ({ ...item, vat_rate: item.vat_rate ?? 0 })), 0, metadata.discountPercent ?? 0, metadata.prezzoManuale, metadata.prezzoManualeIvaPct);
  // Computo PDFs round the gross total before deriving VAT, unlike the classic
  // multi-rate engine. Dispatch to the actual engine, including its cent rules.
  const nativeRows = works.map(item => ({ capitolo_nome: '', quantita: item.quantity, prezzo_unitario: item.unit_price, sconto_pct: item.discount_percent, costo_materiali: 0, costo_manodopera: 0,
    bene_significativo: metadata.nativeTax?.significantLineIds.includes(item.client_temp_id ?? '') ?? false }));
  const nativeOptions = { sconto_pct: metadata.discountPercent ?? 0, iva_pct: defaultVat ?? 0, prezzo_manuale: metadata.prezzoManuale,
    iva_beni_significativi: module === 'ristrutturazione' && metadata.nativeTax?.significantGoods };
  const rst = module === 'ristrutturazione' ? ristrutturazione(nativeRows, nativeOptions) : null;
  const native = rst ?? (module ? calculators[module](nativeRows, nativeOptions) : null);
  const split = rst?.ivaRipartita;
  const totals = native ? { ...classic, subtotale_netto: native.imponibile, totale: native.totale,
    iva_breakdown: split && split.imponibile22 > 0 ? { '10': split.iva10, '22': split.iva22 } : { [String(defaultVat ?? 0)]: native.iva } } : classic;
  const evidence = `VALORI COMMERCIALI DEL WIZARD, calcolati dal software; non tariffe di prezzario. Prezzi unitari NETTI. Sconto globale ${metadata.discountPercent ?? 0}%. ${manualPrice ? `Prezzo a corpo/manuale attivo ${formatCurrency(metadata.prezzoManuale!)} netto prima dello sconto globale: non varia con le nuove righe. Non sommare quel prezzo alle righe.` : 'Totale dalla somma delle righe confermate.'} Imponibile attuale ${formatCurrency(totals.subtotale_netto)}; ${taxPending ? 'IVA e totale lordo non determinabili con i dati attuali.' : `IVA ${formatCurrency(totals.totale - totals.subtotale_netto)}; lordo ${formatCurrency(totals.totale)}.`}\n${works.slice(0, 12).map(item => `${item.client_temp_id}: sconto riga ${item.discount_percent}%, IVA ${item.vat_rate == null ? 'da definire' : `${item.vat_rate}%`}.`).join('\n')}`;
  const tax = taxPending ? null : Math.round((totals.totale - totals.subtotale_netto) * 100) / 100;
  const taxTotal = { net: totals.subtotale_netto, tax, gross: taxPending ? null : totals.totale,
    pending: works.filter(item => item.vat_rate == null).map(item => item.client_temp_id ?? item.name), breakdown: taxPending ? {} : totals.iva_breakdown };
  const summary = `**Valori del preventivo**\n\nNetto: ${formatCurrency(taxTotal.net)} · Sconto globale: ${metadata.discountPercent ?? 0}%\n\n${taxPending ? 'IVA e totale lordo: da definire.' : `IVA: ${formatCurrency(tax!)} · Totale IVA inclusa: ${formatCurrency(taxTotal.gross!)}`}\n\n${manualPrice ? 'Prezzo a corpo/manuale attivo: modificare le righe non cambia il prezzo concordato.' : 'Calcolo sulle righe incluse, con gli sconti e le aliquote del wizard.'}`;
  const significantGoodsNote = module === 'ristrutturazione' && metadata.nativeTax?.significantGoods
    ? '\n\nRegime beni significativi del wizard attivo. Mantieni la classificazione delle voci esistenti; verifica quella delle nuove voci nel computo, senza dedurla automaticamente dal nome.' : '';
  return { items, totals, manualPrice, taxPending, taxTotal, summary: summary + significantGoodsNote, evidence: (evidence + significantGoodsNote).slice(0, 3200) };
}
