import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
    <MemoryRouter initialEntries={[`/?${query}`]}>
      <Preview />
    </MemoryRouter>,
  );
describe("Filtri delle planimetrie", () => {
  it("combina ricerca, periodo e autore e consente la rimozione singola", () => {
    show("vista=elenco&pagina=2");
    fireEvent.click(screen.getByRole("button", { name: "Filtri avanzati" }));
    fireEvent.change(screen.getByLabelText("Aggiornata dal"), {
      target: { value: "2026-11-06" },
    });
    expect(screen.getByRole("status")).toHaveTextContent("1 di 3 planimetrie");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Solo i miei progetti" }),
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
    expect(screen.getByLabelText("Aggiornata dal")).toHaveValue("2026-11-06");
    fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
    expect(screen.getByLabelText("Indirizzo filtri")).toHaveTextContent(
      "vista=elenco",
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 di 3 planimetrie");
    expect(
      screen.queryByRole("button", { name: /Rimuovi filtro/ }),
    ).not.toBeInTheDocument();
  });
  it("ripristina un filtro dall’indirizzo, mostra le date incoerenti e le corregge col periodo rapido", () => {
    show("dal=2026-11-10&al=2026-11-01&mie=1");
    expect(
      screen.getByRole("button", { name: /Filtri avanzati/ }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("data iniziale");
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
  it("non offre schede specifiche quando non è stato scelto un tipo di collegamento", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Filtri avanzati" }));
    expect(
      screen.getByRole("combobox", { name: "Filtra per scheda specifica" }),
    ).toBeDisabled();
  });
});
