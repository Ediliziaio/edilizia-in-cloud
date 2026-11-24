import { parseDelimited } from '../journey/cost-import';
import type { Workspace } from '../types';

export const portals = [
 { key: 'ANAC_PVL', label: 'ANAC · Pubblicità a valore legale', url: 'https://pubblicitalegale.anticorruzione.it/ricerca-generica', description: 'Ricerca pubblica per CIG, oggetto o ente.' },
 { key: 'SINTEL', label: 'Sintel', url: 'https://www.sintel.regione.lombardia.it/eprocdata/sintelSearch.xhtml', description: 'Procedure, lotti e documenti pubblicati dagli enti.' },
 { key: 'ACQUISTI', label: 'Acquisti in Rete', url: 'https://www.acquistinretepa.it/opencms/vetrina_bandi.html', description: 'Bandi Consip e opportunità pubbliche MePA.' },
 { key: 'SATER', label: 'SATER · Intercent-ER', url: 'https://intercenter.regione.emilia-romagna.it/bandi-e-strumenti-di-acquisto/bandi-altri-enti', description: 'Bandi e avvisi pubblici degli enti su SATER.' },
] as const;

export const anacCatalogLabel = 'ANAC · Catalogo CSV';
export const catalogSource = (key: string | null) => key === 'ANAC_DATA' ? anacCatalogLabel : portals.find(portal => portal.key === key)?.label;

export interface CatalogLot {
 cig: string;
 title: string;
 tenderTitle: string;
 authority: string;
 territory: string;
 procedure: string;
 amount: string;
 deadline: string;
}

function normalizedDate(value: string) {
 const iso = value.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T ])/);
 const european = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:$| )/);
 const date = iso?.[1] || (european ? `${european[3]}-${european[2]}-${european[1]}` : '');
 if (!date) return '';
 const parsed = new Date(`${date}T12:00:00Z`);
 return Number.isFinite(+parsed) && parsed.toISOString().startsWith(date) ? date : '';
}

export function readAnacCatalog(text: string) {
 const [columns, ...rows] = parseDelimited(text.replace(/^\uFEFF/, ''), { maxRows: 100_000, maxColumns: 120, maxCharacters: 18_000_000 });
 const headers = (columns || []).map(key => key.trim().toLocaleLowerCase('it').replace(/[\s-]+/g, '_'));
 if (!headers.includes('cig') || !headers.some(h => h === 'oggetto_gara' || h === 'oggetto_lotto' || h === 'oggetto')) {
  throw Error('Intestazioni richieste: CIG e OGGETTO_GARA oppure OGGETTO_LOTTO.');
 }
 const lookup = (...keys: string[]) => keys.map(key => headers.indexOf(key)).filter(i => i >= 0);
 const keys = {
  cig: lookup('cig'), title: lookup('oggetto_lotto','oggetto_gara','oggetto'), tenderTitle: lookup('oggetto_gara','oggetto'),
  authority: lookup('denominazione_stazione_appaltante','denominazione_sa','stazione_appaltante','denominazione_amm'),
  territory: lookup('regione','denominazione_regione','regione_lotto'),
  procedure: lookup('numero_gara','numero_procedura'), amount: lookup('importo_base_dasta','importo_lotto','importo'),
  deadline: lookup('data_scadenza_offerta','data_scadenza'),
 };
 const lots = new Map<string,CatalogLot>();
 let discarded = 0;
 for (const row of rows) {
  const field = (name: keyof typeof keys) => keys[name].map(index => row[index]?.trim()).find(Boolean) || '';
  const cig = field('cig').toUpperCase();
  const title = field('title');
  if (row.length !== headers.length || !/^[A-Z0-9]{10}$/.test(cig) || !title || lots.has(cig)) { discarded++; continue; }
  const value = field('amount').replace(',', '.');
  lots.set(cig, { cig, title, tenderTitle: field('tenderTitle') || title, authority: field('authority'), territory: field('territory'), procedure: field('procedure'),
   amount: /^\d{1,14}(\.\d{1,4})?$/.test(value) ? value : '', deadline: normalizedDate(field('deadline')) });
 }
 return { lots: [...lots.values()], discarded };
}

export function matchingCatalogLots(lots: CatalogLot[], query: string) {
 const terms = query.trim().toLocaleLowerCase('it').split(/\s+/).filter(Boolean);
 return lots.filter(lot => {
  const text = `${lot.cig} ${lot.title} ${lot.tenderTitle} ${lot.authority} ${lot.territory} ${lot.procedure}`.toLocaleLowerCase('it');
  return terms.every(term => text.includes(term));
 });
}

export function tenderForCig(data: Pick<Workspace, 'tenders' | 'lots'>, cig: string) {
 const code = cig.toUpperCase();
 if (!/^[A-Z0-9]{10}$/.test(code)) return undefined;
 const lot = data.lots.find(item => item.code.toUpperCase() === code || item.title.toUpperCase().split(/[^A-Z0-9]+/).includes(code));
 return data.tenders.find(t => t.id === lot?.tender_id || t.official_id?.toUpperCase() === code);
}
