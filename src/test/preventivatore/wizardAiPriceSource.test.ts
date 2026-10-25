import { describe, expect, it } from 'vitest';
import { emptyChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { indicativeBudgetProposal } from '@/lib/preventivi/quoteProposalReview';
import { computoChatDocument, reconcileComputoDraft } from '@/lib/preventivi/wizardAiDraft';
import { wizardAiPriceSource } from '@/lib/preventivi/wizardAiPriceSource';

const budget = {
  scope: 'Pergola di prova 4 x 3 m', currency: 'EUR' as const,
  assumptions: ['Soletta e ancoraggi da verificare dal tecnico'],
  exclusions: ['Linea elettrica dedicata e fondazioni speciali'],
  groups: [{ label: 'Struttura e lamelle', low: 6000, high: 10000, basis: 'Fornitura 12 m², nessuna offerta del fornitore disponibile.' }],
};
const seed = emptyChatDocument();
const indicative = () => indicativeBudgetProposal(seed, budget, 0, false);

describe('provenienza dei prezzi dal budget al computo nativo', () => {
  it('persiste natura indicativa, intervallo e motivazione nel campo stampato dal PDF', () => {
    const proposal = indicative();
    const { rows } = reconcileComputoDraft([], seed, proposal, { companyId: 'demo', projectId: 'test' });
    expect(rows).toHaveLength(1);
    expect(rows[0].prezzo_unitario).toBe(8000);
    expect(rows[0].fonte).toContain('Stima AI indicativa, non prezzario verificato');
    expect(rows[0].fonte).toContain('6.000,00');
    expect(rows[0].fonte).toContain('10.000,00');
    expect(rows[0].fonte).toContain('nessuna offerta del fornitore');
    expect(rows[0].descrizione_estesa).toContain('Soletta e ancoraggi da verificare');
    expect(rows[0].descrizione_estesa).toContain('Linea elettrica dedicata e fondazioni speciali');
    expect(proposal.lines[0].reference).toBeNull();
    expect(rows[0].listino_voce_id).toBeNull();
    const reopened = computoChatDocument(rows, 'Bozza riaperta');
    expect(reopened.lines[0].pricing?.origin).toBe('ai-estimate');
    expect(reopened.lines[0].pricing?.basis).toContain('6.000,00');
    expect(reopened.lines[0].reference).toBeNull();
  });

  it('non inventa una fonte per il prezzo privo di provenienza', () => {
    const line = indicative().lines[0];
    delete line.pricing;
    expect(wizardAiPriceSource(line)).toBeNull();
  });

  it('mantiene riconoscibili anche gli esempi e le offerte dichiarate', () => {
    const line = indicative().lines[0];
    line.pricing = { origin: 'demo', basis: 'Valori convenzionali per collaudo.' };
    expect(wizardAiPriceSource(line)).toContain('non offerta commerciale');
    line.pricing = { origin: 'supplier', basis: 'Offerta indicata dal responsabile, da verificare.' };
    expect(wizardAiPriceSource(line)).toContain('Offerta fornitore dichiarata');
  });
});
