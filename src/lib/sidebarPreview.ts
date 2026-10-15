/** Stato di presentazione del menu: non concede e non revoca accessi. */
export interface ModulePreviewState {
  planResolved: boolean;
  loading: boolean;
  limitedPlan: boolean;
  moduleIncluded: boolean;
  bypass: boolean;
}

/** Solo un piano verificato può confermare l'anteprima di un modulo escluso. */
export function isConfirmedModulePreview(state: ModulePreviewState): boolean {
  if (state.bypass || state.loading || !state.planResolved) return false;
  return state.limitedPlan && !state.moduleIncluded;
}
