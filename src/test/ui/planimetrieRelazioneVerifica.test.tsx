import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VerifichePianta } from "@/components/planimetrie/VerifichePianta";
import { bagnoDaVerificare } from "../fixtures/bagnoDaVerificare";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { name: "Azienda di prova" } }) }));

it("non valuta la conformità e non esporta una relazione quando la lettura è ancora da verificare", () => {
  render(<MemoryRouter><VerifichePianta documento={bagnoDaVerificare()} titolo="Bagno" ambito="fatto" nomeStato="Com'è oggi" modifica="/pianta/modifica" /></MemoryRouter>);
  expect(screen.getByText("Verifiche in attesa del controllo del disegno")).toBeInTheDocument();
  expect(screen.queryByText(/non è un alloggio abitabile/)).not.toBeInTheDocument();
  expect(screen.queryByText(/\d+ conformi/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Relazione PDF" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("Profondità: 423 oppure 421,5 cm, da verificare")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Apri confronto foto e pianta" })).toHaveAttribute("href", "/pianta/modifica");
});
