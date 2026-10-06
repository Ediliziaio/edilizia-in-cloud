import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TempiFase, ilGiorno, testoTempi } from "@/components/orders/TempiFase";
import { fasiCronoprogramma, type FaseInput } from "@/lib/orders/cronoprogramma";

/**
 * Riga «Quando» della fase (06/10/2026): di lato alle date il paragone tra i
 * giorni previsti e quelli che ci sono voluti, quando è finita davvero e di
 * quanto si è sforato.
 */

const oggi = "2026-10-06";
const fase = (extra: Partial<FaseInput>, reale?: { primo: string; ultimo: string }) =>
  fasiCronoprogramma(
    [{ id: "f1", name: "Tinteggiature", status: "da_iniziare", percentuale: 0, start_date: "2026-07-30", end_date: "2026-08-05", completata_il: null, ...extra }],
    new Map(reale ? [["f1", { ...reale, ore: 8, rapportini: 1 }]] : []),
    oggi,
  )[0];

afterEach(cleanup);

describe("tempi della fase in parole", () => {
  it("chiusa tardi: previsti contro reali, il giorno in cui è finita, il ritardo", () => {
    const f = fase({ status: "completata", start_date: "2026-06-02", end_date: "2026-06-08", completata_il: "2026-06-14" }, { primo: "2026-06-03", ultimo: "2026-06-13" });
    expect(testoTempi(f, oggi)).toEqual({
      lungo: "Previsti 7 giorni → reali 12 · finita il 14/06 · 6 giorni di ritardo",
      breve: "finita con 6 giorni di ritardo",
      tono: "rosso",
    });
  });

  it("chiusa in tempo, con l'articolo giusto davanti alla data", () => {
    const f = fase({ status: "completata", start_date: "2026-06-02", end_date: "2026-06-08", completata_il: "2026-06-08" }, { primo: "2026-06-02", ultimo: "2026-06-08" });
    expect(testoTempi(f, oggi)).toMatchObject({ lungo: "Previsti 7 giorni → reali 7 · finita l'08/06, in tempo", breve: null, tono: "verde" });
    expect(ilGiorno("2026-06-11")).toBe("l'11/06");
    expect(ilGiorno("2026-06-01")).toBe("il 01/06");
  });

  it("aperta oltre la fine: da quanti giorni, quando doveva finire, di quanto sfora", () => {
    expect(testoTempi(fase({ status: "in_corso", percentuale: 50 }, { primo: "2026-08-04", ultimo: "2026-08-20" }), oggi)).toMatchObject({
      lungo: "Previsti 7 giorni → aperta da 64 · doveva finire il 05/08 · 62 giorni di ritardo",
      breve: "62 giorni di ritardo",
    });
    // in corso senza rapportini: i giorni reali non si sanno
    expect(testoTempi(fase({ status: "in_corso", percentuale: 50 }), oggi)?.lungo).toBe("Previsti 7 giorni · doveva finire il 05/08 · 62 giorni di ritardo");
    expect(testoTempi(fase({}), oggi)?.lungo).toBe("Non ancora iniziata · doveva finire il 05/08 · 62 giorni di ritardo");
  });

  it("in corso nei tempi: quanti giorni mancano, e in ambra se è partita tardi", () => {
    const f = fase({ status: "in_corso", start_date: "2026-10-01", end_date: "2026-10-10" }, { primo: "2026-10-03", ultimo: "2026-10-05" });
    expect(testoTempi(f, oggi)).toEqual({
      lungo: "Previsti 10 giorni → in corso da 4 · mancano 4 giorni · partita con 2 giorni di ritardo",
      breve: null,
      tono: "ambra",
    });
  });

  it("chiusa senza date reali lo dice; da iniziare nei tempi dice solo i giorni previsti", () => {
    expect(testoTempi(fase({ status: "completata", percentuale: 100 }), oggi)?.lungo).toBe("Previsti 7 giorni · fine reale non registrata");
    expect(testoTempi(fase({ start_date: "2026-10-12", end_date: "2026-10-20" }), oggi)).toEqual({ lungo: "Previsti 9 giorni", breve: null, tono: "neutro" });
    expect(testoTempi(fase({ start_date: null, end_date: null }), oggi)).toBeNull();
  });
});

describe("accanto alle date", () => {
  it("la versione lunga per lo schermo grande, la breve per il telefono", () => {
    render(<TempiFase fase={fase({ status: "in_corso", percentuale: 50 })} oggi={oggi} />);
    const tempi = screen.getByTestId("tempi-f1");
    expect(tempi).toHaveTextContent("Previsti 7 giorni · doveva finire il 05/08 · 62 giorni di ritardo");
    expect(screen.getByText("62 giorni di ritardo", { selector: ".sm\\:hidden" })).toBeInTheDocument();
  });
});
