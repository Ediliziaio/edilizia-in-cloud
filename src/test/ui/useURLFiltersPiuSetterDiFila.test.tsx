import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { useURLFilters } from "@/hooks/useURLFilters";

/**
 * «Righe per pagina» della lista Contatti non cambiava niente. Il gestore faceva due scritture di fila nell'indirizzo
 * (`setPageSize(50); setPage(1)`) e `setSearchParams` di React Router non le mette in coda: la seconda riparte dal
 * valore letto al rendering e cancella la prima. Qui si prova il comportamento, non l'implementazione: più scritture
 * nello stesso gestore devono sommarsi.
 */
function Prova() {
  const { params, setParam, setParams } = useURLFilters({
    page: { key: "pagina", defaultValue: 1, serialize: String, deserialize: Number },
    pageSize: { key: "per_pagina", defaultValue: 25, serialize: String, deserialize: Number },
    sortField: { key: "ordina", defaultValue: "created_at" },
    sortDirection: { key: "dir", defaultValue: "desc" },
    search: { key: "q", defaultValue: "" },
  });
  const posizione = useLocation();
  const vai = useNavigate();
  return (
    <div>
      <output data-testid="url">{posizione.search}</output>
      <output data-testid="valori">{JSON.stringify(params)}</output>
      <button onClick={() => { setParam("pageSize", 50); setParam("page", 1); }}>righe per pagina</button>
      <button onClick={() => { setParam("sortField", "name"); setParam("sortDirection", "asc"); setParam("page", 1); }}>ordina</button>
      <button onClick={() => setParams({ pageSize: 100, page: 1 })}>atomico</button>
      <button onClick={() => setParam("page", 3)}>pagina 3</button>
      <button onClick={() => vai("/contatti")}>torna all'inizio</button>
      <button onClick={() => { setParam("search", "rossi"); setParams({ page: 2 }); setParam("pageSize", 50); }}>misto</button>
    </div>
  );
}
const disegna = (iniziale = "/contatti") => render(<MemoryRouter initialEntries={[iniziale]}><Prova /></MemoryRouter>);
const url = () => new URLSearchParams(screen.getByTestId("url").textContent ?? "");
const valori = () => JSON.parse(screen.getByTestId("valori").textContent ?? "{}") as Record<string, unknown>;
afterEach(cleanup);

describe("più scritture di fila nell'indirizzo (come «Righe per pagina»)", () => {
  it("cambiare le righe per pagina e tornare a pagina 1 tiene la nuova misura", () => {
    disegna("/contatti?pagina=3");
    fireEvent.click(screen.getByText("righe per pagina"));
    expect(url().get("per_pagina")).toBe("50");
    expect(url().has("pagina")).toBe(false); // pagina 1 è quella di partenza: non si scrive
    expect(valori()).toMatchObject({ page: 1, pageSize: 50 });
  });

  it("anche da pagina 1 (il caso dello screenshot: il menu non faceva niente)", () => {
    disegna("/contatti");
    fireEvent.click(screen.getByText("righe per pagina"));
    expect(valori().pageSize).toBe(50);
  });

  it("ordinare cambia campo e direzione insieme, e riporta a pagina 1", () => {
    disegna("/contatti?pagina=4");
    fireEvent.click(screen.getByText("ordina"));
    expect(url().get("ordina")).toBe("name");
    expect(url().get("dir")).toBe("asc");
    expect(url().has("pagina")).toBe(false);
  });

  it("le scritture di fila non perdono quello che c'era già nell'indirizzo", () => {
    disegna("/contatti?q=abc&per_pagina=100");
    fireEvent.click(screen.getByText("ordina"));
    expect(url().get("q")).toBe("abc");
    expect(url().get("per_pagina")).toBe("100");
    expect(url().get("ordina")).toBe("name");
  });

  it("scritture miste (singole e a gruppo) nello stesso gestore si sommano tutte", () => {
    disegna("/contatti");
    fireEvent.click(screen.getByText("misto"));
    expect(valori()).toMatchObject({ search: "rossi", page: 2, pageSize: 50 });
  });

  it("dopo il rendering la scrittura successiva riparte dal nuovo indirizzo, non da quello vecchio", () => {
    disegna("/contatti");
    fireEvent.click(screen.getByText("righe per pagina"));
    fireEvent.click(screen.getByText("pagina 3"));
    expect(valori()).toMatchObject({ page: 3, pageSize: 50 });
    fireEvent.click(screen.getByText("ordina"));
    expect(valori()).toMatchObject({ page: 1, pageSize: 50, sortField: "name", sortDirection: "asc" });
  });

  it("la scrittura a gruppo di sempre continua a funzionare", () => {
    disegna("/contatti?pagina=2");
    fireEvent.click(screen.getByText("atomico"));
    expect(valori()).toMatchObject({ page: 1, pageSize: 100 });
  });

  it("un valore uguale a quello di partenza non resta nell'indirizzo", () => {
    disegna("/contatti?per_pagina=50");
    fireEvent.click(screen.getByText("righe per pagina")); // 50 → 50, pagina 1
    expect(url().get("per_pagina")).toBe("50");
    fireEvent.click(screen.getByText("atomico")); // 100
    expect(url().get("per_pagina")).toBe("100");
  });

  it("tornando a un indirizzo visto prima, la scrittura successiva riparte da quello e non da modifiche superate", () => {
    disegna("/contatti");
    fireEvent.click(screen.getByText("righe per pagina")); // ?per_pagina=50
    expect(valori().pageSize).toBe(50);
    fireEvent.click(screen.getByText("torna all'inizio")); // di nuovo /contatti, senza parametri
    expect(valori().pageSize).toBe(25);
    fireEvent.click(screen.getByText("pagina 3"));
    expect(valori()).toMatchObject({ page: 3, pageSize: 25 });
    expect(url().has("per_pagina")).toBe(false);
  });
});
