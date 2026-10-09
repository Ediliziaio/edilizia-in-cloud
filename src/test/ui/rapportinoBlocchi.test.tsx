import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RapportinoBlocchi } from "@/components/campo/RapportinoBlocchi";

vi.mock("@/components/common/ImgRiservata", () => ({
  ImgRiservata: ({ src, alt }: { src: string; alt?: string }) => <img src={src} alt={alt} />,
}));
afterEach(cleanup);

const giornata = {
  fasi_lavorate: [
    { phase_id: "p1", percentuale: 100, nome: "Demolizioni", foto: ["f0", "f1"], ore: 3.5 },
    { phase_id: "p2", percentuale: 40, nome: "Posa serramenti", foto: ["f2"] },
    { phase_id: "p3", nome: "Pulizia" },
  ],
  materiali_usati: [
    { nome: "Sacchi macerie", quantita: 12, unita: "pz", fase_id: "p1" },
    { nome: "Schiuma", quantita: 6, unita: "pz", da_furgone: true, fase_id: "p2" },
    { nome: "Viti", quantita: 150, unita: "pz" },
  ],
  foto_urls: ["f0", "f1", "f2", "f3"],
};
const scheda = (nome: string) => screen.getByRole("heading", { name: nome }).closest("section") as HTMLElement;

describe("Rapportino a blocchi: scheda estesa", () => {
  it("una scheda per fase con il suo avanzamento, i materiali e le foto", () => {
    render(<RapportinoBlocchi report={giornata} />);
    expect(screen.getByText("Lavorazioni")).toBeInTheDocument();

    const demolizioni = within(scheda("Demolizioni"));
    expect(demolizioni.getByText("Completata")).toBeInTheDocument();
    expect(demolizioni.getByText("Sacchi macerie")).toBeInTheDocument();
    expect(demolizioni.getByText("3 h 30 dichiarate su questa lavorazione")).toBeInTheDocument();
    expect(demolizioni.getAllByRole("img").filter(i => i.tagName === "IMG")).toHaveLength(2);

    const posa = within(scheda("Posa serramenti"));
    expect(posa.getByText("40%")).toBeInTheDocument();
    expect(posa.getByText("Schiuma")).toBeInTheDocument();
    expect(posa.getByText("Dal furgone")).toBeInTheDocument();
    expect(posa.queryByText("Sacchi macerie")).not.toBeInTheDocument();
  });

  it("una fase senza avanzamento è «Lavorata» e dice che non ha materiali né foto", () => {
    render(<RapportinoBlocchi report={giornata} />);
    const pulizia = within(scheda("Pulizia"));
    expect(pulizia.getByText("Lavorata")).toBeInTheDocument();
    expect(pulizia.getByText("Nessun materiale né foto legati a questa lavorazione.")).toBeInTheDocument();
  });

  it("quello che non è di nessuna fase sta in coda: altri materiali e altre foto", () => {
    render(<RapportinoBlocchi report={giornata} />);
    expect(screen.getByText("Altri materiali (1)")).toBeInTheDocument();
    expect(screen.getByText("Viti")).toBeInTheDocument();
    expect(screen.getByText("Altre foto del cantiere (1)")).toBeInTheDocument();
  });

  it("toccare una foto la apre, con l'indirizzo salvato nel rapportino", () => {
    const apri = vi.fn();
    render(<RapportinoBlocchi report={giornata} onFoto={apri} />);
    fireEvent.click(within(scheda("Posa serramenti")).getByRole("button", { name: /Apri Foto di Posa serramenti 1/ }));
    expect(apri).toHaveBeenCalledWith("f2");
  });

  it("un rapportino senza collegamenti (vocale, WhatsApp, storico) mostra materiali e foto in elenco", () => {
    render(<RapportinoBlocchi report={{ materiali_usati: [{ nome: "Colla", quantita: 2, unita: "kg" }], foto_urls: ["a", "b"] }} />);
    expect(screen.queryByText("Lavorazioni")).not.toBeInTheDocument();
    expect(screen.getByText("Materiali usati (1)")).toBeInTheDocument();
    expect(screen.getByText("Foto (2)")).toBeInTheDocument();
  });

  it("con una fase sola il titolo è al singolare", () => {
    render(<RapportinoBlocchi report={{ fasi_lavorate: [{ phase_id: "p", percentuale: 10, nome: "Posa" }] }} />);
    expect(screen.getByText("Lavorazione")).toBeInTheDocument();
  });

  it("non disegna niente se il rapportino non ha né fasi né materiali né foto", () => {
    const { container } = render(<RapportinoBlocchi report={{ fasi_lavorate: [], materiali_usati: null, foto_urls: undefined }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Rapportino a blocchi: scheda compatta (liste da telefono)", () => {
  it("una riga per fase con i conti, senza elenchi né foto", () => {
    render(<RapportinoBlocchi report={giornata} compatto />);
    expect(screen.getByText("Demolizioni")).toBeInTheDocument();
    expect(screen.getByText("1 materiale · 2 foto")).toBeInTheDocument();
    expect(screen.getByText("Posa serramenti")).toBeInTheDocument();
    expect(screen.queryByText("Sacchi macerie")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("dice quanto resta fuori dalle fasi", () => {
    render(<RapportinoBlocchi report={giornata} compatto />);
    expect(screen.getByText("Inoltre: 1 materiale generale · 1 altra foto")).toBeInTheDocument();
  });

  it("senza fasi non aggiunge niente alla lista", () => {
    const { container } = render(<RapportinoBlocchi report={{ materiali_usati: [{ nome: "Colla", quantita: 1, unita: "kg" }] }} compatto />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Rapportino a blocchi: rapportini scritti prima che il nome entrasse nella voce", () => {
  // La forma di sempre in archivio: solo phase_id e ore, il nome non c'è.
  const vecchio = { fasi_lavorate: [{ phase_id: "p1", ore: 8 }, { phase_id: "p2", ore: 2 }] };
  const nomi = new Map([["p1", "Posa serramenti"], ["p2", "Pulizia finale"]]);

  it("col nome delle fasi dato dal cantiere, la scheda si chiama come la fase", () => {
    render(<RapportinoBlocchi report={vecchio} nomiFasi={nomi} />);
    expect(screen.getByRole("heading", { name: "Posa serramenti" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pulizia finale" })).toBeInTheDocument();
    expect(screen.queryByText("Lavorazione non identificata")).not.toBeInTheDocument();
  });

  it("anche nella lista da telefono", () => {
    render(<RapportinoBlocchi report={vecchio} nomiFasi={nomi} compatto />);
    expect(screen.getByText("Posa serramenti")).toBeInTheDocument();
    expect(screen.queryByText("Lavorazione non identificata")).not.toBeInTheDocument();
  });

  it("il nome scritto nel rapportino vale più di quello attuale della fase", () => {
    render(<RapportinoBlocchi report={{ fasi_lavorate: [{ phase_id: "p1", nome: "Demolizioni", ore: 3 }] }} nomiFasi={nomi} />);
    expect(screen.getByRole("heading", { name: "Demolizioni" })).toBeInTheDocument();
    expect(screen.queryByText("Posa serramenti")).not.toBeInTheDocument();
  });

  it("se il nome non si trova (fase cancellata) resta la dicitura generica, senza rompere niente", () => {
    render(<RapportinoBlocchi report={vecchio} nomiFasi={new Map([["p1", "Posa serramenti"]])} />);
    expect(screen.getByRole("heading", { name: "Posa serramenti" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lavorazione non identificata" })).toBeInTheDocument();
  });
});
