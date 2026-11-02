import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EntraConLink from "@/pages/EntraConLink";

const s = vi.hoisted(() => ({ ordine: [] as string[], utente: null as unknown, profilo: null as unknown, invoke: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: s.utente, profile: s.profilo, isLoading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: (...a: unknown[]) => { s.ordine.push("invoke"); return s.invoke(...a); } },
  auth: {
    signOut: async (o: unknown) => { s.ordine.push(`signOut:${JSON.stringify(o)}`); return { error: null }; },
    verifyOtp: async () => { s.ordine.push("verifyOtp"); return { error: null }; },
  },
} }));
const mostra = (qc = new QueryClient()) => render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/entra/t"]}><Routes>
  <Route path="/entra/:token" element={<EntraConLink />} /><Route path="/campo" element={<p>Dentro</p>} />
</Routes></MemoryRouter></QueryClientProvider>);
beforeEach(() => { s.ordine = []; s.utente = null; s.profilo = null; s.invoke.mockResolvedValue({ data: { token_hash: "h" }, error: null }); });
afterEach(cleanup);

describe("Entrare con il link su un telefono già usato", () => {
  it("su un telefono libero entra senza uscite inutili", async () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Entra" }));
    await screen.findByText("Dentro");
    expect(s.ordine).toEqual(["invoke", "verifyOtp"]);
  });
  it("dice chi è già dentro, così non si timbra al posto di un altro", () => {
    s.utente = { id: "a" }; s.profilo = { first_name: "Anna", last_name: "Neri" };
    mostra();
    expect(screen.getByRole("link", { name: "Continua come Anna Neri" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Non sono Anna Neri: entra" })).toBeInTheDocument();
  });
  it("entrando come un altro chiude prima la sessione e pulisce i dati in memoria", async () => {
    s.utente = { id: "a" }; s.profilo = { first_name: "Anna", last_name: "Neri" };
    const qc = new QueryClient();
    qc.setQueryData(["dati-di-anna"], 1);
    mostra(qc);
    fireEvent.click(screen.getByRole("button", { name: "Non sono Anna Neri: entra" }));
    await screen.findByText("Dentro");
    expect(s.ordine).toEqual(["invoke", 'signOut:{"scope":"local"}', "verifyOtp"]);
    await waitFor(() => expect(qc.getQueryData(["dati-di-anna"])).toBeUndefined());
  });
});
