import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampoMaterialiCantiere } from "@/components/campo/CampoMaterialiCantiere";

const state = vi.hoisted(() => ({ livello: "inventario", rpc: vi.fn() }));
vi.mock("@/hooks/campo/useCampoPrelievo", () => ({
  useCampoMagazzinoConfig: () => ({ companyId: "azienda", userId: "operaio", data: { livello: state.livello } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));

beforeEach(() => {
  state.livello = "inventario";
  state.rpc.mockReset();
  state.rpc.mockReturnValue({
    abortSignal: async () => ({
      data: [
        { stock_item_id: "tubi", nome: "Tubo corrugato", unita_misura: "m", consegnato: 2.25, residuo: 2.25 },
        { stock_item_id: "malta", nome: "Malta", unita_misura: "kg", consegnato: 25, residuo: 0 },
        { stock_item_id: "irregolare", nome: "Passacavo", unita_misura: null, consegnato: 1, residuo: null },
      ],
      error: null as null,
    }),
  });
});
afterEach(cleanup);

function apriCantiere() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CampoMaterialiCantiere companyId="azienda" orderId="cantiere" />
    </QueryClientProvider>,
  );
}

describe("Materiali in cantiere dall'app operaio", () => {
  it("legge a richiesta e mostra la stessa unità in Consegnato e Residuo", async () => {
    apriCantiere();
    expect(state.rpc).not.toHaveBeenCalled();
    const details = screen.getByText("Materiali in cantiere").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));

    const tubo = (await screen.findByText("Tubo corrugato")).closest("li")!;
    expect(within(tubo).getByText("Consegnato").nextElementSibling).toHaveTextContent("2,25 m");
    expect(within(tubo).getByText("Residuo").nextElementSibling).toHaveTextContent("2,25 m");
    expect(screen.getByText("0 kg")).toBeInTheDocument();
    expect(screen.getByText("Unità di misura da impostare")).toBeInTheDocument();
    expect(screen.getByText("Da verificare")).toBeInTheDocument();
    expect(state.rpc).toHaveBeenCalledWith("campo_materiali_cantiere", { p_azienda: "azienda", p_cantiere: "cantiere", p_offset: 0 });
  });

  it("rispetta la disattivazione del magazzino", () => {
    state.livello = "nessuno";
    apriCantiere();
    expect(screen.queryByText("Materiali in cantiere")).toBeNull();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
