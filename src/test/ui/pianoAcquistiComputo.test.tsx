import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PianoAcquistiComputo } from "@/components/orders/materiali/PianoAcquistiComputo";
import { pianoAcquisti } from "@/lib/distinta/pianoAcquisti";
import { generaDistinta } from "@/lib/distinta/generaDistinta";
import { collegaMateriali } from "@/lib/distinta/collegaArticoli";

afterEach(cleanup);
it("il piano espone il residuo, la riserva necessaria e le date mancanti senza inventarle", () => {
  const mm = collegaMateriali(generaDistinta({ voci: [{ id: "v1", descrizione_breve: "Fornitura di cemento", unita_misura: "kg", quantita: 100 }], scomposizioni: [] }).righe,
    { articoli: [], listini: [], giaUsati: [] });
  const piano = pianoAcquisti(mm, { magazzino: [{ id: "w", name: mm[0].descrizione, quantity_available: 30, unita_misura: "kg" }], esistenti: [], coperture: [], fasi: [], fornitori: [] });
  render(<PianoAcquistiComputo righe={piano} nomeFase={()=>"Finiture"} vociDaScomporre={2} />);
  expect(screen.getByText("70 kg")).toBeInTheDocument();
  expect(screen.getByText("Da riservare")).toBeInTheDocument();
  expect(screen.getByText("Manca la data della fase")).toBeInTheDocument();
  expect(screen.getByText(/Piano parziale/)).toBeInTheDocument();
});
it("apre la correzione della riga pendente solo quando il piano consente la modifica", () => {
  const mm = collegaMateriali(generaDistinta({ voci: [{ id: "v1", descrizione_breve: "Fornitura di cemento", unita_misura: "kg", quantita: 100 }], scomposizioni: [] }).righe,
    { articoli: [], listini: [], giaUsati: [] });
  mm[0].verifica_acquisto = { stato: "da_verificare", motivi: ["Confezione da confermare"], campi_mancanti: ["confezione"] };
  const righe = pianoAcquisti(mm, { magazzino: [], esistenti: [], coperture: [], fasi: [], fornitori: [] });
  const apri = vi.fn();
  const vista = render(<PianoAcquistiComputo righe={righe} nomeFase={() => "Finiture"} onCompleta={apri} />);
  fireEvent.click(screen.getByRole("button", { name: "Completa i dati" }));
  expect(apri).toHaveBeenCalledWith(righe[0].chiave);
  vista.rerender(<PianoAcquistiComputo righe={righe} nomeFase={() => "Finiture"} />);
  expect(screen.queryByRole("button", { name: "Completa i dati" })).not.toBeInTheDocument();
});
it("filtra le righe da completare, azzera la selezione nascosta e passa agli articoli soltanto le chiavi scelte", () => {
  const mm = collegaMateriali(generaDistinta({ voci: [{ id: "v1", descrizione_breve: "Fornitura di cemento", unita_misura: "kg", quantita: 100 }], scomposizioni: [] }).righe,
    { articoli: [], listini: [], giaUsati: [] });
  const pendente = { ...mm[0], chiave: "isolante", descrizione: "Isolante", verifica_acquisto: { stato: "da_verificare" as const, motivi: ["Modello mancante"], campi_mancanti: ["modello"] } };
  const righe = pianoAcquisti([...mm, pendente], { magazzino: [], esistenti: [], coperture: [], fasi: [], fornitori: [] });
  const gestisci = vi.fn(), data = vi.fn();
  render(<PianoAcquistiComputo righe={righe} nomeFase={() => "Finiture"} onGestisci={gestisci} onData={data} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona i materiali visibili del piano" }));
  expect(screen.getByText("2 selezionati")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "1 Da completare" }));
  expect(screen.queryByText("2 selezionati")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Gestisci gli articoli selezionati" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Isolante nel piano" }));
  fireEvent.click(screen.getByRole("button", { name: "Gestisci gli articoli selezionati" }));
  expect(gestisci).toHaveBeenCalledWith(["isolante"]);
  fireEvent.click(screen.getByRole("button", { name: "Imposta data" }));
  expect(data).toHaveBeenCalledWith("isolante");
});
it("il magazzino proposto che copre tutto richiede ancora la riserva della merce", () => {
  const mm = collegaMateriali(generaDistinta({ voci: [{ id: "v1", descrizione_breve: "Fornitura di cemento", unita_misura: "kg", quantita: 100 }], scomposizioni: [] }).righe,
    { articoli: [], listini: [], giaUsati: [] });
  const righe = pianoAcquisti(mm, { magazzino: [{ id: "stock", name: mm[0].descrizione, quantity_available: 100, unita_misura: "kg" }], esistenti: [], coperture: [], fasi: [], fornitori: [] });
  render(<PianoAcquistiComputo righe={righe} nomeFase={() => "Finiture"} />);
  expect(screen.getByText("Riserva la merce proposta prima di procedere.")).toBeInTheDocument();
  expect(screen.queryByText("Coperto")).not.toBeInTheDocument();
});
it("il materiale già riservato alla commessa non viene presentato come nuova prenotazione da fare", () => {
  const mm = collegaMateriali(generaDistinta({ voci: [{ id: "v1", descrizione_breve: "Fornitura di cemento", unita_misura: "kg", quantita: 100 }], scomposizioni: [] }).righe,
    { articoli: [], listini: [], giaUsati: [] });
  const righe = pianoAcquisti(mm, { magazzino: [], esistenti: [{ id: "r1", chiave_materiale: mm[0].chiave, stock_item_id: "lotto", quantity_reserved: 100, quantity: 100, unita_misura: "kg" }], coperture: [], fasi: [], fornitori: [] });
  render(<PianoAcquistiComputo righe={righe} nomeFase={() => "Finiture"} />);
  expect(screen.getByText("Già riservato")).toBeInTheDocument();
  expect(screen.getByText("Coperto")).toBeInTheDocument();
  expect(screen.queryByText("Da riservare")).not.toBeInTheDocument();
});
