import { describe, expect, it } from "vitest";
import { controlliLipe, importoLipe, scadenzaLipe, xmlLipe, type ComunicazioneLipe, type RighiLipe } from "@/lib/contabilita/lipeXml";

const righi = (p: Partial<RighiLipe> = {}): RighiLipe => ({
  vp2: 10000, vp3: 5000, vp4: 2200, vp5: 1100, vp6_debito: 1100, vp6_credito: 0, vp7: 0, vp8: 0, vp9: 0,
  vp10: 0, vp11: 0, vp12: 0, vp13: 0, vp13_metodo: null, vp14_debito: 1100, vp14_credito: 0, ...p,
});
const base = (p: Partial<ComunicazioneLipe> = {}): ComunicazioneLipe => ({
  anno: 2026, codiceFiscale: "01234567890", partitaIva: "01234567890", cfDichiarante: "RSSMRA80A01H501U",
  codiceCarica: "1", moduli: [{ trimestre: 1, righi: righi({ vp12: 11, vp14_debito: 1111 }) }], ...p,
});

describe("file LIPE", () => {
  it("importi con la virgola e due decimali", () => {
    expect(importoLipe(1234.5)).toBe("1234,50");
    expect(importoLipe(0.07)).toBe("0,07");
    expect(importoLipe(-3.1)).toBe("-3,10");
    expect(importoLipe(1.005 + 0.1)).toMatch(/^1,1[01]$/);
  });

  it("scrive la fornitura IVP18 con gli elementi nell'ordine dello schema", () => {
    const x = xmlLipe(base());
    expect(x.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(x).toContain("<iv:CodiceFornitura>IVP18</iv:CodiceFornitura>");
    const ordine = ["NumeroModulo", "Trimestre", "TotaleOperazioniAttive", "TotaleOperazioniPassive", "IvaEsigibile", "IvaDetratta", "IvaDovuta", "InteressiDovuti", "ImportoDaVersare"];
    const posizioni = ordine.map((t) => x.indexOf(`<iv:${t}>`));
    expect(posizioni.every((p) => p > 0)).toBe(true);
    expect([...posizioni].sort((a, b) => a - b)).toEqual(posizioni);
    expect(x).toContain("<iv:InteressiDovuti>11,00</iv:InteressiDovuti>");
    expect(x).not.toContain("IvaCredito");
  });

  it("tre moduli mensili; il credito va nel suo elemento", () => {
    const m = righi({ vp4: 100, vp5: 400, vp6_debito: 0, vp6_credito: 300, vp14_debito: 0, vp14_credito: 300 });
    const x = xmlLipe(base({ moduli: [{ mese: 4, righi: m }, { mese: 5, righi: righi({ vp4: 100, vp5: 400, vp6_debito: 0, vp6_credito: 300, vp8: 300, vp14_debito: 0, vp14_credito: 600 }) }] }));
    expect(x.match(/<iv:Modulo>/g)).toHaveLength(2);
    expect(x).toContain("<iv:Mese>5</iv:Mese>");
    expect(x).toContain("<iv:CreditoPeriodoPrecedente>300,00</iv:CreditoPeriodoPrecedente>");
    expect(x).toContain("<iv:ImportoACredito>600,00</iv:ImportoACredito>");
  });

  it("quarto trimestre dei trimestrali su opzione: niente VP14", () => {
    const x = xmlLipe(base({ moduli: [{ trimestre: 5, righi: righi() }] }));
    expect(x).toContain("<iv:Trimestre>5</iv:Trimestre>");
    expect(x).not.toContain("ImportoDaVersare");
  });

  it("intermediario: impegno, data e firma", () => {
    const x = xmlLipe(base({ cfIntermediario: "98765432109", dataImpegno: "2026-05-20", impegnoPresentazione: 2 }));
    expect(x).toContain("<iv:DataImpegno>20052026</iv:DataImpegno>");
    expect(x).toContain("<iv:ImpegnoPresentazione>2</iv:ImpegnoPresentazione>");
    expect(x).toContain("<iv:FirmaIntermediario>1</iv:FirmaIntermediario>");
  });

  it.each([
    ["VP6 sbagliato", base({ moduli: [{ trimestre: 2, righi: righi({ vp6_debito: 900 }) }] }), /VP6/],
    ["VP14 sbagliato", base({ moduli: [{ trimestre: 2, righi: righi({ vp14_debito: 5 }) }] }), /VP14/],
    ["VP7 oltre 100", base({ moduli: [{ trimestre: 2, righi: righi({ vp7: 150, vp14_debito: 1250 }) }] }), /VP7/],
    ["VP7 nel primo trimestre", base({ moduli: [{ trimestre: 1, righi: righi({ vp7: 50, vp14_debito: 1150 }) }] }), /VP7/],
    ["VP8 a gennaio", base({ moduli: [{ mese: 1, righi: righi({ vp8: 10, vp14_debito: 1090 }) }] }), /VP8/],
    ["VP12 nel mensile", base({ moduli: [{ mese: 2, righi: righi({ vp12: 11, vp14_debito: 1111 }) }] }), /VP12/],
    ["acconto basso", base({ moduli: [{ mese: 12, righi: righi({ vp13: 50, vp13_metodo: 1, vp14_debito: 1050 }) }] }), /103,29/],
    ["acconto a marzo", base({ moduli: [{ mese: 3, righi: righi({ vp13: 500, vp13_metodo: 1, vp14_debito: 600 }) }] }), /dicembre/],
    ["crediti oltre il dovuto", base({ moduli: [{ trimestre: 2, righi: righi({ vp11: 2000, vp14_debito: 0, vp14_credito: 900 }) }] }), /VP11/],
    ["mesi di trimestri diversi", base({ moduli: [{ mese: 3, righi: righi() }, { mese: 4, righi: righi() }] }), /stesso trimestre/],
    ["periodo doppio", base({ moduli: [{ mese: 4, righi: righi() }, { mese: 4, righi: righi() }] }), /stesso periodo/],
    ["società senza dichiarante", base({ cfDichiarante: null }), /dichiarante/],
    ["partita IVA corta", base({ partitaIva: "123" }), /Partita IVA/],
    ["carica 10 non ammessa", base({ codiceCarica: "10" }), /carica/],
  ])("blocca: %s", (_n, c, atteso) => {
    expect(controlliLipe(c).join(" ")).toMatch(atteso);
    expect(() => xmlLipe(c)).toThrow(atteso);
  });

  it("persona fisica: il dichiarante non serve", () => {
    expect(controlliLipe(base({ codiceFiscale: "RSSMRA80A01H501U", cfDichiarante: null, codiceCarica: null }))).toEqual([]);
  });

  it("scadenze", () => {
    expect(scadenzaLipe(2026, 1)).toBe("2026-05-31");
    expect(scadenzaLipe(2026, 4)).toBe("2027-02-28");
    expect(scadenzaLipe(2027, 4)).toBe("2028-02-29");
  });
});
