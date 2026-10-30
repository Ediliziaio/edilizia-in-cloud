import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allegatiPerInvioSdi, formatoAllegatoSdi, MAX_BYTES_ALLEGATI_SDI, nomeAllegatoSdi } from "../../../supabase/functions/_shared/allegatiSdi";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";

// 30/10/2026 — Allegati delle fatture: sui documenti SDI quelli scelti partono
// dentro l'XML (<Allegati>), letti prima di prenotare l'invio.

const RADICE = join(__dirname, "../../..");

describe("nome e formato per lo SDI", () => {
  it("nome al massimo 60 caratteri, l'estensione resta", () => {
    const n = nomeAllegatoSdi(`${"contabile bonifico fornitore ".repeat(4)}.pdf`);
    expect(n.length).toBeLessThanOrEqual(60);
    expect(n.endsWith(".pdf")).toBe(true);
    expect(nomeAllegatoSdi("Verbale è già firmato.pdf")).toBe("Verbale _ gi_ firmato.pdf");
  });
  it("formato dall'estensione, in maiuscolo", () => {
    expect(formatoAllegatoSdi("ddt.pdf")).toBe("PDF");
    expect(formatoAllegatoSdi("foto.jpeg")).toBe("JPEG");
    expect(formatoAllegatoSdi("senza-estensione", "image/png")).toBe("PNG");
  });
});

function dbFinto(righe: unknown[], file: Record<string, Uint8Array | null>) {
  return {
    from: () => {
      const c: any = {};
      for (const m of ["select", "eq", "order"]) c[m] = () => c;
      c.then = (ok: (v: unknown) => unknown) => ok({ data: righe, error: null as null });
      return c;
    },
    storage: { from: () => ({ download: async (p: string) => file[p] ? { data: new Blob([file[p] as BlobPart]), error: null as null } : { data: null as Blob | null, error: { message: "not found" } } }) },
  };
}

describe("allegati da mandare con il documento", () => {
  it("li legge e li passa in base64", async () => {
    const r = await allegatiPerInvioSdi(dbFinto([{ file_name: "contratto.pdf", mime_type: "application/pdf", size_bytes: 3, storage_path: "co/doc/1-contratto.pdf" }], { "co/doc/1-contratto.pdf": new Uint8Array([37, 80, 68]) }), "co", "d1");
    expect(r).toEqual({ allegati: [{ nome: "contratto.pdf", formato: "PDF", contenuto: "JVBE" }] });
  });
  it("si ferma prima dell'invio se un file manca o se insieme sono troppo grandi", async () => {
    const manca = await allegatiPerInvioSdi(dbFinto([{ file_name: "x.pdf", mime_type: null, size_bytes: 3, storage_path: "co/x.pdf" }], {}), "co", "d1");
    expect(manca.errore).toMatch(/non si trova/);
    const troppi = await allegatiPerInvioSdi(dbFinto([{ file_name: "x.pdf", mime_type: null, size_bytes: MAX_BYTES_ALLEGATI_SDI + 1, storage_path: "co/x.pdf" }], {}), "co", "d1");
    expect(troppi.errore).toMatch(/3,5 MB/);
    const altrove = await allegatiPerInvioSdi(dbFinto([{ file_name: "x.pdf", mime_type: null, size_bytes: 3, storage_path: "altra/x.pdf" }], { "altra/x.pdf": new Uint8Array([1]) }), "co", "d1");
    expect(altrove.errore).toMatch(/non valido/);
  });
});

describe("invia-sdi", () => {
  const invia = readFileSync(join(RADICE, "supabase/functions/invia-sdi/index.ts"), "utf8");
  it("legge gli allegati prima di prenotare l'invio e li mette nel documento dell'XML", () => {
    expect(invia.indexOf("allegatiPerInvioSdi(")).toBeGreaterThan(0);
    expect(invia.indexOf("allegatiPerInvioSdi(")).toBeLessThan(invia.indexOf("claimDocumentoPerInvio(supabase, doc.id)"));
    expect(invia).toMatch(/docXml = \{ \.\.\.docXml, allegati: allegatiInvio\.allegati \}/);
  });
  it("generateXML scrive gli allegati in <Allegati>", () => {
    const xml = generateXML(
      { tipo: "fattura", numero: "1", data_emissione: "2026-10-30", righe: [], cliente_snapshot: { ragione_sociale: "Rossi", partita_iva: "01234567890", indirizzo_nazione: "IT" }, allegati: [{ nome: "contratto.pdf", formato: "PDF", contenuto: "JVBE" }] },
      { ragione_sociale: "Impresa", partita_iva: "09876543210" },
      "00001",
    );
    expect(xml).toContain("<NomeAttachment>contratto.pdf</NomeAttachment>");
    expect(xml).toContain("<Attachment>JVBE</Attachment>");
  });
});
