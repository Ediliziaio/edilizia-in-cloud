import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WarehouseStockTab from "@/components/warehouse/WarehouseStockTab";

const state = vi.hoisted(() => ({
  stock: Array.from({ length: 51 }, (_, i) => ({ id: `item-${i}`, name: `Articolo ${i}`, quantity: 10.5, quantity_reserved: 2, quantity_available: 8.5, unit_cost: 10, min_stock_level: 0, section_id: null as null, supplier_id: null as null })),
  empty: [] as never[], missing: false, error: false, writable: true, costs: true, refetch: vi.fn(), csv: vi.fn(),
}));
vi.mock("@/lib/csvExport", () => ({ exportToCSV: (...args: unknown[]) => state.csv(...args) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditWarehouse: state.writable, canViewCosts: state.costs, isLoading: false }) }));
vi.mock("@/hooks/useWarehouses", () => ({ useWarehouses: () => ({ defaultWarehouse: null as null }) }));
vi.mock("@/hooks/useWarehouseSections", () => ({ useWarehouseSections: () => ({ sections: state.empty }) }));
vi.mock("@/hooks/useMagazzinoRiepilogo", () => ({ useMagazzinoInArrivo: () => ({ data: undefined as undefined, isError: false, isLoading: false }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[1] === "stock" ? (state.missing ? undefined : state.stock) : queryKey[0] === "warehouse-stock-serial-count" ? 0 : state.empty,
    isLoading: false, isError: queryKey[1] === "stock" && state.error, refetch: state.refetch,
  }),
}));
vi.mock("@/components/warehouse/StockItemDialog", () => ({ StockItemDialog: (): null => null }));
vi.mock("@/components/warehouse/StockMovementDialog", () => ({ StockMovementDialog: (): null => null }));
vi.mock("@/components/warehouse/StockMovementHistoryDialog", () => ({ StockMovementHistoryDialog: ({ open }: { open: boolean }) => open ? <div data-testid="dettaglio-articolo-aperto" /> : null }));
vi.mock("@/components/warehouse/WarehouseSectionsManager", () => ({ WarehouseSectionsManager: (): null => null }));
vi.mock("@/components/warehouse/WarehouseMapView", () => ({ WarehouseMapView: (): null => null }));
vi.mock("@/components/warehouse/StockUnitsDrilldownSheet", () => ({ StockUnitsDrilldownSheet: (): null => null }));
vi.mock("@/components/warehouse/UscitaMerceSheet", () => ({ UscitaMerceSheet: ({initialStockItem}: {initialStockItem?: {name:string}}) => <div data-testid="uscita-aperta">{initialStockItem?.name}</div> }));
vi.mock("@/components/tasks/LinkedTasks", () => ({ LinkedTasks: (): null => null }));
vi.mock("@/components/warehouse/InventoryAuditDialog", () => ({ default: (): null => null }));

beforeEach(() => { localStorage.clear(); state.missing = false; state.error = false; state.writable = true; state.costs = true; state.refetch.mockClear(); state.csv.mockClear(); });
const mount = () => render(<MemoryRouter><WarehouseStockTab /></MemoryRouter>);

describe("Selezione ed errori inventario P0", () => {
  it("seleziona soltanto la pagina visibile e annulla la selezione passando alla successiva", () => {
    mount();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona tutti gli articoli di questa pagina" }));
    expect(screen.getByText("50 selezionati in questa pagina")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Successiva" }));
    expect(screen.queryByText(/selezionati in questa pagina/)).toBeNull();
    expect(screen.getAllByRole("checkbox", { name: "Seleziona Articolo 50" }).every((c) => c.getAttribute("aria-checked") === "false")).toBe(true);
  });
  it("annulla la selezione quando una ricerca nasconde le righe", () => {
    mount();
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Seleziona Articolo 0" })[0]);
    expect(screen.getByText("1 selezionato in questa pagina")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Cerca per nome o codice..."), { target: { value: "nessun risultato" } });
    expect(screen.queryByText(/selezionato in questa pagina/)).toBeNull();
    expect(screen.getByText("Nessun articolo corrisponde ai filtri.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi filtri" }));
    expect(screen.getAllByRole("checkbox", { name: "Seleziona Articolo 0" })[0].getAttribute("aria-checked")).toBe("false");
  });
  it("esporta solo la selezione visibile e omette i costi senza permesso", () => {
    state.costs = false;
    mount();
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Seleziona Articolo 0" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Esporta selezionati" }));
    const [rows, columns] = state.csv.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ articolo: "Articolo 0", giacenza: "10.5", disponibile: "8.5" });
    expect(rows[0]).not.toHaveProperty("costo");
    expect(columns.some((c: { key: string }) => c.key === "costo")).toBe(false);
  });
  it("annulla la selezione anche quando cambia il magazzino", () => {
    const { rerender } = mount();
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Seleziona Articolo 0" })[0]);
    rerender(<MemoryRouter><WarehouseStockTab warehouseFilter="altro-magazzino" /></MemoryRouter>);
    expect(screen.queryByText(/selezionato in questa pagina/)).toBeNull();
  });
  it("consuma l’azione rapida: cambiare magazzino non riapre un vecchio prelievo", () => {
    const handled = vi.fn();
    const { rerender } = render(<MemoryRouter><WarehouseStockTab actionRequest={{ type: "ship", nonce: 1 }} onActionHandled={handled} /></MemoryRouter>);
    expect(handled).toHaveBeenCalledOnce();
    rerender(<MemoryRouter><WarehouseStockTab key="altro-magazzino" warehouseFilter="altro" actionRequest={null} onActionHandled={handled} /></MemoryRouter>);
    expect(handled).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("uscita-aperta")).toBeNull();
  });
  it("un errore non produce un falso magazzino vuoto e offre il nuovo tentativo", () => {
    state.error = true;
    mount();
    expect(screen.getByRole("alert").textContent).toContain("Impossibile caricare le giacenze");
    expect(screen.queryByText("Nessun articolo in questo magazzino.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Riprova giacenze" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("rimuove azioni di scrittura e costi quando il ruolo non li permette", () => {
    state.writable = false;
    state.costs = false;
    mount();
    expect(screen.queryByRole("button", { name: "Aggiungi articolo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Modifica" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Costo unitario" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Valore totale" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Seleziona tutti gli articoli di questa pagina" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("columnheader", { name: "Disponibile" })).toBeTruthy();
  });
});

it("apre le giacenze anche prima che la query restituisca il primo array", () => {
  state.missing = true;
  expect(() => mount()).not.toThrow();
  expect(screen.queryByText(/Too many re-renders/)).toBeNull();
});


describe("Giacenze semplificate: accesso alle funzioni e colonne", () => {
  it("parte dalle informazioni essenziali senza togliere selezione e dettaglio", () => {
    mount();
    // 26/11/2026: una riga per articolo con i riferimenti in colonna; il magazzino solo se ce n'è più d'uno.
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["", "Articolo", "Codice", "Giacenza", "Impegnato", "Disponibile", "In arrivo", "Valore totale", "Fornitore", "Stato", "Azioni"]);
    fireEvent.click(screen.getByRole("button", { name: "Apri dettaglio Articolo 0" }));
    expect(screen.getByTestId("dettaglio-articolo-aperto")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Carico" })).toBeNull();
  });
  it("il clic sulla riga apre il dettaglio, la casella seleziona e basta", () => {
    mount();
    const casella = screen.getAllByRole("checkbox", { name: "Seleziona Articolo 1" }).find((c) => c.closest("tr"))!;
    const riga = casella.closest("tr")!;
    fireEvent.click(casella);
    expect(screen.queryByTestId("dettaglio-articolo-aperto")).toBeNull();
    fireEvent.click(within(riga).getAllByRole("cell")[3]);
    expect(screen.getByTestId("dettaglio-articolo-aperto")).toBeTruthy();
  });
  it("aggiunge una colonna e conserva la preferenza al nuovo accesso", async () => {
    const { unmount } = mount();
    fireEvent.keyDown(screen.getByRole("button", { name: "Colonne" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Scorta minima" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(await screen.findByRole("columnheader", { name: "Scorta minima" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("warehouse-columns:v3:demo:current")!)).toEqual(["code", "zone", "incoming", "total_value", "supplier", "threshold"]);
    unmount(); mount();
    expect(screen.getByRole("columnheader", { name: "Scorta minima" })).toBeTruthy();
  });
  it("non rivela i costi salvati nelle preferenze quando manca il permesso", async () => {
    localStorage.setItem("warehouse-columns:v3:demo:current", '["unit_cost","total_value","supplier"]');
    state.costs = false; mount();
    expect(screen.queryByRole("columnheader", { name: "Costo unitario" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Valore totale" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Fornitore" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "Colonne" }), { key: "ArrowDown" });
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByRole("menuitemcheckbox", { name: "Costo unitario" })).toBeNull();
  });
  it("mantiene l’esportazione accessibile in sola lettura", async () => {
    state.writable = false; mount();
    fireEvent.keyDown(screen.getByRole("button", { name: "Altre azioni del magazzino" }), { key: "ArrowDown" });
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByRole("menuitem", { name: "Aggiungi articolo" })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "Importa CSV/XLSX" })).toBeNull();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Esporta elenco filtrato" }));
    expect(state.csv).toHaveBeenCalledOnce();
  });
  it("ignora preferenze corrotte e colonne sconosciute", () => {
    localStorage.setItem("warehouse-columns:v3:demo:current", '["sconosciuta",12,"code"]');
    mount();
    expect(screen.getByRole("columnheader", { name: "Codice" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(8);
  });
});

it("il carico dalla riga passa dalla stessa scelta ODA/carico libero del comando principale", async () => {
  const arrival = vi.fn();
  render(<MemoryRouter><WarehouseStockTab onRegisterArrival={arrival} /></MemoryRouter>);
  fireEvent.keyDown(screen.getByRole("button", { name: "Azioni Articolo 0" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Carica articolo" }));
  expect(arrival).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "item-0" }));
});

it("Preleva articolo usa l’uscita completa anche quando il libero globale è zero", async () => {
  const previous = state.stock[0].quantity_available;
  state.stock[0].quantity_available = 0;
  try {
    mount();
    fireEvent.keyDown(screen.getAllByRole("button", {name:"Azioni Articolo 0"})[0], {key:"ArrowDown"});
    const action=await screen.findByRole("menuitem", {name:"Preleva articolo"});
    expect(action).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(action);
    expect(await screen.findByTestId("uscita-aperta")).toHaveTextContent("Articolo 0");
    expect(screen.queryByText("Scarico Magazzino")).toBeNull();
  } finally { state.stock[0].quantity_available = previous; }
});
