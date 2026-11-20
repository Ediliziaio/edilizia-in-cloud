import { describe, expect, it } from "vitest";
import { guidaVerifica } from "@/lib/distinta/guidaVerifica";
import { verificaDelMateriale } from "@/lib/distinta/verificaAcquisto";
import { materialiEsistentiPerPiano } from "@/lib/distinta/materialiEsistentiPerPiano";
import { gruppoMagazzino } from "@/lib/distinta/navigazioneArticoli";
import type { OrigineRiga } from "@/lib/distinta/generaDistinta";
import type { MaterialeFase } from "@/hooks/useMaterialiPerFase";

const origine: Extract<OrigineRiga, { tipo: "computo" }> = {
  tipo: "computo", voce_id: "v1", codice: null, descrizione: "Isolamento di copertura", quantita_voce: 100, unita_voce: "mq", quantita: 100,
  fonte: "libreria_standard",
};
describe("guida per completare i materiali", () => {
  it("conserva la base documentale distinta dalle quantità proposte dalla ricetta", () => {
    const m = { name: "Adesivo", origini: [{ ...origine, verifica_acquisto: { stato: "da_verificare" as const, motivi: ["Resa da verificare"], campi_mancanti: ["resa", "quantita"] },
      dati_documentali: { versione: 1 as const, quantita: "stimata" as const, quantita_documento: 100, unita_documento: "mq", fonti: [], specifiche: [], componenti_inclusi: [], dati_mancanti: [] } }] };
    const prima = structuredClone(m);
    const guida = guidaVerifica(m);
    expect(guida.tipoQuantita).toBe("Quantità proposta da una ricetta");
    expect(guida.dati?.quantita_documento).toBe(100);
    expect(guida.azioni).toEqual([expect.objectContaining({ dettaglio: expect.stringContaining("resa del prodotto"), fonte: "Scheda del prodotto e quantità di lavoro" })]);
    expect(m).toEqual(prima);
  });
  it("per i serramenti chiede abaco e misure senza trasformare la superficie in pezzi", () => {
    const guida = guidaVerifica({ name: "Serramento", origini: [{ ...origine, verifica_acquisto: { stato: "da_verificare", motivi: ["Abaco da completare"], campi_mancanti: ["abaco", "quantita", "unita", "specifiche"] } }] });
    expect(guida.azioni).toContainEqual(expect.objectContaining({ titolo: "Completa pezzi e misure", fonte: "Rilievo o abaco del progetto" }));
    expect(guida.azioni).toContainEqual(expect.objectContaining({ dettaglio: expect.stringContaining("senza trasformare automaticamente i m² in pezzi") }));
  });
  it("una proposta archiviata senza flag rimane da verificare in elenco, magazzino e piano", () => {
    const m = { id: "m1", name: "Adesivo", quantity: 5, unita_misura: "sacco", chiave_materiale: "adesivo", origini: [origine] };
    expect(verificaDelMateriale(m)?.stato).toBe("da_verificare");
    expect(gruppoMagazzino(m as unknown as MaterialeFase, [{ id: "s1", name: "Adesivo", quantity_available: 10, unita_misura: "sacco" }])).toBe("verificare");
    expect(materialiEsistentiPerPiano([m])[0].verifica_acquisto?.stato).toBe("da_verificare");
  });
  it("una verifica esplicita già salvata prevale sulle note storiche della ricetta", () => {
    const m = { name: "Pittura", origini: [{ ...origine, note: ["Resa da confermare"], verifica_acquisto: { stato: "confermata" as const, motivi: ["Scheda tecnica verificata"], campi_mancanti: [] } }] };
    expect(verificaDelMateriale(m)?.stato).toBe("confermata");
  });
  it("non richiede una verifica a un articolo manuale o una nuova fonte a una macchina già quantificata", () => {
    expect(verificaDelMateriale({ name: "Pittura", origini: [] })).toBeUndefined();
    expect(verificaDelMateriale({ name: "Ventilconvettore", origini: [origine] })).toBeUndefined();
  });
  it("con una fonte da planimetria non pretende campi del computo", () => {
    expect(guidaVerifica({ name: "Presa", origini: [{ tipo: "planimetria", conteggio_id: "c1", documento_id: "d1", documento: "Piano terra", locale: "Bagno", simbolo: "presa", quantita_simbolo: 1, quantita: 2 }] }).azioni).toEqual([]);
  });
});
