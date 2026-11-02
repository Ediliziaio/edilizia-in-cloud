import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { FigliaGenerale, RiepilogoGenerale, TotaliGenerale } from "@/lib/orders/commesseGenerali";

/** Togliere e spostare una commessa (F3), raggruppare dalla lista (F8): prima si vede cosa cambia. */
const m = vi.hoisted(() => ({
  scollega: vi.fn(), sposta: vi.fn(), raggruppa: vi.fn(), navigate: vi.fn(), misure: 0,
}));
vi.mock("@/hooks/useCommesseGenerali", () => ({
  messaggioGenerale: () => "errore",
  useAltreGenerali: () => ({ data: [{ id: "g2", order_code: "C-2", description: "Altra" }], isLoading: false }),
  useRiepilogoGenerale: () => ({ data: undefined as undefined }),
  useMisureDellaCommessa: () => ({ data: m.misure }),
  useScollegaCommessa: () => ({ mutate: m.scollega, isPending: false }),
  useSpostaCommessa: () => ({ mutate: m.sposta, isPending: false }),
  useRaggruppaCommesse: () => ({ mutate: m.raggruppa, isPending: false }),
}));
vi.mock("@/components/orders/generali/ScegliCliente", () => ({
  ScegliCliente: ({ valore }: { valore: string | null }): ReactElement => <p>Cliente: {valore ?? "nessuno"}</p>,
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => m.navigate,
}));
import { RaggruppaDialog } from "@/components/orders/generali/RaggruppaDialog";
import { SpostaFigliaDialog } from "@/components/orders/generali/SpostaFigliaDialog";

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); m.misure = 0; });

const figlia = { id: "a", codice: "ODL-1", nome: "Scuola", importo: 300, divisa: false } as FigliaGenerale;
const riepilogo = {
  generale: { id: "g", codice: "C-1", nome: "Appalto", cliente: null, clienteId: null, modello: "appalto", creataIl: null, valore: 1500 },
  figlie: [figlia],
  permessi: { importi: true, costi: true, margini: true },
} as RiepilogoGenerale;
const totali = { assegnato: 1000, daAssegnare: 500 } as TotaliGenerale;

const dialogo = (azione: "togli" | "sposta", onClose = vi.fn()) =>
  render(<SpostaFigliaDialog riepilogo={riepilogo} totali={totali} figlia={figlia} azione={azione} onClose={onClose} />);

describe("togliere o spostare una commessa", () => {
  it("«Togli» non agisce subito: mostra cosa cambia, poi chiede conferma", () => {
    dialogo("togli");
    expect(m.scollega).not.toHaveBeenCalled();
    expect(screen.getByText("Assegnato").parentElement).toHaveTextContent(/1\.?000.*700/);
    expect(screen.getByText("Da assegnare").parentElement).toHaveTextContent(/500.*800/);
    fireEvent.click(screen.getByRole("button", { name: "Togli" }));
    expect(m.scollega).toHaveBeenCalledWith("a", expect.anything());
  });

  it("«Sposta» resta fermo finché non si sceglie dove", () => {
    dialogo("sposta");
    expect(screen.getByRole("button", { name: "Sposta" })).toBeDisabled();
  });

  it("le misure già nel contratto si dicono prima", () => {
    m.misure = 3;
    dialogo("togli");
    expect(screen.getByText(/Ha 3 misure/)).toBeInTheDocument();
  });
});

describe("raggruppare dalla lista", () => {
  const mappa = { figliePerGenerale: new Map([["g", 1]]), generaleDellaFiglia: new Map() };
  const apri = (righe: { id: string; customer_id?: string | null; total_amount?: number | null }[]) => render(
    <MemoryRouter>
      <RaggruppaDialog righe={righe} modelli={["appalto"]} mappa={mappa} mostraImporti onClose={vi.fn()} />
    </MemoryRouter>,
  );

  it("propone il cliente comune e il totale, e senza nome non parte", () => {
    apri([{ id: "a", customer_id: "c1", total_amount: 100 }, { id: "b", customer_id: "c1", total_amount: 200 }]);
    expect(screen.getByText("Cliente: c1")).toBeInTheDocument();
    expect(screen.getByText(/2 commesse per 300/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Raggruppa" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Appalto scuole" } });
    fireEvent.click(screen.getByRole("button", { name: "Raggruppa" }));
    expect(m.raggruppa).toHaveBeenCalledWith(
      { nuova: { modello: "appalto", nome: "Appalto scuole", clienteId: "c1", valore: null }, commesse: ["a", "b"] },
      expect.anything(),
    );
  });

  it("una generale tra le scelte resta fuori e lo dice", () => {
    apri([{ id: "g" }, { id: "a" }]);
    expect(screen.getByText(/è già una generale/)).toBeInTheDocument();
  });
});
