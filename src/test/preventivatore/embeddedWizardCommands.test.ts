import { describe, expect, it } from 'vitest';
import { isEmbeddedWizardContextCommand } from '@/lib/preventivi/embeddedWizardCommands';
import { QUOTE_SIMULATION_SCENARIOS } from '@/lib/preventivi/quoteSimulationScenarios';

describe('embedded wizard command boundaries', () => {
  it.each([
    'Simulazione di tinteggiatura interna, solo bozza di prova. Una stanza 5 x 4 m.',
    'Per questa simulazione confermo le linee frigorifere: 8 m, 9 m e 11 m.',
    'Prepara una simulazione completa del bagno con tutte le fasi.',
    'Confermo le misure per la simulazione. Non applicare modifiche al wizard.',
    'Descrivi il modello di finestra PVC e le lavorazioni per installarlo.',
    'Non imposta IVA: mantieni i dati fiscali del wizard.',
    'Nel riepilogo mostra modelli e codici dei prodotti installati.',
  ])('keeps ordinary project requests in the conversation: %s', text => {
    expect(isEmbeddedWizardContextCommand(text)).toBe(false);
  });

  it.each([
    'Mostra modelli', 'Mostra i modelli preventivo',
    'Usa modello preventivo 20261022-1218-4000-a000-000000000001',
    'Usa preventivo classico', 'Mostra simulazioni', 'Mostra le simulazioni',
    "Imposta l'IVA al 10%", 'Imposta l’IVA 22%', 'Imposta IVA esclusa',
    'torna al progetto principale',
  ])('keeps explicit navigation/settings outside the embedded editor: %s', text => {
    expect(isEmbeddedWizardContextCommand(`  ${text}  `)).toBe(true);
  });

  it.each(QUOTE_SIMULATION_SCENARIOS)('blocks only the exact scenario command: $id', scenario => {
    expect(isEmbeddedWizardContextCommand(`Simulazione ${scenario.label}`)).toBe(true);
    expect(isEmbeddedWizardContextCommand(`Per la simulazione ${scenario.label} confermo le misure.`)).toBe(false);
  });
});
