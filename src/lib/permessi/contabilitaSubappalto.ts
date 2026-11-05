/**
 * Contabilità dei subappalti (03/11/2026): SAL, verbali, misure e contratti si consultano con la
 * scheda Subappaltatori; le stesse regole sono nel database (scheda_subappaltatori_leggi).
 * Registrare e pagare resta di chi ha Commesse, Costi e Documenti mensili.
 */
interface PermessiContabilita {
  canViewSubappaltatori: boolean;
  canViewCosts: boolean;
  canViewSubappaltatoriAmministrazione: boolean;
  canEditOrders: boolean;
  solaLettura: boolean;
}

type Lettura = Omit<PermessiContabilita, "canEditOrders" | "solaLettura">;

export const puoConsultareSalSub = (p: Lettura): boolean =>
  p.canViewSubappaltatori || (p.canViewCosts && p.canViewSubappaltatoriAmministrazione);

export const puoScrivereSalSub = (p: PermessiContabilita): boolean =>
  p.canViewCosts && p.canViewSubappaltatoriAmministrazione && p.canEditOrders && !p.solaLettura;
