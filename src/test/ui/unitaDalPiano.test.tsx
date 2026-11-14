import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElencoUnita } from "@/lib/orders/generali/unita";
import type { RiepilogoGenerale, TotaliGenerale } from "@/lib/orders/commesseGenerali";
import { unitaDalPiano, type UnitaDalPiano } from "@/lib/orders/generali/unitaDalPiano";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";

/**
 * Unità dalle vendite del piano (14/11/2026, URBAN VISION). Un'operazione appena nata da un
 * business plan ha già nel piano cosa si vende: la scheda Unità vuota lo propone, la finestra
 * delle unità in serie si apre già compilata e si conferma dopo averla controllata.
 */
const m = vi.hoisted(() => ({
  elenco: null as ElencoUnita | null,
  dalPiano: null as UnitaDalPiano | null,
  serie: vi.fn(),
}));
vi.mock("@/hooks/useUnitaDalPiano", () => ({ useUnitaDalPiano: () => m.dalPiano }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useCommesseGenerali", () => ({ messaggioGenerale: (_e: unknown, cosa: string) => `errore ${cosa}`, useCriterioRipartizione: () => ({ data: { criterio: "auto", disponibile: false } }) }));
vi.mock("@/hooks/useGeneraleFatture", () => ({ useFattureGenerale: () => ({ data: undefined as undefined }) }));
vi.mock("@/hooks/useGeneraleUnita", () => {
  const ferma = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useUnitaGenerale: () => ({ data: m.elenco, isLoading: false, isError: false, refetch: vi.fn() }),
    useCreaUnitaInSerie: () => ({ mutate: m.serie, isPending: false }),
    useCambiaStatoUnita: ferma, useDividiUnita: ferma, useSalvaUnita: ferma, useAggiungiMovimento: ferma, useEliminaMovimento: ferma,
  };
});
vi.mock("@/components/orders/generali/vendita/BottoneListino", () => ({ BottoneListino: () => <button type="button">Listino</button> }));

import { SchedaUnita } from "@/components/orders/generali/unita/SchedaUnita";

let ordine = 0;
const vendita = (descrizione: string, importo: number): VocePiano => ({
  id: `v${++ordine}`, tipo: "ricavo", categoria: "vendite", descrizione, importo, mese: null, durataMesi: 1,
  figliaId: null, categorieCosto: [], aFinire: null, nota: null, ordine: ordine * 10, origineId: null,
});
const vuoto = (): ElencoUnita => ({ modello: "sviluppo", costiGenerale: 0, permessi: { importi: true, costi: true, margini: true, modifica: true }, unita: [] });
const riepilogo = { generale: { id: "g", codice: "O-0002", nome: "Via Callimaco 28", cliente: null, clienteId: null, modello: "sviluppo", creataIl: null, valore: 2_496_000 }, figlie: [], permessi: { importi: true, costi: true, margini: true } } as RiepilogoGenerale;
const disegna = (indirizzo = "/") => render(
  <MemoryRouter initialEntries={[indirizzo]}>
    <SchedaUnita riepilogo={riepilogo} totali={{} as TotaliGenerale} puoModificare />
  </MemoryRouter>,
);

beforeEach(() => {
  ordine = 0;
  m.elenco = vuoto();
  m.dalPiano = unitaDalPiano([vendita("Unità 1", 365_000), vendita("Unità 2", 300_000), vendita("Posto auto 1", 12_000)], []);
  m.serie.mockReset();
});
afterEach(cleanup);

describe("unità dalle vendite del piano", () => {
  it("la scheda vuota dice cosa elenca il piano e offre le due partenze, senza sceglierne una", () => {
    disegna();
    expect(screen.getByText("2 unità, 1 posto auto")).toBeInTheDocument();
    expect(screen.getByText(/677\.000/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crea dalle vendite del piano/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Scrivi a mano/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("la finestra si apre già compilata, con il totale del listino da confrontare col piano, e crea le unità", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Crea dalle vendite del piano/ }));
    const finestra = screen.getByRole("dialog");
    expect(within(finestra).getByText("Unità dalle vendite del piano")).toBeInTheDocument();
    expect(within(finestra).getByLabelText("Sigla, riga 1")).toHaveValue("Unità 1");
    expect(within(finestra).getByLabelText("Tipologia, riga 3")).toHaveValue("Posto auto");
    expect(within(finestra).getByLabelText("Listino €, riga 2")).toHaveValue("300.000");
    // Partendo dal piano non c'è «Prepara righe», che cancellerebbe le sigle.
    expect(within(finestra).queryByRole("button", { name: /Prepara/ })).not.toBeInTheDocument();
    expect(within(finestra).getByText(/677\.000 €/)).toBeInTheDocument();

    // Si corregge prima di confermare: una riga si toglie.
    fireEvent.click(within(finestra).getByRole("button", { name: "Togli la riga 3" }));
    fireEvent.click(within(finestra).getByRole("button", { name: "Crea 2 unità" }));
    expect(m.serie).toHaveBeenCalledOnce();
    expect(m.serie.mock.calls[0][0]).toEqual([
      expect.objectContaining({ sigla: "Unità 1", prezzo_listino: 365_000 }),
      expect.objectContaining({ sigla: "Unità 2", prezzo_listino: 300_000 }),
    ]);
  });

  it("«Scrivi a mano» apre la serie vuota di sempre", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Scrivi a mano/ }));
    const finestra = screen.getByRole("dialog");
    expect(within(finestra).getByText("Nuove unità in serie")).toBeInTheDocument();
    expect(within(finestra).getByLabelText("Sigla, riga 1")).toHaveValue("");
  });

  it("arrivando dalla panoramica (?dal-piano=1) la finestra è già aperta e compilata", () => {
    disegna("/?scheda=unita&dal-piano=1");
    expect(within(screen.getByRole("dialog")).getByLabelText("Sigla, riga 1")).toHaveValue("Unità 1");
  });

  it("senza vendite nel piano resta la scheda di sempre", () => {
    m.dalPiano = null;
    disegna();
    expect(screen.queryByRole("button", { name: /Crea dalle vendite del piano/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nuove unità in serie/ })).toBeInTheDocument();
  });

  it("chi non può modificare non vede le partenze", () => {
    render(<MemoryRouter><SchedaUnita riepilogo={riepilogo} totali={{} as TotaliGenerale} puoModificare={false} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /Crea dalle vendite del piano/ })).not.toBeInTheDocument();
  });
});
