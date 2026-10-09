// src/test/ui/fasiRegoleErroreDiPermesso.test.tsx
// Se il database rifiuta (42501) una delle regole della pagina «Fasi e avanzamento», il messaggio parla di «queste
// impostazioni»: prima diceva sempre «i modelli di fasi», anche cambiando una regola.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ errore: vi.fn(), successo: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: state.errore, success: state.successo, info: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null as unknown, error: null as unknown }) }) }) }),
    rpc: async () => ({ data: null as unknown, error: { code: "42501", message: "permission denied" } }),
  },
}));

import { messaggioModello } from "@/hooks/useModelliFasi";
import { useChiSpunta } from "@/hooks/useChiSpunta";
import { usePesoMediaFasi } from "@/hooks/usePesoMediaFasi";
import { useImpostazioniAvvio } from "@/hooks/useImpostazioniAvvio";

const contenitore = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("il rifiuto per permesso dice cosa non si può modificare", () => {
  it("per i modelli parla dei modelli di fasi, e può parlare d'altro", () => {
    expect(messaggioModello({ code: "42501" })).toBe("Non hai il permesso di modificare i modelli di fasi.");
    expect(messaggioModello({ code: "42501" }, "queste impostazioni")).toBe("Non hai il permesso di modificare queste impostazioni.");
    expect(messaggioModello({ code: "23505" }, "queste impostazioni")).toBe("Esiste già un modello con questo nome.");
  });

  it("cambiando chi può spuntare", async () => {
    const { result } = renderHook(() => useChiSpunta(), { wrapper: contenitore });
    act(() => result.current.salva.mutate("capi"));
    await waitFor(() => expect(state.errore).toHaveBeenCalledWith("Non hai il permesso di modificare queste impostazioni."));
  });

  it("cambiando come si calcola l'avanzamento", async () => {
    const { result } = renderHook(() => usePesoMediaFasi(), { wrapper: contenitore });
    act(() => result.current.salva.mutate("durata"));
    await waitFor(() => expect(state.errore).toHaveBeenCalledWith("Non hai il permesso di modificare queste impostazioni."));
  });

  it("cambiando le fasi di partenza o i controlli", async () => {
    const { result } = renderHook(() => useImpostazioniAvvio(), { wrapper: contenitore });
    act(() => result.current.salva.mutate({ controlli: ["fasi"] }));
    await waitFor(() => expect(state.errore).toHaveBeenCalledWith("Non hai il permesso di modificare queste impostazioni."));
  });
});
