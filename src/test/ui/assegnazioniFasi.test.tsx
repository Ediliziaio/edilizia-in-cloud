import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DialogAssegna } from "@/components/orders/AssegnazioniFasi";
import { testoEsitoAssegnazione } from "@/hooks/useAssegnaAlleFasi";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const azioni = { onAssegna: vi.fn(), onChiudi: vi.fn() };
const mostra = (extra: Partial<React.ComponentProps<typeof DialogAssegna>> = {}) => render(
  <DialogAssegna fasi={["Strutture", "Murature"]} squadre={[{ id: "s1", nome: "Squadra A" }]} persone={[{ id: "p1", nome: "Mario Rossi" }]} ditte={[{ id: "d1", nome: "Impianti Srl" }]}
    puoSquadre puoPersoneDitte inCorso={false} {...azioni} {...extra} />,
);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Assegnazione alle fasi", () => {
  it("consegna tutte le scelte insieme", () => {
    mostra();
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByRole("button", { name: "Assegna" })).toBeDisabled();
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: "Squadra A" }));
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: "Impianti Srl" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Assegna" }));
    expect(azioni.onAssegna.mock.calls[0][0]).toEqual({ squadre: ["s1"], persone: [], ditte: ["d1"] });
  });
  it("cerca tra i nomi", () => {
    mostra();
    fireEvent.change(screen.getByLabelText("Cerca tra squadre, persone e ditte"), { target: { value: "mario" } });
    expect(screen.getByRole("checkbox", { name: "Mario Rossi" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Impianti Srl" })).toBeNull();
  });
  it("chi può solo le squadre non vede persone e ditte", () => {
    mostra({ puoPersoneDitte: false });
    expect(screen.getByRole("checkbox", { name: "Squadra A" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Mario Rossi" })).toBeNull();
  });
  it("durante il salvataggio non si conferma due volte", () => {
    mostra({ inCorso: true });
    expect(screen.getByRole("button", { name: "Assegna" })).toBeDisabled();
  });
  it("chiusa non mostra niente", () => {
    mostra({ fasi: null });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("dice quanto ha aggiunto e cosa c'era già", () => {
    expect(testoEsitoAssegnazione({ squadre: 2, persone: 0, ditte: 1, gia_assegnate: 3 })).toBe("Assegnate: 2 squadre, 1 ditta · 3 c'erano già");
    expect(testoEsitoAssegnazione({ squadre: 0, persone: 0, ditte: 0, gia_assegnate: 0 })).toBe("Nessuna nuova assegnazione");
  });
});
