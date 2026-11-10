import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RigheLetteBolla } from "@/components/ddt/RigheLetteBolla";
import { leggiDDTdaAI } from "@/lib/ddt/letturaAI";
afterEach(cleanup);
describe("Controllo della lettura prima di registrare una bolla", () => {
  it("rende controllabili codice, quantità e prezzo assente del documento", () => {
    const doc = {
      mittente: { partita_iva: "IT08236870963" },
      luogo_destinazione: {
        indirizzo: "Via 12 Novembre",
        comune: "Castano Primo",
      },
      righe_merce: [
        {
          codice_articolo: "A8125",
          descrizione: "Malta bianca 25 kg",
          quantita: 56,
          unita_misura: "pz",
        },
      ],
    };
    render(
      <RigheLetteBolla
        nomeFile="bolla.pdf"
        documento={doc}
        righe={leggiDDTdaAI(doc).righe}
      />,
    );
    expect(screen.getByText(/IT08236870963/)).toBeVisible();
    expect(screen.getByText(/Via 12 Novembre/)).toBeVisible();
    fireEvent.click(screen.getByText(/Controlla le righe lette/));
    expect(
      screen.getByRole("table", { name: "Righe lette bolla.pdf" }),
    ).toBeVisible();
    expect(screen.getByText("56")).toBeVisible();
    expect(screen.getByText("Non indicato")).toBeVisible();
  });
  it("distingue una quantità illeggibile da zero e mantiene i decimali", () => {
    const doc = {
      righe_merce: [
        { descrizione: "Quantità assente" },
        {
          descrizione: "Quantità decimale",
          quantita: 95.94,
          prezzo_unitario_eur: 0,
        },
      ],
    };
    render(
      <RigheLetteBolla
        nomeFile="bolla.pdf"
        documento={doc}
        righe={leggiDDTdaAI(doc).righe}
      />,
    );
    fireEvent.click(screen.getByText(/Controlla le righe lette/));
    expect(screen.getByText("95,94")).toBeVisible();
    expect(screen.getByText("0 €")).toBeVisible();
    expect(screen.getAllByText("Da verificare").length).toBeGreaterThan(0);
  });
});

it("segnala una partita IVA incompleta senza correggerla o inventarla", () => {
  const doc = { mittente: { partita_iva: "0075630120" }, righe_merce: [] as unknown[] };
  render(<RigheLetteBolla nomeFile="bolla.pdf" documento={doc} righe={[]} />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Partita IVA letta incompleta o non valida",
  );
  expect(screen.getByText(/0075630120/)).toBeVisible();
});
