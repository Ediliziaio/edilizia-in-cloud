import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("@/hooks/useArrivoPosizioni", () => ({ useArrivoCommessa: () => ({ data: state.data }) }));
import { ArrivoCommessaCard } from "@/components/ddt/ArrivoCommessaCard";

const riga = (id: string, stato: string, riferimento: string) => ({ id, nome: "Finestra", riferimento, stato, quantita: 1, buoni: stato === "arrivata" ? 1 : 0, danneggiati: 0, sbagliati: 0, in_riordino: 0, non_arrivati: 1, ordini: [{ id: "oda", numero: "ODA-1" }] });
const apri = () => render(<MemoryRouter><ArrivoCommessaCard orderId="o" /></MemoryRouter>);

describe("Arrivo sulla commessa", () => {
  it("dice cosa si può posare e cosa manca, e porta alla spunta", () => {
    state.data = { posizioni: 4, arrivate: 1, da_sostituire: 0, parziali: 0, non_arrivate: 3, non_ordinate: 0, pezzi_posabili: 1, pezzi_totali: 4,
      righe: [riga("1", "arrivata", "Cucina"), riga("2", "non_arrivata", "Bagno")] };
    apri();
    expect(screen.getByText("Si può posare 1 posizione su 4")).toBeTruthy();
    expect(screen.getByText("3 posizioni non arrivate")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Si può posare")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Spunta ODA-1" }).getAttribute("href")).toBe("/azienda/ordini-acquisto/oda/arrivo");
  });
  it("non si vede se la commessa non ha articoli su misura", () => {
    state.data = { posizioni: 0, righe: [] };
    const { container } = apri();
    expect(container.textContent).toBe("");
  });
});
