import { describe, it, expect } from "vitest";
import {
  htmlToRichBlocks,
  decodeHtmlEntities,
  richBlocksToPlainText,
} from "@/lib/ristrutturazione/richTextPdf";

describe("richTextPdf — htmlToRichBlocks", () => {
  it("ritorna [] per input vuoto/whitespace/null", () => {
    expect(htmlToRichBlocks(null)).toEqual([]);
    expect(htmlToRichBlocks(undefined)).toEqual([]);
    expect(htmlToRichBlocks("   \n  ")).toEqual([]);
  });

  it("testo semplice: un paragrafo singolo", () => {
    const b = htmlToRichBlocks("Da oltre 20 anni realizziamo ristrutturazioni.");
    expect(b).toEqual([
      { type: "paragraph", runs: [{ text: "Da oltre 20 anni realizziamo ristrutturazioni." }] },
    ]);
  });

  it("testo semplice: paragrafi separati da riga vuota", () => {
    const b = htmlToRichBlocks("Primo paragrafo.\n\nSecondo paragrafo.");
    expect(b.map((x) => x.type)).toEqual(["paragraph", "paragraph"]);
    expect(b[1].runs[0].text).toBe("Secondo paragrafo.");
  });

  it("testo semplice: righe con trattino/bullet diventano bullet", () => {
    const b = htmlToRichBlocks("- Sopralluogo gratuito\n- Preventivo dettagliato\n• Posa certificata");
    expect(b).toHaveLength(3);
    expect(b.every((x) => x.type === "bullet")).toBe(true);
    expect(b[0].runs[0].text).toBe("Sopralluogo gratuito");
    expect(b[2].runs[0].text).toBe("Posa certificata");
  });

  it("HTML: paragrafi <p>", () => {
    const b = htmlToRichBlocks("<p>Primo.</p><p>Secondo.</p>");
    expect(b).toHaveLength(2);
    expect(b[0]).toEqual({ type: "paragraph", runs: [{ text: "Primo." }] });
  });

  it("HTML: lista <ul><li> diventa bullet", () => {
    const b = htmlToRichBlocks("<ul><li>Uno</li><li>Due</li></ul>");
    expect(b.map((x) => x.type)).toEqual(["bullet", "bullet"]);
    expect(b[1].runs[0].text).toBe("Due");
  });

  it("HTML: grassetto e corsivo inline producono run distinti", () => {
    const b = htmlToRichBlocks("<p>Testo <strong>in grassetto</strong> e <em>corsivo</em>.</p>");
    expect(b).toHaveLength(1);
    const runs = b[0].runs;
    expect(runs.find((r) => r.bold)?.text).toBe("in grassetto");
    expect(runs.find((r) => r.italic)?.text).toBe("corsivo");
    // il testo normale resta senza flag
    expect(runs[0]).toEqual({ text: "Testo " });
  });

  it("HTML: <br> diventa spazio nel paragrafo", () => {
    const b = htmlToRichBlocks("<p>Riga uno<br/>Riga due</p>");
    expect(b).toHaveLength(1);
    expect(richBlocksToPlainText(b)).toContain("Riga uno");
    expect(richBlocksToPlainText(b)).toContain("Riga due");
  });

  it("HTML: tag sconosciuti vengono rimossi, entità decodificate", () => {
    const b = htmlToRichBlocks('<p><span style="x">Ke &amp; Bei</span>&nbsp;Serramenti</p>');
    expect(b).toHaveLength(1);
    expect(b[0].runs.map((r) => r.text).join("")).toBe("Ke & Bei Serramenti");
  });

  it("HTML inline senza blocchi: ripiega su testo semplice", () => {
    const b = htmlToRichBlocks("Solo <strong>grassetto</strong> senza paragrafo");
    expect(b).toHaveLength(1);
    expect(b[0].type).toBe("paragraph");
    expect(b[0].runs.map((r) => r.text).join("")).toContain("grassetto");
  });
});

describe("richTextPdf — decodeHtmlEntities", () => {
  it("decodifica numeriche, esadecimali e nominali", () => {
    expect(decodeHtmlEntities("a&#39;b")).toBe("a'b");
    expect(decodeHtmlEntities("5&#x20AC;")).toBe("5€");
    expect(decodeHtmlEntities("Tom &amp; Jerry &mdash; ok")).toBe("Tom & Jerry — ok");
  });
});
