import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SottofasiRapportino } from "@/components/campo/SottofasiRapportino";
import type { Sottofase } from "@/lib/orders/sottofasi";

const sf = (id: string, extra: Partial<Sottofase> = {}): Sottofase => ({ id, phase_id: "f", name: `Lavorazione ${id}`, position: 0, peso: 1, fatta: false, fatta_il: null, percentuale: 0, ...extra });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Sottofasi nel rapportino", () => {
  const azioni = { onSpunta: vi.fn(), onLavorata: vi.fn(), onAvanzata: vi.fn() };
  it("con la quantità nota chiede quanto si è fatto oggi", () => {
    render(<SottofasiRapportino nomeFase="F" sottofasi={[sf("a")]} spunte={[]} lavorate={["a"]} quantitaDi={new Map([["a", { quantita: 306, unita: "mq" }]])} {...azioni} />);
    fireEvent.change(screen.getByLabelText("Lavorazione a: quantità fatta oggi"), { target: { value: "76,5".replace(",", ".") } });
    expect(azioni.onAvanzata).toHaveBeenCalledExactlyOnceWith("a", { quantita: 76.5 });
    expect(screen.getByText(/su 306 mq/)).toBeInTheDocument();
  });
  it("mostra la percentuale che avrà la sottofase, sommando a quanto già fatto", () => {
    render(<SottofasiRapportino nomeFase="F" sottofasi={[sf("a", { percentuale: 25, quantita_fatta: 76.5 })]} spunte={[]} lavorate={["a"]} avanzate={{ a: { quantita: 76.5 } }} quantitaDi={new Map([["a", { quantita: 306, unita: "mq" }]])} {...azioni} />);
    expect(within(screen.getByRole("list")).getByText("50%")).toBeInTheDocument();
  });
  it("senza quantità si sceglie a che punto è, e non si torna indietro", () => {
    render(<SottofasiRapportino nomeFase="F" sottofasi={[sf("a", { percentuale: 50 })]} spunte={[]} lavorate={["a"]} {...azioni} />);
    const scelta = within(screen.getByRole("group", { name: "Lavorazione a: a che punto è" }));
    expect(scelta.getByRole("button", { name: "25%" })).toBeDisabled();
    fireEvent.click(scelta.getByRole("button", { name: "75%" }));
    expect(azioni.onAvanzata).toHaveBeenCalledExactlyOnceWith("a", { percentuale: 75 });
  });
  it("con tante sottofasi parte da quelle da fare, e si cerca", () => {
    const tante = [...Array.from({ length: 9 }, (_, i) => sf(`d${i}`)), sf("fatta", { fatta: true })];
    render(<SottofasiRapportino nomeFase="F" sottofasi={tante} spunte={[]} {...azioni} />);
    expect(screen.queryByText("Lavorazione fatta")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostra anche le fatte (1)" }));
    expect(screen.getByText("Lavorazione fatta")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cerca nelle sottofasi di F"), { target: { value: "d3" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
  it("«Finita» toglie la quantità scritta: non contano due volte", () => {
    render(<SottofasiRapportino nomeFase="F" sottofasi={[sf("a")]} spunte={[]} lavorate={["a"]} avanzate={{ a: { percentuale: 50 } }} {...azioni} />);
    fireEvent.click(screen.getByRole("button", { name: "Lavorazione a: finita" }));
    expect(azioni.onSpunta).toHaveBeenCalledWith("a", true);
    expect(azioni.onLavorata).toHaveBeenCalledWith("a", false);
    expect(azioni.onAvanzata).toHaveBeenCalledWith("a", null);
  });
});
