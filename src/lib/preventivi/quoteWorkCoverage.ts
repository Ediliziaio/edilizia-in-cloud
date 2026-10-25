import type { ChatDocument } from './quoteChatDocument';
import type { QuoteChatProposal } from '../../../supabase/functions/_shared/quoteConversation';

type Phase = { id: string; label: string; match: RegExp; conditional?: boolean };
const phase = (id: string, label: string, match: RegExp, conditional = false): Phase => ({ id, label, match, conditional });
const survey = phase('rilievo', 'Rilievo, verifiche e preparazioni', /rilievo|sopralluogo|tracciament|protezi|allestiment/i);
const handover = phase('consegna', 'Verifiche finali, documenti e consegna', /collaud|verifiche finali|prove|documentazion|pulizia|consegna/i);
const profiles: Record<string, Phase[]> = {
  bagno: [survey, phase('smontaggi', 'Smontaggi, demolizioni e gestione macerie', /smontagg|demolizi|macerie|smaltiment/i), phase('idrico', 'Adduzioni e scarichi', /idric|idraulic|adduzion|scarich/i), phase('elettrico', 'Impianto elettrico e aerazione', /elettric|ventilazion|aspirator/i), phase('supporti', 'Sottofondi e ripristini', /massett|sottofond|ripristin|regolarizz/i), phase('impermeabilizzazione', 'Impermeabilizzazione e raccordi', /impermeabil|membran/i), phase('piastrelle', 'Fornitura e posa di pavimenti e rivestimenti', /piastrell|gres|rivestiment|paviment/i), phase('dotazioni', 'Sanitari, rubinetteria e dotazioni', /sanitar|rubinett|miscelator|lavabo|box doccia/i), phase('finiture', 'Finiture e sigillature', /tintegg|pittur|sigillatur/i), handover],
  costruzione: [survey, phase('terra', 'Terreno, accessi e movimenti terra da valutare', /scav|moviment\w* terra|terreno|sbancament/i), phase('strutture', 'Strutture secondo gli elaborati del progettista', /struttur|fondazion|armatur|cemento armato/i), phase('involucro', 'Involucro, isolamento e copertura', /involucro|tamponament|isolament|cappott|copertura|tetto/i), phase('impianti', 'Impianti e reti', /impiant|idric|elettric|scarich/i), phase('finiture', 'Partizioni, serramenti e finiture', /partizion|tramezz|intonac|serrament|infiss|finitur|paviment/i), phase('esterni', 'Sistemazioni esterne da valutare', /estern|recinzion|giardin|allacci/i, true), handover],
  tennis: [survey, phase('terra', 'Preparazione terreno e sottofondi', /scav|terreno|sottofond|livellament/i), phase('drenaggio', 'Drenaggio e smaltimento acque', /drenagg|acqu|pendenz/i), phase('superficie', 'Superficie sportiva e stratigrafia da definire', /superficie|manto|resina|terra rossa|asfalto/i), phase('recinzione', 'Recinzione e accessi da valutare', /recinzion|access/i, true), phase('illuminazione', 'Illuminazione da valutare', /illuminazion|proiettor/i, true), phase('attrezzature', 'Attrezzature e tracciature', /rete|pali|tracciatur|attrezzatur/i), handover],
  fotovoltaico: [survey, phase('fissaggi', 'Supporti e verifica della copertura', /fissagg|support|struttur|copertura/i), phase('moduli', 'Moduli e inverter', /moduli|pannelli|inverter/i), phase('elettrico', 'Collegamenti e protezioni elettriche', /cabl|elettric|protezion|quadro/i), phase('accumulo', 'Accumulo, solo se richiesto', /accumulo|batteri/i, true), phase('connessione', 'Connessione e pratiche da verificare', /conness|allacci|pratic/i), handover],
  serramenti: [survey, phase('fornitura', 'Fornitura, misure e configurazione per vano', /fornitur|finestr|portefinestr|infiss|serrament/i), phase('rimozione', 'Rimozioni e smaltimento, se richiesti', /rimozion|smontagg|smaltiment/i, true), phase('posa', 'Posa, fissaggi e sigillature', /posa|installazion|fissagg|sigillatur/i), phase('ripristini', 'Ripristini e accessori, se richiesti', /ripristin|accessori|cassonett|zanzarier/i, true), handover],
  tetto: [survey, phase('accessi', 'Accesso e protezioni da definire', /pontegg|sicurezza|access|anticaduta/i), phase('rimozioni', 'Rimozioni e gestione materiali, se richieste', /rimozion|demolizion|smaltiment/i, true), phase('supporti', 'Supporti e stratigrafia da verificare', /support|stratigraf|struttur|orditur/i), phase('isolamento', 'Isolamento e impermeabilizzazione', /isolament|impermeabil|membran/i), phase('manto', 'Manto, lattonerie e dettagli', /tegole|coppi|manto|lattoner|gronda/i), handover],
  appartamento: [survey, phase('demolizioni', 'Demolizioni e smaltimenti, secondo ambito', /demolizion|rimozion|smaltiment/i, true), phase('opere', 'Partizioni, supporti e ripristini', /partizion|tramezz|intonac|massett|ripristin/i), phase('impianti', 'Impianti da confermare per ambiente', /impiant|idric|elettric/i), phase('finiture', 'Pavimenti, rivestimenti e tinteggiature', /paviment|rivestiment|tintegg|finitur/i), phase('forniture', 'Serramenti e dotazioni, se richiesti', /serrament|infiss|sanitar|dotazion/i, true), handover],
};
/** A checklist of candidate scopes, NOT a design, confirmed scope or certificate. */
export function quoteWorkCoverage(doc: ChatDocument, request = '') {
  const text = `${doc.title}\n${request}`;
  const profile = /campo da tennis/i.test(text) ? 'tennis' : /nuova costruzione|costruzione (?:di |della |di una |di un )?(?:casa|villa|villetta|edificio|capannone|scuola)|fondazioni/i.test(text) ? 'costruzione'
    : /fotovoltaic/i.test(text) ? 'fotovoltaico' : /bagno|bagni/i.test(text) && !/appartamento|trilocale/i.test(text) ? 'bagno'
    : /serrament|infiss|finestre/i.test(text) && !/appartamento|trilocale/i.test(text) ? 'serramenti'
    : /tett[oi]|copertura/i.test(text) && !/appartamento|trilocale/i.test(text) ? 'tetto'
    : /appartamento|trilocale|ristrutturazione completa/i.test(text) ? 'appartamento' : null;
  const active = doc.lines.filter(r => !r.supersededBy?.length);
  const phases = (profile ? profiles[profile] : []).map(p => ({ ...p, rows: active.filter(row => p.match.test(`${row.title} ${row.description}`)).map(row => row.id) }));
  return { profile, phases, missing: phases.filter(p => !p.rows.length) };
}
export function quoteCoverageGuidance(doc: ChatDocument, request: string) {
  const coverage = quoteWorkCoverage(doc, request);
  if (!coverage.profile) return 'Intervento libero: chiarisci il risultato richiesto, prepara le lavorazioni pertinenti e chiedi soltanto il dato prioritario. Nessuna lista chiusa di lavori supportati.';
  return `CONTROLLO LOCALE PER ${coverage.profile}, NON PROGETTO TECNICO: ${coverage.phases.map(p => `${p.label}: ${p.rows.length ? 'voci presenti, completezza da verificare' : p.conditional ? 'da valutare solo se richiesto' : 'da chiarire'}`).join('; ')}. Questi sono ambiti candidati, non opere automaticamente autorizzate. Non affermare che una fase è completa perché è nominata; leggere descrizioni, inclusioni ed esclusioni. Le quantità strutturali richiedono elaborati, non si deducono dai mq. Non sommare pacchetti e dettagli.`.slice(0, 2300);
}
/** Transparent local fallback only for an explicitly requested FIRST complete
 * draft when the provider produced no rows. No quantities, prices or inclusion. */
export function quoteInitialScaffold(doc: ChatDocument, request: string): QuoteChatProposal[] {
  if (doc.lines.some(r => !r.supersededBy?.length) || !/\b(?:prepara|crea|genera|fammi|componi)\b/i.test(request)
    || !/\b(?:preventivo|computo|proposta)\b/i.test(request) || !/complet|inter[oa]|nuova costruzione|costruzione di/i.test(request)
    || /\b(?:non|senza)\s+(?:creare|generare|aggiungere|comporre|modificare)\b/i.test(request)) return [];
  const coverage = quoteWorkCoverage(doc, request);
  return coverage.phases.filter(p => !p.conditional).map((p, i): QuoteChatProposal => ({ id: `schema_${coverage.profile}_${i + 1}`, title: p.id === 'idrico' ? `Impianto idrico: ${p.label.toLocaleLowerCase('it')}` : p.label,
    description: 'Ambito preliminare da dettagliare e confermare. Non è un pacchetto quotato né una lavorazione tecnicamente verificata. Non sommare questa fase ai suoi futuri dettagli.',
    unit: 'a corpo', quantity: null, quantityBasis: 'Struttura preliminare proposta dal software; quantità da rilevare e criterio di computazione da scegliere.', referenceId: null }));
}
