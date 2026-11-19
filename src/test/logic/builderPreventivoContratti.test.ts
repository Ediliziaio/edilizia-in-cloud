import { describe, expect, it } from "vitest";
import { conCondizioniDellArchivio, bozzaDalModello, modelloComputoDiSerie, vesteDalModello } from "@/lib/computo/modelloComputo";
import { bozzaVuota, voceVuota, vociDaBozza, leggiBozzaComputo } from "@/lib/computo/editorNativo";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";

const ID = "60000000-0000-4000-a000-000000000001";
const base = { id: ID, nome: "Contratto aziendale completo", versione: 7, attivo: true, predefinito: true, ambito: "preventivo" };

describe("contratto del builder, archivio e PDF", () => {
  it("include anche il testo oltre i vecchi 20.000 caratteri e ne conserva l'origine nella bozza", async () => {
    const testo = `${"La fornitura comprende accessori, posa e consegna. ".repeat(450)}FINE_CONTRATTO_COMPLETO`;
    const m = conCondizioniDellArchivio({ ...modelloComputoDiSerie(), condizioniModelloId: ID }, [{ ...base, clausole: [{ titolo: "Contenuto del contratto", testo }] }]);
    expect(m.condizioniContrattuali.length).toBeGreaterThan(20000); expect(m.condizioniContrattuali).toContain("FINE_CONTRATTO_COMPLETO");
    const b = bozzaDalModello(bozzaVuota(), m); b.voci = [{ ...voceVuota(), descrizione: "Lavorazione", quantita: "1", prezzo: "100" }];
    const riletto = leggiBozzaComputo(JSON.stringify(b));
    expect(riletto.contrattoOrigine).toEqual({ id: ID, nome: base.nome, versione: 7 });
    const pdf = await generaComputoPdf(vociDaBozza(b), { titolo: "Contratto completo", impaginazione: "editoriale", condizioniContrattuali: b.condizioniContrattuali, contrattoOrigine: b.contrattoOrigine, veste: vesteDalModello({ ...m, mostraFirma: false }) });
    expect(pdf.output()).toContain("FINE_CONTRATTO_COMPLETO"); expect(pdf.output()).toContain("versione 7");
    conCondizioniDellArchivio(m, [{ ...base, versione: 8, clausole: [{ titolo: "Nuovo testo", testo: "VERSIONE_SUCCESSIVA" }] }]);
    expect(riletto.condizioniContrattuali).toContain("FINE_CONTRATTO_COMPLETO"); expect(riletto.contrattoOrigine?.versione).toBe(7);
  });
  it("associato vuoto o archiviato usa il predefinito valido e senza archivio usa il testo di base", () => {
    const m = { ...modelloComputoDiSerie(), condizioniModelloId: "vuoto" };
    const letto = conCondizioniDellArchivio(m, [{ ...base, clausole: [{ titolo: "Garanzia", testo: "GARANZIA_AZIENDALE" }] }, { ...base, id: "vuoto", predefinito: false, clausole: [] }]);
    expect(letto.condizioniContrattuali).toContain("GARANZIA_AZIENDALE"); expect(letto.contrattoOrigine?.id).toBe(ID);
    expect(conCondizioniDellArchivio(modelloComputoDiSerie(), []).condizioniContrattuali.trim()).not.toBe("");
  });
  it("le clausole da approvare mantengono anche le ultime parole, e si escludono insieme al contratto", async () => {
    const b = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Lavorazione", quantita: "1", prezzo: "100" }] };
    const m = conCondizioniDellArchivio(modelloComputoDiSerie(), [{ ...base, clausole: [{ titolo: `${"Approvazione di una condizione specifica molto articolata, ".repeat(5)}FINE_CLAUSOLA_LUNGA`, testo: "TESTO_CONTRATTO_DA_APPROVARE", vessatoria: true }] }]);
    const i = { titolo: "Prova approvazioni", impaginazione: "editoriale" as const, condizioniContrattuali: m.condizioniContrattuali, veste: vesteDalModello(m) };
    const con = await generaComputoPdf(vociDaBozza(b), i);
    expect(con.output().match(/FINE_CLAUSOLA_LUNGA/g)?.length).toBe(2);
    const senza = await generaComputoPdf(vociDaBozza(b), { ...i, sezioni: { contrattuali: false } });
    expect(senza.output()).not.toContain("TESTO_CONTRATTO_DA_APPROVARE"); expect(senza.output()).not.toContain("FINE_CLAUSOLA_LUNGA");
  });
});
