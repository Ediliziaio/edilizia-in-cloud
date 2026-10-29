import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import NuovoSopralluogo from "@/pages/azienda/sopralluoghi/NuovoSopralluogo";
import { makeEnergySurvey } from "../fixtures/energySurvey";
const m = vi.hoisted(() => ({ create: vi.fn(), fail: false }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "company1",
}));
vi.mock("@/lib/sopralluoghi/verticalTemplate", () => ({
  categorieConsigliate: () => ["climatizzazione"],
}));
vi.mock("@/hooks/useCompanyCustomers", () => ({
  useCompanyCustomers: () => ({
    data: [{ id: "client1", first_name: "Mario", last_name: "Rossi" }],
  }),
}));
vi.mock("@/lib/api/surveys", () => ({
  listTemplates: async () => {
    if (m.fail) throw new Error("Offline");
    return [
      makeEnergySurvey("clima").template,
      {
        ...makeEnergySurvey().template,
        id: "pv-model",
        name: "Rilievo fotovoltaico",
        is_system: true,
      },
    ];
  },
  createSurvey: m.create,
  listCrmContacts: async () => [
    { id: "contact1", first_name: "Anna", last_name: "Prospect" },
  ],
  listCrmOpportunities: async () => [
    {
      id: "opp1",
      name: "Impianto ufficio",
      contact: { id: "contact1", first_name: "Anna", last_name: "Prospect" },
    },
  ],
  nomeContatto: (c: { first_name?: string; last_name?: string } | undefined) =>
    c ? `${c.first_name} ${c.last_name}` : "",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const data =
        table === "profiles"
          ? [{ id: "tech1", first_name: "Luca", last_name: "Tecnico" }]
          : table === "orders"
            ? [
                {
                  id: "order1",
                  order_code: "ORD-TEST-1",
                  customer_id: "client1",
                  client_name: "Mario Rossi",
                  work_address: "Via Test 8",
                },
              ]
            : [];
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({
          data: { sector: "impianti", vertical_key: "clima" },
        }),
        then: (resolve: (v: { data: unknown }) => void) => resolve({ data }),
      };
      return q;
    },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.fail = false;
  m.create.mockResolvedValue({ id: "new-survey", code: "SOP-TEST" });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Location() {
  const location = useLocation();
  return (
    <output aria-label="Route corrente">
      {location.pathname}
      {location.search}
    </output>
  );
}
function Page({ entry = "/azienda/sopralluoghi/nuovo" }: { entry?: string }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <NuovoSopralluogo />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
async function ready() {
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Continua" }),
    ).toBeEnabled(),
  );
}
async function details() {
  await ready();
  fireEvent.click(
    screen.getByRole("button", { name: "Continua" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Continua" }),
  );
}
async function choose(label: string, option: RegExp) {
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { level: 2, name: "Cliente e commessa" }),
    ).toHaveFocus(),
  );
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}
describe("Nuovo sopralluogo: flusso e riepilogo", () => {
  it("cerca i modelli e distingue la scelta attiva", async () => {
    render(<Page />);
    await ready();
    fireEvent.change(screen.getByLabelText("Cerca modello di rilievo"), {
      target: { value: "fotovoltaico" },
    });
    const group = screen.getByRole("radiogroup", { name: "Tipo di rilievo" });
    expect(within(group).getAllByRole("radio")).toHaveLength(1);
    fireEvent.click(within(group).getByRole("radio"));
    expect(within(group).getByRole("radio")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
  it("mantiene indirizzo e note tornando al passo precedente", async () => {
    render(<Page />);
    await details();
    fireEvent.change(screen.getByLabelText("Indirizzo del cantiere"), {
      target: { value: "Via Test 8" },
    });
    fireEvent.click(screen.getByText(/Note e accesso al cantiere/));
    fireEvent.change(screen.getByLabelText("Indicazioni per il tecnico"), {
      target: { value: "Citofono TEST" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Indietro" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continua" }),
    );
    expect(screen.getByLabelText("Indirizzo del cantiere")).toHaveValue(
      "Via Test 8",
    );
    expect(screen.getByLabelText("Indicazioni per il tecnico")).toHaveValue(
      "Citofono TEST",
    );
  });
  it("crea una sola bozza senza dati inventati e apre direttamente la compilazione", async () => {
    render(<Page />);
    await details();
    const button = screen.getByRole("button", {
      name: "Crea e apri il rilievo",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
    expect(m.create.mock.calls[0][0]).toMatchObject({
      client_id: null,
      order_id: null,
      technician_id: null,
      scheduled_at: null,
      address: null,
      city: null,
      notes: null,
    });
    expect(m.create.mock.calls[0][1]).toBe("company1");
    await waitFor(() =>
      expect(screen.getByLabelText("Route corrente")).toHaveTextContent(
        "/azienda/sopralluoghi/new-survey?modifica=1",
      ),
    );
  });
  it("mostra CAP errato senza inviare la bozza", async () => {
    render(<Page />);
    await details();
    /* Il CAP non e' piu' un campo suo: sta nei dettagli del cercatore di
       indirizzi, che si apre con «Modifica dettagli indirizzo». */
    fireEvent.click(
      screen.getByRole("button", { name: /Modifica dettagli indirizzo/ }),
    );
    fireEvent.change(screen.getByPlaceholderText("20100"), {
      target: { value: "abc" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("5 cifre");
    expect(
      screen.getByRole("button", { name: "Crea e apri il rilievo" }),
    ).toBeDisabled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("il collegamento a una commessa conserva cliente e indirizzo e si può rimuovere", async () => {
    render(<Page />);
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Continua" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: /Cliente o commessa/ }));
    await choose("Commessa", /ORD-TEST-1/);
    expect(
      screen.getByRole("combobox", { name: "Cliente" }),
    ).toHaveTextContent("Mario Rossi");
    fireEvent.click(screen.getByRole("radio", { name: /Collega più avanti/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Continua" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Crea e apri il rilievo" }),
    );
    await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
    expect(m.create.mock.calls[0][0]).toMatchObject({
      client_id: null,
      order_id: null,
      address: "Via Test 8",
    });
  });
  it("gli errori di creazione non cancellano i campi compilati", async () => {
    m.create.mockRejectedValueOnce(new Error("Connessione assente"));
    render(<Page />);
    await details();
    fireEvent.change(screen.getByLabelText("Indirizzo del cantiere"), {
      target: { value: "Via Test 9" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Crea e apri il rilievo" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connessione assente",
    );
    expect(screen.getByLabelText("Indirizzo del cantiere")).toHaveValue(
      "Via Test 9",
    );
  });
  it("mantiene i collegamenti forniti dalla pagina commessa", async () => {
    render(
      <Page entry="/azienda/sopralluoghi/nuovo?order=order1&client=client1&address=Via%20Cantiere%201" />,
    );
    await details();
    fireEvent.click(
      screen.getByRole("button", { name: "Crea e apri il rilievo" }),
    );
    await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
    expect(m.create.mock.calls[0][0]).toMatchObject({
      order_id: "order1",
      client_id: "client1",
      address: "Via Cantiere 1",
    });
  });
  it("mantiene coerenti opportunità e contatto CRM senza confonderli con il cliente", async () => {
    render(<Page />);
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Continua" }),
    );
    fireEvent.click(screen.getByRole("radio", { name: /Contatto CRM/ }));
    await choose("Opportunità", /Impianto ufficio/);
    expect(
      screen.getByRole("combobox", { name: "Contatto" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Continua" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Crea e apri il rilievo" }),
    );
    await waitFor(() => expect(m.create).toHaveBeenCalledOnce());
    expect(m.create.mock.calls[0][0]).toMatchObject({
      client_id: null,
      contact_id: "contact1",
      opportunity_id: "opp1",
    });
  });
  it("non consente di procedere se il caricamento modelli fallisce", async () => {
    m.fail = true;
    render(<Page />);
    await screen.findByRole("alert");
    expect(
      screen.getByRole("button", { name: "Continua" }),
    ).toBeDisabled();
    expect(m.create).not.toHaveBeenCalled();
  });
});
