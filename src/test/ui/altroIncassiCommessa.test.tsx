import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/components/orders/BloccaPrezzoCard", () => ({ BloccaPrezzoCard: (): null => null }));
vi.mock("@/components/orders/BonusRipartizioneCard", () => ({ BonusRipartizioneCard: (): null => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async (): Promise<{ data: Record<string, number>; error: null }> => ({
    data: { aliquota: 10, valore_commessa: 212000, debito_previsto: 21200, debito_da_fatturare: 21200 }, error: null,
  }),
} }));
vi.mock("@/components/ritenute/RitenuteClienteCommessa", () => ({
  useRitenuteClienteCommessa: () => ({ q: { isError: false, isPending: false }, permissions: { isAdmin: true }, trattenute: 10600 }),
  RitenuteClienteCommessa: () => <p>Trattenute dal cliente</p>,
}));
vi.mock("@/hooks/useRitenuteGaranzia", () => ({ useRitenuteGaranzia: () => ({
  ritenute: [] as never[], contratti: [] as never[], noContratti: true, isLoading: false, isError: false, totaleRitenuto: 0, totaleSvincolato: 0,
}) }));
vi.mock("@/components/ritenute/RitenutaFormModal", () => ({ RitenutaFormModal: (): null => null }));
import { AltroIncassiCommessa } from "@/components/orders/AltroIncassiCommessa";

afterEach(cleanup);
const mostra = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <QueryClientProvider client={new QueryClient()}>
      <AltroIncassiCommessa orderId="o1" vatRate={22} hasBuildingBonus={false} saldoPagato={false} conIva conImporti />
    </QueryClientProvider>
  </MemoryRouter>,
);

describe("Altro su questa commessa", () => {
  it("IVA e ritenute partono chiuse con gli importi leggibili nell’intestazione", async () => {
    const { container } = mostra("/azienda/ordini/o1?tab=finanza");
    expect(screen.getByText("IVA della commessa")).toBeInTheDocument();
    expect(screen.getByText("Ritenute di garanzia")).toBeInTheDocument();
    expect([...container.querySelectorAll("details")].every((d) => !d.open)).toBe(true);
    const iva = screen.getByText("IVA della commessa").closest("summary")!;
    await within(iva).findByText("Nessuna fattura");
    expect(iva).toHaveTextContent("Stima finale 21.200,00 € da versare");
    const ritenute = screen.getByText("Ritenute di garanzia").closest("summary")!;
    expect(ritenute).toHaveTextContent("Cliente 10.600,00 € trattenuti");
    expect(ritenute).toHaveTextContent("Subappalti Nessun importo da svincolare");
  });
  it("un link alle ritenute le apre", () => {
    const { container } = mostra("/azienda/ordini/o1?tab=finanza#section-ritenute");
    const ritenute = container.querySelector("#section-ritenute details") as HTMLDetailsElement;
    expect(ritenute.open).toBe(true);
  });
});
