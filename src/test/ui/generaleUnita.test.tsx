import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElencoUnita, MovimentoUnita, UnitaGenerale } from "@/lib/orders/generali/unita";
import type { RiepilogoGenerale, TotaliGenerale } from "@/lib/orders/commesseGenerali";

/**
 * Modulo «Unità e vendite» (30/10/2026): cosa vede chi vende. Da computer tabellone, tabella,
 * serie, divisione; da telefono (375 px) solo tabellone e cambio di stato.
 */
const m = vi.hoisted(() => ({
  elenco: null as ElencoUnita | null,
  mobile: false,
  cambia: vi.fn(),
  serie: vi.fn(),
  dividi: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => m.mobile }));
vi.mock("@/hooks/useCommesseGenerali", () => ({ messaggioGenerale: (_e: unknown, cosa: string) => `errore ${cosa}` }));
vi.mock("@/hooks/useGeneraleUnita", () => {
  const ferma = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useUnitaGenerale: () => ({ data: m.elenco, isLoading: false, isError: false, refetch: vi.fn() }),
    useCambiaStatoUnita: () => ({ mutate: m.cambia, isPending: false }),
    useCreaUnitaInSerie: () => ({ mutate: m.serie, isPending: false }),
    useDividiUnita: () => ({ mutate: m.dividi, isPending: false }),
    useSalvaUnita: ferma,
    useAggiungiMovimento: ferma,
    useEliminaMovimento: ferma,
  };
});
vi.mock("@/components/orders/generali/ScegliCliente", () => ({
  ScegliCliente: ({ id, valore, onCambia }: { id: string; valore: string | null; onCambia: (v: string | null) => void }) => (
    <select id={id} value={valore ?? ""} onChange={(e) => onCambia(e.target.value || null)}>
      <option value="">Cerca tra i clienti</option>
      <option value="cli-1">Mario Rossi</option>
    </select>
  ),
}));

import { modulo } from "@/components/orders/generali/moduli/UnitaScheda";
import { SchedaUnita } from "@/components/orders/generali/unita/SchedaUnita";
import { RiquadroUnita } from "@/components/orders/generali/unita/RiquadroUnita";

const mov = (tipo: MovimentoUnita["tipo"], importo: number): MovimentoUnita => ({ id: `${tipo}-${importo}`, tipo, importo, data: "2026-10-01", descrizione: null });
const unita = (sigla: string, over: Partial<UnitaGenerale> = {}): UnitaGenerale => ({
  orderId: `o-${sigla}`, codice: `O-${sigla}`, nome: sigla, scheda: true, id: `u-${sigla}`, sigla, edificio: null, piano: "1", tipologia: "Appartamento",
  mq: 100, millesimi: 250, listino: 300000, trattato: null, rogito: null, provvigione: null, stato: "libera",
  dataPrenotazione: null, dataCompromesso: null, rogitoPrevisto: null, dataRogito: null, acquirenteId: null, acquirente: null,
  agenzia: null, note: null, origineId: null, divisaIl: null, movimenti: [], importoCommessa: 300000, costoDiretto: 100000, ...over,
});

const elencoPieno = (): ElencoUnita => ({
  modello: "sviluppo",
  costiGenerale: 40000,
  permessi: { importi: true, costi: true, margini: true, modifica: true },
  unita: [
    unita("A1", { piano: "T" }),
    unita("A2", { piano: "1", stato: "compromesso", trattato: 290000, acquirenteId: "cli-1", acquirente: "Mario Rossi", movimenti: [mov("caparra", 30000), mov("acconto", 20000)] }),
    unita("A3", { piano: "1", stato: "rogitata", trattato: 310000, rogito: 310000, acquirente: "Anna Bianchi", movimenti: [mov("caparra", 30000), mov("saldo", 280000)] }),
    unita("A4", { piano: "2", stato: "prenotata", acquirente: "Luca Verdi" }),
  ],
});

const riepilogo = { generale: { id: "g", codice: "C-1", nome: "Residenza Via Roma", cliente: null, clienteId: null, modello: "sviluppo", creataIl: null, valore: null }, figlie: [], permessi: { importi: true, costi: true, margini: true } } as RiepilogoGenerale;
const totali = {} as TotaliGenerale;
const disegna = (puoModificare = true) => render(<MemoryRouter><SchedaUnita riepilogo={riepilogo} totali={totali} puoModificare={puoModificare} /></MemoryRouter>);
const casella = (sigla: string) => screen.getByRole("button", { name: new RegExp(`^${sigla},`) });

beforeEach(() => {
  m.elenco = elencoPieno();
  m.mobile = false;
  m.cambia.mockReset();
  m.serie.mockReset();
  m.dividi.mockReset();
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });
});
afterEach(cleanup);

describe("il modulo", () => {
  it("è pronto e compare anche da telefono, con il riquadro in Panoramica", () => {
    expect(modulo.pronto).toBe(true);
    expect(modulo.telefono).toBe(true);
    expect(modulo.titolo).toBe("Unità e vendite");
    expect(modulo.Riquadro).toBeDefined();
  });
});

describe("da computer", () => {
  it("il tabellone: caselle per stato, piani dall'alto, contatori e avviso delle garanzie", () => {
    disegna();
    expect(casella("A1")).toHaveAccessibleName("A1, Libera");
    expect(casella("A2")).toHaveAccessibleName("A2, Compromesso, Mario Rossi");
    const piani = screen.getAllByText(/° piano|Piano terra/).map((n) => n.textContent);
    expect(piani).toEqual(["2° piano", "1° piano", "Piano terra"]);
    const legenda = screen.getByRole("list", { name: "Unità per stato" });
    expect(within(legenda).getByText("Libere").nextSibling).toHaveTextContent("1");
    expect(screen.getByText(/Venduto 600\.000 € · incassato 360\.000 €/)).toBeVisible();
    expect(screen.getByRole("note")).toHaveTextContent(/su A2 ci sono somme versate prima del rogito \(50\.000 €\).*fideiussione.*polizza assicurativa decennale/);
    expect(screen.getByRole("button", { name: /Nuove unità in serie/ })).toBeVisible();
  });

  it("niente avviso delle garanzie per la compravendita", () => {
    m.elenco = { ...elencoPieno(), modello: "compravendita" };
    disegna();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("la tabella ha prezzi, pagato e margine con i costi comuni ripartiti", () => {
    disegna();
    fireEvent.click(screen.getByRole("radio", { name: "Tabella" }));
    const tabella = screen.getByRole("table");
    const a2 = within(tabella).getByRole("button", { name: "A2" }).closest("tr")!;
    // 290.000 − 100.000 di costi − 10.000 di costi comuni (40.000 per millesimi, 250 su 1000).
    expect(a2).toHaveTextContent("290.000 €");
    expect(a2).toHaveTextContent("50.000 €");
    expect(a2).toHaveTextContent("180.000 €");
    expect(within(tabella).getByText("Margine")).toBeVisible();
  });

  it("tocco una casella → scelgo il compromesso → chiede acquirente, prezzo e caparra", () => {
    disegna();
    fireEvent.click(casella("A1"));
    const finestra = screen.getByRole("dialog");
    fireEvent.click(within(finestra).getByRole("button", { name: "Compromesso" }));
    expect(within(finestra).getByLabelText("Acquirente")).toBeVisible();
    expect(within(finestra).getByLabelText("Prezzo del compromesso")).toHaveValue("300000");
    const conferma = within(finestra).getByRole("button", { name: "Segna il compromesso" });
    expect(conferma).toBeDisabled();
    fireEvent.change(within(finestra).getByLabelText("Acquirente"), { target: { value: "cli-1" } });
    fireEvent.change(within(finestra).getByLabelText("Prezzo del compromesso"), { target: { value: "285.000" } });
    fireEvent.change(within(finestra).getByLabelText(/Caparra/), { target: { value: "25.000" } });
    fireEvent.click(conferma);
    expect(m.cambia).toHaveBeenCalledWith(
      { orderId: "o-A1", stato: "compromesso", dati: expect.objectContaining({ acquirenteId: "cli-1", prezzo: 285000, caparra: 25000 }) },
      expect.anything(),
    );
    expect(within(finestra).getByRole("button", { name: /Dividi A1/ })).toBeVisible();
  });

  it("non si rimette in vendita un'unità con dei pagamenti", () => {
    disegna();
    fireEvent.click(casella("A2"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Libera" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("Su A2 ci sono pagamenti registrati");
  });

  it("nuove unità in serie: incollo da Excel, vedo gli errori, creo", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Nuove unità in serie/ }));
    const finestra = screen.getByRole("dialog");
    fireEvent.paste(within(finestra).getByLabelText("Sigla, riga 1"), {
      clipboardData: { getData: () => "Sigla\tPiano\tMq\tListino\nB1\tT\t80\t200.000\nB2\t1\t90,5\t230.000\nA1\t2\t70\t180.000" },
    });
    expect(within(finestra).getByLabelText("Sigla, riga 2")).toHaveValue("B2");
    expect(within(finestra).getByLabelText("m² comm., riga 2")).toHaveValue("90,5");
    expect(within(finestra).getByRole("alert")).toHaveTextContent("Riga 3: C'è già un'unità A1.");
    expect(within(finestra).getByRole("button", { name: "Crea 3 unità" })).toBeDisabled();
    fireEvent.change(within(finestra).getByLabelText("Sigla, riga 3"), { target: { value: "B3" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea 3 unità" }));
    expect(m.serie.mock.calls[0][0]).toEqual([
      { sigla: "B1", edificio: null, piano: "T", tipologia: null, mq_commerciali: 80, millesimi: null, prezzo_listino: 200000 },
      { sigla: "B2", edificio: null, piano: "1", tipologia: null, mq_commerciali: 90.5, millesimi: null, prezzo_listino: 230000 },
      { sigla: "B3", edificio: null, piano: "2", tipologia: null, mq_commerciali: 70, millesimi: null, prezzo_listino: 180000 },
    ]);
  });

  it("dividi: A1 → A1a + A1b con m² e millesimi ripartiti", () => {
    disegna();
    fireEvent.click(casella("A1"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Dividi A1/ }));
    const finestra = screen.getByRole("dialog", { name: "Dividi A1" });
    fireEvent.change(within(finestra).getByLabelText("m² della parte 1"), { target: { value: "60" } });
    expect(within(finestra).getByRole("alert")).toHaveTextContent("I m² delle parti (110) non tornano con quelli di A1 (100).");
    fireEvent.change(within(finestra).getByLabelText("m² della parte 2"), { target: { value: "40" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Dividi in 2" }));
    expect(m.dividi.mock.calls[0][0]).toEqual({
      orderId: "o-A1",
      parti: [
        { sigla: "A1a", tipologia: null, mq: 60, listino: 150000, millesimi: 150 },
        { sigla: "A1b", tipologia: null, mq: 40, listino: 150000, millesimi: 100 },
      ],
    });
  });

  it("senza permesso di modificare: si guarda e basta", () => {
    m.elenco = { ...elencoPieno(), permessi: { importi: true, costi: true, margini: true, modifica: false } };
    disegna(false);
    expect(screen.queryByRole("button", { name: /Nuove unità in serie/ })).toBeNull();
    fireEvent.click(casella("A1"));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Compromesso" })).toBeDisabled();
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: /Dividi/ })).toBeNull();
  });
});

describe("da telefono, a 375 px", () => {
  beforeEach(() => {
    m.mobile = true;
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 375 });
  });

  it("solo il tabellone: niente serie, niente tabella, niente importi in testa", () => {
    disegna(false);
    expect(casella("A1")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Nuove unità in serie/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Tabella" })).toBeNull();
    expect(screen.queryByText(/Venduto/)).toBeNull();
    // Le caselle stanno in una griglia da quattro: niente spazio vuoto a destra.
    expect(casella("A2").closest("ul")).toHaveClass("grid-cols-4");
    expect(screen.getByRole("note")).toHaveTextContent("Garanzie D.Lgs. 122/2005 per A2.");
  });

  it("si cambia lo stato confermando il prezzo che c'è; niente pagamenti, dati né divisione", () => {
    disegna(false);
    fireEvent.click(casella("A1"));
    const finestra = screen.getByRole("dialog");
    expect(within(finestra).queryByRole("tab")).toBeNull();
    expect(within(finestra).queryByRole("button", { name: /Dividi/ })).toBeNull();
    fireEvent.click(within(finestra).getByRole("button", { name: "Prenotata" }));
    expect(within(finestra).queryByLabelText(/Prezzo trattato/)).toBeNull();
    fireEvent.click(within(finestra).getByRole("button", { name: "Compromesso" }));
    expect(within(finestra).queryByLabelText(/Prezzo del compromesso/)).toBeNull();
    expect(within(finestra).getByText("Prezzo del compromesso: 300.000 €. Si cambia dal computer.")).toBeVisible();
    expect(within(finestra).queryByLabelText(/Rogito previsto/)).toBeNull();
    fireEvent.change(within(finestra).getByLabelText("Acquirente"), { target: { value: "cli-1" } });
    fireEvent.change(within(finestra).getByLabelText(/Caparra/), { target: { value: "10000" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Segna il compromesso" }));
    const [{ dati }] = m.cambia.mock.calls[0];
    expect(dati).toMatchObject({ acquirenteId: "cli-1", prezzo: null, caparra: 10000 });
    expect(dati.rogitoPrevisto).toBeUndefined();
  });
});

describe("il riquadro in Panoramica", () => {
  it("contatori per stato, venduto e incassato", () => {
    render(<MemoryRouter><RiquadroUnita riepilogo={riepilogo} totali={totali} puoModificare /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Vendite · 4 unità" })).toBeVisible();
    expect(screen.getByText("Rogitate").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Venduto").nextSibling).toHaveTextContent("600.000 €");
    expect(screen.getByText("Incassato").nextSibling).toHaveTextContent("360.000 €");
  });

  it("da telefono solo i contatori; senza unità non c'è", () => {
    m.mobile = true;
    const { unmount } = render(<MemoryRouter><RiquadroUnita riepilogo={riepilogo} totali={totali} puoModificare={false} /></MemoryRouter>);
    expect(screen.queryByText("Venduto")).toBeNull();
    unmount();
    m.elenco = { ...elencoPieno(), unita: [] };
    const { container } = render(<MemoryRouter><RiquadroUnita riepilogo={riepilogo} totali={totali} puoModificare={false} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
