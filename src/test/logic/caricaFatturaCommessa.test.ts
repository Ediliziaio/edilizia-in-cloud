import { describe, expect, it } from "vitest";
import { tipoFileFattura } from "@/components/orders/CaricaFatturaCommessa";

describe("fattura caricata dalla commessa", () => {
  it("XML e P7M vanno allo SDI, PDF e foto alla lettura AI", () => {
    expect(tipoFileFattura({ name: "IT01234567890_abc.xml", type: "" })).toBe("xml");
    expect(tipoFileFattura({ name: "IT01234567890_abc.XML.P7M", type: "application/pkcs7-mime" })).toBe("xml");
    expect(tipoFileFattura({ name: "fattura.pdf", type: "application/pdf" })).toBe("documento");
    expect(tipoFileFattura({ name: "foto.jpg", type: "image/jpeg" })).toBe("documento");
    expect(tipoFileFattura({ name: "scansione", type: "image/heic" })).toBe("documento");
  });

  it("il resto si rifiuta prima di caricare", () => {
    expect(tipoFileFattura({ name: "fatture.zip", type: "application/zip" })).toBe("non_valido");
    expect(tipoFileFattura({ name: "tabella.xlsx", type: "application/vnd.ms-excel" })).toBe("non_valido");
  });
});
