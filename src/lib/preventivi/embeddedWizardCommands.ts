import { quoteSimulationTarget } from './quoteSimulationScenarios';

/** Only explicit navigation/settings commands leave an embedded wizard's scope.
 * A work description can legitimately mention a simulation, a model or VAT.
 */
export function isEmbeddedWizardContextCommand(text: string): boolean {
  const command = text.trim();
  return quoteSimulationTarget(command) !== null ||
    /^(?:mostra (?:i )?modelli(?: preventivo)?|usa modello preventivo(?: [a-f\d-]{36})?|usa preventivo classico|mostra (?:le )?simulazioni)$/i.test(command) ||
    /^imposta (?:l['’])?iva\b/i.test(command);
}
