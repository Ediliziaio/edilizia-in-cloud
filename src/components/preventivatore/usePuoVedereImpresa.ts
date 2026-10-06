/**
 * Chi può vedere costi e margine del preventivo: la vista «Impresa» dell'anteprima e,
 * nei moduli a computo, il blocco costi/margine che l'anteprima prepara. È la regola
 * di StepEconomia (`canViewMargins || canViewCosts`), scritta una volta sola.
 */
import { usePermissions } from "@/hooks/usePermissions";

export function usePuoVedereImpresa(): boolean {
  const permessi = usePermissions();
  return Boolean(permessi.canViewMargins || permessi.canViewCosts);
}
