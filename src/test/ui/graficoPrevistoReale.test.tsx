import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

/** «Previsto contro reale» (14/11/2026): costi, ricavi e margine, previsto e reale a confronto. */
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
const voce = (tipo: "costo" | "ricavo", importo: number, mese: string, nota: string | null = null) => ({
  id: `${tipo}${mese}${importo}`, tipo, categoria: tipo === "costo" ? "terreno" : "vendite", descrizione: "x", importo, mese, durataMesi: 1,
  figliaId: null as string | null, categorieCosto: [] as string[], aFinire: null as number | null, nota, ordine: 1, origineId: null as string | null,
});
const reale = (tipo: "costo" | "ricavo", importo: number, data: string) => ({
  id: `r${tipo}${data}`, fonte: "x", rifId: null as string | null, orderId: "g", data, tipo, chiave: "terreno", categoria: null as string | null, descrizione: "x", importo, voceId: null as string | null,
});
vi.mock("@/hooks/useGeneralePiano", () => ({
  useGeneralePianoNumeri: () => ({
    isLoading: false,
    isError: false,
    voci: [voce("costo", 300, "2026-10"), voce("costo", 600, "2026-12"), voce("ricavo", 1000, "2027-01"), voce("costo", 0, "2027-01", "[EIC:DA_STIMARE]")],
    reale: { oggi: "2026-11-14", permessi: { costi: true, importi: true }, righe: [reale("costo", 350, "2026-11-02"), reale("ricavo", 80, "2026-11-20")], incassi: [] as unknown[], categorie: [] as unknown[] },
  }),
}));
import { GraficoSpesa } from "@/components/orders/generali/design/GraficoSpesa";

const riepilogo = (permessi = { costi: true, importi: true, margini: true }) => ({ generale: { id: "g" }, figlie: [], permessi }) as unknown as RiepilogoGenerale;
const disegna = (r = riepilogo()) => render(<MemoryRouter><GraficoSpesa riepilogo={r} /></MemoryRouter>);
afterEach(cleanup);

describe("previsto contro reale", () => {
  it("tre schede: costi sopra il piano in rosso, ricavi sopra in verde, margine col segno", () => {
    disegna();
    const schede = within(screen.getByRole("list", { name: "Previsto e reale per misura" })).getAllByRole("button");
    expect(schede.map((s) => s.getAttribute("aria-label"))).toEqual(["Mostra costi nel grafico", "Mostra ricavi nel grafico", "Mostra margine nel grafico"]);
    expect(within(schede[0]).getByText(/\+50/)).toHaveClass("text-red-600");
    expect(within(schede[1]).getByText(/\+80/)).toHaveClass("text-emerald-600");
    expect(within(schede[2]).getByText(/−270/)).toBeInTheDocument();
    expect(within(schede[2]).getByText(/\+100/)).toBeInTheDocument();
  });

  it("la scheda o il bottone cambiano il grafico, e il margine avvisa delle stime mancanti", () => {
    disegna();
    expect(screen.getByText(/^spesi a /)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostra ricavi nel grafico" }));
    expect(screen.getByText(/^ottenuti a /)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("group", { name: "Misura del grafico" })).getByRole("button", { name: "Margine" }));
    expect(screen.getByText(/il margine previsto è più alto del vero/)).toBeInTheDocument();
    expect(screen.getByText("Margine a fine lavori")).toBeInTheDocument();
  });

  it("chi non vede i margini non ha la misura margine", () => {
    disegna(riepilogo({ costi: true, importi: true, margini: false }));
    expect(screen.queryByRole("button", { name: "Margine" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Mostra/ })).toHaveLength(2);
  });
});
