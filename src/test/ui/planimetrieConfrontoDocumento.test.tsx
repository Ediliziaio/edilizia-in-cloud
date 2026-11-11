import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bagnoDaVerificare } from "../fixtures/bagnoDaVerificare";
import { ConfrontoDocumentoPianta } from "@/components/planimetrie/ConfrontoDocumentoPianta";
import { valoreSulDisegno, verificheDelDocumento } from "../../../shared/planimetrie/verificaDocumento.ts";

beforeEach(() => {
  const BaseURL = URL;
  vi.stubGlobal("URL", class extends BaseURL { static createObjectURL() { return "blob:bagno-originale"; } static revokeObjectURL() {} });
});

it("mostra foto e quote alternative; una scelta non modifica nulla finché non si applica e conferma", () => {
  const aggiornamenti = vi.fn();
  const seleziona = vi.fn();
  function Confronto() {
    const [d, setD] = useState(bagnoDaVerificare);
    return <><ConfrontoDocumentoPianta documento={d} sorgente={{ file: new Blob(["foto"], { type: "image/png" }), nome: "bagno.png" }} onAggiorna={(n) => { aggiornamenti(n); setD(n); }} onSeleziona={seleziona} /><output aria-label="Profondità attuale">{valoreSulDisegno(d, verificheDelDocumento(d)[0])}</output></>;
  }
  render(<QueryClientProvider client={new QueryClient()}><Confronto /></QueryClientProvider>);
  expect(screen.getByRole("img", { name: "Foto originale da confrontare con la pianta" })).toHaveAttribute("src", "blob:bagno-originale");
  const quota = within(screen.getByRole("region", { name: "Profondità: 423 oppure 421,5 cm, da verificare" }));
  expect(quota.getByRole("button", { name: "423 cm" })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(quota.getByRole("button", { name: "421,5 cm" }));
  expect(aggiornamenti).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Profondità attuale")).toHaveTextContent("423");
  fireEvent.click(quota.getByRole("button", { name: "Evidenzia foto e pianta" }));
  expect(seleziona).toHaveBeenCalledWith(expect.objectContaining({ riferimento: expect.objectContaining({ tipo: "locale", campo: "profondita" }) }));
  fireEvent.click(quota.getByRole("button", { name: "Applica quota e conferma" }));
  expect(screen.getByLabelText("Profondità attuale")).toHaveTextContent("421.5");
  expect(quota.getByText("Verificata: 421,5 cm")).toBeInTheDocument();
  expect(screen.getByText(/Render AI: da verificare/)).toBeInTheDocument();
});

it("un verso sconosciuto resta aperto e spiega come correggerlo sul disegno", () => {
  const aggiorna = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><ConfrontoDocumentoPianta documento={bagnoDaVerificare()} onAggiorna={aggiorna} /></QueryClientProvider>);
  const verso = within(screen.getByRole("region", { name: "Verso portafinestra non riconosciuto" }));
  fireEvent.change(verso.getByRole("textbox"), { target: { value: "Il verso non è leggibile" } });
  fireEvent.click(verso.getByRole("button", { name: "Confermo il controllo" }));
  expect(verso.getByRole("alert")).toHaveTextContent("Imposta il verso");
  expect(aggiorna).not.toHaveBeenCalled();
});

it("apre foto grande e pianta, aumenta lo zoom e collega una zona senza confermare la quota", () => {
  const documento = bagnoDaVerificare();
  const aggiorna = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><ConfrontoDocumentoPianta documento={documento} sorgente={{ file: new Blob(["foto"]), nome: "bagno.png" }} onAggiorna={aggiorna} /></QueryClientProvider>);
  const quota = within(screen.getByRole("region", { name: "Profondità: 423 oppure 421,5 cm, da verificare" }));
  fireEvent.click(quota.getByRole("button", { name: "Evidenzia foto e pianta" }));
  fireEvent.click(screen.getByRole("button", { name: "Apri foto grande e confronto" }));
  const dialogo = within(screen.getByRole("dialog"));
  expect(dialogo.getByRole("img", { name: "Pianta di confronto con quota evidenziata" })).toBeInTheDocument();
  expect(dialogo.getByRole("img", { name: /Quota evidenziata sulla pianta: Profondità/ })).toBeInTheDocument();
  fireEvent.click(dialogo.getByRole("button", { name: "Ingrandisci foto grande" }));
  expect(dialogo.getByLabelText("Zoom foto grande")).toHaveTextContent("150%");
  expect(aggiorna).not.toHaveBeenCalled();
  fireEvent.click(dialogo.getByRole("button", { name: "Segna quota sulla foto" }));
  const foto = dialogo.getByTestId("foto-grande-annotabile");
  vi.spyOn(foto, "getBoundingClientRect").mockReturnValue({ x: 10, y: 20, left: 10, top: 20, width: 200, height: 200, right: 210, bottom: 220, toJSON() {} });
  fireEvent.click(foto, { clientX: 50, clientY: 80 });
  fireEvent.click(foto, { clientX: 90, clientY: 100 });
  expect(aggiorna).toHaveBeenCalledTimes(1);
  const salvata = aggiorna.mock.calls[0][0];
  expect(salvata.letturaDocumento.verifiche[0].zoneFoto[0]).toMatchObject({ x: 0.2, y: 0.3, larghezza: 0.2 });
  expect(salvata.livelli).toEqual(documento.livelli);
  expect(verificheDelDocumento(salvata).every((v) => !v.conferma)).toBe(true);
});
