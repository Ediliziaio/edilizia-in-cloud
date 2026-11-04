import { beforeEach, describe, expect, it } from "vitest";
import { COLONNE_PREDEFINITE, leggiColonne, metodiPagamento, prossimaScadenza, salvaColonne } from "@/lib/fatturazione/colonneRicevute";
import { fatturaVerificata } from "@/lib/fatturazione/ripartizioneFattura";

describe("modalità di pagamento in lista", () => {
  it("dice il metodo una volta sola anche con più rate", () => {
    expect(metodiPagamento([{ modalita: "MP12" }, { modalita: "MP12" }])).toEqual(["RiBa"]);
    expect(metodiPagamento([{ modalita: "MP05" }, { modalita: "MP12" }])).toEqual(["Bonifico", "RiBa"]);
  });
  it("senza piano non dice niente", () => {
    expect(metodiPagamento(null)).toEqual([]);
  });
});

describe("prossima scadenza", () => {
  const piano = [{ scadenza: "2026-10-31" }, { scadenza: "2026-11-30" }];
  it("prende la prima da oggi in poi", () => expect(prossimaScadenza(piano, "2026-11-04")).toBe("2026-11-30"));
  it("con tutte passate prende l'ultima", () => expect(prossimaScadenza(piano, "2026-12-15")).toBe("2026-11-30"));
  it("oggi conta ancora", () => expect(prossimaScadenza(piano, "2026-10-31")).toBe("2026-10-31"));
  it("senza date è vuota", () => expect(prossimaScadenza([{ scadenza: null }], "2026-11-04")).toBeNull());
});

describe("colonne scelte", () => {
  beforeEach(() => localStorage.clear());
  it("senza scelta valgono le predefinite", () => expect([...leggiColonne()]).toEqual(COLONNE_PREDEFINITE));
  it("la scelta resta, anche vuota", () => {
    salvaColonne(new Set(["note"]));
    expect([...leggiColonne()]).toEqual(["note"]);
    salvaColonne(new Set());
    expect([...leggiColonne()]).toEqual([]);
  });
  it("un valore rovinato non rompe la pagina", () => {
    localStorage.setItem("fatture-ricevute-colonne-v1", "{rotto");
    expect([...leggiColonne()]).toEqual(COLONNE_PREDEFINITE);
  });
  it("una colonna che non esiste più si ignora", () => {
    localStorage.setItem("fatture-ricevute-colonne-v1", JSON.stringify(["note", "vecchia"]));
    expect([...leggiColonne()]).toEqual(["note"]);
  });
});

describe("da rettificare", () => {
  it("non è verificata, anche se contabilizzata", () => {
    expect(fatturaVerificata({ stato: "contabilizzata", verifica_manuale: "da_rettificare" })).toBe(false);
  });
});
