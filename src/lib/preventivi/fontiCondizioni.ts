import { SALES_AREAS } from '@/lib/moduli-vendita/areas';
import { NOMI_AMBITI, htmlDelModello, testoDelModello, type AmbitoCondizioni, type Clausola } from '@/lib/condizioni/archivio';
import { htmlPerEditorContratto } from './contrattoEditor';

export interface FonteCondizioni { id: string; companyId: string; nome: string; testo: string }
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === 'string' ? v : '';

/**
 * L'archivio «Contratti e condizioni» come fonte da copiare (07/11/2026): i modelli dell'azienda
 * stanno in cima all'elenco, prima dei modelli di preventivo, perché sono il posto dove l'azienda
 * tiene le sue condizioni. Copiare non cambia il modello: resta una copia indipendente.
 */
function dallArchivio(companyId: string, righe: unknown[], perQuestoDocumento: AmbitoCondizioni): FonteCondizioni[] {
  const fonti: Array<FonteCondizioni & { suo: boolean }> = [];
  for (const raw of righe) {
    const row = record(raw);
    if (row.company_id !== companyId || row.attivo === false) continue;
    const clausole = Array.isArray(row.clausole) ? (row.clausole as Clausola[]) : [];
    // Se c'è qualcosa da leggere, si copia l'HTML: titoli e grassetti restano quelli scritti nell'archivio.
    if (!testoDelModello({ clausole }).trim()) continue;
    const testo = htmlDelModello({ clausole });
    const chiave = String(row.ambito) as AmbitoCondizioni;
    const ambito = NOMI_AMBITI[chiave];
    // «Predefinito» vale solo per il documento che si sta scrivendo: il modello predefinito
    // dell'appalto, dentro un blocco di preventivo, predefinito non è (07/11/2026).
    const suo = chiave === perQuestoDocumento;
    fonti.push({
      id: `archivio:${text(row.id)}`,
      companyId,
      nome: `Archivio · ${text(row.nome)}${ambito ? ` (${ambito})` : ''}${suo && row.predefinito ? ' · predefinito' : ''}`,
      testo,
      suo,
    });
  }
  // Prima i modelli di questo tipo di documento, poi gli altri: si copiano, ma non si confondono.
  return fonti
    .sort((a, b) => (a.suo === b.suo ? a.nome.localeCompare(b.nome, 'it') : a.suo ? -1 : 1))
    .map(({ suo: _suo, ...f }) => f);
}

/** Tenant isolation also at the source boundary; never follow references to another company. */
export function fontiCondizioni(
  companyId: string, classicRows: unknown[], moduleRows: unknown[], archivioRows: unknown[] = [],
  /** Per quale documento si stanno scrivendo queste condizioni: decide chi è «predefinito» e chi viene prima. */
  perQuestoDocumento: AmbitoCondizioni = 'preventivo',
): FonteCondizioni[] {
  const classic = classicRows.map(record).filter(r => r.company_id === companyId && r.is_active !== false);
  const resolve = (id: unknown) => classic.find(r => r.id === id);
  const result: FonteCondizioni[] = [];
  for (const row of classic) {
    const kind = row.kind ?? 'offerta';
    let testo = '';
    if (kind === 'condizioni' || kind === 'legali') testo = text(row.body_html) || text(row.contractual_terms_text) || text(row.legal_terms_text);
    if (kind === 'offerta') {
      const terms = resolve(row.linked_terms_id);
      const legal = resolve(row.linked_legal_id);
      testo = [terms ? text(terms.body_html) : row.show_contractual_terms !== false ? text(row.contractual_terms_text) : '', legal ? text(legal.body_html) : row.show_legal_terms ? text(row.legal_terms_text) : ''].filter(Boolean).map(htmlPerEditorContratto).join('\n');
    }
    if (testo.trim()) result.push({ id: `classico:${row.id}`, companyId, nome: `${kind === 'offerta' ? 'Classico' : 'Condizioni generali'} · ${text(row.name)}`, testo });
  }
  for (const raw of moduleRows) {
    const row = record(raw);
    if (row.company_id !== companyId) continue;
    const content = record(row.contenuto);
    if (content.companyId && content.companyId !== companyId) continue;
    const template = record(content.template);
    if (template.company_id && template.company_id !== companyId) continue;
    const testo = text(template.condizioni_legali_testo);
    if (!testo.trim() || template.condizioni_legali_attivo === false) continue;
    const moduleId = text(content.moduleId);
    const families: Record<string, string> = { bagni: 'bgn', ristrutturazione: 'rst', fotovoltaico: 'fv', elettrico: 'elt', climatizzazione: 'clm', termoidraulico: 'idr', pavimenti: 'pav', piscine: 'psc', tetti: 'tetti', serramenti: 'serramenti' };
    const area = SALES_AREAS.find(a => a.interventions.some(i => i.id === moduleId) && (text(row.chiave).includes(`full-${families[a.sourceModule] ?? a.sourceModule}-`) || text(row.chiave).includes(`:${a.id}:`) || a.id === content.areaId));
    const title = area?.interventions.find(i => i.id === moduleId)?.title ?? moduleId;
    result.push({ id: `modulo:${text(row.chiave)}`, companyId, nome: `Modulo · ${area?.title ?? 'Modello salvato'} · ${title}`, testo });
  }
  return [...dallArchivio(companyId, archivioRows, perQuestoDocumento), ...result.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))];
}
