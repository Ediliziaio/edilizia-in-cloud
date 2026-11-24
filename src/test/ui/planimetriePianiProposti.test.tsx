import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PianiDaDwg } from "@/components/planimetrie/PianiDaDwg";
import { leggiPropostaPianiDwg, rettangoloInRitaglio, ritaglioInCoordinateDwg, type RiferimentoDwg } from "@/lib/planimetrie/coordinateDwg";

const proposta = {
  unita: 6 as const, layerMuri: "MRT",
  piani: [
    { nome: "Piano terra", quota: 0, rettangolo: [10, 10, 40, 30] as [number, number, number, number] },
    { nome: "Piano primo", quota: 349, rettangolo: [60, 10, 85, 30] as [number, number, number, number] },
  ],
};

describe("piani trovati da soli nella tavola DWG", () => {
  it("con un clic ricava i piani proposti, con l'unità e il layer letti", () => {
    const ricostruisci = vi.fn();
    const riferimento: RiferimentoDwg = { unita: 4, rettangolo: [0, 0, 100, 50], quote: [], pianiProposti: proposta };
    render(<PianiDaDwg riferimento={riferimento} ritaglio={null} occupato={false} onAggiunto={() => {}} onRicostruisci={ricostruisci} />);
    expect(screen.getByText("Ho trovato 2 piante nella tavola")).toBeInTheDocument();
    expect(screen.getByText(/Il file dichiara millimetri/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ricava i 2 piani trovati" }));
    const [richiesta, tagli] = ricostruisci.mock.calls[0];
    expect(richiesta).toMatchObject({ unita: 6, layerMuri: "MRT", altezza: 270, piani: proposta.piani });
    expect(tagli).toHaveLength(2);
  });

  it("«Correggi prima» mette i piani nell'elenco da modificare", () => {
    render(<PianiDaDwg riferimento={{ unita: 6, rettangolo: [0, 0, 100, 50], pianiProposti: proposta }} ritaglio={null} occupato={false}
      onAggiunto={() => {}} onRicostruisci={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Correggi prima" }));
    expect(screen.getByDisplayValue("Piano primo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3.49")).toBeInTheDocument();
    expect(screen.queryByText("Ho trovato 2 piante nella tavola")).not.toBeInTheDocument();
  });

  it("il ritaglio torna nelle stesse coordinate del DWG", () => {
    const inquadratura: [number, number, number, number] = [0, 0, 100, 50];
    const taglio = rettangoloInRitaglio(inquadratura, [60, 10, 85, 30]);
    expect(ritaglioInCoordinateDwg(inquadratura, taglio).map((v) => Math.round(v * 1000) / 1000)).toEqual([60, 10, 85, 30]);
  });

  it("scarta una proposta con quote doppie o rettangoli rovesciati", () => {
    expect(leggiPropostaPianiDwg(proposta)).toEqual(proposta);
    expect(leggiPropostaPianiDwg({ ...proposta, piani: [proposta.piani[0], { ...proposta.piani[1], quota: 0 }] })).toBeUndefined();
    expect(leggiPropostaPianiDwg({ ...proposta, piani: [{ ...proposta.piani[0], rettangolo: [40, 30, 10, 10] }] })).toBeUndefined();
  });
});
