// 11/11/2026 — «A chi lo chiedi»: una riga per fornitore, i dettagli a
// richiesta (uno alla volta); nel confronto niente tendina per cella; il
// totale offerto vuoto propone la somma delle voci senza salvarla.
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
vi.mock("@/components/orders/ControlloDocumentoCard", () => ({ ControlloDocumentoCard: (): null => null }));
vi.mock("@/components/acquisti/StoricoAcquistiCard", () => ({ StoricoAcquistiCard: (): null => null }));
const m = vi.hoisted(() => ({
  fornitori: [] as Array<Record<string, unknown>>,
  quotes: [] as Array<Record<string, unknown>>,
  setQuote: vi.fn(),
  updateSupplier: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c", name: "Impresa" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] as unknown[], isFetching: false, isError: false, refetch: vi.fn() }) }));
vi.mock("@/hooks/useOperationalSuppliers", () => ({ useOperationalSuppliers: () => ({ suppliers: [] as unknown[] }) }));
vi.mock("@/lib/acquisti/letturaSenzaPrezzi", () => ({ letturaSenzaPrezzi: () => false }));
vi.mock("@/hooks/useSupplierRfqs", async (importOriginal) => {
  const vero = await importOriginal<typeof import("@/hooks/useSupplierRfqs")>();
  const nop = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  return {
    ...vero,
    useSupplierRfqDetail: () => ({
      rfq: { id: "r", rfq_number: "RDO-1", titolo: "Solaio", status: "in_valutazione", created_at: "2026-11-02", order_id: null as string | null, scadenza_offerte: "2026-12-31" },
      items: [
        { id: "i1", descrizione: "Blocchi", quantita: 100, unita_misura: "pz" },
        { id: "i2", descrizione: "Malta", quantita: 10, unita_misura: "sacchi" },
      ],
      fornitori: m.fornitori,
      quotes: m.quotes,
      isLoading: false,
      updateRfq: nop, updateFornitore: { ...nop, mutate: m.updateSupplier }, addItem: nop, updateItem: nop, deleteItem: nop,
      addFornitore: nop, removeFornitore: nop, setQuote: { ...nop, mutate: m.setQuote }, aggiudica: nop,
      segnaChiesta: nop, registraOfferta: nop, allegaOfferta: nop,
    }),
  };
});
vi.mock("@/components/orders/OdaFornitoreCard", () => ({ OdaFornitoreCard: (): null => null }));
vi.mock("@/components/orders/FornitoreCombobox", () => ({ FornitoreCombobox: (): null => null }));
vi.mock("@/components/rdo/EstraiOffertaAIDialog", () => ({ EstraiOffertaAIDialog: (): null => null }));
vi.mock("@/components/documentiOperativi/DocumentoEmailDialog", () => ({ DocumentoEmailDialog: (): null => null }));
import SupplierRfqDetail from "@/pages/azienda/SupplierRfqDetail";

const fornitore = (id: string, nome: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, rfq_id: "r", supplier_id: `s-${id}`, status: "risposta", inviata_at: "2026-11-03", inviata_via: "app",
  risposta_at: "2026-11-04", trasporto_tipo: "incluso", costo_trasporto: null as never, totale_offerto: null as never,
  giorni_consegna: 3, validita_offerta: "2026-12-15", condizioni_pagamento: "60 gg d.f.", note: null as never,
  allegato_url: null as never, email_inbox_id: null as never, aggancio_da: null as never, aggancio_confidenza: null as never, aggancio_da_confermare: false,
  suppliers: { name: nome, email: null as never }, ...extra,
});
const quota = (f: string, i: string, prezzo: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: `${f}-${i}`, rfq_supplier_id: f, rfq_item_id: i, prezzo_unitario: prezzo, sconto_percentuale: 0, aliquota_iva: 22, disponibile: true, note: null, ...extra,
});

beforeEach(() => {
  m.fornitori = [fornitore("a", "Edilferro"), fornitore("b", "Laterizi Sud", { status: "inviata", risposta_at: null, giorni_consegna: null })];
  m.quotes = [quota("a", "i1", 1.1), quota("a", "i2", 6.5)];
  m.setQuote.mockReset();
  m.updateSupplier.mockReset();
});
afterEach(cleanup);
const apri = () => render(<MemoryRouter><SupplierRfqDetail /></MemoryRouter>);

it("ogni fornitore è una riga: nome, stato, totale, consegna e «Scegli questo»; i dettagli chiusi", () => {
  apri();
  const righe = screen.getAllByTestId("riga-fornitore-rdo");
  expect(righe).toHaveLength(2);
  expect(righe[0]).toHaveTextContent("Edilferro");
  expect(righe[0]).toHaveTextContent("Ha risposto");
  expect(righe[0]).toHaveTextContent("175,00");
  expect(righe[0]).toHaveTextContent("consegna 3 gg");
  expect(within(righe[0]).getByRole("button", { name: /Scegli questo/ })).toBeInTheDocument();
  expect(righe[1]).toHaveTextContent("In attesa");
  expect(within(righe[1]).queryByRole("button", { name: /Scegli questo/ })).not.toBeInTheDocument();
  // Con più fornitori i dettagli partono chiusi.
  expect(screen.queryByRole("button", { name: /Anteprima PDF/ })).not.toBeInTheDocument();
});

it("un clic apre i dettagli di un fornitore alla volta", () => {
  apri();
  fireEvent.click(screen.getByRole("button", { name: "Dettagli Edilferro" }));
  expect(screen.getByRole("button", { name: "Dettagli Edilferro" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Anteprima PDF per Edilferro" })).toBeInTheDocument();
  expect(screen.getByLabelText("Totale offerto Edilferro")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dettagli Laterizi Sud" }));
  expect(screen.queryByRole("button", { name: "Anteprima PDF per Edilferro" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Anteprima PDF per Laterizi Sud" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dettagli Laterizi Sud" }));
  expect(screen.queryByRole("button", { name: /Anteprima PDF per/ })).not.toBeInTheDocument();
});

it("con un solo fornitore i dettagli sono aperti da subito", () => {
  m.fornitori = [fornitore("a", "Edilferro")];
  apri();
  expect(screen.getByRole("button", { name: "Dettagli Edilferro" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Anteprima PDF per Edilferro" })).toBeInTheDocument();
});

it("il totale offerto vuoto propone la somma delle voci, senza salvarla", () => {
  m.fornitori = [fornitore("a", "Edilferro")];
  apri();
  const campo = screen.getByLabelText("Totale offerto Edilferro");
  expect(campo).toHaveValue(null);
  expect(campo.getAttribute("placeholder")).toMatch(/175,00/);
  expect(screen.getByText("dalla somma delle voci")).toBeInTheDocument();
  fireEvent.blur(campo);
  expect(m.updateSupplier).not.toHaveBeenCalled();
});

it("un totale scritto a mano resta quello, senza proposta", () => {
  m.fornitori = [fornitore("a", "Edilferro", { totale_offerto: 180 })];
  apri();
  expect(screen.getByLabelText("Totale offerto Edilferro")).toHaveValue(180);
  expect(screen.queryByText("dalla somma delle voci")).not.toBeInTheDocument();
});

it("nel confronto niente tendina per cella: disponibile non si scrive, le eccezioni sì", () => {
  m.quotes = [quota("a", "i1", 1.1), quota("a", "i2", 6.5, { note: "[parziale] 5 sacchi" }), quota("b", "i1", 1.2, { disponibile: false })];
  apri();
  const tabella = screen.getByRole("table");
  // Le scritte visibili nelle celle (le <option> del comando non contano).
  expect(within(tabella).queryByText("Disponibile", { selector: "span" })).not.toBeInTheDocument();
  expect(within(tabella).getByText("Parziale", { selector: "span" })).toBeInTheDocument();
  expect(within(tabella).getByText("Non disponibile", { selector: "span" })).toBeInTheDocument();
  // Lo stato salvato si legge e si cambia dal comando della cella.
  const comando = screen.getByLabelText("Disponibilità Malta da Edilferro");
  expect(comando).toHaveValue("parziale");
  fireEvent.change(comando, { target: { value: "alternativa" } });
  expect(m.setQuote).toHaveBeenCalledWith({
    rfq_supplier_id: "a",
    rfq_item_id: "i2",
    updates: { disponibile: true, note: "[alternativa] 5 sacchi" },
  });
  fireEvent.change(screen.getByLabelText("Disponibilità Blocchi da Laterizi Sud"), { target: { value: "disponibile" } });
  expect(m.setQuote).toHaveBeenLastCalledWith({ rfq_supplier_id: "b", rfq_item_id: "i1", updates: { disponibile: true, note: null as never } });
});
