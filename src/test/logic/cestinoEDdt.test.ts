import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { siPuoRipristinare } from "@/lib/fatturazione/cestino";
import { datiFatturaDaDdt } from "@/lib/fatturazione/fatturaDaDdt";
import type { DocumentoFiscale } from "@/types/fatturazione";

describe("cestino: cosa torna indietro", () => {
  it("una bozza cestinata sì, anche se risulta annullata", () => {
    expect(siPuoRipristinare({ tipo: "fattura", stato: "annullata", numero: "Bozza ABC12345" })).toBe(true);
  });
  it("una fattura annullata col suo numero no", () => {
    expect(siPuoRipristinare({ tipo: "fattura", stato: "annullata", numero: "FT-2026-0007" })).toBe(false);
  });
  it("un DDT e una proforma sì", () => {
    expect(siPuoRipristinare({ tipo: "ddt", stato: "annullata", numero: "DDT-2026-0001" })).toBe(true);
    expect(siPuoRipristinare({ tipo: "proforma", stato: "annullata", numero: "PF-2026-0001" })).toBe(true);
  });
  it("una fattura emessa finita nel cestino sì: torna col suo stato", () => {
    expect(siPuoRipristinare({ tipo: "fattura", stato: "consegnata", numero: "FT-2026-0009" })).toBe(true);
  });
});

describe("fattura da DDT", () => {
  const ddt = {
    id: "d1", tipo: "ddt", numero: "DDT-2026-0003", data_emissione: "2026-11-02", anagrafica_id: "c1", ordine_id: "o1",
    cliente_snapshot: { ragione_sociale: "Cliente" },
    righe: [{ id: "vecchia", numero_linea: 9, descrizione: "Materiale", quantita: 2, unita_misura: "pz", prezzo_unitario: 0, imponibile: 0, aliquota_iva: "22", imposta: 0, totale_riga: 0 }],
    stato: "bozza",
  } as unknown as DocumentoFiscale;

  it("porta cliente, commessa, righe nuove e il riferimento al DDT", () => {
    const f = datiFatturaDaDdt(ddt);
    expect(f.anagrafica_id).toBe("c1");
    expect(f.ordine_id).toBe("o1");
    expect(f.cliente_snapshot).toEqual(ddt.cliente_snapshot);
    expect(f.righe![0].descrizione).toBe("Materiale");
    expect(f.righe![0].numero_linea).toBe(1);
    expect(f.righe![0].id).not.toBe("vecchia");
    expect(f.riferimenti_ddt).toEqual([{ numero: "DDT-2026-0003", data: "2026-11-02" }]);
    expect(f).not.toHaveProperty("numero");
    expect(f).not.toHaveProperty("stato");
  });

  it("l'editor legge davvero il parametro e aggancia il DDT", () => {
    const editor = readFileSync("src/pages/azienda/fatturazione/EditorDocumento.tsx", "utf8");
    expect(editor).toContain('searchParams.get("from_ddt")');
    expect(editor).toContain("datiFatturaDaDdt(");
    expect(editor).toMatch(/ddt_fattura_id: doc\.id/);
  });
});
