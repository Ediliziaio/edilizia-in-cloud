import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ChiusureGiornaliereCassa from "@/pages/azienda/fatturazione/ChiusureGiornaliereCassa";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({
  canViewTesoreria: true, canViewPrimaNota: true, canReconcileBankTransactions: true, solaLettura: false,
}) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const gruppi = ["2025-10-01", "2025-10-02"].map((giorno, i) => ({
  punto_vendita_id: "259", punto_vendita_nome: "Punto A", cassa_id: "42", giorno, numero_scontrini: 1,
  totale_scontrini: 122, scontrini_assenti: 0, con_resi: false, con_fatture: false, con_differiti: false,
  chiusure: [{ id: String(i), presente: true, valuta: "EUR", dati: {
    numero: String(i + 1), data_chiusura: giorno, numero_scontrini: 1, totale_scontrini: 122, contanti: 22,
    elettronici: 100,
    iva: [{ id: "22", aliquota: 22, scontrini: 122, annulli: 0, pagamenti: [
      { tipo: "CASH", importo: 22, annulli: 0, descrizione: "Contanti" },
      { tipo: "CREDITCARD", importo: 100, annulli: 0, descrizione: "Carta" },
    ] }],
  } }],
}));

function vista() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter>
    <ChiusureGiornaliereCassa companyId="azienda" dal="2025-10-01" al="2025-10-02" punto="" />
  </MemoryRouter></QueryClientProvider>);
}

function configura() {
  mocks.rpc.mockReset().mockImplementation((name, args) => {
    if (name === "cassa_in_cloud_confronto") return { range: () => ({ abortSignal: async () => ({ data: gruppi }) }) };
    if (name === "cassa_in_cloud_proposta") return Promise.resolve({ data: {
      valori: { lordo: 122, contanti: 22, pos: 100, ricavi: 100, iva: 22, versione: args.p_giorno },
      puo_registrare: true, scrittura_id: null as null, accredito_id: null as null,
    } });
    if (name === "cassa_in_cloud_candidati_pos") return Promise.resolve({ data: args.p_netto === 197
      ? [{ id: "credito", conto: "Conto B", giorno: "2025-10-03", descrizione: "Accredito POS" }] : [] });
    return Promise.resolve({ data: "salvato" });
  });
  mocks.from.mockReset().mockReturnValue({
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [
      { id: "contanti", natura: "attivo", codice: "1", descrizione: "Cassa" },
      { id: "pos", natura: "attivo", codice: "2", descrizione: "POS in transito" },
      { id: "ricavi", natura: "ricavo", codice: "3", descrizione: "Ricavi" },
      { id: "iva", natura: "passivo", codice: "4", descrizione: "IVA" },
    ] }),
  });
}

afterEach(cleanup);

describe("Conferma operazioni sulle chiusure", () => {
  it("prepara i conti e registra solo dopo la conferma", async () => {
    configura();
    vista();
    fireEvent.click((await screen.findAllByRole("button", { name: "Dettaglio" }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Proponi scrittura Dare/Avere" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", {name:"Registra scrittura"})).toBeDisabled();
    await within(within(dialog).getByLabelText("POS da accreditare")).findByRole("option", { name: "2 · POS in transito" });
    for (const [label,value] of [["Cassa contanti","contanti"],["POS da accreditare","pos"],["Ricavi da corrispettivi","ricavi"],["IVA su vendite","iva"]]) {
      fireEvent.change(within(dialog).getByLabelText(label),{target:{value}});
    }
    expect(mocks.rpc.mock.calls.some(([n])=>n==="cassa_in_cloud_registra_chiusura")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", {name:"Registra scrittura"}));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("cassa_in_cloud_registra_chiusura", expect.objectContaining({
      p_giorno:"2025-10-01",p_versione:"2025-10-01",p_conti:{contanti:"contanti",pos:"pos",ricavi:"ricavi",iva:"iva"},
    })));
  });

  it("associa due giornate al netto delle commissioni al conto scelto", async () => {
    configura();
    vista();
    const caselle = await screen.findAllByRole("checkbox");
    caselle.forEach((el) => fireEvent.click(el));
    fireEvent.click(screen.getByRole("button",{name:"Abbina accredito POS (2)"}));
    const commissioni = await screen.findByLabelText("Commissioni trattenute in questo accredito");
    fireEvent.change(commissioni,{target:{value:"3,00"}});
    await screen.findByRole("option",{name:/Conto B/});
    fireEvent.change(screen.getByLabelText("Accredito da abbinare"),{target:{value:"credito"}});
    fireEvent.click(screen.getByRole("button",{name:"Conferma abbinamento"}));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("cassa_in_cloud_abbina_pos",expect.objectContaining({
      p_tx:"credito",p_commissioni:3,p_chiusure:[
        {punto:"259",cassa:"42",giorno:"2025-10-01",versione:"2025-10-01"},
        {punto:"259",cassa:"42",giorno:"2025-10-02",versione:"2025-10-02"},
      ],
    })));
  });
});
