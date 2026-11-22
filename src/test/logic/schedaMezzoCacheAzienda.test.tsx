import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const sessione = vi.hoisted(() => ({ azienda: "azienda-a", utente: "operatore-a", richieste: [] as string[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: sessione.utente } }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => sessione.azienda }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        let azienda = "";
        const filtri = {
          eq: (campo: string, valore: string) => {
            if (campo === "company_id") azienda = valore;
            return filtri;
          },
          is: () => filtri,
          maybeSingle: async () => {
            sessione.richieste.push(azienda);
            return { data: azienda === "azienda-a" && sessione.utente === "operatore-a"
              ? { id: "trapano", nome: "Trapano della prima azienda" } : null, error: null as null };
          },
        };
        return filtri;
      },
    }),
  },
}));
const { useMezzo } = await import("@/hooks/useMezzi");

it("non riusa la scheda in cache quando cambia azienda o utente con lo stesso collegamento", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, rerender } = renderHook(() => useMezzo("trapano"), { wrapper });
  await waitFor(() => expect(result.current.data?.nome).toBe("Trapano della prima azienda"));
  sessione.azienda = "azienda-b";
  rerender();
  expect(result.current.data?.nome).toBeUndefined();
  await waitFor(() => expect(result.current.data).toBe(null));
  sessione.azienda = "azienda-a";
  sessione.utente = "operatore-b";
  rerender();
  expect(result.current.data?.nome).toBeUndefined();
  await waitFor(() => expect(result.current.data).toBe(null));
  expect(sessione.richieste).toEqual(["azienda-a", "azienda-b", "azienda-a"]);
});
