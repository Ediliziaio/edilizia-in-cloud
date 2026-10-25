import type { ChatDocument } from './quoteChatDocument';
import { quoteWorkCoverage } from './quoteWorkCoverage';
/** Evidence-based checklist, not a completeness certificate or an instruction
 * to add work. Never changes quantities, scope, prices or monetary inclusion. */
export function quoteCompletionReview(doc: ChatDocument, request = ''): string {
  const active = doc.lines.filter(r => !r.supersededBy?.length);
  const named = (rows: typeof active) => rows.map(r => `voce ${doc.lines.indexOf(r) + 1} · ${r.title}`).slice(0, 8).join('; ');
  const measurements = active.filter(r => /dato di calcolo|solo misura|parametro geometrico/i.test(r.title));
  const quantities = active.filter(r => r.quantity == null), prices = active.filter(r => !measurements.includes(r) && r.price == null && !r.estimate);
  const notes = ['**Verifica locale del computo · nessuna modifica**',
    `${active.length} voci attive · ${active.filter(r => r.reference).length} riferimenti acquisiti (equivalenza tecnica da verificare) · ${active.filter(r => r.estimate).length} stime distinte dai prezzi.`,
    quantities.length ? `**Quantità mancanti (${quantities.length})**\n${named(quantities)}. Non valgono zero e non vengono sostituite con 1.` : 'Tutte le voci hanno una quantità: resta da verificarne misure e criterio di computazione.',
    prices.length ? `**Prezzi o analisi di costo mancanti (${prices.length})**\n${named(prices)}${prices.length > 8 ? '; altre voci visibili nell’editor' : ''}. La ricerca senza risultati non certifica l’assenza dal prezzario.` : 'Nessun prezzo mancante senza stima; le stime non sono prezzi approvati.'];
  const transport = active.filter(r => r.reference && /trasporto/.test(r.reference.description.split(/Escluso:/i)[0]) && /rimozion|demolizion/i.test(r.title));
  const separate = active.filter(r => /trasporto/i.test(r.title) && !/rimozion|demolizion/i.test(r.title));
  if (measurements.length) notes.push(`**Parametri geometrici, non costi di lavorazione**\n${named(measurements)}. Non assegnare automaticamente un prezzo a un dato di calcolo: usalo come base delle formule delle opere pertinenti. Rivedi eventuali inclusioni monetarie per evitare doppioni. Nessuna riga è stata eliminata o esclusa automaticamente.`);
  if (transport.length && separate.length) notes.push(`**Possibile doppio trasporto**\nGià compreso nei riferimenti di ${named(transport)}. Rivedi ${named(separate)}: distinguere oneri di smaltimento esclusi da trasporto già compreso, senza azzerare automaticamente nulla.`);
  if (/bagno/i.test(doc.title)) {
    const titles = active.filter(r => !/rimozion|demolizion/i.test(r.title)).map(r => r.title).join(' ');
    if (!/rubinett|miscelator/i.test(titles)) notes.push('**Rubinetteria**\nNon risulta una voce dedicata: verifica se miscelatori e accessori sono compresi nelle forniture oppure da computare separatamente. Non li aggiungo automaticamente.');
    if (/\bWC\b|\bvaso\b/i.test(titles) && !/cassett|scarico WC/i.test(titles)) notes.push('**WC e accessori**\nVerifica cassetta, comando di scarico e accessori nel testo originale della fornitura, prima di considerare completo il gruppo WC.');
    if (active.some(r => /elettric/i.test(r.title) && /prese/i.test(r.quantityBasis) && /luci/i.test(r.quantityBasis) && /comando/i.test(r.quantityBasis))) notes.push('**Elettrico**\nPrese, punti luce e comandi possono avere tariffe differenti: non moltiplicare un unico prezzo per la somma indistinta dei punti.');
  }
  const coverage = quoteWorkCoverage(doc, request);
  if (coverage.profile) notes.push(`**Ambiti da controllare · ${coverage.profile}**\n${coverage.phases.map(p => `- ${p.label}: ${p.rows.length ? 'voci presenti, contenuto ancora da verificare' : p.conditional ? 'da valutare se richiesto, non aggiunto' : 'non individuato nelle voci, da chiarire'}.`).join('\n')}\nUna fase nominata non prova completezza; questa lista non autorizza lavorazioni o quantità.`);
  notes.push('Controllo documentale parziale: non sostituisce rilievo, progetto tecnico o revisione professionale. Nessuna chiamata AI o invio ai clienti.');
  return notes.join('\n\n');
}
