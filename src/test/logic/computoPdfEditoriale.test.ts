import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { computoCompletoDimostrativo } from "../fixtures/computoCompleto";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";
import { leggiBozzaComputo, vociDaBozza, vociPerAnteprima } from "@/lib/computo/editorNativo";
import { applicaVarianteComputo } from "@/lib/computo/variantiPdf";

describe("computo editoriale completo", () => {
  it("stampa imponibile, IVA e un unico totale comprensivo di imposta", async () => {
    const b = computoCompletoDimostrativo();
    const doc = await generaComputoPdf(vociDaBozza({ ...b, voci: [{ ...b.voci[0], misure: [], quantita: "2", prezzo: "133" }] }), {
      titolo: "IVA di collaudo", impaginazione: "editoriale", ivaModalita: "applicata", ivaAliquota: "22", ivaNota: "Nota fiscale di collaudo",
    });
    const out = doc.output();
    expect(out).toContain("IVA 22%"); expect(out).toContain("58,52"); expect(out).toContain("324,52");
    expect(out.match(/\(TOTALE IVA INCLUSA\)/g)).toHaveLength(1);
    expect(out).toContain("Nota fiscale di collaudo");
    if (process.env.COMPUTO_PDF_QA_OUTPUT) await writeFile("output/pdf/computo-esempio-iva.pdf", Buffer.from(doc.output("arraybuffer")));
  });
  it("non mostra IVA e nota fiscale quando il documento è senza prezzi", async () => {
    const b = computoCompletoDimostrativo();
    const doc = await generaComputoPdf(vociDaBozza(b), { titolo: "Senza prezzi", impaginazione: "editoriale", senzaPrezzi: true, ivaModalita: "applicata", ivaAliquota: "22", ivaNota: "NOTA_FISCALE_RISERVATA" });
    expect(doc.output()).not.toContain("IVA 22%"); expect(doc.output()).not.toContain("NOTA_FISCALE_RISERVATA");
    expect(doc.output()).not.toContain("TOTALE IVA INCLUSA");
  });
  it("ripete le intestazioni tabellari e mantiene fino all'ultima riga nelle descrizioni lunghe", async () => {
    const b = computoCompletoDimostrativo(), voci = vociDaBozza({ ...b, voci: [b.voci[0]] });
    voci[0].descrizione_estesa = `${"Descrizione tecnica completa da conservare. ".repeat(500)} FINE_LAVORAZIONE`;
    const prima = JSON.stringify(voci);
    const doc = await generaComputoPdf(voci, { titolo: "Tabella multipagina", impaginazione: "editoriale", dettaglioMisure: false });
    expect(doc.output()).toContain("FINE_LAVORAZIONE");
    expect(doc.output().match(/DESCRIZIONE DELLA LAVORAZIONE/g)!.length).toBeGreaterThan(2);
    expect(JSON.stringify(voci)).toBe(prima);
  });
  it("separa la copertina anche nei computi con una sola voce", async () => {
    const bozza = computoCompletoDimostrativo();
    const doc = await generaComputoPdf(vociDaBozza({ ...bozza, voci: [bozza.voci[0]] }), { titolo: "Copertina sempre", impaginazione: "editoriale" });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect((doc.internal.pages as unknown as Record<number, string[]>)[1].join(" ")).not.toContain("DESCRIZIONE DELLA LAVORAZIONE");
    expect((doc.internal.pages as unknown as Record<number, string[]>)[2].join(" ")).toContain("DESCRIZIONE DELLA LAVORAZIONE");
  });
  it("nasconde gli unitari senza perdere gli importi e le misure", async () => {
    const b = computoCompletoDimostrativo();
    const doc = await generaComputoPdf(vociDaBozza(b), { titolo: b.titolo, impaginazione: "editoriale", mostraPrezziUnitari: false, dettaglioMisure: true });
    expect(doc.output()).not.toContain("PREZZO UNITARIO");
    expect(doc.output()).toContain("IMPORTO VOCE"); expect(doc.output()).toContain("MISURAZIONI");
    expect(doc.output()).toContain("TOTALE IMPONIBILE");
  });
  it("esclude codici, fonti e importi solo dalla presentazione", async () => {
    const b = computoCompletoDimostrativo(), voci = vociDaBozza(b), prima = JSON.stringify(voci);
    const doc = await generaComputoPdf(voci, { titolo: b.titolo, impaginazione: "editoriale", mostraCodici: false, mostraFonti: false, mostraImporti: false, mostraPrezziUnitari: false, riferimentoPrezzi: "RIFERIMENTO_RISERVATO" });
    for (const s of ["NP.13", "RIFERIMENTO_RISERVATO", "FONTI DELLE VOCI", "IMPORTO VOCE", "TOTALE IMPONIBILE", "PREZZO UNITARIO"]) expect(doc.output()).not.toContain(s);
    expect(JSON.stringify(voci)).toBe(prima);
  });
  it("il riepilogo mostra solo i capitoli e un unico totale finale", async () => {
    const b = computoCompletoDimostrativo();
    const doc = await generaComputoPdf(vociDaBozza(b), { ...b, impaginazione: "editoriale", soloRiepilogo: true });
    const out = doc.output(); expect(out).toContain("Riepilogo economico");
    expect(out).not.toContain("NP.13"); expect(out).not.toContain("MISURAZIONI");
    expect(out.match(/\(TOTALE IMPONIBILE\)/g)).toHaveLength(1);
    if (process.env.COMPUTO_PDF_QA_OUTPUT) await writeFile("output/pdf/computo-ristrutturazione-riepilogo.pdf", Buffer.from(doc.output("arraybuffer")));
  });
  it("mantiene tutte le voci, le misure e le condizioni nel nuovo documento", async () => {
    const bozza = computoCompletoDimostrativo();
    const doc = await generaComputoPdf(vociDaBozza(bozza), { ...bozza, azienda: "Edilizia in Cloud", impaginazione: "editoriale", dettaglioMisure: true, indirizzoIntervento: bozza.indirizzo });
    const out = doc.output();
    for (const v of bozza.voci) expect(out).toContain(v.tariffa);
    expect(out).toContain("MISURAZIONI"); expect(out).toContain("PARTI");
    expect(out).toContain("Riepilogo economico"); expect(out).toContain("Perimetro e condizioni");
    expect(out).toContain("NP.13"); expect(out.match(/\(TOTALE IMPONIBILE\)/g)).toHaveLength(1);
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    // Le colonne economiche riducono la larghezza delle descrizioni, senza tagliarle.
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(6);
    if (process.env.COMPUTO_PDF_QA_OUTPUT) {
      await mkdir("output/pdf", { recursive: true }); await mkdir("output/computo", { recursive: true });
      await writeFile("output/pdf/computo-ristrutturazione-completo.pdf", Buffer.from(doc.output("arraybuffer")));
      await writeFile("output/computo/esempio-computo-completo.bozza.json", JSON.stringify(bozza, null, 2));
    }
  });
  it("la variante senza prezzi conserva misure e lavorazioni ma non i prezzi calcolati", async () => {
    const bozza = computoCompletoDimostrativo();
    const doc = await generaComputoPdf(vociDaBozza(bozza), { ...bozza, titolo: "Ristrutturazione - computo senza prezzi", azienda: "Edilizia in Cloud", indirizzoIntervento: bozza.indirizzo, impaginazione: "editoriale", dettaglioMisure: true, senzaPrezzi: true });
    const out = doc.output();
    expect(out).toContain("NP.13"); expect(out).toContain("MISURAZIONI");
    expect(out).not.toContain("PREZZO UNITARIO"); expect(out).not.toContain("TOTALE IMPONIBILE"); expect(out).not.toContain("Riepilogo economico");
    if (process.env.COMPUTO_PDF_QA_OUTPUT) await writeFile("output/pdf/computo-ristrutturazione-senza-prezzi.pdf", Buffer.from(doc.output("arraybuffer")));
  });
  it("permette la presentazione sintetica senza eliminare le misure dai dati", async () => {
    const bozza = computoCompletoDimostrativo(), voci = vociDaBozza(bozza);
    const doc = await generaComputoPdf(voci, { titolo: "Sintesi", impaginazione: "editoriale", dettaglioMisure: false });
    expect(doc.output()).not.toContain("MISURAZIONI"); expect(voci[0].misure.length).toBe(1);
    expect(doc.output()).toContain("NP.13");
  });
  it.skipIf(!process.env.COMPUTO_SOURCE_JSON)("riproduce la bozza sorgente locale nelle tre versioni, segnalando i dati incompleti", async () => {
    const b = leggiBozzaComputo(await readFile(process.env.COMPUTO_SOURCE_JSON!, "utf8"));
    expect(b.voci.length).toBe(55);
    expect(b.voci.some(v => v.tariffa === "S.1.01.4.4")).toBe(true);
    const { voci, incomplete } = vociPerAnteprima(b);
    expect(incomplete).toBe(1);
    for (const variant of ["completo", "cliente", "senza-prezzi", "riepilogo"] as const) {
      const opzioni = applicaVarianteComputo(b, variant === "completo" ? "tecnico" : variant);
      const doc = await generaComputoPdf(voci, { ...b, azienda: "Edilizia in Cloud", indirizzoIntervento: b.indirizzo, impaginazione: "editoriale",
        mostraPrezziUnitari: opzioni.mostraPrezziUnitariPdf, mostraImporti: opzioni.mostraImportiPdf, mostraCodici: opzioni.mostraCodiciPdf, mostraFonti: opzioni.mostraFontiPdf,
        dettaglioMisure: opzioni.mostraMisurePdf, senzaPrezzi: variant === "senza-prezzi", soloRiepilogo: variant === "riepilogo", parziale: "RIPRODUZIONE DA VERIFICARE: dati mancanti e incongruenze presenti nella fonte. Totale parziale ricalcolato, non un'offerta." });
      if (variant === "senza-prezzi") expect(doc.output()).not.toContain("PREZZO UNITARIO");
      if (variant === "riepilogo") expect(doc.output()).not.toContain("MISURAZIONI");
      await writeFile(`output/pdf/giulia-replica-${variant}.pdf`, Buffer.from(doc.output("arraybuffer")));
    }
  });
  it("non ripete i testi comuni delle sottovoci consecutive e non li cancella dai dati", async () => {
    const b = computoCompletoDimostrativo(), voci = vociDaBozza({ ...b, voci: b.voci.slice(0, 2) });
    voci.forEach(v => { v.descrizione_comune = "DESCRIZIONE_COMUNE_UNICA"; });
    const doc = await generaComputoPdf(voci, { titolo: "Sottovoci", impaginazione: "editoriale" });
    expect(doc.output().match(/\(DESCRIZIONE_COMUNE_UNICA\)/g)).toHaveLength(1);
    expect(voci[1].descrizione_comune).toBe("DESCRIZIONE_COMUNE_UNICA");
  });
  it("cambia variante senza modificare voci, misure, cliente o condizioni", () => {
    const b = computoCompletoDimostrativo();
    const copia = JSON.stringify(b);
    for (const formato of ["cliente", "tecnico", "senza-prezzi", "riepilogo"] as const) {
      const next = applicaVarianteComputo(b, formato);
      expect(next.voci).toBe(b.voci); expect(next.committente).toBe(b.committente); expect(next.condizioni).toBe(b.condizioni);
      expect(next.formatoPdf).toBe(formato);
    }
    expect(JSON.stringify(b)).toBe(copia);
  });
});
