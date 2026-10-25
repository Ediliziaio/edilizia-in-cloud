import { describe, expect, it } from 'vitest';
import { QUOTE_SIMULATION_SCENARIOS, quoteSimulationScenario, quoteSimulationTarget } from '@/lib/preventivi/quoteSimulationScenarios';
import { localDraftKey } from '@/lib/preventivi/localQuoteMemory';
import { memoryScope } from './localPlanFixtures';
describe('Simulazione autonoma bagno completo 12 m²', () => {
  it('si sceglie dalla chat, non ricicla il caso da 6 m² e non precompila misure o prezzi', () => {
    const scenario = quoteSimulationScenario('bagno12')!;
    expect(quoteSimulationTarget('Simulazione bagno completo 12 m²')).toBe('bagno12');
    expect(scenario.prompt).toContain('bagno di 12 m²'); expect(scenario.prompt).toContain('Non dedurre forma'); expect(scenario.prompt).toContain('nessuna inclusione automatica');
    expect(scenario).not.toHaveProperty('price'); expect(scenario).not.toHaveProperty('lines');
    expect(quoteSimulationScenario('bagno')?.title).toContain('6 m²');
    expect(new Set(QUOTE_SIMULATION_SCENARIOS.map(s => s.id)).size).toBe(QUOTE_SIMULATION_SCENARIOS.length);
  });
  it('ha una memoria distinta da bagno 6 m², parziale e progetto principale', () => {
    const keys = [undefined, 'bagno', 'bagno12', 'parziale', 'serramenti'].map(id => localDraftKey({ ...memoryScope, ...(id ? { scenarioId: quoteSimulationScenario(id)!.id } : {}) }));
    expect(new Set(keys).size).toBe(5);
    expect(keys[2]).toMatch(/:scenario:bagno12$/);
  });
});
