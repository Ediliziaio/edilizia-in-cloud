import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { FiltriArchivioPiante } from "@/components/planimetrie/FiltriArchivioPiante";
import {
  filtraElencoPiante,
  leggiFiltriElenco,
  scriviFiltriElenco,
  giornoLocalePianta,
} from "@/lib/planimetrie/elenco";
import type { RigaPlanimetria } from "@/lib/planimetrie/archivio";
const base: RigaPlanimetria = {
  id: "p1",
  company_id: "company",
  titolo: "Appartamento",
  stato: "bozza",
  descrizione: null,
  contact_id: null,
  customer_id: null,
  quote_id: null,
  order_id: null,
  computo_upload_id: null,
  survey_id: null,
  versione_corrente: 1,
  created_by: "me",
  created_at: "2026-11-01",
  updated_at: "2026-11-10T12:00:00Z",
  deleted_at: null,
};
const rows = [
  base,
  {
    ...base,
    id: "p2",
    titolo: "Villa",
    created_by: "altro",
    updated_at: "2026-11-05T12:00:00Z",
  },
  {
    ...base,
    id: "p3",
    titolo: "Progetto passato",
    stato: "archiviata" as const,
  },
];
function Preview() {
  const [params, setParams] = useSearchParams();
  const value = leggiFiltriElenco(params);
  const filtered = filtraElencoPiante(rows, value, undefined, "me");
  return (
    <>
      <FiltriArchivioPiante
        value={value}
        piante={rows}
        userId="me"
        risultati={filtered.length}
        onChange={(patch) =>
          setParams(scriviFiltriElenco(params, { pagina: 0, ...patch }))
        }
      />
      <p aria-label="Indirizzo filtri">{params.toString()}</p>
      <ul aria-label="Progetti filtrati">
        {filtered.map((row) => (
          <li key={row.id}>{row.titolo}</li>
        ))}
      </ul>
    </>
  );
}
const show = (query = "vista=elenco") =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/?${query}`]}>
        <Preview />
      </MemoryRouter>
    </QueryClientProvider>,
  );
describe("Filtri delle planimetrie", () => {
  it("combina periodo e autore nel pannello laterale e mantiene la ricerca nella barra", () => {
    show("vista=elenco&pagina=2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Filtra collegamenti" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Filtri" }),
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      /Filtri planimetrie/,
    );
    fireEvent.change(screen.getByLabelText("Aggiornata dal"), {
      target: { value: "2026-11-06" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Solo i miei progetti" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mostra 1 planimetria" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca una pianta" }),
      { target: { value: "Appartamento" } },
    );
    expect(screen.getByLabelText("Indirizzo filtri")).toHaveTextContent(
      "mie=1",
    );
    expect(screen.getByLabelText("Indirizzo filtri")).not.toHaveTextContent(
      "pagina=",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Rimuovi filtro Ricerca: Appartamento",
      }),
    );
    expect(
      screen.getByRole("textbox", { name: "Cerca una pianta" }),
    ).toHaveValue("");
    fireEvent.click(
      screen.getByRole("button", { name: "Filtri" }),
    );
    expect(screen.getByLabelText("Aggiornata dal")).toHaveValue("2026-11-06");
    fireEvent.click(
      screen.getByRole("button", { name: "Azzera" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mostra 2 planimetrie" }),
    );
    expect(screen.getByLabelText("Indirizzo filtri")).toHaveTextContent(
      "vista=elenco",
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 di 3 planimetrie");
  });
  it("non espande la pagina quando ripristina filtri dall’indirizzo e segnala date incoerenti nel pannello", () => {
    show("dal=2026-11-10&al=2026-11-01&mie=1");
    expect(screen.queryByLabelText("Aggiornata dal")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Filtri" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("data iniziale");
    expect(
      screen.getByRole("button", { name: "Mostra 0 planimetrie" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Ultimi 7 giorni" }));
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    expect(screen.getByLabelText("Aggiornata dal")).toHaveValue(
      giornoLocalePianta(start),
    );
    expect(screen.getByLabelText("Aggiornata al")).toHaveValue(
      giornoLocalePianta(end),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
