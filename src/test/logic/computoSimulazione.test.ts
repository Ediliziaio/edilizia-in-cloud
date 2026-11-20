import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { bozzaVuota, voceVuota, bozzaComputoSchema, calcolaVoce, type MisuraEditor } from "@/lib/computo/editorNativo";
import { analizzaEconomia, totaleElencoComputo } from "@/lib/computo/economiaComputo";

describe("simulazione computo ristrutturazione", () => {
  it("riconcilia misure con detrazione, beni a pezzo, opzionali, sconto e IVA", async () => {
    const misura = (descrizione: string, campi: Partial<MisuraEditor>): MisuraEditor => ({ id: crypto.randomUUID(), descrizione, parti: "", lunghezza: "", larghezza: "", altezza: "", formula: "", ...campi });
    const voce = (capitolo: string, descrizione: string, unita: string, quantita: string, prezzo: string) => ({ ...voceVuota(), capitolo, descrizione, unita, quantita, prezzo });
    const [a, b, c, d] = ["Preparazione e demolizioni", "Cartongesso e finiture", "Serramenti e schermature", "Impianto elettrico"];
    const bozza = bozzaComputoSchema.parse({ ...bozzaVuota(), titolo: "DEMO · Preventivo / computo metrico · Ristrutturazione appartamento", numero: "DEMO-CM-2026-001", dataDocumento: "19/11/2026",
      committente: "Cliente DEMO · Ristrutturazione", oggetto: "Ristrutturazione appartamento: demolizioni, cartongesso, serramenti, tapparelle e impianto elettrico. Simulazione dimostrativa.",
      indirizzo: "Via dei Giardini 12, 20100 Milano (MI)", cantiere_indirizzo: "Via dei Giardini 12", cantiere_citta: "Milano", cantiere_cap: "20100", cantiere_provincia: "MI",
      capitoli: [a, b, c, d], mostraMisurePdf: true, mostraCodiciPdf: false, mostraFontiPdf: false,
      ivaModalita: "applicata", ivaAliquota: "22", sconto: { tipo: "percentuale", valore: "5", descrizione: "Sconto commerciale" },
      pagamenti: "Acconto 30% alla conferma, 40% a inizio lavori, saldo 30% alla consegna.", tempi: "Durata prevista 6 settimane dalla conferma delle misure.",
      sezioniPdf: { ...bozzaVuota().sezioniPdf, firme: false, cronoprogramma: false, detrazione: false },
      voci: [
        voce(a, "Rimozione pavimenti esistenti", "mq", "42", "18"), voce(a, "Conferimento inerti", "mc", "3", "95"),
        { ...voce(b, "Controparete in cartongesso a doppia lastra", "mq", "", "58"), misure: [misura("Parete soggiorno", { parti: "1", lunghezza: "5", altezza: "2,7" }), misura("Parete camera", { parti: "1", lunghezza: "3,8", altezza: "2,7" }), misura("A detrarre vano porta", { formula: "-0,9*2,1" })] },
        { ...voce(b, "Controsoffitto isolato", "mq", "", "65"), misure: [misura("Soggiorno", { lunghezza: "6", larghezza: "4" })] },
        { ...voce(b, "Tinteggiatura pareti soggiorno", "mq", "", "12"), misure: [misura("Perimetro per altezza, meno vano porta", { formula: "2*(6+4)*2,7-2,1*0,9" })] },
        voce(c, "Finestra PVC cucina · 1200 × 1400 mm", "cad", "1", "620"), voce(c, "Finestra PVC camera · 1400 × 1500 mm", "cad", "1", "690"), voce(c, "Porta-finestra soggiorno · 900 × 2300 mm", "cad", "1", "1080"), voce(c, "Tapparelle in alluminio coibentato · 3 posizioni", "cad", "3", "180"),
        voce(d, "Punto presa completo", "cad", "12", "62"), voce(d, "Punto luce completo", "cad", "8", "48"), voce(d, "Quadro elettrico e verifica", "corpo", "1", "380"),
        { ...voce(c, "Zanzariere su misura · optional fuori dal totale", "cad", "3", "95"), opzionale: true },
      ] });
    expect(bozza.voci).toHaveLength(13);
    for (const v of bozza.voci) expect(calcolaVoce(v).errori).toEqual([]);
    expect(calcolaVoce(bozza.voci[2])).toMatchObject({ quantita: 21.87, importo: 1268.46 });
    expect(calcolaVoce(bozza.voci[4])).toMatchObject({ quantita: 52.11, importo: 625.32 });
    const economia = analizzaEconomia(bozza);
    expect(economia.totaleLavori).toBeCloseTo(8932.78, 2);
    expect(economia).toMatchObject({ sconto: 446.64, netto: 8486.14, totaleCliente: 10353.09 });
    expect(totaleElencoComputo(bozza)).toBe(10353.09);
    if (process.env.COMPUTO_DEMO_OUTPUT) {
      const contratto = JSON.parse(await readFile("/private/tmp/eic-preventivatore-unico-20261119/contratto-atteso.json", "utf8"));
      bozza.condizioniContrattuali = contratto.clausole.map((r: { testo: string }) => r.testo).join("\n\n");
      bozza.contrattoOrigine = { id: contratto.id, nome: contratto.nome, versione: contratto.versione };
      await writeFile(process.env.COMPUTO_DEMO_OUTPUT, JSON.stringify({ formato: "ediliziaincloud-computo", versione: 1, bozza, allegati: [] }, null, 2));
    }
  });
});
