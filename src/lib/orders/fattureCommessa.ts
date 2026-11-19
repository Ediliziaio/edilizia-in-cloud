import { isDocumentoEmesso, isNotaCredito, isTipoVendita } from '@/lib/fatturazione/registroVendite';
import { totaleFatturato } from './incassiCommessa';
import { incassoQuotaCommessa } from '@/lib/fatturazione/incassoQuotaCommessa';
import type { ScadenzaPagamento } from '@/types/fatturazione';

export interface FatturaCommessa {
  id: string; origine?: 'nativa' | 'importata'; numero: string; data_emissione: string; stato: string; tipo: string;
  totale_da_pagare: number; totale_documento: number | null; importo_pagato?: number; importo_associato: number | null; stornato?: number;
  cliente_snapshot?: { codice_fiscale?: string | null; partita_iva?: string | null } | null;
  imponibile_totale?: number; iva_totale?: number;
  scadenze_pagamento?: ScadenzaPagamento[] | null;
  copie_importate?: Array<{ id: string; numero: string }>;
  copie_da_verificare?: boolean;
}
const normal = (s?: string | null) => (s ?? '').replace(/\s/g, '').toUpperCase();
const cents = (value: unknown) => value != null && value !== '' && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : null;
export const documentoAnnullato = (f: Pick<FatturaCommessa, 'stato'>) => ['annullata','annullato','cancelled','canceled','void','deleted'].includes(f.stato);
/** Stessa identità fiscale: numero, data, intestatario, imponibile, IVA e totale. */
function identitaDocumento(f: FatturaCommessa, conNumero = true): string | null {
  const amounts = [f.imponibile_totale, f.iva_totale, f.totale_documento].map(cents);
  if (!f.numero || !f.data_emissione || amounts.some(v => v == null) || !isTipoVendita(f.tipo) || ['bozza','draft'].includes(f.stato)) return null;
  return JSON.stringify([conNumero ? normal(f.numero) : null, f.data_emissione, isNotaCredito(f.tipo), ...amounts]);
}
function identity(f: FatturaCommessa): string | null {
  const cf = normal(f.cliente_snapshot?.codice_fiscale), iva = normal(f.cliente_snapshot?.partita_iva);
  const fiscal = identitaDocumento(f);
  return fiscal && (cf || iva) ? JSON.stringify([fiscal, cf, iva]) : null;
}
function stessoIdConDatiCoerenti(a: FatturaCommessa, b: FatturaCommessa) {
  const fiscal = identitaDocumento(a, false);
  if (!fiscal || a.id !== b.id || fiscal !== identitaDocumento(b, false)) return false;
  return (['codice_fiscale','partita_iva'] as const).every(k => {
    const x = normal(a.cliente_snapshot?.[k]), y = normal(b.cliente_snapshot?.[k]);
    return !x || !y || x === y;
  });
}
export function unisciFattureCommessa<T extends FatturaCommessa>(native: T[], importate: T[]): T[] {
  const output = native.map(f => ({ ...f, copie_importate: [...(f.copie_importate ?? [])] }));
  const map = new Map<string, number>();
  output.forEach((f, i) => { const key = identity(f); if (key) map.set(key, i); });
  const byId = new Map(output.map((f, i) => [f.id, i]));
  for (const f of importate) {
    const key = identity(f);
    let index = key ? map.get(key) : undefined;
    const sameId = byId.get(f.id);
    // I documenti storici migrati conservano lo stesso UUID nelle due fonti.
    // L’ID non basta: data, intestatario e imponibile/IVA/totale devono essere coerenti.
    // Un numero rinominato in migrazione resta visibile come differenza da verificare.
    if (index == null && sameId != null && stessoIdConDatiCoerenti(output[sameId], f)) index = sameId;
    if (index == null) output.push({ ...f, copie_importate: [...(f.copie_importate ?? [])] });
    else {
      const original = output[index];
      original.copie_importate.push({ id: f.id, numero: f.numero });
      const stato = (d: FatturaCommessa) => documentoAnnullato(d) ? 'annullata' : d.stato === 'stornata' ? 'stornata' : isDocumentoEmesso(d.stato) ? 'emessa' : d.stato;
      if (normal(original.numero) !== normal(f.numero) || stato(original) !== stato(f) || cents(original.importo_pagato ?? 0) !== cents(f.importo_pagato ?? 0) || cents(original.totale_da_pagare) !== cents(f.totale_da_pagare) || cents(original.stornato ?? 0) !== cents(f.stornato ?? 0)) original.copie_da_verificare = true;
    }
  }
  return output;
}
export function statoIncassoDocumento(f: FatturaCommessa) {
  if (documentoAnnullato(f)) return 'Annullata';
  if (f.stato === 'stornata') return 'Stornata';
  if (['bozza','draft'].includes(f.stato)) return 'Bozza';
  if (!isTipoVendita(f.tipo)) return 'Altro documento';
  if (!isDocumentoEmesso(f.stato)) return 'Da emettere';
  if (isNotaCredito(f.tipo)) return 'Nota di credito';
  const quota = incassoQuotaCommessa(f);
  return quota.residuo <= 0 ? 'Incassata' : quota.incassato > 0 ? 'Parziale' : 'Da incassare';
}
export function riepilogoFattureCommessa(docs: FatturaCommessa[]) {
  let incassato = 0, residuo = 0;
  for (const f of docs) {
    if (!isTipoVendita(f.tipo) || isNotaCredito(f.tipo) || !isDocumentoEmesso(f.stato) || f.stato === 'stornata') continue;
    const quota = incassoQuotaCommessa(f); incassato += Math.round(quota.incassato * 100); residuo += Math.round(quota.residuo * 100);
  }
  return { fatturato: Math.round(totaleFatturato(docs) * 100) / 100, incassato: incassato / 100, residuo: residuo / 100 };
}
