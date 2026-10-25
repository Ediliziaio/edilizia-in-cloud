import type { ChatDocument } from './quoteChatDocument';
import { formatCurrency } from '@/lib/formatters';

export type QuoteRequestIntent = 'information' | 'budget' | 'compose' | 'revise' | 'open';
/** Hints, NOT an exhaustive classifier, professional assessment or permission
 * to switch the user's selected editor. Unknown/mixed work stays in free chat. */
export function assessQuoteRequest(text: string) {
  const normalized = text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it');
  const mutation = /\b(?:crea|prepara|genera|componi|aggiungi|inserisci|elabora|fammi|rifai|aggiorna|modifica|sostituisci)\b/.test(normalized)
    && !/\b(?:non|senza)\s+(?:creare|preparare|generare|comporre|aggiungere|inserire|elaborare|rifare|aggiornare|modificare|sostituire)\b/.test(normalized);
  const question = /^(?:(?:ciao|buongiorno)[,!]?\s+)?(?:come|cosa|che cosa|quali|qual e|quanto|perche|puoi spiegarmi|spiegami|mi spieghi|vorrei capire|vorrei sapere|riepiloga|mostrami i dati|dimmi)\b/.test(normalized);
  const noEstimates = /\b(?:senza|niente)\s+(?:stime|ipotesi)|\bsolo\s+(?:prezzi|costi)\s+verificati|\bnon\s+(?:voglio|fare|usare)\s+(?:un\s+)?(?:budget|stime|ipotesi|preventivo indicativo)/.test(normalized);
  // A standalone request may follow a preamble; a citation such as
  // “budget preliminare e computo devono restare separati” is not that request.
  const nominalBudgetRequest = /(?:^|[;.!?\n])\s*(?:budget preliminare|budget indicativo|stima preliminare|stima indicativa|preventivo (?:indicativo|orientativo|di massima))\b(?=\s*(?:[,:;.!?]|$)|\s+(?:per|di|del|della|dei|delle|da|sul|sulla|con)\b|\s+dell['’])/.test(normalized);
  const budget = !noEstimates && (nominalBudgetRequest
    || /\b(?:prepara|genera|calcola|stima|aggiorna|rivedi|correggi|rifai|riprova|prova|crea|vorrei|voglio|fammi)\b[^;.!?\n]{0,60}\b(?:budget preliminare|budget indicativo|stima preliminare|stima indicativa|preventivo (?:indicativo|orientativo|di massima))\b/.test(normalized)
    || /^quanto (?:costa|costerebbe|potrebbe costare)\b/.test(normalized));
  const intent: QuoteRequestIntent = question && !mutation && !budget ? 'information' : budget ? 'budget'
    : mutation ? /\b(?:aggiorna|modifica|sostituisci)\b/.test(normalized) ? 'revise' : 'compose' : 'open';
  const topics: string[] = [];
  if (/\b(?:appalt[oi] pubblic[oi]|gar[ae] (?:pubblic\w+|d.appalto)|lavori pubblici|stazione appaltante|disciplinare di gara|offerta (?:tecnica|economica) di gara)\b/.test(normalized)) topics.push('public');
  if (/\b(?:nuova costruzione|nuove costruzioni|costruire|edificare|costruzione (?:di |della |di una |di un )?(?:casa|villa|villetta|edificio|capannone|campo)|fondazioni)\b/.test(normalized)) topics.push('construction');
  if (/\b(?:ristruttur\w*|rifacimento|rifai|rinnovo|demolizion\w*)\b/.test(normalized)) topics.push('renovation');
  if (/\b(?:manutenzion\w*|riparazion\w*|infiltrazion\w*|guasto|guasti)\b/.test(normalized)) topics.push('maintenance');
  if (/\b(?:fotovoltaic\w*|serrament\w*|infiss\w*|tett[oi]|copertur\w*|impiant\w*|cappott\w*|facciat\w*|bagno|bagni|campo da tennis|piscin\w*)\b/.test(normalized)) topics.push('specialist');
  return { intent, topics };
}

export function quoteRequestGuidance(text: string, flow?: string) {
  const assessment = assessQuoteRequest(text);
  const parts = [
    `ORIENTAMENTO DEL TURNO (indizi locali, non classificazione tecnica certificata): ${assessment.intent}; ambiti riconosciuti: ${assessment.topics.join(', ') || 'liberi/da chiarire'}.`,
    'Rispondi anche a domande libere. Una domanda informativa non autorizza cambi a voci, esclusioni o misure. Le richieste non previste da questi indizi NON sono fuori ambito: chiarisci obiettivo e dati mancanti, senza ricondurle tutte al bagno.',
    'Per una richiesta esplicita di proposta completa, descrivi le fasi pertinenti e puoi proporre righe con quantità null dove mancano misure. Le fasi suggerite non sono automaticamente richieste, prezzi o inclusioni. Chiedi una decisione prioritaria alla volta, con alternative quando utili; non inventare dati per riempire righe.',
    'Distingui spiegazione, budget preliminare e computo. Nei computi i prezzi vengono solo da riferimenti o inserimenti verificabili; una stima AI resta dichiarata come indicativa. Non promettere fattibilità o date senza dati.',
  ];
  if (assessment.topics.includes('construction')) parts.push('Nuove costruzioni: chiarire destinazione, ubicazione, consistenza e livello progettuale. Considerare come ambiti DA VALUTARE terreno/scavi, strutture, involucro, impianti, finiture ed esterni. Non derivare fondazioni, armature, sezioni o quantità strutturali dai soli mq: richiedono progetto e verifica tecnica.');
  if (assessment.topics.includes('public')) parts.push('Appalti pubblici: distinguere studio preliminare, computo e preparazione di offerta. Chiedere gli atti di gara pertinenti, gli elaborati, il prezzario/edizione e i vincoli dichiarati. Senza documenti non affermare requisiti, scadenze, aliquote, ribassabilità o conformità normativa; rinviare a fonti ufficiali aggiornate e revisione professionale. Non applicare ribassi globali, non firmare o inviare offerte, non produrre dichiarazioni di possesso requisiti.');
  if (assessment.topics.includes('maintenance')) parts.push('Manutenzione: distinguere sintomo, causa ipotizzata e intervento. Chiedere ubicazione/estensione, accesso e verifiche disponibili. Non presentare una diagnosi o una riparazione definitiva come certa da una descrizione o immagine.');
  if (assessment.topics.includes('specialist')) parts.push('Lavori specialistici: chiedere le caratteristiche che incidono sulla lavorazione (pezzi/misure, materiali, potenze o stratigrafie pertinenti). Distingui fornitura, posa, opere accessorie e prestazioni da verificare; non sommare pacchetti e relativi dettagli due volte.');
  if (flow) parts.push(`Editor scelto dall’utente: ${flow.slice(0, 80)}. La chat può spiegare altri lavori, ma non cambiare editor o riutilizzare le quantità di questo modello per un progetto diverso; chiedi se il nuovo ambito integra il lavoro o è un progetto separato.`);
  return parts.join('\n').slice(0, 2900);
}

export function quoteCurrentStateEvidence(doc: ChatDocument) {
  const rows = doc.lines.filter(row => !row.supersededBy?.length);
  let evidence = `STATO CORRENTE CALCOLATO DAL SOFTWARE · revisione ${doc.revision}. ${rows.length} voci attive. I messaggi precedenti possono riportare valori superati: per quantità, unità e inclusione fanno fede lines e includedLineIds di QUESTO turno, non la prosa della cronologia. I prezzi qui riportati sono valori della bozza, non tariffe certificate.\n`;
  let count = 0;
  for (const row of rows) {
    const line = `${row.id}: ${row.quantity ?? 'ignota'} ${row.unit}; prezzo ${row.price ?? 'da definire'} EUR/unità; ${row.included ? 'inclusa' : 'non inclusa'}${row.manual ? '; manuale protetta' : ''}.\n`;
    if ((evidence + line).length > 2750) break;
    evidence += line; count++;
  }
  if (count < rows.length) evidence += `Estratto: ${count}/${rows.length} voci. Per le altre leggere lines; nessuna quantità mancante vale zero.`;
  return evidence;
}

/** Deterministic human summary: no model-generated quantities, prices or totals. */
export function quoteCurrentValues(doc: ChatDocument, vat: number | null, discounts: Record<string, number> = {}) {
  const rows = doc.lines.filter(row => !row.supersededBy?.length);
  return `**Dati correnti della bozza · revisione ${doc.revision}**\n\n${rows.length ? rows.slice(0, 6).map(row => `- **${row.title.slice(0, 120)}**: ${row.quantity == null ? 'quantità da definire' : `${row.quantity} ${row.unit}`} · ${row.price == null ? 'prezzo da definire' : `${formatCurrency(row.price)} / ${row.unit}`} · ${row.included ? 'inclusa nel parziale' : 'non inclusa'} · sconto ${discounts[row.id] ?? 0}%.`).join('\n') : 'Nessuna lavorazione composta.'}${rows.length > 6 ? `\n\nPrime 6 voci su ${rows.length}; le altre restano nell’editor.` : ''}\n\nIVA: ${vat == null ? 'da definire' : `${vat}% inserita nell’editor`}. Valori della bozza, non prezzi regionali certificati.`.slice(0, 2300);
}

export function asksQuoteCurrentValues(text: string) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\b(?:riepilog\w*|mostr\w*|quali sono|qual e)\b/i.test(normalized)
    && /\b(?:valori attuali|dati attuali|dati correnti|voce corrente|voci correnti|quantita attuale|prezzo manuale|prezzo attuale)\b/i.test(normalized);
}
