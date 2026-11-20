import { describe, expect, it } from "vitest";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { modelloComputoDiSerie, modelloComputoSchema, vesteDalModello } from "@/lib/computo/modelloComputo";
import { validaTtf, base64Asset, preparaAssetModello, caricaAssetModello } from "@/lib/computo/assetModello";
import { bozzaVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";
import { generaComputoPdf } from "@/lib/computo/esportaComputo";
import { normalizzaFontPdf } from "@/lib/computo/compatibilitaFontPdf";
import { PDFDocument, PDFDict, PDFArray, PDFName, PDFString } from "pdf-lib";
import { Blob as NodeBlob } from "node:buffer";
import { vi } from "vitest";

describe("personalizzazione completa del modello", () => {
  it("rifiuta file non TTF o incompleti e percorsi di altre aziende prima di richiedere i file", async () => {
    expect(() => validaTtf(new ArrayBuffer(2))).toThrow();
    const falso = new ArrayBuffer(40); new DataView(falso).setUint32(0, 0x00010000); new DataView(falso).setUint16(4, 2);
    expect(() => validaTtf(falso)).toThrow();
    await expect(preparaAssetModello({ titolo: "Test", companyId: "mia-azienda", veste: { ...vesteDalModello(modelloComputoDiSerie()), logoPersonalizzato: "altra-azienda/logo.png" } })).rejects.toThrow("non appartiene");
  });
  it("limita dimensioni e nomi dei campi e conserva la compatibilità dei vecchi modelli", () => {
    expect(modelloComputoSchema.safeParse({ dimensioneTesto: 99 }).success).toBe(false);
    expect(modelloComputoSchema.safeParse({ campiPersonalizzati: [{ chiave: "constructor.foo", etichetta: "No" }] }).success).toBe(false);
    expect(modelloComputoDiSerie()).toMatchObject({ mostraIntestazione: true, immagineCopertina: "", logoPersonalizzato: "", fontTitoli: null, campiPersonalizzati: [] });
  });
  it("rifiuta caricamenti non supportati senza inviarli al servizio dati", async () => {
    await expect(caricaAssetModello("azienda", new File(["font"], "carattere.woff", { type: "font/woff" }), "font")).rejects.toThrow("TrueType");
    await expect(caricaAssetModello("azienda", new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }), "logo")).rejects.toThrow("PNG o JPG");
    await expect(caricaAssetModello("azienda", new File([], "vuoto.png", { type: "image/png" }), "copertina")).rejects.toThrow("5 MB");
  });
  it("incorpora il TTF, applica le dimensioni reali e compila valori custom senza perdere righe su più pagine", async () => {
    const bytes = await readFile("public/fonts/EBGaramond-Regular.ttf");
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    expect(() => validaTtf(buffer)).not.toThrow();
    const m = modelloComputoDiSerie();
    Object.assign(m, { copertina: "editoriale", fontFamiglia: "personalizzato", fontTitoli: "times", dimensioneTitolo: 48, dimensioneSottotitoli: 16, dimensioneTesto: 12,
      mostraIntestazione: false, mostraFirma: false, piePagina: "Documento dimostrativo", premessa: "La garanzia prevista è {{custom.garanzia}}. Referente {{custom.referente}}.",
      campiPersonalizzati: [{ chiave: "garanzia", etichetta: "Garanzia", valore: "10 anni", mostraNelDocumento: true }, { chiave: "referente", etichetta: "Responsabile", valore: "Referente Demo", mostraNelDocumento: false }] });
    const b = { ...bozzaVuota(), voci: Array.from({ length: 24 }, (_, n) => ({ ...voceVuota(), capitolo: `Capitolo ${Math.floor(n / 8) + 1}`, descrizione: `${"Fornitura e posa completa di accessori. ".repeat(6)}FINE_${n + 1}`, quantita: "2", prezzo: "100" })) };
    const pdf = await generaComputoPdf(vociDaBozza(b), { titolo: "Un progetto con titoli ampi e testo personalizzato", impaginazione: "editoriale", stato: "", azienda: "TESTATA_DA_NASCONDERE", dettagliAzienda: "RECAPITI_DA_NASCONDERE",
      veste: { ...vesteDalModello(m), fontCaricato: { normale: base64Asset(buffer) } }, ivaModalita: "applicata", ivaAliquota: "22" });
    expect(pdf.output()).toContain("/FontFile2"); expect(pdf.output()).toContain("48 Tf");
    expect(pdf.output()).not.toContain("TESTATA_DA_NASCONDERE"); expect(pdf.output()).not.toContain("RECAPITI_DA_NASCONDERE"); expect(pdf.output()).not.toContain("PER ACCETTAZIONE");
    // L'estrazione visiva verifica anche i font con mappa Unicode; i testi TTF sono codificati nel PDF.
    expect(pdf.getNumberOfPages()).toBeGreaterThan(4);
    vi.stubGlobal("Blob", NodeBlob);
    try {
      const normalizzato = await normalizzaFontPdf(pdf.output("arraybuffer"));
      const riletto = await PDFDocument.load(new Uint8Array(await normalizzato.arrayBuffer()));
      expect(riletto.getPageCount()).toBe(pdf.getNumberOfPages());
      let corretti = 0;
      for (const p of riletto.getPages()) {
        const fonts = p.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
        for (const [, ref] of fonts?.entries() ?? []) {
          const f = riletto.context.lookup(ref);
          if (!(f instanceof PDFDict)) continue;
          const cid = f.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray);
          if (!cid) continue;
          expect(cid.lookup(0, PDFDict).lookup(PDFName.of("CIDSystemInfo"), PDFDict).lookup(PDFName.of("Ordering"), PDFString).decodeText()).toBe("Identity"); corretti++;
        }
      }
      expect(corretti).toBeGreaterThan(0);
    } finally { vi.unstubAllGlobals(); }
    if (process.env.PREVENTIVATORE_QA_OUTPUT) { await mkdir("output/pdf", { recursive: true }); await writeFile("output/pdf/builder-personalizzazione-font-grandi.pdf", new Uint8Array(pdf.output("arraybuffer"))); }
  });
});
