/**
 * Fornitori → «Ordini e pagamenti»: la modifica rapida di una riga che non va a buon fine dice cosa è successo in
 * italiano, non con il testo del database («duplicate key value violates unique constraint…», «Errore sconosciuto»).
 */
import type { ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  erroreScrittura: null as unknown,
  toastErr: vi.fn(),
  toastOk: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: state.toastOk, error: state.toastErr } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let scrive = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        order: () => b,
        neq: () => b,
        eq: () => b,
        update: () => { scrive = true; return b; },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
          Promise.resolve(scrive ? { data: null as unknown, error: state.erroreScrittura } : { data: [] as unknown[], error: null as unknown }).then(ok, ko),
      };
      return b;
    },
  },
}));

import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";

const involucro = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

async function modifica() {
  const { result } = renderHook(() => useOperationalSuppliers(), { wrapper: involucro });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => { result.current.update.mutate({ id: "f1", updates: { name: "Rossi" } }); });
  await waitFor(() => expect(state.toastErr.mock.calls.length + state.toastOk.mock.calls.length).toBeGreaterThan(0));
}

beforeEach(() => {
  state.erroreScrittura = null;
  state.toastErr.mockClear();
  state.toastOk.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("Fornitori: errore della modifica rapida", () => {
  it("un nome già usato arriva come frase italiana, senza il testo del database", async () => {
    state.erroreScrittura = { code: "23505", message: 'duplicate key value violates unique constraint "suppliers_company_id_name_key"' };
    await modifica();
    expect(state.toastErr).toHaveBeenCalledWith("Fornitore non aggiornato", {
      description: "Esiste già un elemento con questi dati. Controlla e riprova.",
    });
    expect(JSON.stringify(state.toastErr.mock.calls)).not.toMatch(/duplicate key|constraint|Errore sconosciuto/);
  });

  it("un errore qualunque dice di riprovare e non mostra il testo tecnico", async () => {
    state.erroreScrittura = { code: "XX000", message: "connection reset by peer" };
    await modifica();
    expect(state.toastErr).toHaveBeenCalledWith("Fornitore non aggiornato", {
      description: "Non sono riuscito a salvare il fornitore. Riprova tra poco.",
    });
  });

  it("un permesso negato dal database si legge come permesso", async () => {
    state.erroreScrittura = { code: "42501", message: 'new row violates row-level security policy for table "suppliers"' };
    await modifica();
    expect(state.toastErr).toHaveBeenCalledWith("Fornitore non aggiornato", {
      description: "Non hai i permessi per questa operazione. Contatta l'amministratore.",
    });
  });

  it("se va a buon fine dice «Fornitore aggiornato» e nessun errore", async () => {
    await modifica();
    expect(state.toastOk).toHaveBeenCalledWith("Fornitore aggiornato");
    expect(state.toastErr).not.toHaveBeenCalled();
  });
});
