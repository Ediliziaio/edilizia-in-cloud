import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import SettingsUserDetail from "@/pages/azienda/settings/SettingsUserDetail";

const db = vi.hoisted(() => ({ leggi: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      let signal: AbortSignal;
      const leggi = () => db.leggi(tabella, signal);
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: leggi,
        abortSignal: (readSignal: AbortSignal) => { signal = readSignal; return query; },
        then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => leggi().then(resolve, reject),
      };
      return query;
    },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin" }, effectiveCompany: { id: "azienda" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: true, isLoading: false }),
}));

const profilo = { id: "utente", first_name: "Marta", last_name: "Demo", email: "marta@example.com", company_id: "azienda" };
const risposta = (tabella: string) => ({
  data: tabella === "profiles" ? profilo : tabella === "user_roles" ? [{ role: "company_admin" }, { role: "salesperson" }] : null,
  error: null,
});

function apriScheda() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/utenti/utente?tab=permissions"]}>
        <Routes><Route path="/utenti/:userId" element={<SettingsUserDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("avvia insieme le letture e mostra un errore recuperabile se fallisce la lettura dei ruoli", async () => {
  let terminaProfilo: (riga: ReturnType<typeof risposta>) => void = () => {};
  const attesaProfilo = new Promise<ReturnType<typeof risposta>>(resolve => { terminaProfilo = resolve; });
  db.leggi.mockImplementation((tabella: string) => {
    if (tabella === "profiles") return attesaProfilo;
    if (tabella === "user_roles") return Promise.resolve({ data: null, error: new Error("Errore di rete") });
    return Promise.resolve(risposta(tabella));
  });
  const client = apriScheda();
  await waitFor(() => expect(db.leggi.mock.calls.map(([tabella]) => tabella).sort())
    .toEqual(["companies", "multi_company_access", "profiles", "user_roles"]));
  expect(screen.getByRole("status", { name: "Caricamento scheda utente" })).toBeInTheDocument();
  terminaProfilo(risposta("profiles"));
  expect(await screen.findByText("Impossibile caricare la scheda utente.")).toBeInTheDocument();
  expect(screen.queryByText("Utente non trovato.")).not.toBeInTheDocument();

  db.leggi.mockImplementation((tabella: string) => Promise.resolve(risposta(tabella)));
  fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
  expect(await screen.findByRole("heading", { name: "Marta Demo" })).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /Anche Venditore/ })).toBeChecked();
  client.clear();
});

it("mostra Utente non trovato quando la lettura riesce ma il profilo è assente", async () => {
  db.leggi.mockResolvedValue({ data: null, error: null });
  const client = apriScheda();
  expect(await screen.findByText("Utente non trovato.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Riprova" })).not.toBeInTheDocument();
  client.clear();
});
