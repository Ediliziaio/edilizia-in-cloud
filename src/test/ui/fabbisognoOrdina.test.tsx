/**
 * La pagina del fabbisogno: si selezionano materiali di due commesse, si
 * conferma, partono due bozze; la data «serve il» si salva uscendo dal campo.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  riga({ order_item_id: "a", data_scritta: fra(20) }),
  riga({ order_item_id: "b", order_id: "o2", commessa: "C-002", name: "Rasante" }),
  riga({ order_item_id: "c", name: "Tasselli", supplier_id: null, fornitore: null }),
];

vi.mock("@/hooks/useFabbisognoMateriali", () => ({
  useFabbisognoMateriali: () => ({ data: righe, isLoading: false, isError: false, refetch: vi.fn() }),
  useOrdinaDalFabbisogno: () => ({ mutateAsync: ordina, isPending: false }),
  useImpostaDataFabbisogno: () => ({ mutate: imposta, isPending: false }),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permessi }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az1" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  const catena: Record<string, unknown> = {};
  Object.assign(catena, { select: () => catena, eq: () => catena, order: () => catena, limit: async () => ({ data: [{ id: "s1", name: "Edilmarket" }], error: null as unknown }) });
  return { supabase: { from: () => catena, rpc: async () => ({ error: null as unknown }) } };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: FabbisognoMateriali } = await import("@/pages/azienda/FabbisognoMateriali");
const pagina = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FabbisognoMateriali /></MemoryRouter></QueryClientProvider>);
/** «Serve il» è una riga cliccabile: il campo si apre al clic (17/11/2026). */
const campoData = (nome: string) => {
  fireEvent.click(screen.getByLabelText(`Cambia quando serve ${nome} in cantiere`));
  return screen.getByLabelText(`Quando serve ${nome} in cantiere`) as HTMLInputElement;
};

describe("fabbisogno: ordinare e datare", () => {
  beforeEach(() => { ordina.mockReset(); imposta.mockReset(); permessi = { canManagePurchasing: true, canEditOrders: true }; });

  it("due commesse selezionate = due bozze, e partono solo dopo la conferma", async () => {
    ordina.mockResolvedValue([{ ok: true, poId: "p1", n: 1 }, { ok: true, poId: "p2", n: 1 }]);
    pagina();
    // Senza fornitore si seleziona (per assegnarlo), ma nella bozza vanno solo quelli col fornitore.
    fireEvent.click(screen.getByLabelText("Seleziona Tasselli (C-001)"));
    expect(screen.getByText(/1 selezionati · 1 senza fornitore/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Crea la bozza d'ordine/ })).toBeDisabled();
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
    const campo = campoData("EPS 10 cm");
    fireEvent.change(campo, { target: { value: fra(30) } });
    expect(imposta).not.toHaveBeenCalled();
    fireEvent.blur(campo);
    expect(imposta.mock.calls[0][0]).toEqual({ ids: ["a"], data: fra(30) });
    const ancora = campoData("EPS 10 cm");
    fireEvent.change(ancora, { target: { value: "" } });
    fireEvent.blur(ancora);
    expect(imposta.mock.calls[1][0]).toEqual({ ids: ["a"], data: null });
  });

  it("senza data scritta il campo è vuoto e dice che segue la fase; scegliere proprio quella data si salva", () => {
    pagina();
    expect(screen.getAllByText(/\(inizio fase\)/).length).toBe(2);
    const campo = campoData("Rasante");
    expect(campo.value).toBe("");
    expect(screen.getByText(/Vuoto: segue l'inizio fase/)).toBeTruthy();
    fireEvent.change(campo, { target: { value: fra(20) } });
    fireEvent.blur(campo);
    expect(imposta.mock.calls[0][0]).toEqual({ ids: ["b"], data: fra(20) });
  });

  it("una data scritta non cambiata non si salva di nuovo", () => {
    pagina();
    fireEvent.blur(campoData("EPS 10 cm"));
    expect(imposta).not.toHaveBeenCalled();
  });

  it("chi modifica le commesse seleziona e assegna il fornitore, non ordina; senza permessi la data si legge e basta", () => {
    permessi = { canManagePurchasing: false, canEditOrders: true };
    const { unmount } = pagina();
    fireEvent.click(screen.getByLabelText("Seleziona EPS 10 cm (C-001)"));
    expect(screen.getByLabelText("Assegna il fornitore ai materiali selezionati")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /bozz/ })).toBeNull();
    expect(screen.getByLabelText("Cambia quando serve EPS 10 cm in cantiere")).toBeTruthy();
    unmount();
    permessi = { canManagePurchasing: false, canEditOrders: false };
    pagina();
    expect(screen.queryByLabelText(/^Seleziona EPS/)).toBeNull();
    expect(screen.queryByLabelText("Cambia quando serve EPS 10 cm in cantiere")).toBeNull();
  });
});
