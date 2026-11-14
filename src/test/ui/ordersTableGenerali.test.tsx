import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { OrdersTable } from "@/components/orders/OrdersTable";
import type { OrderWithDetails } from "@/lib/orderUtils";

/**
 * Lista commesse (30-31/10/2026): una commessa generale si apre ad albero con le sue commesse
 * sotto e i totali sommati; le commesse di una generale che non è nella pagina dicono dove stanno.
 */
afterEach(cleanup);

const riga = (id: string, codice: string, totale: number) =>
  ({ id, order_code: codice, description: `Lavoro ${codice}`, created_at: "2026-10-15", total_amount: totale, vat_rate: 0, deposit_amount: 0, balance_amount: totale, deposit_paid: false, balance_paid: false }) as OrderWithDetails;

const mappaGenerali = {
  figliePerGenerale: new Map([["g", 2], ["altra", 1]]),
  generaleDellaFiglia: new Map([
    ["a", { id: "g", etichetta: "C-014" }],
    ["b", { id: "g", etichetta: "C-014" }],
    ["x", { id: "altra", etichetta: "C-099" }],
  ]),
};

const disegna = () => render(
  <MemoryRouter>
    <OrdersTable
      orders={[riga("g", "C-014", 0), riga("a", "ODL-1", 1000), riga("b", "ODL-2", 500), riga("x", "ODL-9", 300), riga("n", "C-020", 500)]}
      onDelete={vi.fn()} isDeleting={false} orderCosts={new Map()} visibleColumns={new Set(["totalIvato"])} mappaGenerali={mappaGenerali}
    />
  </MemoryRouter>,
);

const tabella = () => screen.getByRole("table");

describe("commesse generali nella lista", () => {
  it("chiusa: le commesse dentro non sono sparse in lista, la generale ne somma gli importi", () => {
    disegna();
    expect(within(tabella()).queryByText("ODL-1")).not.toBeInTheDocument();
    const generale = within(tabella()).getByText("Generale · 2").closest("tr")!;
    expect(generale).toHaveTextContent(/1\.500,00/);
  });

  it("aperta: le commesse dentro compaiono subito sotto, senza ripetere «in C-014»", () => {
    disegna();
    fireEvent.click(within(tabella()).getByRole("button", { name: "Apri le 2 commesse dentro" }));
    const righe = within(tabella()).getAllByRole("row").map((r) => r.textContent ?? "");
    const pos = (t: string) => righe.findIndex((r) => r.includes(t));
    expect(pos("C-014")).toBeLessThan(pos("ODL-1"));
    expect(pos("ODL-1")).toBe(pos("C-014") + 1);
    expect(within(tabella()).queryByText("in C-014")).not.toBeInTheDocument();
    fireEvent.click(within(tabella()).getByRole("button", { name: "Chiudi le commesse dentro" }));
    expect(within(tabella()).queryByText("ODL-1")).not.toBeInTheDocument();
  });

  it("una commessa la cui generale non è nella pagina resta al suo posto e dice dov'è", () => {
    disegna();
    expect(within(tabella()).getByText("in C-099")).toBeInTheDocument();
  });

  it("caparre e acconti delle unità contano come incassato, senza sommarli due volte", () => {
    cleanup();
    render(
      <MemoryRouter>
        <OrdersTable
          orders={[riga("u", "A1", 1000)]} onDelete={vi.fn()} isDeleting={false} orderCosts={new Map()}
          visibleColumns={new Set(["collected", "due"])}
          mappaGenerali={{ figliePerGenerale: new Map(), generaleDellaFiglia: new Map(), incassiUnita: new Map([["u", 300]]) }}
        />
      </MemoryRouter>,
    );
    const r = within(tabella()).getByText("A1").closest("tr")!;
    expect(r).toHaveTextContent(/300,00/);
    expect(r).toHaveTextContent(/700,00/);
  });

  it("le commesse fuori pagina entrano nei totali della generale, senza comparire due volte", () => {
    cleanup();
    render(
      <MemoryRouter>
        <OrdersTable
          orders={[riga("g", "C-014", 0), riga("a", "ODL-1", 1000)]} figlieFuoriPagina={[riga("b", "ODL-2", 500)]}
          onDelete={vi.fn()} isDeleting={false} orderCosts={new Map()} visibleColumns={new Set(["totalIvato", "total_amount"])} mappaGenerali={mappaGenerali}
        />
      </MemoryRouter>,
    );
    const generale = within(tabella()).getByText("Generale · 2").closest("tr")!;
    expect(generale).toHaveTextContent(/1\.?500,00/);
    expect(generale).not.toHaveTextContent(/^.*0,00 €.*0,00 €$/);
    expect(within(tabella()).queryByText("ODL-2")).not.toBeInTheDocument();
  });

  it("«Raggruppa» compare con le commesse scelte e solo se la pagina lo offre", () => {
    cleanup();
    const onRaggruppa = vi.fn();
    const conBottone = (extra: { onRaggruppa?: (ids: string[]) => void }) => render(
      <MemoryRouter>
        <OrdersTable orders={[riga("n", "C-020", 500)]} onDelete={vi.fn()} isDeleting={false} orderCosts={new Map()} {...extra} />
      </MemoryRouter>,
    );
    conBottone({ onRaggruppa });
    expect(screen.queryByRole("button", { name: /Raggruppa/ })).not.toBeInTheDocument();
    fireEvent.click(within(tabella()).getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: /Raggruppa/ }));
    expect(onRaggruppa).toHaveBeenCalledWith(["n"]);
    cleanup();
    conBottone({});
    fireEvent.click(within(tabella()).getAllByRole("checkbox")[1]);
    expect(screen.queryByRole("button", { name: /Raggruppa/ })).not.toBeInTheDocument();
  });

  it("senza generali la tabella non cambia", () => {
    cleanup();
    render(<MemoryRouter><OrdersTable orders={[riga("n", "C-020", 500)]} onDelete={vi.fn()} isDeleting={false} orderCosts={new Map()} /></MemoryRouter>);
    expect(screen.queryByText(/Generale ·/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /commesse dentro/ })).not.toBeInTheDocument();
  });
});

describe("unità in vendita nella lista (URBAN VISION, 14/11/2026)", () => {
  // Le commesse delle unità nascono con lo stato predefinito dell'azienda («Contratto Firmato») e
  // con il listino come importo: la lista le mostrava come contratti firmati da incassare.
  const firmato = { name: "Contratto Firmato", color: "#2563eb" };
  const unita = (id: string, codice: string, totale: number) => ({ ...riga(id, codice, totale), status: firmato }) as OrderWithDetails;
  const mappa = {
    figliePerGenerale: new Map([["g", 3]]),
    generaleDellaFiglia: new Map([
      ["u2", { id: "g", etichetta: "O-0002" }],
      ["u1", { id: "g", etichetta: "O-0002" }],
      ["u3", { id: "g", etichetta: "O-0002" }],
    ]),
    statoVenditaUnita: new Map([["u1", "libera" as const], ["u2", "prenotata" as const], ["u3", "compromesso" as const]]),
  };
  const disegnaUnita = () => render(
    <MemoryRouter>
      <OrdersTable
        orders={[riga("g", "O-0002", 0)]} figlieFuoriPagina={[unita("u2", "O-0013", 300_000), unita("u1", "O-0012", 365_000), unita("u3", "O-0014", 200_000)]}
        onDelete={vi.fn()} isDeleting={false} orderCosts={new Map()} visibleColumns={new Set(["totalIvato", "due"])} mappaGenerali={mappa}
      />
    </MemoryRouter>,
  );

  it("un'unità libera o prenotata mostra lo stato di vendita, il listino e niente da incassare", () => {
    disegnaUnita();
    fireEvent.click(within(tabella()).getByRole("button", { name: "Apri le 3 commesse dentro" }));
    const libera = within(tabella()).getByText("O-0012").closest("tr")!;
    expect(libera).toHaveTextContent("Libera");
    expect(libera).not.toHaveTextContent("Contratto Firmato");
    expect(libera).toHaveTextContent(/365\.000,00 €listino/);
    expect(libera).toHaveTextContent("Non venduta");
    expect(within(tabella()).getByText("O-0013").closest("tr")!).toHaveTextContent("Prenotata");
    // Con il compromesso c'è un prezzo pattuito: è da incassare.
    const venduta = within(tabella()).getByText("O-0014").closest("tr")!;
    expect(venduta).toHaveTextContent("Compromesso");
    expect(venduta).not.toHaveTextContent("Non venduta");
  });

  it("la generale somma solo il venduto e dice a parte quanto è ancora in vendita", () => {
    disegnaUnita();
    const generale = within(tabella()).getByText("Generale · 3").closest("tr")!;
    expect(generale).toHaveTextContent(/200\.000,00/);
    expect(generale).toHaveTextContent(/in vendita 665\.000,00/);
  });

  it("dentro la generale le unità vanno in ordine di codice", () => {
    disegnaUnita();
    fireEvent.click(within(tabella()).getByRole("button", { name: "Apri le 3 commesse dentro" }));
    const codici = within(tabella()).getAllByRole("row").map((r) => r.textContent?.match(/O-00\d\d/g)?.[0]).filter(Boolean);
    expect(codici).toEqual(["O-0002", "O-0012", "O-0013", "O-0014"]);
  });
});
