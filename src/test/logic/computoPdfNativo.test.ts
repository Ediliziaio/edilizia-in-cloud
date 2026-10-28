import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generaComputoPdf, righeComputoClassico } from "@/lib/computo/esportaComputo";
import { bozzaVuota, misuraVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";

const bozza = { ...bozzaVuota(), titolo: "Computo metrico estimativo - Ristrutturazione", committente: "Cliente di prova locale", oggetto: "Lavori interni - piano terra", voci: [
  { ...voceVuota(), descrizione: "Rimozione pavimentazione e preparazione del sottofondo, compresi carico e trasporto.", tariffa: "NP.001", quantita: "12", prezzo: "35,50" },
  { ...voceVuota(), descrizione: "Intonaco interno delle pareti", tariffa: "NP.002", prezzo: "18", quantita: "", misure: [
    { ...misuraVuota(), descrizione: "Pareti ambiente A", formula: "(4+3)*2*2,7" },
    { ...misuraVuota(), descrizione: "Detrazione apertura", formula: "-1*1*2,1" },
  ] },
  { ...voceVuota(), capitolo: "Sicurezza", descrizione: "Protezione delle aree di lavoro", unita: "a corpo", corpo: true, sicurezza: true, quantita: "1", prezzo: "150" },
] };
describe("PDF tecnico del computo nativo", () => {
  it("nasconde i dati cliente nella variante anonima", async () => {
    const doc = await generaComputoPdf(vociDaBozza(bozza), { titolo: "Computo", presentazione: "preventivo", committente: "ClienteRiservato", indirizzoIntervento: "IndirizzoRiservato", nascondiCliente: true });
    expect(doc.output()).not.toContain("ClienteRiservato"); expect(doc.output()).not.toContain("IndirizzoRiservato");
    expect(doc.output()).toContain("NP.001");
  });
  it("il preventivo cliente è compatto, raggruppato e ha un solo totale finale", async () => {
    const doc = await generaComputoPdf(vociDaBozza(bozza), { ...bozza, azienda: "Edilizia in Cloud", presentazione: "preventivo",
      numero: "CM-LOCALE-001", indirizzoIntervento: "Immobile di prova", condizioni: "Lavorazioni incluse come da elenco. Tempi e pagamenti da concordare.", stato: "BOZZA LOCALE" });
    const pdf = doc.output();
    expect(pdf).toContain("Edilizia in Cloud"); expect(pdf).toContain("CM-LOCALE-001"); expect(pdf).toContain("NP.001");
    expect(pdf).toContain("Riepilogo economico"); expect(pdf.match(/\(TOTALE IMPONIBILE\)/g)).toHaveLength(1);
    expect(pdf).toContain("1.218,60"); expect(pdf).toContain("Note e condizioni");
    expect(doc.internal.pageSize.getHeight()).toBeGreaterThan(doc.internal.pageSize.getWidth());
    if (process.env.COMPUTO_PDF_QA_OUTPUT) {
      const dest = path.resolve("output/pdf/preventivo-computo-cliente.pdf");
      await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, Buffer.from(doc.output("arraybuffer")));
    }
  });

  it("la presentazione cliente senza prezzi non espone somme o unitari", async () => {
    const doc = await generaComputoPdf(vociDaBozza(bozza), { titolo: "Computo senza prezzi", presentazione: "preventivo", senzaPrezzi: true });
    const pdf = doc.output();
    for (const testo of ["TOTALE IMPONIBILE", "Riepilogo economico", "35,50", "1.218,60", "PREZZO", "IMPORTO"])
      expect(pdf).not.toContain(`(${testo})`);
    expect(pdf).toContain("NP.001");
  });

  it("il preventivo cliente conserva descrizioni e condizioni su più pagine", async () => {
    const b = { ...bozza, voci: [{ ...bozza.voci[0], descrizione: "Descrizione estesa della lavorazione ".repeat(500) + "FINE_LAVORAZIONE" }] };
    const doc = await generaComputoPdf(vociDaBozza(b), { titolo: "Test multipagina", presentazione: "preventivo", condizioni: "Condizioni dettagliate ".repeat(500) + "FINE_CONDIZIONI" });
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    expect(doc.output()).toContain("FINE_LAVORAZIONE"); expect(doc.output()).toContain("FINE_CONDIZIONI");
    if (process.env.COMPUTO_PDF_QA_OUTPUT) await writeFile("/tmp/computo-cliente-stress.pdf", Buffer.from(doc.output("arraybuffer")));
  });

  it("usa il generatore esistente con descrizioni, misure e riepilogo", async () => {
    const voci = vociDaBozza(bozza);
    const doc = await generaComputoPdf(voci, { ...bozza, stato: "BOZZA LOCALE - non contrattuale" });
    const pdf = doc.output();
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toContain("NP.001"); expect(pdf).toContain("Detrazione apertura"); expect(pdf).toContain("Riepilogo per capitoli");
    expect(righeComputoClassico(voci).at(-1)).toMatchObject({ tipo: "totale", importo: 1218.6 });
    if (process.env.COMPUTO_PDF_QA_OUTPUT) {
      const dest = path.resolve(process.env.COMPUTO_PDF_QA_OUTPUT);
      await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, Buffer.from(doc.output("arraybuffer")));
    }
  });
  it("il PDF senza prezzi non rivela unitari, importi, riporti o quadro economico", async () => {
    const doc = await generaComputoPdf(vociDaBozza(bozza), { titolo: "Computo metrico", senzaPrezzi: true });
    const pdf = doc.output();
    for (const testo of ["Unitario", "TOTALE", "Riepilogo per capitoli", "RIPORTO", "35,50", "426,00", "1.218,60"]) expect(pdf).not.toContain(`(${testo})`);
    expect(pdf).toContain("NP.001"); expect(pdf).toContain("Detrazione apertura");
  });
  it("impagina descrizioni e righe di misura più lunghe di una pagina", async () => {
    const v = { ...bozza.voci[0], descrizione: "DESCRIZIONE ESTESA ".repeat(700) + "FINE_DESCRIZIONE", misure: [{ ...misuraVuota(), descrizione: "RIGA MISURA ".repeat(700) + "FINE_MISURA", formula: "12" }] };
    const doc = await generaComputoPdf(vociDaBozza({ ...bozza, voci: [v] }), { titolo: "Stress test locale" });
    expect(doc.getNumberOfPages()).toBeGreaterThan(4);
    expect(doc.output()).toContain("FINE_DESCRIZIONE"); expect(doc.output()).toContain("FINE_MISURA");
  });
});
