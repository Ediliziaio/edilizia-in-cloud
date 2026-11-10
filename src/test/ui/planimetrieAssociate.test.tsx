import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PlanimetrieAssociate } from "@/components/planimetrie/PlanimetrieAssociate";

const mock = vi.hoisted(() => ({ carica: vi.fn(), canViewRenderAi: true, canViewCustomers: true }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewRenderAi: mock.canViewRenderAi, canViewCustomers: mock.canViewCustomers, canViewPreventivi: true, canViewOrders: true, canViewMarketingContacts: true, solaLettura: true }) }));
vi.mock("@/lib/planimetrie/pianteAssociate", async (original) => ({ ...await original<typeof import("@/lib/planimetrie/pianteAssociate")>(), caricaPianteAssociate: mock.carica }));

const pianta = { id: "p1", titolo: "Villa associata", stato: "in_uso", versione_corrente: 3, updated_at: "2026-11-10" };
function monta(tipo: "cliente" | "contatto" | "preventivo" | "commessa" | "computo" = "cliente", id = "scheda-1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<PlanimetrieAssociate companyId="azienda-A" tipo={tipo} schedaId={id} />, { wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider> });
  return { ...view, client };
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.canViewRenderAi = true;
  mock.canViewCustomers = true;
  mock.carica.mockResolvedValue({ piante: [pianta], totale: 1 });
});

describe("Collegamento al progetto originale", () => {
  it.each(["cliente", "contatto", "preventivo", "commessa", "computo"] as const)("nella scheda %s mostra soltanto l'accesso alla planimetria esistente, anche in sola lettura", async (tipo) => {
    monta(tipo);
    expect(await screen.findByRole("link", { name: "Apri planimetria Villa associata" })).toHaveAttribute("href", "/azienda/planimetrie/p1");
    expect(mock.carica).toHaveBeenCalledWith("azienda-A", tipo, "scheda-1", 0);
    expect(screen.queryByRole("button", { name: /^(crea|nuov|associa)/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fascicolo PDF Villa associata" })).toHaveAttribute("href", "/azienda/planimetrie/p1?esporta=fascicolo");
  });

  it("senza accesso a Render AI non mostra né carica il progetto", () => {
    mock.canViewRenderAi = false;
    const { container } = monta();
    expect(container).toBeEmptyDOMElement();
    expect(mock.carica).not.toHaveBeenCalled();
  });

  it("rispetta anche i permessi della scheda collegata", () => {
    mock.canViewCustomers = false;
    monta();
    expect(mock.carica).not.toHaveBeenCalled();
  });

  it("dopo una rimozione aggiorna l'elenco con la stessa invalidazione della planimetria", async () => {
    const { client } = monta();
    await screen.findByRole("link", { name: "Apri planimetria Villa associata" });
    mock.carica.mockResolvedValue({ piante: [], totale: 0 });
    await client.invalidateQueries({ queryKey: ["planimetrie"] });
    expect(await screen.findByText("Nessuna planimetria associata a questo cliente.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("passando a un'altra scheda riparte dalla prima pagina senza mostrare la precedente", async () => {
    mock.carica.mockResolvedValueOnce({ piante: [pianta], totale: 7 }).mockResolvedValueOnce({ piante: [{ ...pianta, id: "p2", titolo: "Seconda pagina" }], totale: 7 });
    const view = monta();
    fireEvent.click(await screen.findByRole("button", { name: "Successive" }));
    await screen.findByRole("link", { name: "Apri planimetria Seconda pagina" });
    mock.carica.mockResolvedValue({ piante: [], totale: 0 });
    view.rerender(<PlanimetrieAssociate companyId="azienda-A" tipo="cliente" schedaId="altro-cliente" />);
    await screen.findByText("Nessuna planimetria associata a questo cliente.");
    expect(mock.carica).toHaveBeenLastCalledWith("azienda-A", "cliente", "altro-cliente", 0);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
