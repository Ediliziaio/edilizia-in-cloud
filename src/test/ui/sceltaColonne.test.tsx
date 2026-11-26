/**
 * Il pannellino «Colonne» cliccato per davvero (26/11/2026).
 *
 * La logica ha già il suo test (`src/test/logic/colonneTabella.test.ts`). Qui si controlla
 * la parte che un test di logica non vede: che la spunta tolga davvero la colonna dalla
 * tabella, che le frecce la spostino, che la colonna fissa non si lasci spegnere e che la
 * scelta sopravviva a un ricaricamento della pagina — cioè che finisca nel localStorage e
 * venga riletta.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-1" }, user: { id: "utente-1" } }),
}));

import { SceltaColonne } from "@/components/tabelle/SceltaColonne";
import { useColonneTabella } from "@/hooks/useColonneTabella";
import type { ColonnaTabella } from "@/lib/tabelle/colonneTabella";

const DEF: ColonnaTabella[] = [
  { chiave: "numero", etichetta: "Numero", fissa: true, ancorata: "inizio" },
  { chiave: "cliente", etichetta: "Cliente" },
  // Fissa ma non ancorata: nel pannellino c'è, con la spunta bloccata.
  { chiave: "stato", etichetta: "Stato", fissa: true },
  { chiave: "totale", etichetta: "Totale" },
  { chiave: "cig", etichetta: "CIG", spentaDiSerie: true },
];

/** Una tabella finta che disegna solo le intestazioni: basta per vedere cosa c'è e in che ordine. */
function Tabella() {
  const colonne = useColonneTabella("prova", DEF);
  return (
    <div>
      <SceltaColonne colonne={colonne} />
      <table>
        <thead>
          <tr>
            {colonne.colonne.map((c) => (
              <th key={c.chiave}>{c.etichetta}</th>
            ))}
          </tr>
        </thead>
      </table>
    </div>
  );
}

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
Element.prototype.scrollIntoView ??= () => {};

const intestazioni = () => screen.getAllByRole("columnheader").map((th) => th.textContent);
const apri = () => fireEvent.click(screen.getByRole("button", { name: /Colonne/ }));

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe("il pannellino delle colonne", () => {
  it("di serie mostra le colonne dichiarate, tranne quelle spente di serie", () => {
    render(<Tabella />);
    expect(intestazioni()).toEqual(["Numero", "Cliente", "Stato", "Totale"]);
  });

  it("togliendo la spunta la colonna sparisce dalla tabella", () => {
    render(<Tabella />);
    apri();
    fireEvent.click(screen.getByLabelText("Cliente"));
    expect(intestazioni()).toEqual(["Numero", "Stato", "Totale"]);
  });

  it("mettendo la spunta a una spenta di serie, compare al suo posto", () => {
    render(<Tabella />);
    apri();
    fireEvent.click(screen.getByLabelText("CIG"));
    expect(intestazioni()).toEqual(["Numero", "Cliente", "Stato", "Totale", "CIG"]);
  });

  it("la colonna fissa non si lascia spegnere", () => {
    render(<Tabella />);
    apri();
    const fissa = screen.getByLabelText("Stato");
    expect(fissa).toBeDisabled();
    fireEvent.click(fissa);
    expect(intestazioni()).toContain("Stato");
  });

  it("la freccia sposta la colonna", () => {
    render(<Tabella />);
    apri();
    fireEvent.click(screen.getByRole("button", { name: /Sposta Totale a sinistra/ }));
    expect(intestazioni()).toEqual(["Numero", "Cliente", "Totale", "Stato"]);
  });

  it("le ancorate non compaiono nel riordino: niente frecce per Numero", () => {
    render(<Tabella />);
    apri();
    expect(screen.queryByRole("button", { name: /Sposta Numero/ })).toBeNull();
  });

  it("la scelta resta dopo un ricaricamento", () => {
    const primo = render(<Tabella />);
    apri();
    fireEvent.click(screen.getByLabelText("Cliente"));
    fireEvent.click(screen.getByRole("button", { name: /Sposta Totale a sinistra/ }));
    const prima = intestazioni();
    primo.unmount();

    render(<Tabella />);
    expect(intestazioni()).toEqual(prima);
    expect(intestazioni()).not.toContain("Cliente");
  });

  it("«Predefinite» compare solo dopo una modifica, e rimette tutto a posto", () => {
    render(<Tabella />);
    apri();
    expect(screen.queryByRole("button", { name: "Predefinite" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Cliente"));
    fireEvent.click(screen.getByRole("button", { name: "Predefinite" }));
    expect(intestazioni()).toEqual(["Numero", "Cliente", "Stato", "Totale"]);
  });

  it("conta le colonne nascoste sul pulsante", () => {
    render(<Tabella />);
    apri();
    fireEvent.click(screen.getByLabelText("Cliente"));
    // Cliente spenta a mano + CIG spenta di serie.
    expect(screen.getByRole("button", { name: /Colonne/ }).textContent).toContain("2");
  });
});
