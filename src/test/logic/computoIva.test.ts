import { describe, expect, it } from "vitest";
import { calcolaIvaComputo } from "@/lib/computo/ivaComputo";
import { bozzaVuota, leggiBozzaComputo } from "@/lib/computo/editorNativo";

describe("IVA esplicita del computo", () => {
  it("non scambia l'IVA non impostata con zero", () => {
    expect(calcolaIvaComputo(100, {})).toMatchObject({ iva: null, totale: null, modalita: "da-definire" });
    expect(calcolaIvaComputo(100, { ivaModalita: "non-applicabile" })).toMatchObject({ iva: 0, totale: 100 });
    expect(calcolaIvaComputo(100, { ivaModalita: "applicata", ivaAliquota: "0" })).toMatchObject({ iva: 0, totale: 100, modalita: "applicata" });
  });
  it("calcola e arrotonda i centesimi senza cambiare l'imponibile", () => {
    expect(calcolaIvaComputo(266, { ivaModalita: "applicata", ivaAliquota: "22" })).toMatchObject({ iva: 58.52, totale: 324.52 });
    expect(calcolaIvaComputo(99.99, { ivaModalita: "applicata", ivaAliquota: "10,5" })).toMatchObject({ iva: 10.5, totale: 110.49 });
  });
  it.each(["", "-1", "101", "NaN", "Infinity", "22%", "1/0"])("rifiuta aliquota non valida: %s", ivaAliquota => {
    expect(calcolaIvaComputo(100, { ivaModalita: "applicata", ivaAliquota }).errore).not.toBe("");
    expect(calcolaIvaComputo(100, { ivaModalita: "applicata", ivaAliquota }).totale).toBeNull();
  });
  it("non inventa un totale quando mancano gli importi", () => {
    expect(calcolaIvaComputo(null, { ivaModalita: "applicata", ivaAliquota: "22" }).totale).toBeNull();
  });
  it("conserva le impostazioni e mantiene compatibili le vecchie bozze", () => {
    const b = { ...bozzaVuota(), ivaModalita: "applicata", ivaAliquota: "10", ivaNota: "Nota scelta dall'azienda" };
    expect(leggiBozzaComputo(JSON.stringify(b))).toMatchObject(b);
    const { ivaModalita: _m, ivaAliquota: _a, ivaNota: _n, ...vecchia } = b;
    expect(leggiBozzaComputo(JSON.stringify(vecchia)).ivaModalita).toBe("da-definire");
  });
});
