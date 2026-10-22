import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const stato = vi.hoisted(() => ({
  permessi: { canEditOrders: true, canValidateBom: false, canManagePurchasing: false, canViewCosts: true, isAdmin: false },
  fasi: [] as unknown[],
  cambia: vi.fn(),
  creaOrdini: vi.fn(),
  tabelle: {} as Record<string, unknown[]>,
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" }, user: { id: "utente" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useOperationalSuppliers", () => ({ useOperationalSuppliers: () => ({ suppliers: [{ id: "f1", name: "Elettroforniture Srl", is_active: true }] }) }));

vi.mock("@/hooks/useMaterialiPerFase", () => {
  const muta = (fn = vi.fn()) => ({ mutate: fn, isPending: false });
  return {
    useMaterialiPerFase: () => ({ fasi: stato.fasi, isLoading: false, isError: false, refetch: vi.fn() }),
    useAzioniMateriali: () => ({
      cambiaStato: muta(stato.cambia), aggiornaMateriale: muta(), spostaInFase: muta(), assegnaFornitore: muta(),
      richiediOfferta: muta(), creaOrdini: muta(stato.creaOrdini),
    }),
    chiaviMateriali: { commessa: (id: string) => ["materiali-per-fase", id] },
  };
});

import { MaterialiPerFase } from "@/components/orders/materiali/MaterialiPerFase";

const materiale = (id: string, extra: Record<string, unknown> = {}) => ({
  id, order_id: "c1", name: `Materiale ${id}`, description: null as never, quantity: 37, status: "da_ordinare", supplier_id: null as never,
  purchase_price: 2, vat_rate: 22, phase_id: "fase-el", unita_misura: "pz", specifiche: null as never, origine_materiale: "computo",
  quantita_calcolata: 36.4, origini: [{ tipo: "computo", voce_id: "v", codice: "EL.05", descrizione: "Punto presa", quantita_voce: 37, unita_voce: "cad", quantita: 37 }],
  locale: null as never, supplier_rfq_item_id: null as never, stock_item_id: null as never, posizioni: null as never, stato: "da_ordinare", ordinabile: true, avviso: null as never, ...extra,
});

describe("Materiali per fase nella commessa", () => {
  beforeEach(() => {
    stato.cambia.mockReset();
    stato.creaOrdini.mockReset();
    stato.permessi = { canEditOrders: true, canValidateBom: false, canManagePurchasing: false, canViewCosts: true, isAdmin: false };
  });

  async function disegna() {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><MaterialiPerFase orderId="c1" orderCode="C-001" /></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("fase in bozza: avanzamento, provenienza dal computo, «Invia al tecnico» per chi prepara", async () => {
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: { stato: "bozza", note_validazione: null, validata_il: null, inviata_il: null },
      materiali: [materiale("a"), materiale("b", { stato: "ordinato" })] }];
    await disegna();
    const fase = screen.getByRole("region", { name: "Fase Impianto elettrico" });
    expect(within(fase).getByText("In preparazione")).toBeInTheDocument();
    expect(within(fase).getByText(/2 materiali · 1 da ordinare · 1 ordinati · 0 consegnati/)).toBeInTheDocument();
    expect(within(fase).getAllByText("Computo · EL.05")).toHaveLength(2);
    expect(within(fase).getAllByText("calcolata 36,4")).toHaveLength(2);
    fireEvent.click(within(fase).getByRole("button", { name: /Invia al tecnico/ }));
    expect(stato.cambia).toHaveBeenCalledWith({ phaseId: "fase-el", azione: "invia_validazione" });
  });

  it("dal tecnico: valida o rimanda con nota; chi prepara non ha pulsanti e non ordina", async () => {
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: { stato: "da_validare", note_validazione: null, validata_il: null, inviata_il: null },
      materiali: [materiale("a")] }];
    stato.permessi = { ...stato.permessi, canEditOrders: false, canValidateBom: true };
    await disegna();
    expect(screen.getByRole("button", { name: /Valida i materiali della fase/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Rimanda indietro/ }));
    const dialogo = await screen.findByRole("dialog");
    const conferma = within(dialogo).getByRole("button", { name: "Rimanda indietro" });
    expect(conferma).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText(/Nota/), { target: { value: "Mancano le cassette" } });
    fireEvent.click(conferma);
    expect(stato.cambia).toHaveBeenCalledWith({ phaseId: "fase-el", azione: "rimanda", nota: "Mancano le cassette" }, expect.anything());
  });

  it("selezione: i materiali di una fase non validata non si ordinano", async () => {
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: { stato: "da_validare", note_validazione: null, validata_il: null, inviata_il: null },
      materiali: [materiale("a")] }];
    await disegna();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Materiale a" }));
    expect(screen.getByText("1 selezionati")).toBeInTheDocument();
    expect(screen.getByText(/di fasi non validate/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crea ordine/ })).toBeDisabled();
  });

  it("fase validata: si ordina la selezione", async () => {
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: { stato: "validata", note_validazione: null, validata_il: "2026-10-22", inviata_il: null },
      materiali: [materiale("a", { supplier_id: "f1" })] }];
    await disegna();
    expect(screen.getByText("Elettroforniture Srl")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona tutti i materiali di Impianto elettrico" }));
    fireEvent.click(screen.getByRole("button", { name: /Crea ordine/ }));
    expect(stato.creaOrdini).toHaveBeenCalledWith({ materiali: [expect.objectContaining({ id: "a" })] }, expect.anything());
  });

  it("commessa senza materiali: spiega cosa fare e offre la generazione", async () => {
    stato.fasi = [];
    await disegna();
    expect(screen.getByText("Nessun materiale ancora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Genera dal computo e dalle tavole/ })).toBeInTheDocument();
  });
});
