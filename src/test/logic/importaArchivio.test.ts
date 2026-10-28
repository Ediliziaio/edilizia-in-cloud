import { describe, expect, it } from "vitest";
import {
  controllaArchivio,
  fileArchivio,
  notaArchivio,
  stessaFonteArchivio,
  tipoArchivioFascicolo,
} from "@/lib/sicurezza/importaArchivio";
import type { DocumentoSubappaltatore } from "@/types/subappaltatori";
const fonte: DocumentoSubappaltatore = {
  id: "00000000-0000-4000-a000-000000000001",
  company_id: "azienda",
  subappaltatore_id: "ditta",
  tipo: "visura_camerale",
  nome_file: "visura.pdf",
  url: "azienda/ditta/file.pdf",
  data_rilascio: null,
  data_scadenza: null,
  note: null,
  created_at: "2026-10-27",
};
const target = {
  companyId: "azienda",
  subId: "ditta",
  orderId: null,
  titolo: "Visura",
};
describe("Originali dell’archivio precedente", () => {
  it("mappa soltanto il tipo senza attribuire verifica o requisiti", () => {
    expect(tipoArchivioFascicolo("visura_camerale")).toBe("visura");
    expect(tipoArchivioFascicolo("polizza_rc")).toBe("altro");
    expect(tipoArchivioFascicolo("attestazione_soa")).toBe("qualificazione");
  });
  it("impedisce impresa/azienda estranee e POS senza commessa", () => {
    expect(() => controllaArchivio({ ...fonte, company_id: "altra" }, target))
      .toThrow(/appartiene/);
    expect(() =>
      controllaArchivio({ ...fonte, subappaltatore_id: "altra" }, target)
    ).toThrow();
    expect(() => controllaArchivio({ ...fonte, tipo: "pos" }, target)).toThrow(
      /commessa/,
    );
  });
  it.each([
    "https://esempio.invalid/file.pdf",
    "azienda/altra/file.pdf",
    "azienda/ditta/../file.pdf",
    "azienda/ditta/%2e%2e",
    "azienda/ditta/file.pdf?token=x",
    "azienda/ditta/fi\\le",
  ])("rifiuta origine non gestita %s", (url) => {
    expect(() => controllaArchivio({ ...fonte, url }, target)).toThrow();
  });
  it("rileva cambi di originale, date o classificazione prima di salvare", () => {
    expect(stessaFonteArchivio(fonte, { ...fonte })).toBe(true);
    expect(
      stessaFonteArchivio(fonte, { ...fonte, url: "azienda/ditta/altro.pdf" }),
    ).toBe(false);
    expect(
      stessaFonteArchivio(fonte, { ...fonte, data_scadenza: "2026-12-01" }),
    ).toBe(false);
  });
  it("corregge il MIME del PDF mantenendo esattamente i byte", async () => {
    const raw = new TextEncoder().encode("%PDF-1.7\nTEST");
    const file = await fileArchivio(
      new Blob([raw], { type: "application/octet-stream" }),
      "originale.pdf",
    );
    expect(file.blob.type).toBe("application/pdf");
    expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual(
      Array.from(raw),
    );
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(notaArchivio(fonte, file.sha256)).toContain(fonte.id);
  });
  it("non trasforma HTML, file vuoti o Word in PDF con il solo nome", async () => {
    await expect(fileArchivio(new Blob(["<html>test</html>"]), "test.pdf"))
      .rejects.toThrow(/conversione/);
    await expect(fileArchivio(new Blob([]), "test.pdf")).rejects.toThrow(
      /vuoto/,
    );
  });
});
