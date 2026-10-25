import type { ChatDocument, ChatLine } from './quoteChatDocument';

/** Synthetic commercial allocation, NOT a market-price model or a regional tariff.
 * Deliberately fixed: never scale an arbitrary project to make a budget look feasible. */
const ORIGIN = 'ESEMPIO A BUDGET 12000 NETTI';
export const BATHROOM_BUDGET_REQUEST = 'Esempio bagno da 12.000 € netti';
export const BATHROOM_BUDGET_NOTE = 'Esempio precompilato, non una stima generata dall’AI. Importi ripartiti a titolo illustrativo, non prezzi di prezzario né costi verificati. Fattibilità, forniture e quantità da validare con l’impresa. IVA da definire.';
export const BATHROOM_BUDGET_ASSUMPTIONS = 'Caso di esempio: bagno di 12 m², disposizione invariata, 4 apparecchi, 8 punti elettrici, gres e dotazioni di fascia base. Pavimento 12 m²; rivestimenti netti 27,68 m²; pareti doccia 6,60 m². Nessuna misura dedotta dalla planimetria. Esclusi opere strutturali, bonifiche, colonne condominiali, serramenti, pratiche e prestazioni professionali. I tempi dipendono anche da asciugature e approvvigionamenti.';
export const BATHROOM_BUDGET_PACKAGES = [
  ['Preparazione', 'Rilievo, tracciamenti e protezioni', 450, 'Rilievo esecutivo, tracciamenti, protezione percorsi e confinamento antipolvere.'],
  ['Demolizioni', 'Smontaggi, demolizioni e smaltimenti', 1350, 'Smontaggio dotazioni; rimozione pavimento 12 m², rivestimenti 27,68 m² e massetto; movimentazione, trasporto e oneri di conferimento ordinari. Nessun doppio addebito di trasporti.'],
  ['Impianti', 'Impianto idrico e scarichi', 1750, 'Rifacimento interno al bagno per 4 apparecchi; adduzioni e scarichi. Escluse colonne condominiali. Montaggio terminali nel pacchetto dotazioni.'],
  ['Impianti', 'Impianto elettrico e aspirazione', 650, '8 punti elettrici, collegamento equipotenziale e aspiratore con percorso breve. Quadri e linee esterne al bagno da verificare separatamente.'],
  ['Supporti', 'Massetto e ripristini murari', 850, 'Nuovo massetto 12 m² e regolarizzazione supporti parete 27,68 m². Sistemi, spessori e tempi di maturazione da validare, senza accelerazioni presunte.'],
  ['Impermeabilizzazione', 'Impermeabilizzazione bagno e doccia', 650, 'Pavimento 12 m² e pareti doccia 6,60 m², con raccordi e risvolti del sistema. Nessuna duplicazione della superficie pavimento doccia.'],
  ['Finiture', 'Gres pavimento e rivestimenti: fornitura e posa', 1650, 'Fornitura gres fascia base: pavimento 13,20 m² e pareti 30,45 m², sfrido 10% incluso. Posa sulle superfici nette di 12 e 27,68 m², adesivi e fughe compresi.'],
  ['Dotazioni', 'Sanitari, mobile bagno e rubinetteria', 2200, 'WC, bidet, mobile con lavabo, miscelatori lavabo e bidet: fornitura e montaggio. Prodotti di fascia base da selezionare; nessuna marca o prestazione inventata.'],
  ['Dotazioni', 'Doccia completa: piatto, box e gruppo doccia', 650, 'Piatto 120×90 cm con piletta, box e gruppo doccia: fornitura e montaggio, gamma base da verificare. Impermeabilizzazione conteggiata separatamente.'],
  ['Dotazioni', 'Scaldasalviette, specchio, luce e accessori', 600, 'Scaldasalviette idronico con collegamento locale, specchio, plafoniera e set accessori base: fornitura e montaggio. Compatibilità impianto da verificare.'],
  ['Finiture', 'Tinteggiature e sigillature finali', 550, 'Preparazione e pittura pareti sopra rivestimento 7 m² e soffitto 12 m²; sigillature elastiche finali dei raccordi.'],
  ['Consegna', 'Prove impianti, documentazione e pulizia', 650, 'Prove idrauliche e termiche, verifiche elettriche e documentazione dovuta, pulizia finale e consegna. Nessuna conformità viene attestata da questa simulazione.'],
] as const;

export function isBathroomBudgetRequest(text: string): boolean {
  // Exact demo command plus a narrow natural-language request. No currency inference,
  // gross-to-net conversion, hypothetical/negated request or unrelated 12,000 value.
  // Generic budget requests must reach the real conversation, not silently
  // substitute a 12 m² precompiled room for the user's project.
  return text === BATHROOM_BUDGET_REQUEST;
}
export const hasBathroomBudgetExample = (document: ChatDocument) => document.lines.some(line => !line.supersededBy?.length && line.original.quantityBasis.startsWith(ORIGIN));
export const bathroomBudgetAction = (revision: number) => `Applica esempio bagno da 12.000 € netti · revisione ${revision}`;

export function applyBathroomBudgetExample(document: ChatDocument, revision: number): ChatDocument {
  if (revision !== document.revision) throw new Error('La bozza è cambiata: richiedi di nuovo la proposta a budget.');
  if (hasBathroomBudgetExample(document)) throw new Error('L’esempio è già nel computo: modifica le voci esistenti, senza sovrascriverle.');
  if (document.lines.length + BATHROOM_BUDGET_PACKAGES.length > 100) throw new Error('Spazio insufficiente per conservare lo storico: usa una nuova bozza locale.');
  const lines: ChatLine[] = BATHROOM_BUDGET_PACKAGES.map(([chapter, title, price, scope], index): ChatLine => {
    const proposal: ChatLine['original'] = { id: `budget_bagno12_r${revision}_${index + 1}`, title, description: scope, unit: 'a corpo', quantity: 1, quantityBasis: `${ORIGIN}: 1 pacchetto ${chapter}. ${BATHROOM_BUDGET_NOTE}`, referenceId: null };
    return { ...proposal, original: { ...proposal }, price, included: true, manual: true, reference: null };
  });
  const ids = lines.map(line => line.id);
  // Keep the entire previous document in local history, including verified source
  // references/manual prices. No chains/cycles and no old/new double billing.
  return { revision: revision + 1, title: 'PROPOSTA A BUDGET · Bagno completo 12 m²', lines: [
    ...document.lines.map(line => ({ ...line, included: false, supersededBy: ids })), ...lines,
  ] };
}
