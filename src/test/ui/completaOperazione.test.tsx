import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";
import { DA_STIMARE } from "@/lib/orders/generali/budgetCompletezza";
import type { UnitaDalPiano } from "@/lib/orders/generali/unitaDalPiano";

/**
 * «Completa l'operazione» in Panoramica (14/11/2026): un'operazione appena nata da un business
 * plan ha un percorso solo — unità, mesi, stime, approvazione — invece di tre avvisi sparsi.
 */
const m = vi.hoisted(() => ({ numeri: null as unknown, telefono: false, fonti: [] as unknown[] }));
vi.mock("@/hooks/useGeneralePiano", () => ({ useGeneralePianoNumeri: () => m.numeri }));
vi.mock("@/hooks/useGeneraleInvestitori", () => ({ useFontiGenerale: () => ({ data: m.fonti, isLoading: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => m.telefono }));

import { AvvisiPiano } from "@/components/orders/generali/design/AvvisiPiano";

let n = 0;
const voce = (v: Partial<VocePiano>): VocePiano => ({
  id: `v${++n}`, tipo: "costo", categoria: "costruzione", descrizione: `Voce ${n}`, importo: 1000, mese: "2027-01", durataMesi: 1,
  figliaId: null, categorieCosto: [], aFinire: null, nota: null, ordine: n * 10, origineId: null, ...v,
});
const riepilogo = (figlie = 0) => ({
  generale: { id: "g", modello: "sviluppo" },
  figlie: Array.from({ length: figlie }, (_, i) => ({ id: `f${i}` })),
  permessi: { importi: true, costi: true, margini: true },
}) as unknown as RiepilogoGenerale;
const numeri = (voci: VocePiano[], stato: "bozza" | "approvata" = "bozza") => ({
  isLoading: false, isError: false, vuoto: false, voci,
  inVista: { id: "b", stato }, approvata: stato === "approvata" ? { id: "b", stato } : null,
  piano: { budgetCompleto: !voci.some((v) => (v.nota ?? "").includes(DA_STIMARE)), confronto: { totali: { margine: { scostamento: 0 } } } },
});
const dalPiano = { composizione: "7 unità, 16 posti auto", righe: [], vendite: 23, valore: 1 } as unknown as UnitaDalPiano;

function Indirizzo() {
  const l = useLocation();
  return <output data-testid="indirizzo">{l.search}</output>;
}
const disegna = (r: RiepilogoGenerale, unita: UnitaDalPiano | null = dalPiano) =>
  render(
    <MemoryRouter initialEntries={["/?g=O-0002"]}>
      <AvvisiPiano riepilogo={r} dalPiano={unita} puoModificare />
      <Indirizzo />
    </MemoryRouter>,
  );

beforeEach(() => { n = 0; m.telefono = false; m.fonti = [{ id: "f1" }]; });
afterEach(cleanup);

describe("completa l'operazione", () => {
  it("cinque passi nell'ordine del titolare, il primo da fare in evidenza", () => {
    m.numeri = numeri([voce({ mese: null }), voce({ mese: null }), voce({ importo: 0, mese: null, nota: DA_STIMARE })]);
    disegna(riepilogo());
    const passi = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(passi.map((p) => p.querySelector("p")?.textContent?.replace(/: da fare|: fatto/, ""))).toEqual([
      "Cosa vendi", "Quando entrano ed escono i soldi", "Le stime che mancano", "Il budget di riferimento", "Da dove arrivano i soldi",
    ]);
    expect(passi[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/7 unità, 16 posti auto/)).toBeInTheDocument();
    expect(screen.getByText(/2 voci non hanno il mese/)).toBeInTheDocument();
    expect(screen.getByText(/1 voce è ancora da stimare/)).toBeInTheDocument();
    expect(screen.getByText("1 di 5")).toBeInTheDocument();
  });

  it("ogni azione porta dove si fa la cosa", () => {
    m.numeri = numeri([voce({ mese: null }), voce({ importo: 0, nota: DA_STIMARE })]);
    disegna(riepilogo());
    fireEvent.click(screen.getByRole("button", { name: /Crea le unità dal piano/ }));
    expect(screen.getByTestId("indirizzo").textContent).toContain("scheda=unita");
    expect(screen.getByTestId("indirizzo").textContent).toContain("dal-piano=1");
    fireEvent.click(screen.getByRole("button", { name: /Metti i mesi/ }));
    expect(screen.getByTestId("indirizzo").textContent).toMatch(/scheda=piano.*calendario=1/);
    fireEvent.click(screen.getByRole("button", { name: /Completa le stime/ }));
    expect(screen.getByTestId("indirizzo").textContent).toContain("stime=1");
  });

  it("i passi fatti si spuntano; a lavoro finito il percorso sparisce", () => {
    m.numeri = numeri([voce({}), voce({ mese: null })]);
    disegna(riepilogo(3), null);
    expect(within(screen.getByRole("list")).getAllByRole("listitem")[0]).toHaveTextContent("Cosa vendi: fatto");
    expect(screen.getByText("3 unità create.")).toBeInTheDocument();
    expect(screen.getByText("3 di 5")).toBeInTheDocument();
    cleanup();
    m.numeri = numeri([voce({})], "approvata");
    const { container } = disegna(riepilogo(3), null);
    expect(container.querySelector("#completa-operazione")).toBeNull();
  });

  it("al telefono dice cosa manca, senza azioni (il piano lì non si modifica)", () => {
    m.telefono = true;
    m.numeri = numeri([voce({ mese: null })]);
    disegna(riepilogo());
    expect(screen.getByText(/1 voce non ha il mese/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Metti i mesi/ })).not.toBeInTheDocument();
  });
});

describe("da dove arrivano i soldi", () => {
  it("senza fonti è il quinto passo, con l'azione verso Investitori", () => {
    m.fonti = [];
    m.numeri = numeri([voce({})], "approvata");
    disegna(riepilogo(3), null);
    const passi = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(passi).toHaveLength(5);
    expect(passi[4]).toHaveTextContent("Da dove arrivano i soldi: da fare");
    fireEvent.click(screen.getByRole("button", { name: /Indica le fonti/ }));
    expect(screen.getByTestId("indirizzo").textContent).toContain("scheda=investitori");
  });
});
