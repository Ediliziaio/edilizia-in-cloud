/**
 * Contratto sui fix di impaginazione PDF (audit luglio 2026).
 *
 * Bug coperti:
 *  1. Computo troncato: il contenitore capitolo di CapitoloTable era wrap={false}
 *     → un capitolo lungo veniva spostato a pagina nuova e TAGLIATO. Ora il
 *     contenitore scorre e l'header capitolo ha minPresenceAhead (niente orfani).
 *  2. OrdinePDF: glifi non-WinAnsi (emoji meteo, →, 📷, ✓, ↗/↙) che Helvetica
 *     non ha → caratteri spazzatura nel PDF.
 *  3. SerramentoPDF: footer 4-5 righe sovrapposto al contenuto (paddingBottom
 *     troppo basso) e "≈" non-WinAnsi.
 *  4. numberOfLines non esiste in react-pdf: serve maxLines/textOverflow (stile).
 *  5. richTextPdf: <br> reso come spazio → a-capo persi ("testi attaccati").
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { htmlToRichBlocks } from "@/lib/ristrutturazione/richTextPdf";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

// Dal 20/09/2026 gli otto moduli edili consegnano lo stesso documento: le garanzie
// di impaginazione si controllano lì, una volta, e ogni modulo deve passare da lì.
const DOCUMENTO = "src/components/preventivi/pdf/DocumentoEdilePDF.tsx";
const MODULI_PDF = [
  "src/components/bagni/BagniPDF.tsx",
  "src/components/climatizzazione/ClimatizzazionePDF.tsx",
  "src/components/elettrico/ElettricoPDF.tsx",
  "src/components/pavimenti/PavimentiPDF.tsx",
  "src/components/piscine/PiscinePDF.tsx",
  "src/components/ristrutturazione/RistrutturazionePDF.tsx",
  "src/components/tetti/TettiPDF.tsx",
  "src/components/termoidraulico/TermoidraulicoPDF.tsx",
];

describe("computo nel documento edile condiviso (TabellaCapitolo)", () => {
  const src = read(DOCUMENTO);
  const tabella = src.slice(src.indexOf("function TabellaCapitolo("), src.indexOf("// ─── Copertina"));

  it("il capitolo non è atomico: uno lungo scorre sulla pagina dopo, non viene tagliato", () => {
    // Il contenitore del capitolo scorre…
    expect(tabella).toMatch(/return \(\s*\n\s*<View minPresenceAhead=\{spazioDopo\} style=\{\{ marginBottom: 16 \}\}>/);
    // …l'intestazione del capitolo non resta orfana in fondo alla pagina…
    expect(tabella).toContain("<View wrap={false}>");
    expect(tabella).toContain("{cap.voci[0] ? riga(cap.voci[0]) : null}");
    // …e le singole voci restano intere.
    expect(tabella).toMatch(/<View key=\{v\.id\} wrap=\{false\}/);
  });

  it("paddingBottom della pagina >= 90 (piè di pagina fino a cinque righe)", () => {
    const m = src.match(/const pagina = \{ paddingTop: \d+, paddingBottom: (\d+),/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(90);
  });

  it("«Chi siamo» non è atomico: un testo lungo non viene troncato", () => {
    expect(src).not.toMatch(/<View wrap=\{false\}[^>]*>\s*\n\s*<TestoRicco html=\{modello\.chiSiamoHtml\}/);
  });

  it("solo caratteri che i font interni sanno disegnare (niente frecce, spunte, meno tipografico)", () => {
    for (const glifo of ["→", "←", "✓", "✔", "−", "≈", "›", "‹", "★", "☀"]) {
      expect(src).not.toContain(glifo);
    }
  });

  it.each(MODULI_PDF)("%s passa dal documento condiviso, senza una sua impaginazione", (rel) => {
    const modulo = read(rel);
    expect(modulo).toContain("<DocumentoEdilePDF dati={dati} />");
    expect(modulo).toContain("costruisciDatiEdile(");
    expect(modulo).not.toContain("<Page");
    expect(modulo).not.toContain("StyleSheet");
  });
});

describe("OrdinePDF: niente glifi fuori WinAnsi e niente numberOfLines", () => {
  const src = read("src/components/orders/OrdinePDF.tsx");

  it("non contiene numberOfLines (non esiste in react-pdf)", () => {
    expect(src).not.toContain("numberOfLines");
    // Il troncamento avviene con le proprietà di STILE supportate da react-pdf.
    expect(src).toMatch(/maxLines: \d+, textOverflow: "ellipsis"/);
  });

  it("non contiene frecce/emoji che Helvetica non sa disegnare", () => {
    for (const glyph of ["→", "↗", "↙", "✓", "📷", "☀", "☁", "🌧", "❄", "💨"]) {
      expect(src).not.toContain(glyph);
    }
  });

  it("le etichette meteo sono solo testo", () => {
    expect(src).toContain('sereno: "Sereno"');
    expect(src).toContain('vento: "Vento"');
  });

  it("header colonne articoli fixed (si ripete sulle pagine della tabella)", () => {
    expect(src).toMatch(/<View style=\{styles\.tableHeader\} fixed>\s*\n\s*<Text style=\{\[styles\.tableHeaderText, \{ flex: 2\.5 \}\]\}>Articolo<\/Text>/);
  });
});

describe("SerramentoPDF: footer non sovrapposto e glifi WinAnsi", () => {
  const src = read("src/components/serramenti/SerramentoPDF.tsx");

  it("paddingBottom della pagina >= 90", () => {
    const m = src.match(/paddingBottom: (\d+),/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(90);
  });

  it("niente '≈' (non-WinAnsi): usa '~' ASCII", () => {
    expect(src).not.toContain("≈");
    expect(src).toContain("~ da € ");
  });

  it("icone metriche renderizzate solo se ASCII stampabile", () => {
    expect(src).toMatch(/m\.icon && \/\^\[\\x20-\\x7E\]\+\$\/\.test\(m\.icon\)/);
  });
});

describe("richTextPdf (bagni): <br> produce un a-capo reale", () => {
  it("il tag <br> emette \\n nel run (in react-pdf va a capo dentro <Text>)", () => {
    const blocks = htmlToRichBlocks("<p>prima riga<br>seconda riga</p>");
    expect(blocks).toHaveLength(1);
    const text = blocks[0].runs.map((r) => r.text).join("");
    expect(text).toBe("prima riga\nseconda riga");
  });

  it("<br/> autochiuso e br multipli producono a-capo multipli", () => {
    const blocks = htmlToRichBlocks("<p>a<br/><br/>b</p>");
    const text = blocks[0].runs.map((r) => r.text).join("");
    expect(text).toBe("a\n\nb");
  });

  it("i br dentro run in grassetto non spezzano la formattazione", () => {
    const blocks = htmlToRichBlocks("<p><strong>titolo<br>riga2</strong> normale</p>");
    const text = blocks[0].runs.map((r) => r.text).join("");
    expect(text).toContain("titolo\nriga2");
  });
});
