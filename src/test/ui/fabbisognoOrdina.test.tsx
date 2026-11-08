/**
 * La pagina del fabbisogno: si selezionano materiali di due commesse, si
 * conferma, partono due bozze; la data «serve il» si salva uscendo dal campo.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RigaFabbisogno } from "@/lib/acquisti/fabbisogno";

const ordina = vi.fn();
const imposta = vi.fn();
let permessi = { canManagePurchasing: true, canEditOrders: true };
const oggi = new Date().toLocaleDateString("en-CA");
const fra = (g: number) => { const d = new Date(`${oggi}T12:00:00`); d.setDate(d.getDate() + g); return d.toLocaleDateString("en-CA"); };

const riga = (p: Partial<RigaFabbisogno>): RigaFabbisogno => ({
  order_item_id: "i1", order_id: "o1", commessa: "C-001", phase_id: "f1", fase: "Cappotto", name: "EPS 10 cm",
  unita_misura: "m²", supplier_id: "s1", fornitore: "Edilmarket", previsto: 100, ordinato: 0, in_bozza: 0, ricevuto: 0,
  residuo: 100, eccedenza: 0, unita_diversa: false, stato: "da_ordinare", data_serve: fra(20), giorni_consegna: 7, ordina_entro: fra(3), ...p,
});
const righe = [
  riga({ order_item_id: "a" }),
  riga({ order_item_id: "b", order_id: "o2", commessa: "C-002", name: "Rasante" }),
  riga({ order_item_id: "c", name: "Tasselli", supplier_id: null, fornitore: null }),
];

vi.mock("@/hooks/useFabbisognoMateriali", () => ({
  useFabbisognoMateriali: () => ({ data: righe, isLoading: false, isError: false, refetch: vi.fn() }),
  useOrdinaDalFabbisogno: () => ({ mutateAsync: ordina, isPending: false }),
  useImpostaDataFabbisogno: () => ({ mutate: imposta, isPending: false }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: FabbisognoMateriali } = await import("@/pages/azienda/FabbisognoMateriali");
const pagina = () => render(<MemoryRouter><FabbisognoMateriali /></MemoryRouter>);

describe("fabbisogno: ordinare e datare", () => {
  beforeEach(() => { ordina.mockReset(); imposta.mockReset(); permessi = { canManagePurchasing: true, canEditOrders: true }; });

  it("due commesse selezionate = due bozze, e partono solo dopo la conferma", async () => {
    ordina.mockResolvedValue([{ ok: true, poId: "p1", n: 1 }, { ok: true, poId: "p2", n: 1 }]);
    pagina();
    // Senza fornitore non si può selezionare.
    expect(screen.queryByLabelText(/Seleziona Tasselli \(/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Seleziona EPS 10 cm (C-001)"));
    fireEvent.click(screen.getByLabelText("Seleziona Rasante (C-002)"));
    fireEvent.click(screen.getByRole("button", { name: /Crea 2 bozze d'ordine/ }));
    expect(ordina).not.toHaveBeenCalled();
    expect(screen.getByText("C-001 · Edilmarket")).toBeTruthy();
    expect(screen.getByText("C-002 · Edilmarket")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Crea" }));
    await waitFor(() => expect(ordina).toHaveBeenCalledTimes(1));
    expect(ordina.mock.calls[0][0].map((r: RigaFabbisogno) => r.order_item_id)).toEqual(["a", "b"]);
  });

  it("la data si salva all'uscita dal campo; vuota torna all'inizio della fase", () => {
    pagina();
    const campo = screen.getByLabelText("Quando serve EPS 10 cm in cantiere") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: fra(30) } });
    expect(imposta).not.toHaveBeenCalled();
    fireEvent.blur(campo);
    expect(imposta.mock.calls[0][0]).toEqual({ ids: ["a"], data: fra(30) });
    fireEvent.change(campo, { target: { value: "" } });
    fireEvent.blur(campo);
    expect(imposta.mock.calls[1][0]).toEqual({ ids: ["a"], data: null });
  });

  it("senza permesso acquisti: niente selezione; senza nessuno dei due, la data si legge e basta", () => {
    permessi = { canManagePurchasing: false, canEditOrders: true };
    const { unmount } = pagina();
    expect(screen.queryByLabelText(/^Seleziona EPS/)).toBeNull();
    expect(screen.getByLabelText("Quando serve EPS 10 cm in cantiere")).toBeTruthy();
    unmount();
    permessi = { canManagePurchasing: false, canEditOrders: false };
    pagina();
    expect(screen.queryByLabelText("Quando serve EPS 10 cm in cantiere")).toBeNull();
  });
});
