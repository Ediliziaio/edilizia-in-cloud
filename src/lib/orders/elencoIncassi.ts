import type { Installment } from '@/lib/orderUtils';
import { isDocumentoEmesso, isNotaCredito, isTipoVendita } from '@/lib/fatturazione/registroVendite';
import { incassoQuotaCommessa } from '@/lib/fatturazione/incassoQuotaCommessa';
import { documentoAnnullato, statoIncassoDocumento, type FatturaCommessa } from './fattureCommessa';
export interface VoceIncasso { key: string; rata?: Installment; documento?: FatturaCommessa }
/** Ogni fattura compare una volta: la riga della sua rata la contiene già. */
export function vociIncassi(rate: Installment[], documents: FatturaCommessa[]): VoceIncasso[] {
  const used = new Set<string>();
  const rows = rate.map(rata => {
    const invoiceId = rata.documento_fiscale_id ?? rata.fattura?.id;
    const documento = documents.find(d => !used.has(d.id) && (d.id === invoiceId || d.copie_importate?.some(c => c.id === invoiceId)));
    if (documento) used.add(documento.id);
    // La query della fattura può aggiornarsi prima della scheda commessa. Stato e
    // parziale della riga devono leggere gli stessi incassi del dettaglio, senza scritture.
    const leggibile = documento && isTipoVendita(documento.tipo) && !isNotaCredito(documento.tipo)
      && isDocumentoEmesso(documento.stato) && documento.stato !== 'stornata';
    const aggiornata = leggibile && rata.documento_quota_lorda == null ? { ...rata,
      is_paid: statoIncassoDocumento(documento) === 'Incassata',
      fattura: { id: documento.id, numero: documento.numero, stato: documento.stato,
        importo_pagato: incassoQuotaCommessa(documento).incassato },
    } : rata;
    return { key: `rata:${rata.id ?? rata.position}`, rata: aggiornata, documento };
  });
  return [...rows, ...documents.filter(d=>!used.has(d.id)).sort((a,b)=>(b.data_emissione ?? '').localeCompare(a.data_emissione ?? '') || a.numero.localeCompare(b.numero,'it',{numeric:true})).map(documento=>({key:`documento:${documento.id}`,documento}))];
}
export function statoVoceIncasso(v: VoceIncasso) {
  if (v.rata?.documento_quota_lorda != null) return v.rata.is_paid ? 'Incassata' : Number(v.rata.fattura?.importo_pagato??0)>0 ? 'Parziale' : 'Da incassare';
  if (v.documento) return statoIncassoDocumento(v.documento);
  return v.rata?.is_paid ? 'Incassata' : 'Da incassare';
}
export function voceAttiva(v: VoceIncasso) { return !v.documento || !documentoAnnullato(v.documento) && v.documento.stato !== 'stornata'; }
