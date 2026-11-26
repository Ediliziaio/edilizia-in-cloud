/**
 * I filtri di un elenco restano dove li hai lasciati (26/11/2026).
 *
 * «Cerchiamo le fatture di un fornitore, entriamo in una fattura, usciamo e la ricerca è
 * sparita.» Qui si prova il pezzo che lo sistema: i filtri vanno nell'indirizzo mentre uno
 * li cambia — così il tasto indietro li ritrova — e vengono ricordati per questa sessione,
 * così li ritrova anche chi torna all'elenco dal menu, con l'indirizzo nudo.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, effectiveCompany: { id: "az1" } }),
}));

import { useFiltriUrl } from "@/hooks/useFiltriUrl";

const PREDEFINITI = { cerca: "", stato: "all", fornitore: "all" };

function Elenco() {
  const { valori, imposta, azzera, azzeraCon, attivi } = useFiltriUrl("prova", PREDEFINITI);
  return (
    <div>
      <input
        aria-label="Cerca"
        value={valori.cerca}
        onChange={(e) => imposta("cerca", e.target.value)}
      />
      <button onClick={() => imposta("stato", "pagate")}>Solo pagate</button>
      {/* Passata così com'è: React ci mette l'evento del clic come primo argomento, e
          `azzera` non deve farci niente. */}
      <button onClick={azzera}>Azzera</button>
      <button onClick={() => azzeraCon({ stato: "pagate" })}>Azzera e tieni pagate</button>
      <p data-testid="valori">{`${valori.cerca}|${valori.stato}|${valori.fornitore}`}</p>
      <p data-testid="attivi">{attivi ? "sì" : "no"}</p>
    </div>
  );
}

function Indirizzo() {
  const l = useLocation();
  return <p data-testid="indirizzo">{l.pathname + l.search}</p>;
}

/** L'elenco, poi la scheda di una fattura: le due strade che l'utente fa davvero. */
function App({ da = "/elenco" }: { da?: string }) {
  return (
    <MemoryRouter initialEntries={[da]}>
      <Routes>
        <Route path="/elenco" element={<Elenco />} />
        <Route path="/fattura" element={<p>scheda della fattura</p>} />
      </Routes>
      <Indirizzo />
    </MemoryRouter>
  );
}

const valori = () => screen.getByTestId("valori").textContent;
const indirizzo = () => screen.getByTestId("indirizzo").textContent;

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe("i filtri di un elenco", () => {
  it("di serie sono i predefiniti e l'indirizzo resta pulito", () => {
    render(<App />);
    expect(valori()).toBe("|all|all");
    expect(indirizzo()).toBe("/elenco");
    expect(screen.getByTestId("attivi").textContent).toBe("no");
  });

  it("cambiandoli finiscono nell'indirizzo, così il tasto indietro li ritrova", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Cerca"), { target: { value: "Battaglino" } });
    expect(indirizzo()).toContain("cerca=Battaglino");
    fireEvent.click(screen.getByText("Solo pagate"));
    expect(indirizzo()).toContain("stato=pagate");
    expect(valori()).toBe("Battaglino|pagate|all");
  });

  it("un filtro rimesso sul predefinito sparisce dall'indirizzo, non resta scritto «all»", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Solo pagate"));
    expect(indirizzo()).toContain("stato=pagate");
    fireEvent.click(screen.getByText("Azzera"));
    expect(indirizzo()).toBe("/elenco");
    expect(valori()).toBe("|all|all");
  });

  it("azzerando da un onClick, l'evento del clic non finisce nell'indirizzo", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Cerca"), { target: { value: "Indecal" } });
    fireEvent.click(screen.getByText("Azzera"));
    expect(indirizzo()).toBe("/elenco");
  });

  it("si può azzerare e mettere un filtro in una scrittura sola", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Cerca"), { target: { value: "Indecal" } });
    fireEvent.click(screen.getByText("Azzera e tieni pagate"));
    expect(valori()).toBe("|pagate|all");
    expect(indirizzo()).toBe("/elenco?stato=pagate");
  });

  it("cambiando un filtro si torna alla prima pagina", () => {
    render(<App da="/elenco?pagina=7" />);
    fireEvent.click(screen.getByText("Solo pagate"));
    expect(indirizzo()).not.toContain("pagina=7");
  });

  it("l'indirizzo esplicito vince: aprendo un link filtrato si vede quello", () => {
    render(<App da="/elenco?cerca=Indecal&stato=pagate" />);
    expect(valori()).toBe("Indecal|pagate|all");
    expect(screen.getByTestId("attivi").textContent).toBe("sì");
  });

  it("tornando all'elenco con l'indirizzo nudo, i filtri di prima sono ancora lì", () => {
    const primo = render(<App />);
    fireEvent.change(screen.getByLabelText("Cerca"), { target: { value: "Indecal" } });
    fireEvent.click(screen.getByText("Solo pagate"));
    primo.unmount();

    // Come chi esce dalla fattura e ritorna all'elenco dal menu: nessun parametro.
    render(<App />);
    expect(valori()).toBe("Indecal|pagate|all");
  });

  it("ma «Azzera» è una scelta, e viene ricordata com'è", () => {
    const primo = render(<App />);
    fireEvent.click(screen.getByText("Solo pagate"));
    fireEvent.click(screen.getByText("Azzera"));
    primo.unmount();

    render(<App />);
    expect(valori()).toBe("|all|all");
  });
});
