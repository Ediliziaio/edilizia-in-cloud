import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RapportinoCardCampo, type RapportinoCardRiga } from "@/components/campo/RapportinoCardCampo";

vi.mock("@/components/common/ImgRiservata", () => ({ ImgRiservata: ({ src, alt }: { src: string; alt?: string }) => <img src={src} alt={alt} /> }));
afterEach(cleanup);

const riga: RapportinoCardRiga = {
  id: "r", data_lavoro: "2026-10-05", stato: "inviato", ore_lavorate: 7.5, percentuale_avanzamento: 0, descrizione_lavori: "Posa di due serramenti",
  foto_urls: ["a", "b", "c", "d"], pdf_url: null, firma_operaio_url: null,
};
const disegna = (r: Partial<RapportinoCardRiga> = {}, nomiFasi?: ReadonlyMap<string, string>) => {
  const azioni = { onPdf: vi.fn(), onFirma: vi.fn(), onCorreggi: vi.fn() };
  render(<RapportinoCardCampo r={{ ...riga, ...r }} pdfOccupato={false} nomiFasi={nomiFasi} {...azioni} />);
  return azioni;
};

describe("Rapportino nella lista del cantiere (operaio)", () => {
  it("inviato: «In attesa», con i dati del giorno e il pulsante Firma", () => {
    const a = disegna();
    expect(screen.getByText("In attesa")).toBeInTheDocument();
    expect(screen.getByText("5 ott 2026")).toBeInTheDocument();
    expect(screen.getByText("7.5h lavorate")).toBeInTheDocument();
    expect(screen.getByText("4 foto")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Firma/ }));
    expect(a.onFirma).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Correggi e rimanda" })).not.toBeInTheDocument();
  });

  it("l'avanzamento a zero non si scrive: con le fasi lo calcola il sistema", () => {
    disegna({ percentuale_avanzamento: 0 });
    expect(screen.queryByText(/% avanzamento/)).not.toBeInTheDocument();
    cleanup();
    disegna({ percentuale_avanzamento: 35 });
    expect(screen.getByText("35% avanzamento")).toBeInTheDocument();
  });

  it("approvato: «Approvato»", () => {
    disegna({ stato: "approvato" });
    expect(screen.getByText("Approvato")).toBeInTheDocument();
  });

  it("un rapportino respinto NON risulta «In attesa»: dice «Respinto», mostra il motivo e permette di correggerlo", () => {
    const a = disegna({ stato: "rifiutato", motivo_rifiuto: "Mancano le ore degli altri operai." });
    expect(screen.getByText("Respinto")).toBeInTheDocument();
    expect(screen.queryByText("In attesa")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Mancano le ore degli altri operai.");
    fireEvent.click(screen.getByRole("button", { name: "Correggi e rimanda" }));
    expect(a.onCorreggi).toHaveBeenCalled();
    // firmare un rapportino da rifare non ha senso: la firma si mette quando lo si rimanda
    expect(screen.queryByRole("button", { name: /^Firma$/ })).not.toBeInTheDocument();
  });

  it("respinto senza motivo scritto: dice di chiedere all'ufficio, non inventa", () => {
    disegna({ stato: "rifiutato", motivo_rifiuto: "  " });
    expect(screen.getByRole("alert")).toHaveTextContent("Nessun motivo scritto");
  });

  it("bozza: «Completa e invia»", () => {
    const a = disegna({ stato: "bozza" });
    expect(screen.getByText("Bozza")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Completa e invia" }));
    expect(a.onCorreggi).toHaveBeenCalled();
  });

  it("un record vecchio senza stato si legge dal flag approvato", () => {
    disegna({ stato: undefined, approvato: true });
    expect(screen.getByText("Approvato")).toBeInTheDocument();
  });

  it("firmato: niente pulsante Firma", () => {
    disegna({ firma_operaio_url: "firma.png" });
    expect(screen.getByText("Firmato")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Firma$/ })).not.toBeInTheDocument();
  });

  it("il PDF: «Genera PDF» se manca, «Apri PDF» se c'è, «Preparo PDF…» mentre lavora", () => {
    const a = disegna();
    fireEvent.click(screen.getByRole("button", { name: "Genera PDF" }));
    expect(a.onPdf).toHaveBeenCalled();
    cleanup();
    disegna({ pdf_url: "x.pdf" });
    expect(screen.getByRole("button", { name: "Apri PDF" })).toBeInTheDocument();
    cleanup();
    render(<RapportinoCardCampo r={riga} pdfOccupato onPdf={vi.fn()} onFirma={vi.fn()} onCorreggi={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Preparo PDF…" })).toBeDisabled();
  });

  it("una riga per fase con i conti di materiali e foto", () => {
    disegna({
      fasi_lavorate: [{ phase_id: "p1", percentuale: 60, nome: "Posa serramenti", foto: ["a", "b"] }, { phase_id: "p2", percentuale: 100, nome: "Pulizia" }],
      materiali_usati: [{ nome: "Schiuma", quantita: 2, unita: "pz", fase_id: "p1" }],
    });
    expect(screen.getByText("Posa serramenti")).toBeInTheDocument();
    expect(screen.getByText("1 materiale · 2 foto")).toBeInTheDocument();
    expect(screen.getByText("Pulizia")).toBeInTheDocument();
    expect(screen.getByText("Completata")).toBeInTheDocument();
  });

  it("un rapportino vecchio, con la fase scritta solo come id, prende il nome dalla fase del cantiere", () => {
    disegna({ fasi_lavorate: [{ phase_id: "p1", ore: 8 }] }, new Map([["p1", "Posa serramenti"]]));
    expect(screen.getByText("Posa serramenti")).toBeInTheDocument();
    expect(screen.queryByText("Lavorazione non identificata")).not.toBeInTheDocument();
  });

  it("mostra al massimo tre anteprime delle foto", () => {
    disegna();
    expect(screen.getAllByAltText("Foto rapportino")).toHaveLength(3);
  });

  it("una data illeggibile non fa cadere la lista", () => {
    disegna({ data_lavoro: "boh" });
    expect(screen.getByText("boh")).toBeInTheDocument();
  });
});
