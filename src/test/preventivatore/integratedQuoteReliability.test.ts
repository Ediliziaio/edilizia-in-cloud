import { describe, expect, it } from 'vitest';
import { emptyQuoteProject, readQuoteProject, quoteBudgetIntent, quoteBudgetTargetCheck, quoteProjectEconomy, quoteRoomQuantity, applyQuoteRoomQuantities, quoteCostScope, type QuoteProject, type QuoteRoomMeasures } from '@/lib/preventivi/quoteProject';
import { applyChatResult, patchChatLine, type ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { protectedQuoteEdits, applyProtectedQuoteEdits, indicativeBudgetProposal, quotePriceLabel } from '@/lib/preventivi/quoteProposalReview';
import { updateQuoteScopeFacts, quoteTurnIsHypothetical } from '../../../supabase/functions/_shared/quoteScopeMemory';
import { updateQuoteRoomDecisions } from '../../../supabase/functions/_shared/quoteRoomMemory';
import { quoteLineOverlaps } from '@/lib/preventivi/quoteLineDuplicates';
import { readLocalQuoteSnapshot } from '@/lib/preventivi/localQuoteMemory';
import { localSnapshot, turnId } from './localPlanFixtures';
const p = { id: 'floor', title: 'Posa pavimento bagno', description: 'Sola posa gres', quantity: 10, unit: 'm²', quantityBasis: 'Misura utente', referenceId: null as null };
const doc = (): ChatDocument => ({ title: 'Bagno da verificare', revision: 4, lines: [{ ...p, original: p, price: 40, manual: true, included: true, reference: null }] });
const room: QuoteRoomMeasures = { id: 'bath', name: 'Bagno', length: 3, width: 4, height: 2.7, tileHeight: 2.2, tiledOpenings: 3.12, paintOpenings: 0, wastePct: 10 };
describe('Affidabilità integrata: richieste, economia e quantità', () => {
  it('calcola lo sforamento del budget preliminare indipendentemente dalle affermazioni AI', () => {
    const budget = { scope: 'Bagno 6 mq', currency: 'EUR' as const, assumptions: [] as never[], exclusions: [] as never[], groups: [{ label: 'Lavori', low: 12300, high: 22700, basis: 'Stima di test' }] };
    const target = { amount: 12000, basis: 'net' as const, evidence: 'Utente' };
    expect(quoteBudgetTargetCheck(budget, target, null)).toMatchObject({ status: 'below-range', shortfall: 300 });
    expect(quoteBudgetTargetCheck(budget, { ...target, basis: 'gross' }, null)).toBeNull();
    expect(quoteBudgetTargetCheck(budget, { ...target, basis: 'gross' }, 10)?.shortfall).toBe(1530);
  });
  it.each([
    ['Fammi bagno 6 mq da 12.000 €', 12000, 'unspecified'],
    ['Vorrei un tetto con budget 25000 euro IVA inclusa', 25000, 'gross'],
    ['Preventivo serramenti da 8.500,50 € netti', 8500.5, 'net'],
    ['Ho un budget di 12000€', 12000, 'unspecified'],
  ])('interpreta il budget senza inventare misure: %s', (text, amount, basis) => expect(quoteBudgetIntent(String(text))).toMatchObject({ amount, basis }));
  it.each(['Prezzo unitario voce 1: 12000€', 'Non ho un budget', 'Budget fra 10000€ e 12000€', 'Bagno di 12 mq'])('non interpreta importi ambigui o quantità come budget: %s', text => expect(quoteBudgetIntent(text)).toBeNull());
  it('non estende un componente escluso all’intero impianto', () => {
    for (const evidence of ['Impianto idrico bagno per quattro apparecchi, montaggio apparecchi escluso', 'Predisposizione idraulica bagno con terminale escluso', 'Colonne condominiali escluse']) {
      expect(updateQuoteScopeFacts([], evidence)).toEqual([]); expect(updateQuoteRoomDecisions([], evidence).decisions).toEqual([]);
    }
    expect(updateQuoteRoomDecisions([], 'Impianto idrico bagno escluso').decisions).toMatchObject([{ work: 'impianto_idrico', state: 'excluded' }]);
  });
  it('non confonde evitare doppioni con posa in sovrapposizione', () => {
    const decisions = updateQuoteRoomDecisions([], 'Rifai pavimento bagno evitando sovrapposizioni della malta').decisions;
    expect(decisions.some(d => d.detail === 'sovrapposizione')).toBe(false);
    expect(updateQuoteRoomDecisions([], 'Rifai pavimento bagno con posa in sovrapposizione').decisions.some(d => d.detail === 'sovrapposizione')).toBe(true);
  });
  it('le ipotesi esplicite non bloccano la creazione richiesta, ma le scelte indecise sì', () => {
    expect(quoteTurnIsHypothetical('Crea le righe con queste ipotesi da confermare')).toBe(false);
    expect(quoteTurnIsHypothetical('Forse voglio rifare il bagno')).toBe(true);
    expect(quoteTurnIsHypothetical('Non ho ancora deciso se rifare il pavimento')).toBe(true);
  });
  it('una spiegazione senza modifiche non cambia la revisione economica', () => {
    const before = doc(); const result = { version: 1, turnId, revision: 4, simulated: true, model: 'test', references: [] as never[], turn: { version: 1, title: '', message: 'Riepilogo', proposals: [] as never[], questions: [] as never[], searches: [] as never[], warnings: [] as never[] } };
    expect(applyChatResult(before, result, turnId, null).document).toBe(before);
  });
  it('i sigillanti non sono una fornitura generica di sanitari', () => {
    const before = doc(); before.lines = ['Sigillature finali e raccordi sanitari/box', 'Fornitura WC', 'Fornitura bidet'].map((title, i) => ({ ...before.lines[0], id: `r${i}`, title, original: { ...p, id: `r${i}`, title } }));
    expect(quoteLineOverlaps(before)).toEqual([]);
  });
  it('calcola margine e budget solo con costi completi e aliquota coerente', () => {
    const before = doc(); const project: QuoteProject = { ...emptyQuoteProject(), target: { amount: 500, basis: 'gross', evidence: 'Utente' }, costs: [{ id: 'floor', materials: 100, hours: 4, hourlyRate: 25, subcontract: 0, other: 0, scope: quoteCostScope(before.lines[0]) }], overheadPct: 10, contingencyPct: 5, targetMarginPct: 25, crewSize: 2, hoursPerDay: 8 };
    const values = quoteProjectEconomy(before, project, 10);
    expect(values).toMatchObject({ net: 400, gross: 440, totalCost: 231, margin: 169, marginPct: 42.25, requiredPrice: 308, targetDelta: -60, crewDays: .25 });
    expect(quoteProjectEconomy(before, project, null).targetDelta).toBeNull();
    const changed = patchChatLine(before, 'floor', { quantity: 12 });
    expect(quoteProjectEconomy(changed, project, 10)).toMatchObject({ margin: null, costsComplete: false, missingCostRows: ['floor'] });
  });
  it('vuoto e zero sono distinti: non inventa un margine per costi mancanti', () => {
    expect(quoteProjectEconomy(doc(), emptyQuoteProject(), null).margin).toBeNull();
    expect(() => readQuoteProject({ ...emptyQuoteProject(), targetMarginPct: 100 })).toThrow();
    expect(() => readQuoteProject({ ...emptyQuoteProject(), overheadPct: NaN })).toThrow();
    expect(() => readQuoteProject({ ...emptyQuoteProject(), rooms: [room, room] })).toThrow();
  });
  it('non presenta un residuo di budget se mancano prezzi nel progetto', () => {
    const before = doc(); before.lines.push({ ...before.lines[0], id: 'unpriced', price: null, included: false });
    const project = { ...emptyQuoteProject(), target: { amount: 12000, basis: 'net' as const, evidence: 'Budget utente' } };
    expect(quoteProjectEconomy(before, project, null)).toMatchObject({ net: 400, missingPriceRows: 1, targetDelta: null });
  });
  it('ricalcola superfici nette e sfridi senza duplicare la posa', () => {
    expect(quoteRoomQuantity(room, 'floor').result).toBe(12);
    expect(quoteRoomQuantity(room, 'tiles').result).toBe(27.68);
    expect(quoteRoomQuantity(room, 'paint').result).toBe(7);
    expect(quoteRoomQuantity(room, 'floorSupply').result).toBe(13.2);
    expect(quoteRoomQuantity(room, 'tileSupply').result).toBe(30.45);
    expect(() => quoteRoomQuantity({ ...room, tiledOpenings: null }, 'tiles')).toThrow('aperture');
    expect(() => quoteRoomQuantity({ ...room, tileHeight: 4 }, 'tiles')).toThrow();
  });
  it('modifica solo le quantità collegate dopo conferma, preserva prezzo e invalida l’inclusione', () => {
    const before = doc(); const project = { ...emptyQuoteProject(), rooms: [room], links: [{ lineId: 'floor', roomId: 'bath', kind: 'floor' as const }] };
    const next = applyQuoteRoomQuantities(before, project, 4);
    expect(next.lines[0]).toMatchObject({ quantity: 12, price: 40, included: false, calculation: { result: 12 } });
    expect(() => applyQuoteRoomQuantities(next, project, 4)).toThrow('cambiate');
    expect(applyQuoteRoomQuantities(next, { ...project, rooms: [{ ...room, width: 5 }] }, 5).lines[0].quantity).toBe(15);
  });
  it('le modifiche AI alle righe manuali sono proposte, non sovrascritture', () => {
    const before = doc(), proposal = { ...p, description: 'Posa con adesivo specificato', quantity: 12 };
    expect(protectedQuoteEdits(before, [proposal])[0].fields).toEqual(['description', 'quantity']);
    const next = applyProtectedQuoteEdits(before, [proposal], 4);
    expect(next.lines[0]).toMatchObject({ description: proposal.description, quantity: 12, price: 40, included: false, original: p });
    expect(() => applyProtectedQuoteEdits(next, [proposal], 4)).toThrow('superate');
    expect(applyProtectedQuoteEdits(before, [{ ...proposal, unit: 'cad' }], 4).lines[0].price).toBeNull();
  });
  it('converte il budget AI a valori medi, non al budget desiderato, con provenienza persistente', () => {
    const budget = { scope: 'Bagno sintetico', currency: 'EUR' as const, assumptions: ['Dati da confermare'], exclusions: ['Strutture'], groups: [{ label: 'Impianti', low: 1000, high: 2000, basis: 'Stima generale, non tariffa' }] };
    const next = indicativeBudgetProposal(doc(), budget, 4);
    const active = next.lines.filter(l => !l.supersededBy?.length);
    expect(active[0]).toMatchObject({ price: 1500, pricing: { origin: 'ai-estimate', low: 1000, high: 2000 }, referenceId: null });
    expect(quotePriceLabel(active[0])).toBe('Stima AI indicativa');
    const snapshot = localSnapshot(); snapshot.plan = null; snapshot.rectangle = null; snapshot.document = next; snapshot.project = { ...emptyQuoteProject(), rooms: [room] };
    expect(readLocalQuoteSnapshot(JSON.parse(JSON.stringify(snapshot))).document).toEqual(next);
    expect(readLocalQuoteSnapshot(snapshot).project).toEqual(snapshot.project);
    expect(() => indicativeBudgetProposal(next, budget, 4)).toThrow();
  });
});
