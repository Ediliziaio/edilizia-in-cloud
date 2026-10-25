import { assessQuoteRequest } from './quoteRequestContext';
import type { ChatDocument } from './quoteChatDocument';
import type { PlanAttachment } from './planReading';
import { quoteCoverageGuidance } from './quoteWorkCoverage';

export function quotePlanningGuidance(doc: ChatDocument, text: string, plan: PlanAttachment | null, vision: boolean, budget: boolean) {
  const intent = assessQuoteRequest(text).intent;
  const parts = ['CONDUZIONE DELLA CONVERSAZIONE: usa i dati già confermati. Una sola domanda prioritaria, non ripetuta nel messaggio e in questions; offrire alternative brevi quando utili. Non richiedere un elenco di informazioni prima di dare qualcosa di utilizzabile.'];
  if (intent === 'compose' || intent === 'revise' || budget) parts.push(budget
    ? 'PRIMA PROPOSTA: se è possibile uno scenario plausibile, presenta il budget preliminare strutturato con intervalli e ipotesi esplicite da confermare. Non adattare i prezzi per far tornare il budget obiettivo. Se manca un dato davvero decisivo chiedi SOLO quello, spiegandone l’effetto; non spacciare un caso standard per il progetto reale.'
    : 'PRIMA BOZZA: componi realmente proposals delle lavorazioni richieste, anche se mancano prezzi o misure: usa quantity:null e referenceId:null dove necessario. Non basta dire che hai composto le righe. Non aspettare un prezzo per creare una voce da completare. Non usare 1 a corpo come quantità implicita.');
  if (plan) parts.push(`ALLEGATO ${plan.mime === 'application/pdf' ? 'PDF' : 'IMMAGINE'}: ${vision ? 'in questo turno ricevi la copia visiva della pagina scelta' : 'in questo turno NON ricevi l’immagine: hai soltanto gli eventuali testi OCR e misure confermate'}. Distingui etichette lette, quote leggibili, interpretazioni e misure confermate dall’utente. Una planimetria non dice quali opere desidera il cliente e non prova stratigrafie, strutture, materiali o impianti nascosti. Chiedi prima il tipo di intervento se non è indicato. Niente aree ricavate dalla sola dimensione in pixel né assunzione che tutte le stanze siano rettangolari. Per un progetto multipagina indica gli elaborati mancanti; non dichiarare di aver letto tutte le pagine.`);
  parts.push(quoteCoverageGuidance(doc, text));
  return parts.join('\n').slice(0, 2900);
}
