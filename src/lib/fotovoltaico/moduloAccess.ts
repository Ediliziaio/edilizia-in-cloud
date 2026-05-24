export interface FvModuloStato {
  attivo: boolean;
  setup_completato: boolean;
}

export interface FvModuloIndexGateInput {
  data?: FvModuloStato;
  isLoading: boolean;
  isError: boolean;
  fetchStatus: "fetching" | "paused" | "idle";
}

export interface FvModuloIndexGate {
  showLoading: boolean;
  showInactive: boolean;
  showSetup: boolean;
}

export function resolveFvModuloIndexGate(input: FvModuloIndexGateInput): FvModuloIndexGate {
  const hasData = Boolean(input.data);

  if (!hasData || input.isError) {
    return { showLoading: false, showInactive: false, showSetup: false };
  }

  return {
    showLoading: false,
    showInactive: !input.data!.attivo,
    showSetup: input.data!.attivo && !input.data!.setup_completato,
  };
}
