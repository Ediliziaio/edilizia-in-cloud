/**
 * Kit e pacchetti: un errore, un avviso (10/10/2026).
 *
 * Salvare, eliminare o attivare/disattivare un pacchetto che non riesce faceva comparire due avvisi: quello della pagina
 * (con la frase in italiano) e quello generico di App.tsx, che scatta per ogni mutation che fallisce e non è «silent».
 * Le tre mutation (`useBundles.ts`) le usa solo la pagina «Kit e pacchetti», che mostra già il suo avviso.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: async () => ({ error: { message: "violates row-level security policy" } }) }),
      delete: () => ({ eq: async () => ({ error: { message: "violates row-level security policy" } }) }),
    }),
  },
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => null as unknown as string }));

import { useDeleteBundle, useToggleBundleAttivo, useUpsertBundle } from "@/hooks/useBundles";

function conCache() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
const silenziosa = (client: QueryClient) =>
  (client.getMutationCache().getAll()[0]?.meta as { silent?: boolean } | undefined)?.silent;

afterEach(() => cleanup());

describe("Kit e pacchetti: le mutation che falliscono non fanno il secondo avviso generico", () => {
  it("salvare (qui senza azienda: l'errore arriva subito)", async () => {
    const { client, wrapper } = conCache();
    const { result } = renderHook(() => useUpsertBundle(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ nome: "Kit 3 kWp", voci: [] } as never).catch((): void => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(silenziosa(client)).toBe(true);
  });

  it("eliminare", async () => {
    const { client, wrapper } = conCache();
    const { result } = renderHook(() => useDeleteBundle(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("b1").catch((): void => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(silenziosa(client)).toBe(true);
  });

  it("attivare o disattivare", async () => {
    const { client, wrapper } = conCache();
    const { result } = renderHook(() => useToggleBundleAttivo(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "b1", attivo: false }).catch((): void => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(silenziosa(client)).toBe(true);
  });
});
