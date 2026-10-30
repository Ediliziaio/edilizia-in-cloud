/**
 * «Documenti da confermare» (30/10/2026): le regole dell'elenco e del numero in home.
 * Il 30/10 c'erano 158 bozze ferme e nessuna confermata: contano i documenti veri,
 * l'«altro» (il 38%) sta in fondo e non entra nel numero.
 */
import { describe, expect, it } from "vitest";
import {
  LIMITE_ELENCO,
  conteggioCompatto,
  dataLeggibile,
  dividiPerTipo,
  eAltro,
  etaBozza,
  etichettaTipo,
  mittenteEmail,
  numeroItaliano,
  riepilogoBozza,
  sottotitoloBozza,
  testoCampo,
  type BozzaLetta,
} from "@/lib/email-ai/documentiDaConfermare";

const bozza = (extra: Partial<BozzaLetta> = {}): BozzaLetta => ({
  tipo: "fattura",
  campi: {
    fornitore_ragione_sociale: { valore: "Edil Forniture Rossi S.r.l.", conf: 0.97 },
    numero: { valore: "FT-2026/118", conf: 0.99 },
    data: { valore: "2026-10-12", conf: 0.99 },
    totale: { valore: 1220, conf: 0.99 },
  },
  dati_incerti: [],
  created_at: "2026-10-28T09:00:00Z",
  ...extra,
});

describe("tipo del documento", () => {
  it("«altro» è anche ciò che non ha un tipo", () => {
    for (const t of ["altro", "ALTRO", " altro ", "", null, undefined]) expect(eAltro(t)).toBe(true);
    for (const t of ["fattura", "ddt", "proforma", "nota_credito", "contratto"]) expect(eAltro(t)).toBe(false);
  });
  it("etichette leggibili; un tipo nuovo non si perde", () => {
    expect(etichettaTipo("fattura")).toBe("Fattura");
    expect(etichettaTipo("ddt")).toBe("Bolla (DDT)");
    expect(etichettaTipo("nota_credito")).toBe("Nota di credito");
    expect(etichettaTipo("proforma")).toBe("Proforma");
    expect(etichettaTipo("altro")).toBe("Altro documento");
    expect(etichettaTipo(null)).toBe("Altro documento");
    expect(etichettaTipo("ordine_acquisto")).toBe("Ordine acquisto");
  });
});

describe("dividiPerTipo", () => {
  it("documenti veri da una parte, «altro» dall'altra, nell'ordine di arrivo", () => {
    const righe = [{ id: 1, tipo: "ddt" }, { id: 2, tipo: "altro" }, { id: 3, tipo: "fattura" }, { id: 4, tipo: "" }, { id: 5, tipo: "proforma" }];
    const { principali, altro } = dividiPerTipo(righe);
    expect(principali.map((r) => r.id)).toEqual([1, 3, 5]);
    expect(altro.map((r) => r.id)).toEqual([2, 4]);
  });
  it("lista vuota", () => {
    expect(dividiPerTipo([])).toEqual({ principali: [], altro: [] });
  });
});

describe("numeroItaliano", () => {
  it("numeri e testi all'italiana", () => {
    expect(numeroItaliano(1220)).toBe(1220);
    expect(numeroItaliano("1.234,56")).toBe(1234.56);
    expect(numeroItaliano("€ 12,5")).toBe(12.5);
    expect(numeroItaliano("1.500")).toBe(1500);
    expect(numeroItaliano("-45,10")).toBe(-45.1);
  });
  it("ciò che non è un numero è null", () => {
    for (const v of [null, undefined, "", "boh", "12abc", Number.NaN, Number.POSITIVE_INFINITY]) expect(numeroItaliano(v as never)).toBeNull();
  });
});

describe("riepilogo della bozza", () => {
  it("fornitore, numero, data leggibile, totale", () => {
    expect(riepilogoBozza(bozza())).toEqual({
      fornitore: "Edil Forniture Rossi S.r.l.",
      numero: "FT-2026/118",
      data: "12 ott 2026",
      totale: 1220,
      incerti: 0,
    });
  });
  it("il totale può arrivare come testo italiano", () => {
    expect(riepilogoBozza(bozza({ campi: { totale: { valore: "1.220,00" } } })).totale).toBe(1220);
  });
  it("campi mancanti o vuoti → null, non «undefined» né stringhe vuote", () => {
    const r = riepilogoBozza(bozza({ campi: { fornitore_ragione_sociale: { valore: "  " }, numero: { valore: null } } }));
    expect(r).toEqual({ fornitore: null, numero: null, data: null, totale: null, incerti: 0 });
    expect(riepilogoBozza(bozza({ campi: null })).fornitore).toBeNull();
  });
  it("conta i campi incerti senza doppioni", () => {
    expect(riepilogoBozza(bozza({ dati_incerti: ["totale", "data", "totale"] })).incerti).toBe(2);
    expect(riepilogoBozza(bozza({ dati_incerti: null })).incerti).toBe(0);
  });
  it("la data che non si capisce resta com'è", () => {
    expect(dataLeggibile("domani")).toBe("domani");
    expect(dataLeggibile(null)).toBeNull();
    expect(dataLeggibile("2026-02-03")).toBe("3 feb 2026");
  });
});

describe("sottotitolo: tipo, numero e data, quel che c'è", () => {
  it("tutto", () => expect(sottotitoloBozza(bozza())).toBe("Fattura · n. FT-2026/118 · 12 ott 2026"));
  it("senza numero e data", () => {
    expect(sottotitoloBozza(bozza({ tipo: "ddt", campi: { numero: { valore: null } } }))).toBe("Bolla (DDT)");
  });
  it("«altro»", () => expect(sottotitoloBozza(bozza({ tipo: "altro", campi: {} }))).toBe("Altro documento"));
});

describe("da quanto aspetta", () => {
  // Date senza fuso: lette come ora locale, così il risultato non dipende dal fuso della macchina.
  const ora = new Date(2026, 9, 30, 12, 0);
  it.each([
    ["2026-10-30T08:00:00", "oggi"],
    ["2026-10-29T23:00:00", "ieri"],
    ["2026-10-27T09:00:00", "3 giorni fa"],
    ["2026-10-17T09:00:00", "13 giorni fa"],
    ["2026-10-10T09:00:00", "2 settimane fa"],
    ["2026-08-15T09:00:00", "2 mesi fa"],
  ])("%s → %s", (creata, atteso) => {
    expect(etaBozza(creata, ora)).toBe(atteso);
  });
  it("una data nel futuro o illeggibile non rompe", () => {
    expect(etaBozza("2026-11-05T09:00:00", ora)).toBe("oggi");
    expect(etaBozza("boh", ora)).toBe("");
  });
});

describe("mittente e numero compatto", () => {
  it("il nome se c'è, altrimenti l'indirizzo", () => {
    expect(mittenteEmail({ from_name: " Mario Rossi ", from_email: "m@x.it" })).toBe("Mario Rossi");
    expect(mittenteEmail({ from_name: "  ", from_email: "m@x.it" })).toBe("m@x.it");
    expect(mittenteEmail({ from_name: null, from_email: null })).toBeNull();
    expect(mittenteEmail(null)).toBeNull();
  });
  it("oltre 99, «99+»", () => {
    expect(conteggioCompatto(7)).toBe("7");
    expect(conteggioCompatto(99)).toBe("99");
    expect(conteggioCompatto(100)).toBe("99+");
  });
  it("testo del campo", () => {
    expect(testoCampo({ a: { valore: 12 } }, "a")).toBe("12");
    expect(testoCampo({ a: { valore: 0 } }, "a")).toBe("0");
    expect(testoCampo({}, "a")).toBeNull();
  });
  it("l'elenco ha un tetto", () => expect(LIMITE_ELENCO).toBe(200));
});
