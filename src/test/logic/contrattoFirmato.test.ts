import { describe, expect, it } from "vitest";
import { documentoFirmato, modoFirma, percorsoContrattoCarta, puoFirmareSuCarta, scansioneValida } from "@/lib/preventivi/contrattoFirmato";

describe("preventivo firmato su carta", () => {
  it("si firma su carta solo un preventivo non ancora contratto, del classico", () => {
    expect(puoFirmareSuCarta("bozza", null)).toBe(true);
    expect(puoFirmareSuCarta("inviata", "")).toBe(true);
    expect(puoFirmareSuCarta("scaduta", null)).toBe(true);
    expect(puoFirmareSuCarta("accettata", null)).toBe(false);
    expect(puoFirmareSuCarta("convertita", null)).toBe(false);
    expect(puoFirmareSuCarta("rifiutata", null)).toBe(false);
    expect(puoFirmareSuCarta("inviata", "modulo:bagni:123")).toBe(false);
  });

  it("la scansione va nella cartella dei contratti del preventivo, col nome pulito", () => {
    expect(percorsoContrattoCarta("az", "pr", "Contratto Rossi è firmato.PDF", 5)).toBe("az/contratti-carta/pr/5-Contratto-Rossi-e-firmato.pdf");
    expect(percorsoContrattoCarta("az", "pr", "../../x.jpg", 5)).toBe("az/contratti-carta/pr/5-x.jpg");
  });

  it("accetta PDF e foto fino a 20 MB", () => {
    expect(scansioneValida({ name: "a.pdf", size: 100 })).toBeNull();
    expect(scansioneValida({ name: "a.HEIC", size: 100 })).toBeNull();
    expect(scansioneValida({ name: "a.docx", size: 100 })).toMatch(/PDF o una foto/);
    expect(scansioneValida({ name: "a.pdf", size: 21 * 1024 * 1024 })).toMatch(/20 MB/);
  });

  it("il modo della firma: scritto, o dedotto per i vecchi", () => {
    expect(modoFirma({ firma_modo: "carta", signed_at: "x" })).toBe("carta");
    expect(modoFirma({ signed_at: "x", signed_by_ip: "1.2.3.4" })).toBe("online");
    expect(modoFirma({ signed_at: null })).toBeNull();
  });

  it("il documento registrato si legge solo dai bucket dei contratti", () => {
    expect(documentoFirmato({ bucket: "quote-pdfs", path: "a/b.pdf" })).toMatchObject({ name: "contratto firmato" });
    expect(documentoFirmato({ bucket: "altro", path: "a/b.pdf" })).toBeNull();
    expect(documentoFirmato({ bucket: "quote-pdfs", path: "../b.pdf" })).toBeNull();
    expect(documentoFirmato(null)).toBeNull();
  });
});
