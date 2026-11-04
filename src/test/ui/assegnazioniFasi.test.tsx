import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AssegnazioniFasi, faseDaAssegnare, type FaseAssegnazioni } from "@/components/orders/AssegnazioniFasi";
import { testoEsitoAssegnazione } from "@/hooks/useAssegnaAlleFasi";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const fasi: FaseAssegnazioni[] = [
  { id: "f1", nome: "Strutture", percentuale: 10, squadre: ["Squadra A"], persone: [], ditte: [], mezzi: ["Gru"], articoli: 4 },
  { id: "f2", nome: "Murature", percentuale: 0, squadre: [], persone: [], ditte: [], mezzi: [], articoli: 0 },
  { id: "f3", nome: "Finita", percentuale: 100, squadre: [], persone: [], ditte: [], mezzi: [], articoli: 0 },
];
const azioni = { onAssegna: vi.fn(), onApriScheda: vi.fn() };
const mostra = (extra: Partial<React.ComponentProps<typeof AssegnazioniFasi>> = {}) => render(
  <AssegnazioniFasi fasi={fasi} squadre={[{ id: "s1", nome: "Squadra A" }]} persone={[{ id: "p1", nome: "Mario Rossi" }]} ditte={[{ id: "d1", nome: "Impianti Srl" }]}
    puoSquadre puoPersoneDitte articoliSenzaFase={2} inCorso={false} {...azioni} {...extra} />,
);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Assegnazioni delle fasi", () => {
  it("una fase finita non resta da assegnare", () => {
    expect(fasi.map(faseDaAssegnare)).toEqual([false, true, false]);
  });
  it("mostra chi lavora, i mezzi, gli articoli e quelli senza fase", () => {
    mostra();
    expect(screen.getAllByText("Squadra A").length).toBeGreaterThan(0);
    expect(screen.getByText("Gru")).toBeInTheDocument();
    expect(screen.getByText("2 articoli senza fase")).toBeInTheDocument();
  });
  it("il filtro lascia solo le fasi senza nessuno", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: /Da assegnare/ }));
    expect(screen.getByRole("button", { name: "Murature" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Strutture" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Finita" })).toBeNull();
  });
  it("assegna in una volta sola alle fasi scelte", () => {
    mostra();
    expect(screen.getByRole("button", { name: "Scegli le fasi" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Strutture" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Murature" }));
    fireEvent.click(screen.getByRole("button", { name: "Assegna a 2 fasi" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByRole("button", { name: "Assegna" })).toBeDisabled();
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: "Squadra A" }));
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: "Impianti Srl" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Assegna" }));
    expect(azioni.onAssegna).toHaveBeenCalledOnce();
    expect(azioni.onAssegna.mock.calls[0][0]).toEqual({ fasi: ["f1", "f2"], squadre: ["s1"], persone: [], ditte: ["d1"] });
  });
  it("cerca tra i nomi", () => {
    mostra();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Murature" }));
    fireEvent.click(screen.getByRole("button", { name: "Assegna a 1 fase" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Cerca tra squadre, persone e ditte"), { target: { value: "mario" } });
    expect(within(dialogo).getByRole("checkbox", { name: "Mario Rossi" })).toBeInTheDocument();
    expect(within(dialogo).queryByRole("checkbox", { name: "Impianti Srl" })).toBeNull();
  });
  it("chi può solo le squadre non vede persone e ditte", () => {
    mostra({ puoPersoneDitte: false });
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Murature" }));
    fireEvent.click(screen.getByRole("button", { name: "Assegna a 1 fase" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByRole("checkbox", { name: "Squadra A" })).toBeInTheDocument();
    expect(within(dialogo).queryByRole("checkbox", { name: "Mario Rossi" })).toBeNull();
  });
  it("in sola lettura non si sceglie e non si assegna", () => {
    mostra({ puoSquadre: false, puoPersoneDitte: false });
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Scegli le fasi/ })).toBeNull();
  });
  it("il nome della fase apre la sua scheda", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Strutture" }));
    expect(azioni.onApriScheda).toHaveBeenCalledExactlyOnceWith("f1");
  });
  it("dice quanto ha aggiunto e cosa c'era già", () => {
    expect(testoEsitoAssegnazione({ squadre: 2, persone: 0, ditte: 1, gia_assegnate: 3 })).toBe("Assegnate: 2 squadre, 1 ditta · 3 c'erano già");
    expect(testoEsitoAssegnazione({ squadre: 0, persone: 0, ditte: 0, gia_assegnate: 0 })).toBe("Nessuna nuova assegnazione");
  });
});
