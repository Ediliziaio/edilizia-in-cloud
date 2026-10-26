/**
 * Il piano di pagamento del preventivo (26/10/2026): rate ai momenti del lavoro o ai SAL, con gli importi che
 * sommano esattamente al prezzo. Prima «come paga il cliente» era una frase nel modello, uguale per tutti.
 */
import { describe, expect, it } from "vitest";
import {
  cambiaModo, leggiPianoPagamento, pianoCompleto, pianoDaModello, pianoRateDiPartenza, pianoSalDiPartenza,
  quandoSiPaga, rateConImporti, totalePercentuali, type PianoPagamento,
} from "@/lib/preventivi/pianoPagamento";

const somma = (righe: ReadonlyArray<{ importo: number }>) => Math.round(righe.reduce((s, r) => s + r.importo, 0) * 100) / 100;

describe("lettura del piano salvato", () => {
  it("legge modo, righe e note; il modo sconosciuto vale «rate»", () => {
    const p = leggiPianoPagamento({ modo: "sal", note: " bonifico ", righe: [{ nome: "SAL 1", percent: 50, evento: "sal_numero", numero: 1 }, { nome: "Saldo", percent: 50, evento: "fine_lavori" }] })!;
    expect(p.modo).toBe("sal");
    expect(p.note).toBe("bonifico");
    expect(p.righe).toHaveLength(2);
    expect(leggiPianoPagamento({ modo: "boh", righe: [{ nome: "x", percent: 100, evento: "fine_lavori" }] })!.modo).toBe("rate");
  });

  it("niente righe, niente piano: null invece di un piano vuoto", () => {
    for (const v of [null, undefined, {}, { righe: [] }, { righe: "x" }, [], "x"]) expect(leggiPianoPagamento(v)).toBeNull();
  });

  it("i valori storti rientrano: percentuale fra 0 e 100, evento sconosciuto a data fissa, numero SAL solo coi SAL", () => {
    const p = leggiPianoPagamento({ righe: [
      { nome: "  ", percent: 300, evento: "chissà", numero: 4 },
      { nome: "x".repeat(200), percent: -5, evento: "sal_numero", numero: 0 },
      { nome: "Saldo", percent: "33,3", evento: "fine_lavori", numero: 9 },
    ] })!;
    expect(p.righe[0]).toMatchObject({ nome: "Rata", percent: 100, evento: "data_fissa", numero: null });
    expect(p.righe[1]).toMatchObject({ percent: 0, evento: "sal_numero", numero: null });
    expect(p.righe[1].nome.length).toBe(80);
    expect(p.righe[2]).toMatchObject({ percent: 0, numero: null }); // "33,3" non è un numero
  });

  it("lo stato della commessa non è un evento di un preventivo: una commessa non c'è ancora", () => {
    expect(leggiPianoPagamento({ righe: [{ nome: "x", percent: 100, evento: "stato_commessa" }] })!.righe[0].evento).toBe("data_fissa");
  });

  it("più di dodici rate non entrano", () => {
    const righe = Array.from({ length: 20 }, (_, i) => ({ nome: `R${i}`, percent: 5, evento: "fine_lavori" }));
    expect(leggiPianoPagamento({ righe })!.righe).toHaveLength(12);
  });
});

describe("un piano vale solo se fa 100", () => {
  it("riconosce completo e incompleto", () => {
    expect(pianoCompleto(pianoRateDiPartenza())).toBe(true);
    expect(totalePercentuali(pianoRateDiPartenza().righe)).toBe(100);
    expect(pianoCompleto({ modo: "rate", righe: [{ nome: "a", percent: 40, evento: "fine_lavori", numero: null }], note: null })).toBe(false);
    expect(pianoCompleto(null)).toBe(false);
  });
});

describe("importi delle rate", () => {
  const piano: PianoPagamento = { modo: "rate", righe: [
    { nome: "Acconto", percent: 30, evento: "firma_contratto", numero: null },
    { nome: "Saldo", percent: 70, evento: "fine_lavori", numero: null },
  ], note: null };

  it("ogni rata è la sua percentuale del prezzo IVA inclusa", () => {
    const r = rateConImporti(piano, 59805.06);
    expect(r[0].importo).toBe(17941.52);
    expect(r[1].importo).toBe(41863.54);
    expect(somma(r)).toBe(59805.06);
  });

  it("l'ultima assorbe l'arrotondamento: tre terzi di un prezzo dispari tornano al centesimo", () => {
    const terzi: PianoPagamento = { modo: "rate", righe: [1, 2, 3].map((i) => ({ nome: `R${i}`, percent: 33.33, evento: "fine_lavori" as const, numero: null as number | null })), note: null };
    const conCento = { ...terzi, righe: [...terzi.righe.slice(0, 2), { ...terzi.righe[2], percent: 33.34 }] };
    expect(somma(rateConImporti(conCento, 10000))).toBe(10000);
    expect(somma(rateConImporti(conCento, 1234.57))).toBe(1234.57);
  });

  it("un piano incompleto non si aggiusta di nascosto: le rate restano quelle che sono", () => {
    const meta: PianoPagamento = { modo: "rate", righe: [{ nome: "Acconto", percent: 40, evento: "firma_contratto", numero: null }], note: null };
    expect(somma(rateConImporti(meta, 1000))).toBe(400);
  });

  it("senza piano o senza prezzo non si inventa niente", () => {
    expect(rateConImporti(null, 1000)).toEqual([]);
    expect(rateConImporti(piano, 0).every((r) => r.importo === 0)).toBe(true);
  });
});

describe("come si legge «quando si paga»", () => {
  it("il SAL porta il suo numero, gli altri l'etichetta dell'evento", () => {
    expect(quandoSiPaga({ evento: "sal_numero", numero: 2 })).toBe("Al SAL 2");
    expect(quandoSiPaga({ evento: "sal_numero", numero: null })).toBe("Al SAL");
    expect(quandoSiPaga({ evento: "firma_contratto", numero: null })).toBe("Alla firma del contratto");
    expect(quandoSiPaga({ evento: "fine_lavori", numero: null })).toBe("A fine lavori");
  });
});

describe("piani di partenza", () => {
  it("a rate: acconto alla firma e saldo a fine lavori", () => {
    const p = pianoRateDiPartenza();
    expect(p.modo).toBe("rate");
    expect(p.righe.map((r) => r.percent)).toEqual([30, 70]);
  });

  it("a SAL: acconto, i SAL numerati in parti uguali, saldo; la somma fa 100", () => {
    const p = pianoSalDiPartenza(3, 20, 10);
    expect(p.modo).toBe("sal");
    expect(p.righe.map((r) => r.nome)).toEqual(["Acconto alla firma", "SAL 1", "SAL 2", "SAL 3", "Saldo a fine lavori"]);
    expect(p.righe.filter((r) => r.evento === "sal_numero").map((r) => r.numero)).toEqual([1, 2, 3]);
    expect(totalePercentuali(p.righe)).toBe(100);
  });

  it("anche con un numero di SAL che non divide tondo la somma resta 100", () => {
    for (const n of [1, 3, 6, 7]) expect(totalePercentuali(pianoSalDiPartenza(n).righe), String(n)).toBe(100);
  });
});

describe("dal modello dell'azienda al preventivo", () => {
  it("copia le righe e capisce da sé se è un piano a SAL", () => {
    const conSal = pianoDaModello({ righe: [
      { nome: "Acconto", percent: 30, tipo: "deposit" as const, evento: "firma_contratto" as const, numero: null as number | null, preavviso: 7 },
      { nome: "Primo SAL", percent: 40, tipo: "deposit", evento: "sal_numero", numero: 1, preavviso: 7 },
      { nome: "Saldo", percent: 30, tipo: "balance", evento: "fine_lavori", numero: null, preavviso: 7 },
    ] });
    expect(conSal.modo).toBe("sal");
    expect(conSal.righe[1]).toMatchObject({ nome: "Primo SAL", percent: 40, evento: "sal_numero", numero: 1 });
    const senzaSal = pianoDaModello({ righe: [{ nome: "Saldo", percent: 100, tipo: "balance", evento: "fine_lavori", numero: null, preavviso: 7 }] });
    expect(senzaSal.modo).toBe("rate");
  });
});

describe("cambio di modo", () => {
  it("da rate a SAL tiene acconto e saldo e mette i SAL in mezzo", () => {
    const p = cambiaModo({ modo: "rate", righe: [
      { nome: "Caparra", percent: 40, evento: "firma_contratto", numero: null },
      { nome: "Saldo", percent: 60, evento: "fine_lavori", numero: null },
    ], note: "bonifico" }, "sal");
    expect(p.modo).toBe("sal");
    expect(p.righe[0].percent).toBe(40);
    expect(p.righe.filter((r) => r.evento === "sal_numero").length).toBe(3);
    expect(totalePercentuali(p.righe)).toBe(100);
    expect(p.note).toBe("bonifico");
  });

  it("da SAL a rate restano acconto e saldo, e la somma fa 100", () => {
    const p = cambiaModo(pianoSalDiPartenza(3, 25, 10), "rate");
    expect(p.modo).toBe("rate");
    expect(p.righe).toHaveLength(2);
    expect(p.righe[0].percent).toBe(25);
    expect(totalePercentuali(p.righe)).toBe(100);
  });

  it("lo stesso modo non cambia niente", () => {
    const p = pianoRateDiPartenza();
    expect(cambiaModo(p, "rate")).toBe(p);
  });
});
