import { describe, expect, it } from "vitest";
import {
  classifyTipoDocumento,
  guessContentType,
  guessScadenzaFromName,
  sanitizeFileName,
} from "@/lib/sicurezza/bulkDocumenti";

describe("classifyTipoDocumento", () => {
  it("riconosce DURC", () => {
    expect(classifyTipoDocumento("DURC_2026.pdf")).toBe("durc");
    expect(classifyTipoDocumento("durc-impresa.PDF")).toBe("durc");
  });

  it("riconosce attestazione SOA (prima di visura)", () => {
    expect(classifyTipoDocumento("attestazione_SOA.pdf")).toBe("attestazione_soa");
    expect(classifyTipoDocumento("SOA OG1.pdf")).toBe("attestazione_soa");
  });

  it("riconosce visura camerale", () => {
    expect(classifyTipoDocumento("visura_camerale.pdf")).toBe("visura_camerale");
    expect(classifyTipoDocumento("CCIAA_registro_imprese.pdf")).toBe("visura_camerale");
  });

  it("riconosce DVR", () => {
    expect(classifyTipoDocumento("DVR.pdf")).toBe("dvr");
    expect(classifyTipoDocumento("valutazione_dei_rischi_2025.pdf")).toBe("dvr");
  });

  it("riconosce polizza RC", () => {
    expect(classifyTipoDocumento("polizza_rc.pdf")).toBe("polizza_rc");
    expect(classifyTipoDocumento("assicurazione_RCT.pdf")).toBe("polizza_rc");
    expect(classifyTipoDocumento("fideiussione.pdf")).toBe("polizza_rc");
  });

  it("riconosce certificazione ISO", () => {
    expect(classifyTipoDocumento("ISO_9001.pdf")).toBe("iso_certificazione");
    expect(classifyTipoDocumento("cert_45001.pdf")).toBe("iso_certificazione");
  });

  it("ripiega su 'altro' quando nulla combacia", () => {
    expect(classifyTipoDocumento("random.pdf")).toBe("altro");
    expect(classifyTipoDocumento("")).toBe("altro");
  });
});

describe("guessScadenzaFromName", () => {
  it("estrae data ISO yyyy-mm-dd", () => {
    expect(guessScadenzaFromName("durc_2026-12-31.pdf")).toBe("2026-12-31");
    expect(guessScadenzaFromName("scad 2025.06.30 polizza")).toBe("2025-06-30");
  });

  it("estrae data italiana dd-mm-yyyy", () => {
    expect(guessScadenzaFromName("polizza_31-12-2026.pdf")).toBe("2026-12-31");
    expect(guessScadenzaFromName("DURC 30/06/2025.pdf")).toBe("2025-06-30");
  });

  it("normalizza giorni/mesi a una cifra", () => {
    expect(guessScadenzaFromName("doc_1-2-2026.pdf")).toBe("2026-02-01");
  });

  it("rifiuta date impossibili", () => {
    expect(guessScadenzaFromName("doc_2026-13-40.pdf")).toBeNull();
  });

  it("ritorna null se non trova date", () => {
    expect(guessScadenzaFromName("documento_senza_data.pdf")).toBeNull();
    expect(guessScadenzaFromName("")).toBeNull();
  });
});

describe("guessContentType", () => {
  it("mappa estensioni note", () => {
    expect(guessContentType("a.pdf")).toBe("application/pdf");
    expect(guessContentType("foto.JPG")).toBe("image/jpeg");
    expect(guessContentType("firma.p7m")).toBe("application/pkcs7-mime");
  });

  it("ripiega sul fallback per estensioni ignote", () => {
    expect(guessContentType("file.xyz")).toBe("application/octet-stream");
    expect(guessContentType("senza_estensione")).toBe("application/octet-stream");
  });
});

describe("sanitizeFileName", () => {
  it("sostituisce caratteri non sicuri con underscore", () => {
    expect(sanitizeFileName("DURC impresa (2026).pdf")).toBe("DURC_impresa_2026_.pdf");
    expect(sanitizeFileName("a/b\\c.pdf")).toBe("a_b_c.pdf");
  });

  it("preserva punti e trattini", () => {
    expect(sanitizeFileName("doc-2026.01.02.pdf")).toBe("doc-2026.01.02.pdf");
  });
});
