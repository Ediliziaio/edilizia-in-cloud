import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import CampoSegnalaSicurezza from "@/pages/campo/CampoSegnalaSicurezza";
import { RegistroEventiSicurezza } from "@/components/sicurezza/RegistroEventiSicurezza";
import type { SicurezzaEvento } from "@/integrations/supabase/appDatabase";

const stato = vi.hoisted(() => ({
  inserite: [] as Record<string, unknown>[],
  aggiornate: [] as Record<string, unknown>[],
  erroreInsert: null as null | { code: string; message: string },
  eventi: [] as SicurezzaEvento[],
}));

function catena(tabella: string) {
  const risposta = () => {
    if (tabella === "order_campo_assignments") return { data: [{ order_id: "o1", order: { id: "o1", order_code: "RIS01", description: "Bagno" } }], error: null };
    if (tabella === "sicurezza_eventi") return { data: stato.eventi, error: null };
    if (tabella === "profiles") return { data: [{ id: "u1", first_name: "Marco", last_name: "Operaio" }], error: null };
    if (tabella === "orders") return { data: [{ id: "o1", order_code: "RIS01" }], error: null };
    return { data: [], error: null };
  };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve(risposta()).then(ok);
  q.insert = (riga: Record<string, unknown>) => { stato.inserite.push(riga); return Promise.resolve({ error: stato.erroreInsert }); };
  q.update = (riga: Record<string, unknown>) => { stato.aggiornate.push(riga); return { eq: () => Promise.resolve({ error: null }) }; };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => catena(t),
    storage: { from: () => ({ upload: () => Promise.resolve({ error: null }), createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, profile: { company_id: "c1" } }) }));
vi.mock("@/lib/campo/timbra", () => ({ senzaRete: () => false }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

const conQuery = (ui: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => { stato.inserite = []; stato.aggiornate = []; stato.erroreInsert = null; stato.eventi = []; });

it("l'operaio segnala un infortunio: 112 in cima, dati del ferito e cantiere già scelto", async () => {
  conQuery(<CampoSegnalaSicurezza />);
  expect(screen.getByRole("link", { name: /Chiama il 112/ })).toHaveAttribute("href", "tel:112");
  fireEvent.click(screen.getByRole("button", { name: /Infortunio/ }));
  fireEvent.change(screen.getByPlaceholderText("Parte del corpo: mano, schiena…"), { target: { value: "mano" } });
  fireEvent.click(screen.getByRole("button", { name: "Pronto soccorso" }));
  fireEvent.change(screen.getByPlaceholderText(/scivolato dal secondo gradino/), { target: { value: "Taglio col flex" } });
  await waitFor(() => expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("o1"));
  fireEvent.click(screen.getByRole("button", { name: "Invia all'ufficio" }));
  expect(await screen.findByText("Segnalazione inviata")).toBeInTheDocument();
  expect(stato.inserite[0]).toMatchObject({
    company_id: "c1", order_id: "o1", tipo: "infortunio", ferito: true, parte_corpo: "mano",
    soccorso: "pronto_soccorso", persona_coinvolta: null, descrizione: "Taglio col flex", foto: [],
  });
});

it("un invio ripetuto che trova la riga già scritta vale come arrivato", async () => {
  stato.erroreInsert = { code: "23505", message: "duplicate key" };
  conQuery(<CampoSegnalaSicurezza />);
  fireEvent.click(screen.getByRole("button", { name: /Quasi incidente/ }));
  fireEvent.change(screen.getByPlaceholderText(/scivolato dal secondo gradino/), { target: { value: "Tavola scivolata" } });
  fireEvent.click(screen.getByRole("button", { name: "Invia all'ufficio" }));
  expect(await screen.findByText("Segnalazione inviata")).toBeInTheDocument();
  expect(stato.inserite[0]).toMatchObject({ tipo: "quasi_incidente", ferito: false, soccorso: "nessuno" });
});

const evento: SicurezzaEvento = {
  id: "e1", company_id: "c1", order_id: "o1", segnalato_da: "u1", tipo: "infortunio", accaduto_il: "2026-11-23T08:00:00Z",
  luogo: "Scala", descrizione: "Caduto dalla scala", ferito: true, persona_coinvolta: null, parte_corpo: "polso",
  soccorso: "pronto_soccorso", testimoni: null, foto: [], stato: "nuova", gestita_da: null, presa_in_carico_il: null,
  azioni_correttive: null, note_ufficio: null, chiusa_il: null, created_at: "2026-11-23T08:05:00Z", updated_at: "2026-11-23T08:05:00Z",
};

it("l'ufficio vede la segnalazione, il promemoria INAIL e non chiude senza azioni correttive", async () => {
  stato.eventi = [evento];
  conQuery(<RegistroEventiSicurezza companyId="c1" puoScrivere />);
  expect(await screen.findByText("Caduto dalla scala")).toBeInTheDocument();
  expect(screen.getByText(/INAIL/)).toBeInTheDocument();
  expect(await screen.findByText(/Marco Operaio · polso · pronto soccorso/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
  await waitFor(() => expect(stato.aggiornate).toHaveLength(0));
  fireEvent.change(screen.getByLabelText("Azioni correttive"), { target: { value: "Scala nuova con blocco" } });
  fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
  await waitFor(() => expect(stato.aggiornate[0]).toMatchObject({ stato: "chiusa", azioni_correttive: "Scala nuova con blocco" }));
});
