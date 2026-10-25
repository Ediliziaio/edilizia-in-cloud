import type { ConfigurazioneComponentiFv, ListinoComponentiFv } from './componentiConfigurazione';
import type { FvTipoServizio } from './tipi';
const serviceTypes: FvTipoServizio[] = ['pratica_gse', 'allaccio_e_distribuzione', 'asseverazione', 'smaltimento_amianto', 'opere_edili_accessorie', 'smaltimento_imballaggi', 'oneri_sicurezza', 'altro'];
export function tipoServizioFv(raw: string): FvTipoServizio {
  if (!raw) return 'altro';
  if (serviceTypes.includes(raw as FvTipoServizio)) return raw as FvTipoServizio;
  throw new Error('Tipo di servizio FV non riconosciuto: scegli una categoria valida');
}

type Configurazione = ConfigurazioneComponentiFv & {
  iva_aliquota: number; prezzo_vendita_manuale: number | null;
  manodopera_righe: Array<{ descrizione: string; ore: number; tariffa_oraria_netta: number; tariffa_oraria_vendita: number }>;
  servizi_righe: Array<{ tipo?: string; descrizione: string; quantita: number; prezzo_netto: number; prezzo_vendita: number }>;
};
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const nonnegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Validate the WHOLE configuration before the first native mutation. No missing
 * catalogue entry may disappear silently from the saved components or PDF. */
export function problemiConfigurazioneFv(data: Configurazione, listino?: ListinoComponentiFv): string[] {
  const issues: string[] = [];
  if (!positive(data.potenza_kwp)) issues.push('Indica una potenza kWp valida');
  if (!nonnegative(data.iva_aliquota) || data.iva_aliquota > 1) issues.push('Verifica l’aliquota IVA (formato decimale del modulo FV)');
  if (data.prezzo_vendita_manuale != null && !nonnegative(data.prezzo_vendita_manuale)) issues.push('Correggi il prezzo di vendita manuale');
  if (data.kit_bundle_id) {
    if (!positive(data.kit_prezzo)) issues.push('Il kit selezionato non ha un prezzo verificato');
  } else {
    if (!Number.isSafeInteger(data.numero_pannelli_scelti) || data.numero_pannelli_scelti <= 0) issues.push('Configura un numero intero positivo di pannelli');
    for (const [label, id, catalogue] of [
      ['pannello', data.pannello_id, listino?.pannelli], ['inverter', data.inverter_id, listino?.inverter],
      ...(data.con_accumulo ? [['accumulo', data.accumulo_id, listino?.accumuli] as const] : []),
    ] as const) {
      if (!id) { issues.push(`Seleziona un modello di ${label} dal listino: nessun prezzo standard viene confermato automaticamente`); continue; }
      if (!catalogue) continue; // Step navigation can run while catalogue data is loading.
      const article = catalogue.find(row => row.id === id);
      if (!article) issues.push(`Il ${label} selezionato non è disponibile nel listino caricato`);
      else if (!positive(Number(article.prezzo_vendita)) && !(data.prezzo_vendita_manuale! > 0)) issues.push(`Prezzo del ${label} da verificare`);
      if (article?.prezzo_acquisto != null && !nonnegative(Number(article.prezzo_acquisto))) issues.push(`Costo del ${label} non valido`);
    }
  }
  if (data.con_accumulo && !positive(data.capacita_accumulo_kwh)) issues.push('Indica la capacità dell’accumulo');
  for (const [i, row] of data.prodotti_extra.entries()) if (!row.descrizione.trim() || !positive(row.quantita) || !nonnegative(row.prezzo_vendita) || row.prezzo_acquisto != null && !nonnegative(row.prezzo_acquisto)) issues.push(`Completa quantità, descrizione e prezzi del prodotto extra ${i + 1}`);
  for (const [i, row] of data.manodopera_righe.entries()) if (!row.descrizione.trim() || !positive(row.ore) || !nonnegative(row.tariffa_oraria_netta) || !nonnegative(row.tariffa_oraria_vendita)) issues.push(`Completa ore e tariffe della manodopera ${i + 1}`);
  for (const [i, row] of data.servizi_righe.entries()) {
    if (!row.descrizione.trim() || !positive(row.quantita) || !nonnegative(row.prezzo_netto) || !nonnegative(row.prezzo_vendita)) issues.push(`Completa quantità e prezzi del servizio ${i + 1}`);
    try { tipoServizioFv(row.tipo ?? 'altro'); } catch (error) { issues.push((error as Error).message); }
  }
  return issues;
}
