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
  aggiornaMovimento: vi.fn(),
}));

vi.mock("@/components/orders/generali/investitori/ReportMensile", () => ({ ReportMensile: () => <p>Report mensile</p> }));
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
      data: [
        { id: "r1", fonteId: "M", fonteNome: "Mario Rossi", destinatario: "mario@example.com", oggetto: "x", stato: "inviato", errore: null as string | null, pdfPath: "a/b/r1.pdf", creatoIl: "2027-05-02T10:00:00Z", inviatoIl: "2027-05-02T10:00:01Z", versionePiano: "Versione 2 approvata", conPiano: true },
        { id: "r2", fonteId: "M", fonteNome: "Mario Rossi", destinatario: "", oggetto: "Rendiconto senza piano.pdf", stato: "scaricato", errore: null as string | null, pdfPath: "a/b/r2.pdf", creatoIl: "2027-05-03T10:00:00Z", inviatoIl: null as string | null, versionePiano: "Versione 1 superata", conPiano: false },
      ],
    }),
    useEliminaFonte: muta, useEliminaMovimento: muta, useSalvaFonte: muta, useAggiungiMovimento: muta, useInviaRendiconto: muta,
    useAggiornaMovimentoPrevisto: () => ({ mutate: m.aggiornaMovimento, isPending: false }),
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

const disegna = (r = riepilogo(), puoModificare = true, percorso = "/") => {
  const { Scheda } = modulo;
  return render(<MemoryRouter initialEntries={[percorso]}><Scheda riepilogo={r} totali={totali} puoModificare={puoModificare} /></MemoryRouter>);
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
  m.aggiornaMovimento.mockClear();
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
    const fonti = screen.getByRole("table", { name: "Fonti di capitale" });
    expect(within(fonti).getByRole("columnheader", { name: "Versato" })).toBeInTheDocument();
    expect(within(fonti).getByRole("columnheader", { name: "Da versare" })).toBeInTheDocument();
    expect(within(fonti).getByRole("columnheader", { name: "Rientro stimato" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analisi" }));
    const tabella = screen.getByRole("table", { name: "Previsione delle fonti" });
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
    fireEvent.click(screen.getByRole("button", { name: "Analisi" }));
    const r = screen.getByRole("region", { name: "Rendimento e leva" });
    expect(r).toHaveTextContent("ROI");
    expect(r).toHaveTextContent("TIR del progetto");
    expect(r).toHaveTextContent("ROE");
    expect(r).toHaveTextContent("TIR dei mezzi propri");
    expect(r).toHaveTextContent("Effetto leva");
    const simulazione = screen.getByRole("region", { name: "Simula i finanziamenti" });
    expect(within(simulazione).getByLabelText("Variazione del tasso annuo")).toBeInTheDocument();
    expect(within(simulazione).getByLabelText("Variazione di banca e finanziamenti")).toBeInTheDocument();
  });

  it("mostra il costo del debito e le fonti nel tempo", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: "Analisi" }));
    const c = screen.getByRole("region", { name: "Costo del debito" });
    expect(c).toHaveTextContent("Interessi");
    expect(c).toHaveTextContent("Spese");
    expect(c).toHaveTextContent("Il piano non ha una voce «Oneri finanziari»");
    expect(screen.getByRole("region", { name: "Fonti nel tempo" })).toHaveTextContent("Fabbisogno del piano");
  });

  it("divide il capitale per fonte e avvisa se le fonti non coprono il picco", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: "Analisi" }));
    const copertura = screen.getByRole("region", { name: "Capitale per fonte" });
    expect(within(copertura).getByText("Mezzi propri")).toBeInTheDocument();
    expect(within(copertura).getByText("Investitori")).toBeInTheDocument();
    expect(within(copertura).getByText("Banca e finanziamenti")).toBeInTheDocument();
    expect(within(copertura).getByText(/Mancano 100\.000\s€ per coprire il picco/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("al picco di esposizione");
  });

  it("spiega la regola di ripartizione dell'utile", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: "Analisi" }));
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

  it("tiene lo storico dei rendiconti inviati e scaricati, con la versione del piano", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: "Rendiconti" }));
    const storico = screen.getByRole("region", { name: "Storico dei rendiconti" });
    expect(storico).toHaveTextContent("mario@example.com");
    expect(storico).toHaveTextContent("Inviato");
    expect(storico).toHaveTextContent("Scaricato");
    expect(storico).toHaveTextContent("Versione 2 approvata · con il piano voce per voce");
    expect(storico).toHaveTextContent("Versione 1 superata · senza il piano voce per voce");
    fireEvent.change(within(storico).getByRole("searchbox", { name: "Cerca rendiconto" }), { target: { value: "versione 2" } });
    expect(within(storico).getByText("Inviato")).toBeInTheDocument();
    expect(within(storico).queryByText("Scaricato")).toBeNull();
  });

  it("apre il registro previsto della fonte e lo storico con la stessa fonte", () => {
    m.movimenti.push(
      { ...mov("a", "M", "2027-07-09", 10_000), nota: "[EIC:MOVIMENTO_PREVISTO] Tranche di Mario" },
      { ...mov("b", "B", "2027-07-09", 20_000), nota: "[EIC:MOVIMENTO_PREVISTO] Tranche della banca" },
    );
    disegna();
    fireEvent.click(screen.getByRole("link", { name: "Movimenti previsti di Mario Rossi" }));
    expect(screen.getByRole("combobox", { name: "Fonte del movimento" })).toHaveTextContent("Mario Rossi");
    const registro = screen.getByRole("table", { name: "Movimenti delle fonti" });
    expect(within(registro).getByText("Tranche di Mario")).toBeInTheDocument();
    expect(within(registro).queryByText("Tranche della banca")).toBeNull();
    fireEvent.click(within(registro).getByRole("button", { name: "Mario Rossi" }));
    fireEvent.click(screen.getByRole("link", { name: "Storico PDF" }));
    expect(screen.getByRole("combobox", { name: "Fonte del rendiconto" })).toHaveTextContent("Mario Rossi");
    expect(screen.getByRole("button", { name: "Prepara PDF" })).toBeEnabled();
  });

  it("i link al rendiconto mensile continuano ad aprire il report", () => {
    disegna(riepilogo(), true, "/?rendiconto-aperto=1&rendiconto-mese=2027-05");
    expect(screen.getByText("Report mensile")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "PDF archiviati" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "PDF per fonte" }));
    expect(screen.getByRole("table", { name: "PDF archiviati" })).toBeInTheDocument();
  });

  it("mette in coda solo i movimenti programmati arrivati a scadenza", () => {
    m.movimenti.push(
      { ...mov("scaduto", "B", "2027-06-28", 25_000), nota: "[EIC:MOVIMENTO_PREVISTO] Tranche scaduta" },
      { ...mov("futuro", "B", "2027-07-09", 10_000), nota: "[EIC:MOVIMENTO_PREVISTO] Tranche futura" },
    );
    disegna();
    fireEvent.click(screen.getByRole("link", { name: "Da confermare 1" }));
    expect(screen.getByRole("button", { name: "Da confermare 1" })).toHaveAttribute("aria-pressed", "true");
    const registro = screen.getByRole("table", { name: "Movimenti delle fonti" });
    expect(within(registro).getByText("Tranche scaduta")).toBeInTheDocument();
    expect(within(registro).queryByText("Tranche futura")).toBeNull();
    expect(within(registro).queryByText("Mario Rossi")).toBeNull();
    fireEvent.click(within(registro).getByRole("button", { name: /^Conferma.*Banca Locale/ }));
    expect(screen.getByRole("dialog", { name: "Conferma movimento effettuato" })).toBeInTheDocument();
  });

  it("apre il mese scoperto e porta al registro filtrato sulle sue date", () => {
    m.fonti = [fonte({ id: "B", tipo: "banca", nome: "Banca Locale", impegno: 600_000, tassoPct: 4 })];
    m.movimenti = [
      { ...mov("set", "B", "2027-09-20", 25_000), nota: "[EIC:MOVIMENTO_PREVISTO] Erogazione di settembre" },
      { ...mov("ott", "B", "2027-10-05", 575_000), nota: "[EIC:MOVIMENTO_PREVISTO] Erogazione di ottobre" },
    ];
    disegna();
    fireEvent.click(screen.getByRole("link", { name: "Analizza lo scoperto di set 2027" }));
    const copertura = screen.getByRole("region", { name: "Copertura mensile" });
    expect(copertura).toHaveTextContent(/Da coprire\s*575\.000\s€/);
    fireEvent.click(within(copertura).getByRole("link", { name: "Movimenti del mese" }));
    expect(screen.getByRole("combobox", { name: "Mese dei movimenti" })).toHaveTextContent("set 2027");
    const registro = screen.getByRole("table", { name: "Movimenti delle fonti" });
    expect(within(registro).getByText("Erogazione di settembre")).toBeInTheDocument();
    expect(within(registro).queryByText("Erogazione di ottobre")).toBeNull();
  });

  it("riprogramma il movimento previsto con la nuova data", () => {
    const previsto = { ...mov("futuro", "B", "2027-07-09", 10_000), nota: "[EIC:MOVIMENTO_PREVISTO] Tranche futura" };
    m.movimenti.push(previsto);
    disegna();
    fireEvent.click(screen.getByRole("button", { name: "Movimenti" }));
    const registro = screen.getByRole("table", { name: "Movimenti delle fonti" });
    expect(within(registro).getAllByRole("button", { name: /^Riprogramma/ })).toHaveLength(1);
    fireEvent.click(within(registro).getByRole("button", { name: /^Riprogramma.*Banca Locale/ }));
    const dialog = screen.getByRole("dialog", { name: "Riprogramma movimento" });
    const salva = within(dialog).getByRole("button", { name: "Salva nuova data" });
    expect(salva).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Nuova data prevista"), { target: { value: "2027-08-02" } });
    expect(within(dialog).getByLabelText("Nuova data prevista")).toHaveAccessibleDescription("2 agosto 2027");
    fireEvent.click(salva);
    expect(m.aggiornaMovimento).toHaveBeenCalledWith(
      { movimento: previsto, data: "2027-08-02", azione: "riprogramma" }, expect.any(Object),
    );
  });

  it("il riquadro in Panoramica distingue capitale dentro e ancora da versare", () => {
    const Riquadro = modulo.Riquadro!;
    render(<MemoryRouter><Riquadro riepilogo={riepilogo()} totali={totali} puoModificare /></MemoryRouter>);
    const r = screen.getByRole("region", { name: "Investitori" });
    expect(r).toHaveTextContent("Capitale ancora dentro");
    expect(r).toHaveTextContent("350.000");
    expect(r).toHaveTextContent("Ancora da versare");
    expect(r).toHaveTextContent("Mezzi propri");
    expect(r).not.toHaveTextContent("Rendimento atteso");
    expect(r).toHaveTextContent("mancano 100.000");
  });
});

// Sanity: i numeri del riquadro sono quelli dei conti.
it("i conti del riquadro tornano", () => {
  const c = calcolaInvestitori({ fonti: [fonte({ id: "A", tipo: "propri", nome: "A", impegno: 1 })], movimenti: [], numeri: NUMERI, oggi: "2027-06-30" });
  expect(c.utile.stima / NUMERI.capitaleMassimo).toBeCloseTo(0.4, 9);
});
