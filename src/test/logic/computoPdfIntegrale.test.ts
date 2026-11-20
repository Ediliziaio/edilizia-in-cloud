import { describe, expect, it } from "vitest";
import { bozzaVuota, misuraVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";
import { modelloComputoDiSerie, vesteDalModello } from "@/lib/computo/modelloComputo";

describe("impaginazione del computo integrale", () => {
  it("legge la voce dall'alto in basso e riporta il prezzo una sola volta dopo le misure", async () => {
    const b = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "LAVORAZIONE_CAMPIONE", prezzo: "17.23", misure: [
      { ...misuraVuota(), descrizione: "PRIMO_RILIEVO", parti: "2", lunghezza: "3" },
      { ...misuraVuota(), descrizione: "ULTIMO_RILIEVO", parti: "3", lunghezza: "4" },
    ] }] };
    const voci = vociDaBozza(b), prima = JSON.stringify(voci);
    const doc = await generaComputoPdf(voci, { titolo: "Computo", impaginazione: "editoriale", dettaglioMisure: true, sezioni: { riepilogo: false } });
    const out = doc.output();
    expect(out.indexOf("LAVORAZIONE_CAMPIONE")).toBeLessThan(out.indexOf("PRIMO_RILIEVO"));
    expect(out.indexOf("ULTIMO_RILIEVO")).toBeLessThan(out.indexOf("(SOMMANO) Tj"));
    expect(out.indexOf("(SOMMANO) Tj")).toBeLessThan(out.indexOf("(17,23) Tj"));
    expect(out.match(/\(17,23\) Tj/g)).toHaveLength(1);
    expect(out).toContain("(310,14) Tj"); expect(out).toContain("(U.M.) Tj"); expect(out).toContain("(mq) Tj");
    expect(out).toContain("Parti 2 / Lung. 3"); expect(out).toContain("Parti 3 / Lung. 4");
    expect(JSON.stringify(voci)).toBe(prima);
  });
  it("disattiva solo la stampa delle misure e mantiene quantità e prezzo finali", async () => {
    const b = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Lavorazione", prezzo: "17.23", misure: [{ ...misuraVuota(), descrizione: "RILIEVO_RISERVATO", lunghezza: "3", larghezza: "4" }] }] };
    const voci = vociDaBozza(b), prima = JSON.stringify(voci);
    const doc = await generaComputoPdf(voci, { titolo: "Computo", impaginazione: "editoriale", dettaglioMisure: false, sezioni: { riepilogo: false } });
    const out = doc.output();
    expect(out).not.toContain("RILIEVO_RISERVATO"); expect(out).not.toContain("Lung. 3");
    expect(out).toContain("(12,00) Tj"); expect(out).toContain("(206,76) Tj"); expect(JSON.stringify(voci)).toBe(prima);
  });
  it("espone IVA e sconto solo quando applicati, senza cambiare il prezzo della voce", async () => {
    const b = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Lavorazione", quantita: "2", prezzo: "100" }] };
    const voci = vociDaBozza(b);
    const doc = await generaComputoPdf(voci, { titolo: "Computo", impaginazione: "editoriale", ivaModalita: "applicata", ivaAliquota: "22", sconto: { tipo: "percentuale", valore: "10", descrizione: "SCONTO_COMMERCIALE" } });
    expect(doc.output()).toContain("SCONTO_COMMERCIALE 10%"); expect(doc.output()).toContain("IVA 22%");
    expect(doc.output()).toContain("219,60"); expect(doc.output()).toContain("39,60"); expect(doc.output()).toContain("(100,00) Tj");
    const senza = await generaComputoPdf(voci, { titolo: "Computo", impaginazione: "editoriale", ivaModalita: "non-applicabile" });
    expect(senza.output()).not.toContain("SCONTO_COMMERCIALE"); expect(senza.output()).not.toContain("IVA 22%"); expect(senza.output()).toContain("200,00");
  });
  it("mostra soltanto le dimensioni usate nelle misure della voce", async () => {
    const b = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Due ambienti", prezzo: "10", misure: [{ ...misuraVuota(), descrizione: "Camera", formula: "2*3" }, { ...misuraVuota(), descrizione: "Bagno", formula: "1*2" }] }] };
    const voci = vociDaBozza(b), prima = JSON.stringify(voci);
    const pdf = await generaComputoPdf(voci, { titolo: "Computo", impaginazione: "editoriale", dettaglioMisure: true });
    const testo = pdf.output();
    expect(testo).toContain("(SOMMANO) Tj"); expect(testo).toContain("Formula: 2*3"); expect(testo).toContain("Formula: 1*2");
    for (const colonna of ["(PARTI)", "(LUNG.)", "(LARG.)", "(H/PESO)"]) expect(testo).not.toContain(colonna);
    expect(JSON.stringify(voci)).toBe(prima);
  });
  it("mantiene il totale finale entro 12 punti anche con testo del modello molto grande", async () => {
    const b = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Lavorazione", quantita: "2", prezzo: "133" }] };
    const pdf = await generaComputoPdf(vociDaBozza(b), { titolo: "Computo", impaginazione: "editoriale", ivaModalita: "applicata", ivaAliquota: "22", sezioni: { firme: false }, veste: vesteDalModello({ ...modelloComputoDiSerie(), dimensioneTesto: 18, mostraFirma: false }) });
    const blocchi = [...pdf.output().matchAll(/BT([\s\S]*?)ET/g)].map(m => m[1]).filter(t => t.includes("324,52"));
    expect(blocchi).toHaveLength(1);
    expect(Number(blocchi[0].match(/\/F\d+\s+([\d.]+) Tf/)?.[1])).toBeLessThanOrEqual(12);
    expect(pdf.output().match(/\(TOTALE IVA INCLUSA\)/g)).toHaveLength(1);
  });
  it("separa il titolo della sottocategoria dalla chiusura della tabella precedente", async () => {
    const b = { ...bozzaVuota(), voci: ["SOTTOCATEGORIA_UNO", "SOTTOCATEGORIA_DUE"].map(categoria => ({ ...voceVuota(), capitolo: "Capitolo", categoria, descrizione: "Lavorazione", quantita: "1", prezzo: "10" })) };
    const doc = await generaComputoPdf(vociDaBozza(b), { titolo: "Computo", impaginazione: "editoriale", sezioni: { indice: false, riepilogo: false } });
    const pagina = (doc.internal as unknown as { pages: string[][] }).pages.find(p => p?.join("\n").includes("(SOTTOCATEGORIA_DUE) Tj"))!.join("\n");
    const blocchi = [...pagina.matchAll(/BT([\s\S]*?)ET/g)].map(m => m[1]);
    const titolo = blocchi.find(b => b.includes("(SOTTOCATEGORIA_DUE) Tj"))!;
    const prima = blocchi.slice(0, blocchi.indexOf(titolo)).reverse().find(b => b.includes("(SOMMANO) Tj"))!;
    const coordinata = (blocco: string) => Number(blocco.match(/[-\d.]+ ([-\d.]+) Td/)?.[1]);
    expect(coordinata(prima) - coordinata(titolo)).toBeGreaterThan(22);
  });
  it("raccoglie la misura senza dimensioni nel totale e conserva riferimento e formula composta", async () => {
    const b = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Lavorazione con formula", prezzo: "25", misure: [{ ...misuraVuota(), descrizione: "Camera", formula: "2*3" }] }] };
    const voci = vociDaBozza(b), prima = JSON.stringify(voci);
    const pdf = await generaComputoPdf(voci, { titolo: "Computo", impaginazione: "editoriale", dettaglioMisure: true });
    expect(pdf.output()).toContain("Camera / Formula: 2*3");
    expect(pdf.output()).toContain("(6,00) Tj"); expect(pdf.output()).toContain("(mq) Tj"); expect(pdf.output()).toContain("150,00");
    expect(pdf.output()).not.toContain("MISURAZIONI"); expect(JSON.stringify(voci)).toBe(prima);
  });
  it("mantiene distinta una misura che non coincide con la quantità della voce", async () => {
    const b = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Quantità da verificare", prezzo: "25", misure: [{ ...misuraVuota(), descrizione: "Rilievo", formula: "6" }] }] };
    const voci = vociDaBozza(b); voci[0].quantita = 8;
    const pdf = await generaComputoPdf(voci, { titolo: "Computo", impaginazione: "editoriale", dettaglioMisure: true });
    expect(pdf.output()).toContain("(6,00) Tj"); expect(pdf.output()).toContain("Rilievo"); expect(pdf.output()).toContain("(SOMMANO) Tj");
  });
  it("non perde il testo delle misure lunghe e chiude la voce sulla loro ultima pagina", async () => {
    const b = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Misura su più pagine", prezzo: "10", misure: [{ ...misuraVuota(), descrizione: `${"Riferimento completo della misura. ".repeat(180)} FINE_RILIEVO`, parti: "3", lunghezza: "2" }] }] };
    const pdf = await generaComputoPdf(vociDaBozza(b), { titolo: "Computo", impaginazione: "editoriale", dettaglioMisure: true, veste: vesteDalModello({ ...modelloComputoDiSerie(), dimensioneTesto: 12 }) });
    const pagine = (pdf.internal as unknown as { pages: string[][] }).pages;
    const finale = pagine.find(p => p?.join("\n").includes("FINE_RILIEVO"));
    expect(finale).toBeDefined(); expect(finale!.join("\n")).toContain("(SOMMANO) Tj"); expect(pdf.output()).toContain("Voce 1 - continua");
  });
  it("tiene capitoli e sottocategorie insieme all'inizio della prima voce", async () => {
    const b = { ...bozzaVuota(), voci: Array.from({ length: 18 }, (_, n) => ({ ...voceVuota(), capitolo: `CAPITOLO_${n}`, sottocategoria: `GRUPPO_${n}`, tariffa: `CODICE_${n}`, descrizione: "Descrizione completa e dettagli tecnici della lavorazione. ".repeat(6 + n % 4), quantita: "1", prezzo: "10" })) };
    const pdf = await generaComputoPdf(vociDaBozza(b), { titolo: "Computo", impaginazione: "editoriale", veste: vesteDalModello({ ...modelloComputoDiSerie(), dimensioneTesto: 12 }), sezioni: { indice: false } });
    const pagine = (pdf.internal as unknown as { pages: string[][] }).pages;
    for (let n = 0; n < 18; n++) {
      const pagina = pagine.find(p => p?.join("\n").includes(`(CODICE_${n}) Tj`));
      expect(pagina).toBeDefined(); expect(pagina!.join("\n")).toContain(`(CAPITOLO_${n}) Tj`); expect(pagina!.join("\n")).toContain(`(GRUPPO_${n}) Tj`);
    }
  });
  it("con testo grande mantiene interi i numeri di voce a tre e quattro cifre", async () => {
    const b = { ...bozzaVuota(), voci: [226, 1234].map(n => ({ ...voceVuota(), numero: String(n), descrizione: `Lavorazione ${n}`, quantita: "1", prezzo: "10" })) };
    const pdf = await generaComputoPdf(vociDaBozza(b), { titolo: "Computo", impaginazione: "editoriale", veste: vesteDalModello({ ...modelloComputoDiSerie(), dimensioneTesto: 12 }) });
    expect(pdf.output()).toContain("(226) Tj"); expect(pdf.output()).toContain("(1234) Tj");
  });
  it("riporta tutto il riferimento del documento nelle testate delle pagine successive", async () => {
    const b = { ...bozzaVuota(), voci: Array.from({ length: 16 }, (_, n) => ({ ...voceVuota(), descrizione: `Lavorazione ${n + 1} ${"Descrizione completa con riferimenti. ".repeat(10)}`, quantita: "1", prezzo: "10" })) };
    const numero = "DEMO-CM-GENZANO-001";
    const pdf = await generaComputoPdf(vociDaBozza(b), { titolo: "Computo completo", numero, impaginazione: "editoriale", sezioni: { firme: false }, veste: vesteDalModello({ ...modelloComputoDiSerie(), dimensioneTesto: 12, mostraIntestazione: false, mostraFirma: false }) });
    const pagine = (pdf.internal as unknown as { pages: string[][] }).pages;
    expect(pdf.getNumberOfPages()).toBeGreaterThan(2);
    for (let n = 2; n <= pdf.getNumberOfPages(); n++) expect(pagine[n].join("\n")).toContain(`(${numero}) Tj`);
  });
  it("tiene la somma con l'ultima riga di misura", async () => {
    const b = { ...bozzaVuota(), voci: Array.from({ length: 18 }, (_, n) => ({ ...voceVuota(), descrizione: `Lavorazione ${n + 1} ${"Testo completo di capitolato e riferimenti. ".repeat(7)}`, quantita: "", prezzo: "10", misure: [
      { ...misuraVuota(), descrizione: "Prima misura", parti: "1" },
      { ...misuraVuota(), descrizione: `ULTIMA_MISURA_${n + 1}`, parti: String((n + 1) * 10) },
    ] })) };
    const pdf = await generaComputoPdf(vociDaBozza(b), { titolo: "Computo con misure", impaginazione: "editoriale", dettaglioMisure: true });
    const pagine = (pdf.internal as unknown as { pages: string[][] }).pages;
    for (let n = 1; n <= 18; n++) {
      const pagina = pagine.find(p => p?.join("\n").includes(`(ULTIMA_MISURA_${n}) Tj`));
      expect(pagina).toBeDefined(); expect(pagina!.join("\n")).toContain("(SOMMANO) Tj"); expect(pagina!.join("\n")).toContain(`(${n * 10 + 1},00) Tj`);
    }
  });
});
