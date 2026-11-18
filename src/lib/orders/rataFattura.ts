/** Il collegamento rata↔fattura sincronizza anche gli incassi: ammettiamo solo una fattura intera. */
export interface FatturaPerRata {
  id: string;
  origine?: 'nativa' | 'importata';
  tipo: string;
  stato: string;
  totale_documento: number | null;
  totale_da_pagare: number;
  importo_associato: number | null;
  stornato?: number;
}
const TIPI = new Set(['fattura', 'fattura_pa', 'parcella', 'fattura_accompagnatoria', 'acconto_fattura', 'acconto_parcella', 'fattura_differita_b', 'fattura_riepilogativa']);
export function impedimentoFatturaRata(f: FatturaPerRata, amount: number, occupata: boolean): string | null {
  if (f.origine === 'importata') return 'Documento importato: gestisci il collegamento dalla fatturazione.';
  if (!TIPI.has(f.tipo)) return 'Questo documento non è una fattura associabile.';
  if (['annullata', 'stornata'].includes(f.stato) || Number(f.stornato ?? 0) > 0) return 'Fattura annullata o stornata.';
  if (occupata) return 'Già collegata a un’altra rata.';
  const totale = Number(f.totale_documento ?? f.totale_da_pagare);
  if (!Number.isFinite(totale) || !Number.isFinite(amount) || amount <= 0 || Math.round(totale * 100) !== Math.round(amount * 100)) return 'Importo diverso dalla rata: verifica prima il piano pagamenti.';
  if (f.importo_associato != null && Math.round(Number(f.importo_associato) * 100) !== Math.round(totale * 100)) return 'Solo una quota della fattura appartiene alla commessa.';
  return null;
}
