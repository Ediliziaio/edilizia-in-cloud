/**
 * Il dialogo non collega mai da solo: propone il riferimento univoco, dice quando non c'è o non è univoco, e la
 * chiamata al database parte solo dalla conferma.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
let candidate: unknown[] = [];
let xml: string | null = null;
let storni: unknown[] = [];

function catena(risposta: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) c[m] = () => c;
  c.maybeSingle = () => Promise.resolve({ data: risposta(), error: null });
  c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: risposta(), error: null }).then(ok);
  return c;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (nome: string, args: unknown) => {
      rpc(nome, args);
      if (nome === "nota_credito_candidate") return Promise.resolve({ data: candidate, error: null });
      if (nome === "nota_credito_collega") return Promise.resolve({ data: { stornato: 61, fatture_chiuse: [], credito_residuo: 0, non_assegnato: 0, riba_avvisate: [] }, error: null });
      return Promise.resolve({ data: { fatture_restano_contabilizzate: [] }, error: null });
    },
    from: (t: string) => catena(() => (t === "note_credito_storni" ? storni : { xml_raw: xml, indice_corpo: 0, ritenuta_importo: null })),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/orders/financialRefresh", () => ({ refreshFinancialQueries: vi.fn() }));

import { CollegaNotaCreditoDialog } from "@/components/fatturazione/CollegaNotaCreditoDialog";

const notaXml = (riferimenti: string[]) => `<F><FatturaElettronicaHeader><CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>1</IdCodice></IdFiscaleIVA></DatiAnagrafici></CedentePrestatore></FatturaElettronicaHeader>
<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD04</TipoDocumento><Data>2026-10-19</Data><Numero>NC</Numero></DatiGeneraliDocumento>
${riferimenti.map((r) => `<DatiFattureCollegate><IdDocumento>${r}</IdDocumento></DatiFattureCollegate>`).join("")}</DatiGenerali></FatturaElettronicaBody></F>`;

const f = (id: string, numero: string, totale = 122) => ({ id, numero_fattura: numero, data_fattura: "2026-10-01", totale_documento: totale, stato: "contabilizzata", storico_esterno: false, company_cost_id: "c1", aperto: totale, stornato: 0 });
const nota = { id: "n1", company_id: "az", numero_fattura: "NC", data_fattura: "2026-10-19", cedente_ragione_sociale: "Fornitore", totale_documento: -61, imponibile_totale: -50, iva_totale: -11 };

const apri = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <CollegaNotaCreditoDialog nota={nota} onChiudi={() => undefined} />
  </QueryClientProvider>,
);
const conferma = () => screen.findByRole("button", { name: "Riduci il debito" });
const spunta = (numero: string) => screen.findByRole("checkbox", { name: `Storna la fattura ${numero}` });

beforeEach(() => { rpc.mockClear(); candidate = []; xml = null; storni = []; });

describe("collegare una nota di credito", () => {
  it("riferimento univoco: spuntata, ma non parte niente finché non si conferma", async () => {
    candidate = [f("a", "12"), f("b", "13")];
    xml = notaXml(["12"]);
    apri();
    await waitFor(async () => expect((await spunta("12")).getAttribute("data-state")).toBe("checked"));
    expect((await spunta("13")).getAttribute("data-state")).toBe("unchecked");
    expect(rpc).not.toHaveBeenCalledWith("nota_credito_collega", expect.anything());

    fireEvent.click(await conferma());
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("nota_credito_collega", { p_nota: "n1", p_quote: [{ fattura_id: "a", importo: 61 }] }));
  });

  it("due fatture con lo stesso numero: nessuna spuntata, conferma ferma", async () => {
    candidate = [f("a", "12"), { ...f("b", "12"), data_fattura: "2025-01-01" }];
    xml = notaXml(["12"]);
    apri();
    expect(await screen.findByText(/Più fatture di questo fornitore/)).toBeTruthy();
    for (const c of await screen.findAllByRole("checkbox")) expect(c.getAttribute("data-state")).toBe("unchecked");
    expect((await conferma()).hasAttribute("disabled")).toBe(true);
  });

  it("riferimento che non si trova: lo dice e si sceglie a mano", async () => {
    candidate = [f("a", "12")];
    xml = notaXml(["999"]);
    apri();
    expect(await screen.findByText(/cita la fattura «999»/)).toBeTruthy();
    fireEvent.click(await spunta("12"));
    fireEvent.click(await conferma());
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("nota_credito_collega", { p_nota: "n1", p_quote: [{ fattura_id: "a", importo: 61 }] }));
  });

  it("nota senza file (da Fatture in Cloud): si sceglie a mano", async () => {
    candidate = [f("a", "12")];
    apri();
    expect(await screen.findByText(/non dice quale fattura rettifica/)).toBeTruthy();
    expect((await spunta("12")).getAttribute("data-state")).toBe("unchecked");
  });

  it("già collegata: riparte da com'è e si può togliere", async () => {
    candidate = [f("a", "12")];
    storni = [{ fattura_id: "a", importo: 40 }];
    apri();
    fireEvent.click(await screen.findByRole("button", { name: "Togli il collegamento" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("nota_credito_scollega", { p_nota: "n1" }));
  });
});
