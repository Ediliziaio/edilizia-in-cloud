import { describe, expect, it } from "vitest";
import { CATEGORIE_DI_BASE, chiaveRiga, contoPropostoRiga, etichettaCategoria } from "@/lib/fatturazione/contoPerRiga";

describe("conto di costo per riga", () => {
  it("propone il conto dalla descrizione della riga (fatture vere di calcestruzzo, ferro e minuteria)", () => {
    const p = (d: string) => contoPropostoRiga(d, CATEGORIE_DI_BASE);
    expect(p("126 CLS RCK35 S4 XC1XC2")).toBe("materie_prime");
    expect(p("POMPAGGIO AL MC AUTOPOMPA FH986JA")).toBe("noli_attrezzature");
    expect(p("DIR. CHIAMATA AUTOPOMPA")).toBe("noli_attrezzature");
    expect(p("Quota fissa Piazzamento Betonpompa")).toBe("noli_attrezzature");
    expect(p("TRASPORTO MEZZO ETERNOO")).toBe("trasporti");
    expect(p("TONDO ACCIAIO B450C M.12 D.16")).toBe("materie_prime");
    expect(p("CUBIERE PVC")).toBe("materiali_di_consumo");
    expect(p("SPRAY MULTIUSO WD-40 ml.500")).toBe("materiali_di_consumo");
    expect(p("DISCO 115x1,5 FERRO-451476")).toBe("attrezzature");
    expect(p("TENAGLIA 250 KNIPEX-SLIM")).toBe("attrezzature");
    expect(p("Rif. documento 23007 del 4/08/2026")).toBeNull();
  });
  it("con le categorie proprie propone solo quelle che l'azienda ha", () => {
    expect(contoPropostoRiga("POMPAGGIO AL MC", ["materiali", "subappalti"])).toBeNull();
    expect(contoPropostoRiga("CLS RCK 37", ["materiali", "subappalti"])).toBe("materiali");
    expect(contoPropostoRiga("TRASPORTO", ["Trasporti", "materiali"])).toBe("Trasporti");
  });
  it("la chiave è il numero di riga dell'XML, altrimenti la posizione", () => {
    expect(chiaveRiga({ numero_linea: 7 }, 0)).toBe("7");
    expect(chiaveRiga({}, 2)).toBe("3");
    expect(etichettaCategoria("materiali_di_consumo")).toBe("Materiali di consumo");
  });
});
