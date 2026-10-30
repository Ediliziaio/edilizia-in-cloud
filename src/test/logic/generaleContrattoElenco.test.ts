import { describe, expect, it } from "vitest";
import { leggiCelle, leggiElencoIncollato, leggiNumero, righePerImport } from "@/lib/orders/generali/contrattoElenco";

/**
 * L'elenco prezzi del contratto incollato da Excel (31/10/2026): Excel copia con tabulazioni e
 * mette tra virgolette le celle a più righe; i prezzi arrivano come li mostra il foglio.
 */

describe("i numeri come arrivano da un foglio", () => {
  it("all'italiana, all'inglese, con l'euro e gli spazi", () => {
    expect(leggiNumero("1.234,56")).toBe(1234.56);
    expect(leggiNumero("1234,5")).toBe(1234.5);
    expect(leggiNumero("€ 12,50")).toBe(12.5);
    expect(leggiNumero("1,234.56")).toBe(1234.56);
    expect(leggiNumero("12.500")).toBe(12_500);
    expect(leggiNumero("0,1234")).toBe(0.1234);
    expect(leggiNumero("15")).toBe(15);
  });

  it("quello che non è un numero resta fuori", () => {
    expect(leggiNumero("")).toBeNull();
    expect(leggiNumero("a corpo")).toBeNull();
    expect(leggiNumero("12,5 €/m²")).toBeNull();
  });
});

describe("le celle", () => {
  it("tabulazioni, celle vuote e celle a più righe tra virgolette", () => {
    const t = 'A.01\t"Scavo di sbancamento\ncon mezzi meccanici"\tm³\t10,00\nA.02\t"Calcestruzzo ""C25/30"""\tm³\t120,00\n\n';
    expect(leggiCelle(t)).toEqual([
      ["A.01", "Scavo di sbancamento con mezzi meccanici", "m³", "10,00"],
      ["A.02", 'Calcestruzzo "C25/30"', "m³", "120,00"],
    ]);
  });

  it("un CSV col punto e virgola", () => {
    expect(leggiCelle("A.01;Scavo;m³;10,00\r\n")).toEqual([["A.01", "Scavo", "m³", "10,00"]]);
  });
});

describe("l'elenco incollato", () => {
  it("riconosce l'intestazione e le colonne, anche in ordine diverso", () => {
    const e = leggiElencoIncollato("Descrizione\tCodice\tPrezzo unitario\tU.M.\nScavo\tA.01\t10,00\tm³\nCalcestruzzo\tA.02\t120\tm³");
    expect(e.intestazione).toBe(true);
    expect(e.colonne).toEqual(["descrizione", "codice", "prezzo", "unita"]);
    expect(e.righe).toEqual([
      { riga: 2, codice: "A.01", descrizione: "Scavo", unitaMisura: "m³", prezzo: 10, quantita: null },
      { riga: 3, codice: "A.02", descrizione: "Calcestruzzo", unitaMisura: "m³", prezzo: 120, quantita: null },
    ]);
  });

  it("senza intestazione, quattro colonne sono codice, descrizione, U.M. e prezzo", () => {
    const e = leggiElencoIncollato("A.01\tScavo\tm³\t10,00");
    expect(e.intestazione).toBe(false);
    expect(e.righe[0]).toMatchObject({ codice: "A.01", descrizione: "Scavo", unitaMisura: "m³", prezzo: 10 });
  });

  it("un computo (cinque o più colonne) porta anche la quantità; l'importo si ignora", () => {
    const e = leggiElencoIncollato("A.01\tScavo\tm³\t125,5\t10,00\t1.255,00");
    expect(e.colonne).toEqual(["codice", "descrizione", "unita", "quantita", "prezzo", "ignora"]);
    expect(e.righe[0]).toMatchObject({ quantita: 125.5, prezzo: 10 });
  });

  it("scarta le righe senza descrizione o senza prezzo, e dice perché", () => {
    const e = leggiElencoIncollato("A.01\tScavo\tm³\t10,00\nCAP. 1\tMOVIMENTI DI TERRA\t\t\nA.03\t\tm³\t5\nA.04\tDemolizione\tm³\ta corpo");
    expect(e.righe.map((r) => r.codice)).toEqual(["A.01"]);
    expect(e.scartate).toEqual([
      { riga: 2, motivo: "manca il prezzo" },
      { riga: 3, motivo: "manca la descrizione" },
      { riga: 4, motivo: "«a corpo» non è un prezzo" },
    ]);
  });

  it("un codice ripetuto vale una volta, con l'ultima riga", () => {
    const e = leggiElencoIncollato("A.01\tScavo\tm³\t10\nA.01\tScavo a mano\tm³\t25");
    expect(e.righe).toHaveLength(1);
    expect(e.righe[0]).toMatchObject({ descrizione: "Scavo a mano", prezzo: 25 });
    expect(e.doppioni).toEqual(["A.01"]);
  });

  it("le colonne scelte a mano dall'anteprima vincono su quelle dedotte", () => {
    const e = leggiElencoIncollato("Scavo\tm³\t10", ["descrizione", "ignora", "prezzo"]);
    expect(e.righe[0]).toMatchObject({ descrizione: "Scavo", unitaMisura: "", prezzo: 10 });
  });

  it("prepara le righe per generale_elenco_importa", () => {
    expect(righePerImport(leggiElencoIncollato("A.01\tScavo\tm³\t125,5\t10,00").righe)).toEqual([
      { codice: "A.01", descrizione: "Scavo", unita_misura: "m³", prezzo: 10, quantita_contratto: 125.5 },
    ]);
  });
});
