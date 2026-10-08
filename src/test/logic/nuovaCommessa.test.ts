// src/test/logic/nuovaCommessa.test.ts
import { describe, expect, it } from "vitest";
import {
  CONTROLLI_DI_PARTENZA, controlliValidi, cosaManca, modelloDiAvvio, senzaControllo, testoMancano,
  type DatiCantiere,
} from "@/lib/orders/nuovaCommessa";

const completa: DatiCantiere = {
  indirizzo: "Via Roma 1, Torino", inizio: "2026-11-02", fine: "2026-12-15", fasi: 4, persone: 3, rate: 2,
};
const tutti = [...CONTROLLI_DI_PARTENZA];

describe("controlliValidi", () => {
  it("di partenza si controlla tutto, nell'ordine della lista", () => {
    expect(CONTROLLI_DI_PARTENZA).toEqual(["indirizzo", "date", "fasi", "chi", "pagamenti"]);
  });
  it("legge l'elenco del database: scarta quello che non conosce, toglie i doppioni, rimette in ordine", () => {
    expect(controlliValidi(["pagamenti", "fasi", "boh", "fasi", 7, null])).toEqual(["fasi", "pagamenti"]);
  });
  it("un elenco vuoto è una scelta: non si controlla niente", () => {
    expect(controlliValidi([])).toEqual([]);
  });
  it("un valore che non è un elenco (colonna non ancora creata, lettura fallita) vale «tutto»", () => {
    expect(controlliValidi(undefined)).toEqual(tutti);
    expect(controlliValidi(null)).toEqual(tutti);
    expect(controlliValidi("fasi")).toEqual(tutti);
  });
  it("la lista di partenza restituita non è quella condivisa", () => {
    const a = controlliValidi(undefined);
    a.pop();
    expect(controlliValidi(undefined)).toHaveLength(5);
  });
});

describe("cosaManca", () => {
  it("una commessa organizzata non manca di niente", () => {
    expect(cosaManca(completa, tutti)).toEqual([]);
  });
  it("una commessa nata con i dati minimi manca di tutto, nell'ordine di sempre", () => {
    const m = cosaManca({ indirizzo: "", inizio: null, fine: null, fasi: 0, persone: 0, rate: 0 }, tutti);
    expect(m.map((x) => x.chiave)).toEqual(["indirizzo", "date", "fasi", "chi", "pagamenti"]);
    expect(m[2]).toEqual({ chiave: "fasi", mancante: "le fasi di lavoro", azione: "Scegli le fasi" });
  });
  it("un indirizzo di soli spazi non è un indirizzo", () => {
    expect(cosaManca({ ...completa, indirizzo: "   " }, tutti).map((x) => x.chiave)).toEqual(["indirizzo"]);
  });
  it("le date mancano se ne manca anche una sola", () => {
    expect(cosaManca({ ...completa, fine: null }, tutti).map((x) => x.chiave)).toEqual(["date"]);
    expect(cosaManca({ ...completa, inizio: undefined }, tutti).map((x) => x.chiave)).toEqual(["date"]);
  });
  it("conta solo quello che l'azienda ha scelto di controllare", () => {
    const vuota: DatiCantiere = { indirizzo: null, inizio: null, fine: null, fasi: 0, persone: 0, rate: 0 };
    expect(cosaManca(vuota, ["indirizzo", "pagamenti"]).map((x) => x.chiave)).toEqual(["indirizzo", "pagamenti"]);
    expect(cosaManca(vuota, [])).toEqual([]);
  });
});

describe("testoMancano", () => {
  it("una cosa sola", () => {
    expect(testoMancano([{ mancante: "l'indirizzo del cantiere" }])).toBe("Manca: l'indirizzo del cantiere");
  });
  it("due cose, tre cose", () => {
    expect(testoMancano([{ mancante: "le fasi di lavoro" }, { mancante: "come si paga" }])).toBe("Mancano: le fasi di lavoro e come si paga");
    expect(testoMancano([{ mancante: "a" }, { mancante: "b" }, { mancante: "c" }])).toBe("Mancano: a, b e c");
  });
  it("niente da dire, niente testo", () => {
    expect(testoMancano([])).toBe("");
  });
});

describe("senzaControllo", () => {
  it("toglie uno e lascia gli altri nell'ordine", () => {
    expect(senzaControllo(tutti, "fasi")).toEqual(["indirizzo", "date", "chi", "pagamenti"]);
    expect(tutti).toHaveLength(5);
  });
});

describe("modelloDiAvvio", () => {
  const offerti = [{ id: "m1", nome: "A" }, { id: "m2", nome: "B" }];
  it("se non ha toccato niente vale il modello di partenza dell'azienda", () => {
    expect(modelloDiAvvio(offerti, null, "m2")).toEqual({ id: "m2", nome: "B" });
  });
  it("senza modello di partenza e senza scelta: nessuna fase, come oggi", () => {
    expect(modelloDiAvvio(offerti, null, null)).toBeNull();
  });
  it("«Nessuna» (testo vuoto) batte il modello di partenza", () => {
    expect(modelloDiAvvio(offerti, "", "m2")).toBeNull();
  });
  it("una scelta batte il modello di partenza", () => {
    expect(modelloDiAvvio(offerti, "m1", "m2")).toEqual({ id: "m1", nome: "A" });
  });
  it("un modello che non si offre più (eliminato) non dà fasi", () => {
    expect(modelloDiAvvio(offerti, null, "gone")).toBeNull();
    expect(modelloDiAvvio(offerti, "gone", "m1")).toBeNull();
  });
});
