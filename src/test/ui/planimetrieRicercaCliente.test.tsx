import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RicercaSchedaFiltro } from "@/components/planimetrie/RicercaSchedaFiltro";
const api = vi.hoisted(() => ({ cerca: vi.fn(), contesto: vi.fn() }));
vi.mock("@/lib/planimetrie/collegamenti", () => ({
  DEFINIZIONI_COLLEGAMENTI: {
    cliente: { titolo: "Cliente" },
    contatto: { titolo: "Contatto CRM" },
  },
  cercaCollegamentiPianta: api.cerca,
  caricaContestoCollegamenti: api.contesto,
}));
vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: (value: string) => value,
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  api.cerca.mockResolvedValue([{ id: "c1", nome: "Mario Rossi" }]);
  api.contesto.mockResolvedValue({ cliente: {} });
});
afterEach(() => vi.unstubAllGlobals());
it.each(["cliente", "contatto"] as const)(
  "cerca %s sul server solo quando si apre, con nome e azienda, e seleziona una scheda esistente",
  async (tipo) => {
    const change = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <RicercaSchedaFiltro
          companyId="azienda-A"
          tipo={tipo}
          value=""
          onChange={change}
        />
      </QueryClientProvider>,
    );
    expect(api.cerca).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("combobox", {
        name:
          tipo === "cliente" ? "Filtra per cliente" : "Filtra per contatto crm",
      }),
    );
    await screen.findByRole("option", { name: "Mario Rossi" });
    fireEvent.change(
      screen.getByRole("combobox", {
        name: tipo === "cliente" ? "Cerca cliente" : "Cerca contatto crm",
      }),
      { target: { value: "Rossi" } },
    );
    await waitFor(() =>
      expect(api.cerca).toHaveBeenCalledWith("azienda-A", tipo, "Rossi"),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Mario Rossi" }));
    expect(change).toHaveBeenCalledWith("c1");
    expect(
      client.getQueryData([
        "planimetrie-filtro-scheda",
        "azienda-A",
        tipo,
        "c1",
      ]),
    ).toMatchObject({ nome: "Mario Rossi" });
    expect(
      screen.queryByText(/Crea cliente|Crea contatto/),
    ).not.toBeInTheDocument();
  },
);
it("mostra un errore di ricerca senza presentarlo come elenco vuoto", async () => {
  api.cerca.mockRejectedValue(new Error("offline"));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RicercaSchedaFiltro
        companyId="azienda-A"
        tipo="cliente"
        value=""
        onChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("combobox", { name: "Filtra per cliente" }));
  expect(
    await screen.findByRole("alert", {}, { timeout: 4000 }),
  ).toHaveTextContent("Ricerca non disponibile");
});

it("se non trova nomi lo indica e permette comunque di togliere il filtro", async () => {
  api.cerca.mockResolvedValue([]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RicercaSchedaFiltro
        companyId="azienda-A"
        tipo="cliente"
        value=""
        onChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("combobox", { name: "Filtra per cliente" }));
  expect(
    await screen.findByText("Nessun risultato. Prova un altro nome."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("option", { name: "Qualsiasi cliente" }),
  ).toBeInTheDocument();
});
