import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RiepilogoGenerale, TotaliGenerale } from "@/lib/orders/commesseGenerali";
import { calcolaInvestitori, type Fonte, type Movimento, type NumeriOperazione } from "@/lib/orders/generali/investitoriConti";

/**
 * Modulo «Investitori» della commessa generale (tappa 5): cosa vede chi usa l'app.
 * I conti sono quelli veri (investitoriConti); finte solo le letture dal database.
 */
const m = vi.hoisted(() => ({
  fonti: [] as unknown[],
  movimenti: [] as unknown[],
  numeri: null as unknown,
  pianoVuoto: false,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
// I grafici misurano il contenitore: in jsdom basta che non cadano.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda", name: "Edil Srl" } }) }));
vi.mock("@/hooks/useCompanyCustomers", () => ({ useCompanyCustomers: () => ({ data: [] as unknown[], isLoading: false }) }));
vi.mock("@/hooks/useGeneraleInvestitori", async () => {
  const conti = await import("@/lib/orders/generali/investitoriConti");
  const muta = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useGeneraleInvestitori: () => ({
      fonti: m.fonti, movimenti: m.movimenti, numeriPiano: null as unknown, numeri: m.numeri, oggi: "2027-06-30",
      conti: conti.calcolaInvestitori({ fonti: m.fonti as Fonte[], movimenti: m.movimenti as Movimento[], numeri: m.numeri as NumeriOperazione | null, oggi: "2027-06-30" }),
      pianoVuoto: m.pianoVuoto, pianoInBozza: false, isLoading: false, isError: false, refetch: vi.fn(),
    }),
    useVenditeGenerale: () => ({ data: null as unknown }),
    useRendicontiInviati: () => ({
      isLoading: false,
      data: [{ id: "r1", fonteId: "M", fonteNome: "Mario Rossi", destinatario: "mario@example.com", oggetto: "x", stato: "inviato", errore: null as string | null, pdfPath: "a/b/r1.pdf", creatoIl: "2027-05-02T10:00:00Z", inviatoIl: "2027-05-02T10:00:01Z" }],
    }),
    useEliminaFonte: muta, useEliminaMovimento: muta, useSalvaFonte: muta, useAggiungiMovimento: muta, useInviaRendiconto: muta,
    messaggioInvestitori: () => "errore", linkPdfRendiconto: vi.fn(),
  };
});

const { modulo } = await import("@/components/orders/generali/moduli/InvestitoriScheda");

const fonte = (f: Partial<Fonte> & Pick<Fonte, "id" | "tipo" | "nome">): Fonte => ({
  soggetto: "persona", clienteId: null, email: null, impegno: 0, quotaUtilePct: null, tassoPct: null,
  dataInizio: null, scadenza: null, nota: null, ordine: 0, ...f,
});
const mov = (id: string, fonteId: string, data: string, importo: number): Movimento => ({ id, fonteId, tipo: "versamento", data, importo, nota: null });

const riepilogo = (margini = true): RiepilogoGenerale => ({
  generale: { id: "g", codice: "C-27", nome: "Residenza Via Roma", cliente: null, clienteId: null, modello: "sviluppo", creataIl: null, valore: null },
  figlie: [],
  permessi: { importi: true, costi: true, margini },
});
const totali = {} as TotaliGenerale;
const NUMERI: NumeriOperazione = {
  marginePrevisto: 300_000, margineStima: 240_000, capitaleMassimo: 600_000, meseCapitaleMassimo: "2027-09",
  capitaleInvestitoOggi: 250_000, inizio: "2027-01", fine: "2028-12", interessiNelPiano: false,
  fabbisogno: [{ mese: "2027-01", importo: 350_000 }, { mese: "2027-09", importo: 600_000 }, { mese: "2028-12", importo: 0 }],
  tirProgetto: 0.2,
};

const disegna = (r = riepilogo(), puoModificare = true) => {
  const { Scheda } = modulo;
  return render(<MemoryRouter><Scheda riepilogo={r} totali={totali} puoModificare={puoModificare} /></MemoryRouter>);
};

beforeEach(() => {
  m.fonti = [
    fonte({ id: "M", tipo: "capitale", nome: "Mario Rossi", impegno: 200_000, email: "mario@example.com" }),
    fonte({ id: "P", tipo: "propri", nome: "Edil Srl", impegno: 150_000 }),
    fonte({ id: "B", tipo: "banca", nome: "Banca Locale", impegno: 150_000, tassoPct: 4 }),
  ];
  m.movimenti = [mov("1", "M", "2027-01-15", 200_000), mov("2", "P", "2027-01-15", 150_000)];
  m.numeri = NUMERI;
  m.pianoVuoto = false;
});
afterEach(cleanup);

describe("il modulo Investitori", () => {
  it("è pronto, solo da tablet e computer, con un riquadro in Panoramica", () => {
    expect(modulo.pronto).toBe(true);
    expect(modulo.telefono).toBe(false);
    expect(modulo.Riquadro).toBeTypeOf("function");
  });

  it("senza permesso sui margini non mostra nulla di sensibile", () => {
    disegna(riepilogo(false));
    expect(screen.getByText(/li vede chi ha il permesso di vedere i margini/)).toBeInTheDocument();
    expect(screen.queryByText("Mario Rossi")).not.toBeInTheDocument();
  });

  it("elenca le fonti con previsto, ad oggi e a finire, e quanto spetta a ciascuna", () => {
    disegna();
    const tabella = within(screen.getByRole("region", { name: "Le fonti" })).getByRole("table");
    expect(within(tabella).getAllByText("Previsto")).toHaveLength(2);
    expect(within(tabella).getAllByText("Ad oggi")).toHaveLength(2);
    expect(within(tabella).getAllByText("A finire")).toHaveLength(2);
    expect(within(tabella).getByText("Mario Rossi")).toBeInTheDocument();
    expect(within(tabella).getByText(/Investitore a capitale · pro quota/)).toBeInTheDocument();
    expect(within(tabella).getByText(/Banca o mutuo · 4% annuo/)).toBeInTheDocument();
    expect(within(tabella).getAllByText(/TIR .* l'anno/).length).toBeGreaterThan(0);
  });

  it("mostra il rendimento dell'operazione contro quello dei mezzi propri, e la leva", () => {
    disegna();
    const r = screen.getByRole("region", { name: "Rendimento e leva" });
    expect(r).toHaveTextContent("ROI");
    expect(r).toHaveTextContent("TIR del progetto");
    expect(r).toHaveTextContent("ROE");
    expect(r).toHaveTextContent("TIR dei mezzi propri");
    expect(r).toHaveTextContent("Effetto leva");
    expect(within(r).getByLabelText("Tasso")).toBeInTheDocument();
    expect(within(r).getByLabelText("Banca e finanziamenti")).toBeInTheDocument();
  });

  it("mostra il costo del debito e le fonti nel tempo", () => {
    disegna();
    const c = screen.getByRole("region", { name: "Costo del debito" });
    expect(c).toHaveTextContent("Interessi");
    expect(c).toHaveTextContent("Spese");
    expect(c).toHaveTextContent("Il piano non ha una voce «Oneri finanziari»");
    expect(screen.getByRole("region", { name: "Fonti nel tempo" })).toHaveTextContent("Fabbisogno del piano");
  });

  it("divide il capitale per fonte e avvisa se le fonti non coprono il picco", () => {
    disegna();
    const copertura = screen.getByRole("region", { name: "Capitale per fonte" });
    expect(within(copertura).getByText("Mezzi propri")).toBeInTheDocument();
    expect(within(copertura).getByText("Investitori")).toBeInTheDocument();
    expect(within(copertura).getByText("Banca e finanziamenti")).toBeInTheDocument();
    expect(within(copertura).getByText(/Mancano 100\.000\s€ per coprire il picco/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("al picco di esposizione");
  });

  it("spiega la regola di ripartizione dell'utile", () => {
    disegna();
    const regola = screen.getByRole("region", { name: "Come si divide l'utile" });
    expect(regola).toHaveTextContent("pro quota");
    expect(regola).toHaveTextContent("Chi presta riceve il capitale e gli interessi");
  });

  it("aprendo una fonte mostra movimenti, regola e il rendiconto", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Mario Rossi/ }));
    expect(screen.getByRole("button", { name: /Registra movimento/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rendiconto/ })).toBeInTheDocument();
    expect(screen.getByText(/Rendiconti a mario@example.com/)).toBeInTheDocument();
  });

  it("chi non modifica vede ma non aggiunge", () => {
    disegna(riepilogo(), false);
    expect(screen.queryByRole("button", { name: /Aggiungi fonte/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Mario Rossi/ }));
    expect(screen.queryByRole("button", { name: /Registra movimento/ })).not.toBeInTheDocument();
  });

  it("senza fonti propone il prossimo passo", () => {
    m.fonti = [];
    m.movimenti = [];
    disegna();
    expect(screen.getByText("Da dove arrivano i soldi dell'operazione?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Banca o mutuo/ })).toBeInTheDocument();
  });

  it("tiene lo storico dei rendiconti inviati", () => {
    disegna();
    const storico = screen.getByRole("region", { name: "Rendiconti inviati" });
    expect(storico).toHaveTextContent("mario@example.com");
    expect(storico).toHaveTextContent("Inviato");
  });

  it("il riquadro in Panoramica: raccolto contro capitale massimo e rendimento atteso", () => {
    const Riquadro = modulo.Riquadro!;
    render(<MemoryRouter><Riquadro riepilogo={riepilogo()} totali={totali} puoModificare /></MemoryRouter>);
    const r = screen.getByRole("region", { name: "Investitori" });
    expect(r).toHaveTextContent("Capitale raccolto");
    expect(r).toHaveTextContent("350.000");
    expect(r).toHaveTextContent("600.000");
    expect(r).toHaveTextContent("Rendimento atteso");
    // 240.000 di margine sul capitale massimo di 600.000.
    expect(r).toHaveTextContent("40%");
    expect(r).toHaveTextContent("Rendimento dei mezzi propri");
    expect(r).toHaveTextContent("mancano 100.000");
  });
});

// Sanity: i numeri del riquadro sono quelli dei conti.
it("i conti del riquadro tornano", () => {
  const c = calcolaInvestitori({ fonti: [fonte({ id: "A", tipo: "propri", nome: "A", impegno: 1 })], movimenti: [], numeri: NUMERI, oggi: "2027-06-30" });
  expect(c.utile.stima / NUMERI.capitaleMassimo).toBeCloseTo(0.4, 9);
});
