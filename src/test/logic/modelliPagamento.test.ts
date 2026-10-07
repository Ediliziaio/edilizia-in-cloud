// src/test/logic/modelliPagamento.test.ts
import { describe, expect, it } from "vitest";
import type { Installment } from "@/lib/orderUtils";
import {
  EVENTI_MODELLO, MODELLI_PAGAMENTO_DI_PARTENZA, assemblaModelliPagamento, bozzaPagamentoDaModello, bozzaPagamentoVuota,
  eModelloPagamentoDiPartenza, mettiIlResto, modelliPagamentoDaOffrire, modelliPagamentoMancanti, modelliPagamentoPerInizializzare,
  modelloPagamentoDiPartenza, normalizzaTipi, numeraSal, puoCambiarePiano, quandoRata, rataPerServer, rateDaModello,
  quandoSiIncassa, ricalcolaRatePercentuali, riepilogoModello, saldoDaAllineare, sommaPercentuali, validaBozzaPagamento,
  type BozzaModelloPagamento, type ModelloPagamento, type RataModello,
} from "@/lib/orders/modelliPagamento";

const rata = (nome: string, percent: number, tipo: RataModello["tipo"], evento: RataModello["evento"], numero: number | null = null): RataModello =>
  ({ nome, percent, tipo, evento, numero, preavviso: 7 });
const treRate: ModelloPagamento = {
  id: "m1", origine: "azienda", nome: "Tre rate", descrizione: "",
  righe: [rata("Alla firma", 30, "deposit", "firma_contratto"), rata("SAL 1", 40, "deposit", "sal_numero", 1), rata("Saldo", 30, "balance", "fine_lavori")],
};

describe("i modelli di partenza", () => {
  it("sono sei, ognuno a cento, con l'ultima rata saldo e i SAL numerati", () => {
    expect(MODELLI_PAGAMENTO_DI_PARTENZA).toHaveLength(6);
    for (const m of MODELLI_PAGAMENTO_DI_PARTENZA) {
      expect(sommaPercentuali(m.righe), m.nome).toBe(100);
      expect(m.righe[m.righe.length - 1].tipo, m.nome).toBe("balance");
      expect(m.righe.slice(0, -1).every((r) => r.tipo === "deposit"), m.nome).toBe(true);
      const sal = m.righe.filter((r) => r.evento === "sal_numero").map((r) => r.numero);
      expect(sal.every((n) => n !== null)).toBe(true);
      expect(new Set(sal).size).toBe(sal.length);
    }
  });
  it("ognuno passa la validazione che passerebbe a un modello scritto dall'azienda", () => {
    for (const m of MODELLI_PAGAMENTO_DI_PARTENZA) {
      expect(validaBozzaPagamento({ id: null, nome: m.nome, descrizione: m.descrizione, righe: m.righe }).ok, m.nome).toBe(true);
    }
  });
  it("hanno nomi diversi (l'azienda non può averne due con lo stesso nome)", () => {
    expect(new Set(MODELLI_PAGAMENTO_DI_PARTENZA.map((m) => m.nome.toLowerCase())).size).toBe(6);
  });
  it("«stato commessa» non è un evento da modello", () => {
    expect(EVENTI_MODELLO).not.toContain("stato_commessa");
    expect(EVENTI_MODELLO).toHaveLength(11);
  });
  it("un modello di partenza ha id «partenza:<chiave>»", () => {
    const m = modelloPagamentoDiPartenza(MODELLI_PAGAMENTO_DI_PARTENZA[0]);
    expect(m.id).toBe("partenza:acconto-saldo");
    expect(m.origine).toBe("partenza");
    expect(eModelloPagamentoDiPartenza(m.id)).toBe(true);
    expect(eModelloPagamentoDiPartenza("m1")).toBe(false);
  });
  it("quello che si manda al server per darli all'azienda: nome, descrizione, rate (senza id)", () => {
    const p = modelliPagamentoPerInizializzare();
    expect(p).toHaveLength(6);
    expect(p[2]).toMatchObject({ nome: "Tre rate con un SAL (30/40/30)", righe: [expect.objectContaining({ evento: "firma_contratto" }), expect.objectContaining({ evento: "sal_numero", numero: 1 }), expect.anything()] });
    expect(p[0]).not.toHaveProperty("id");
  });
});

describe("modelliPagamentoDaOffrire", () => {
  it("finché l'azienda non li ha fatti suoi: quelli di partenza", () => {
    expect(modelliPagamentoDaOffrire(false, []).map((m) => m.id)).toHaveLength(6);
  });
  it("se ne ha già salvato uno suo prima: i suoi per primi, e quello di partenza con lo stesso nome non si ripete", () => {
    const suo = { ...treRate, id: "a", nome: " metà e metà (50/50) " };
    const offerti = modelliPagamentoDaOffrire(false, [suo]);
    expect(offerti[0].id).toBe("a");
    expect(offerti).toHaveLength(6);
    expect(offerti.filter((m) => m.nome.trim().toLowerCase() === "metà e metà (50/50)")).toHaveLength(1);
  });
  it("dopo: solo i suoi, anche se li ha tolti tutti", () => {
    expect(modelliPagamentoDaOffrire(true, [treRate]).map((m) => m.id)).toEqual(["m1"]);
    expect(modelliPagamentoDaOffrire(true, [])).toEqual([]);
  });
  it("conta quelli di partenza che mancano, senza badare a maiuscole e spazi", () => {
    expect(modelliPagamentoMancanti([])).toBe(6);
    expect(modelliPagamentoMancanti([{ ...treRate, nome: " TUTTO a fine lavori " }])).toBe(5);
  });
});

describe("assemblaModelliPagamento", () => {
  it("compone i modelli dalle due tabelle e rispetta le posizioni", () => {
    const m = assemblaModelliPagamento(
      [{ id: "m2", name: "B", hint: null, position: 1 }, { id: "m1", name: "A", hint: "uno", position: 0 }],
      [
        { id: "r2", template_id: "m1", position: 1, label: "Saldo", type: "balance", percent: "70.00", trigger_evento: "fine_lavori", trigger_numero: null, giorni_preavviso: 7 },
        { id: "r1", template_id: "m1", position: 0, label: "Acconto", type: "deposit", percent: 30, trigger_evento: "firma_contratto", trigger_numero: null, giorni_preavviso: 3 },
      ],
    );
    expect(m.map((x) => x.id)).toEqual(["m1", "m2"]);
    expect(m[0].descrizione).toBe("uno");
    expect(m[0].righe).toEqual([
      { nome: "Acconto", percent: 30, tipo: "deposit", evento: "firma_contratto", numero: null, preavviso: 3 },
      { nome: "Saldo", percent: 70, tipo: "balance", evento: "fine_lavori", numero: null, preavviso: 7 },
    ]);
    expect(m[1].righe).toEqual([]);
    expect(m[1].descrizione).toBe("");
  });
  it("un evento che non conosce diventa «data fissa»: non si rompe", () => {
    const [m] = assemblaModelliPagamento(
      [{ id: "m", name: "A", hint: null, position: 0 }],
      [{ id: "r", template_id: "m", position: 0, label: "X", type: "boh", percent: 100, trigger_evento: "stato_commessa", trigger_numero: null, giorni_preavviso: 7 }],
    );
    expect(m.righe[0]).toMatchObject({ evento: "data_fissa", tipo: "deposit" });
  });
});

describe("come si legge", () => {
  it("quando matura una rata", () => {
    expect(quandoRata("firma_contratto", null)).toBe("alla firma del contratto");
    expect(quandoRata("sal_numero", 2)).toBe("al SAL n. 2");
    expect(quandoRata("sal_numero", null)).toBe("al SAL");
    expect(quandoRata("fine_lavori", null)).toBe("a fine lavori");
  });
  it("il riepilogo di un modello", () => {
    expect(riepilogoModello(treRate.righe)).toBe("30% alla firma del contratto · 40% al SAL n. 1 · 30% a fine lavori");
    expect(riepilogoModello([{ percent: 33.5, evento: "data_posa", numero: null }])).toBe("33,5% alla posa");
  });
});

describe("bozze", () => {
  it("la bozza vuota ha già un acconto e un saldo, che sommano cento", () => {
    const b = bozzaPagamentoVuota();
    expect(b.id).toBeNull();
    expect(sommaPercentuali(b.righe)).toBe(100);
    expect(b.righe.map((r) => r.tipo)).toEqual(["deposit", "balance"]);
  });
  it("una copia è una bozza nuova, «Copia di …», con rate che non sono condivise; modificare ne tiene l'id", () => {
    const copia = bozzaPagamentoDaModello(treRate, true);
    expect(copia).toMatchObject({ id: null, nome: "Copia di Tre rate" });
    copia.righe[0].nome = "cambiata";
    expect(treRate.righe[0].nome).toBe("Alla firma");
    expect(bozzaPagamentoDaModello(treRate, false).id).toBe("m1");
    expect(bozzaPagamentoDaModello({ ...treRate, nome: "x".repeat(80) }, true).nome).toHaveLength(80);
  });
  it("i tipi si rimettono a posto: acconti, e l'ultima è il saldo", () => {
    const righe = normalizzaTipi([rata("a", 50, "balance", "firma_contratto"), rata("b", 50, "deposit", "fine_lavori")]);
    expect(righe.map((r) => r.tipo)).toEqual(["deposit", "balance"]);
  });
  it("«metti il resto» porta l'ultima rata a quello che manca per cento", () => {
    const righe = [rata("a", 30, "deposit", "firma_contratto"), rata("b", 25, "deposit", "inizio_lavori"), rata("c", 10, "balance", "fine_lavori")];
    expect(mettiIlResto(righe).map((r) => r.percent)).toEqual([30, 25, 45]);
    // se le altre rate sono già troppe non si inventa niente
    expect(mettiIlResto([rata("a", 100, "deposit", "firma_contratto"), rata("b", 10, "balance", "fine_lavori")]).map((r) => r.percent)).toEqual([100, 10]);
    expect(mettiIlResto([])).toEqual([]);
  });
  it("una rata «al SAL» senza numero prende il primo libero", () => {
    const righe = numeraSal([
      rata("a", 25, "deposit", "sal_numero", 2), rata("b", 25, "deposit", "sal_numero"), rata("c", 25, "deposit", "sal_numero"), rata("d", 25, "balance", "fine_lavori"),
    ]);
    expect(righe.map((r) => r.numero)).toEqual([2, 1, 3, null]);
  });
});

describe("validaBozzaPagamento", () => {
  const ok = (patch: Partial<BozzaModelloPagamento> = {}): BozzaModelloPagamento => ({
    id: null, nome: "Mio", descrizione: "", righe: [rata("Acconto", 30, "deposit", "firma_contratto"), rata("Saldo", 70, "balance", "fine_lavori")], ...patch,
  });
  it("senza nome non passa", () => {
    expect(validaBozzaPagamento(ok({ nome: "  " }))).toEqual({ ok: false, errore: "Dai un nome al modello." });
  });
  it("senza rate, o con troppe, non passa", () => {
    expect(validaBozzaPagamento(ok({ righe: [] }))).toEqual({ ok: false, errore: "Un modello ha almeno una rata." });
    const tredici = Array.from({ length: 13 }, (_, i) => rata(`R${i}`, 7, "deposit", "data_fissa"));
    expect(validaBozzaPagamento(ok({ righe: tredici })).ok).toBe(false);
  });
  it("le percentuali devono sommare cento", () => {
    expect(validaBozzaPagamento(ok({ righe: [rata("a", 30, "deposit", "firma_contratto"), rata("b", 60, "balance", "fine_lavori")] })))
      .toEqual({ ok: false, errore: "Le percentuali devono sommare 100: ora fanno 90." });
    expect(validaBozzaPagamento(ok({ righe: [rata("a", 33.33, "deposit", "firma_contratto"), rata("b", 66.67, "balance", "fine_lavori")] })).ok).toBe(true);
  });
  it("una percentuale a zero o sopra cento non passa", () => {
    expect(validaBozzaPagamento(ok({ righe: [rata("a", 0, "deposit", "firma_contratto"), rata("b", 100, "balance", "fine_lavori")] }))).toEqual({ ok: false, errore: "La percentuale della rata 1 va da 0 a 100." });
    expect(validaBozzaPagamento(ok({ righe: [rata("a", 150, "balance", "fine_lavori")] })).ok).toBe(false);
  });
  it("ogni rata ha un nome", () => {
    expect(validaBozzaPagamento(ok({ righe: [rata("  ", 30, "deposit", "firma_contratto"), rata("b", 70, "balance", "fine_lavori")] })))
      .toEqual({ ok: false, errore: "Dai un nome alla rata 1 (massimo 80 caratteri)." });
  });
  it("una rata «al SAL» dice quale SAL, e due rate non sono lo stesso SAL", () => {
    expect(validaBozzaPagamento(ok({ righe: [rata("a", 30, "deposit", "sal_numero"), rata("b", 70, "balance", "fine_lavori")] })))
      .toEqual({ ok: false, errore: "Scrivi quale SAL è la rata 1 (da 1 a 99)." });
    expect(validaBozzaPagamento(ok({ righe: [rata("a", 30, "deposit", "sal_numero", 1), rata("b", 30, "deposit", "sal_numero", 1), rata("c", 40, "balance", "fine_lavori")] })))
      .toEqual({ ok: false, errore: "Due rate sono lo stesso SAL: ogni SAL ha la sua rata." });
  });
  it("il preavviso va da 0 a 90 giorni", () => {
    const r = [{ ...rata("a", 100, "balance", "fine_lavori"), preavviso: 120 }];
    expect(validaBozzaPagamento(ok({ righe: r }))).toEqual({ ok: false, errore: "Il preavviso della rata 1 va da 0 a 90 giorni." });
  });
  it("ripulisce: spazi, tipi rimessi a posto, numero solo dove serve, descrizione vuota → null; tiene l'id", () => {
    const esito = validaBozzaPagamento({
      id: "m1", nome: "  Mio  ", descrizione: "   ",
      righe: [{ ...rata(" Acconto ", 30.004, "balance", "firma_contratto"), numero: 7 }, rata("Saldo", 69.996, "deposit", "fine_lavori")],
    });
    expect(esito.ok && esito.payload).toEqual({
      id: "m1", nome: "Mio", descrizione: null,
      righe: [
        { nome: "Acconto", percent: 30, tipo: "deposit", evento: "firma_contratto", numero: null, preavviso: 7 },
        { nome: "Saldo", percent: 70, tipo: "balance", evento: "fine_lavori", numero: null, preavviso: 7 },
      ],
    });
  });
});

describe("rateDaModello (stessi numeri della prova SQL)", () => {
  const importi = (m: Pick<ModelloPagamento, "righe">, totale: number) => rateDaModello(m, totale).map((r) => r.amount);
  it("30/40/30 su 1220: 366, 488, 366", () => {
    expect(importi(treRate, 1220)).toEqual([366, 488, 366]);
  });
  it("su 1000,01 ogni rata al centesimo e l'ultima prende il resto: 300,00 · 400,00 · 300,01", () => {
    expect(importi(treRate, 1000.01)).toEqual([300, 400, 300.01]);
  });
  it("su 0,02: 0,01 · 0,01 · 0,00 (la somma torna sempre)", () => {
    expect(importi(treRate, 0.02)).toEqual([0.01, 0.01, 0]);
  });
  it("la somma fa sempre il totale, anche con percentuali scomode", () => {
    const m = { righe: [rata("a", 33.33, "deposit", "data_fissa"), rata("b", 33.33, "deposit", "data_fissa"), rata("c", 33.34, "balance", "data_fissa")] };
    for (const totale of [100, 99.99, 1234.56, 0.5, 7, 100000.07]) {
      const somma = importi(m, totale).reduce((s, x) => Math.round((s + x) * 100) / 100, 0);
      expect(somma, String(totale)).toBe(totale);
    }
  });
  it("un totale negativo o rotto non dà importi negativi", () => {
    expect(importi(treRate, -50)).toEqual([0, 0, 0]);
    expect(importi(treRate, Number.NaN)).toEqual([0, 0, 0]);
  });
  it("porta con sé tipo, momento, numero del SAL, preavviso e percentuale; nessuna data", () => {
    const [a, b, c] = rateDaModello(treRate, 1000);
    expect(a).toMatchObject({ position: 0, label: "Alla firma", type: "deposit", is_paid: false, trigger_evento: "firma_contratto", trigger_numero: null, giorni_preavviso: 7, percent: 30 });
    expect(b).toMatchObject({ position: 1, trigger_evento: "sal_numero", trigger_numero: 1, percent: 40 });
    expect(c).toMatchObject({ position: 2, type: "balance", trigger_evento: "fine_lavori" });
    expect(a.expected_date).toBeUndefined();
  });
  it("il numero del SAL resta solo sulle rate «al SAL»", () => {
    const m = { righe: [{ ...rata("a", 50, "deposit", "firma_contratto"), numero: 3 }, rata("b", 50, "balance", "fine_lavori")] };
    expect(rateDaModello(m, 100)[0].trigger_numero).toBeNull();
  });
});

describe("ricalcolaRatePercentuali", () => {
  it("cambia il totale: le rate da modello seguono, il saldo no (lo calcola il modulo)", () => {
    const rate = rateDaModello(treRate, 1000);
    const nuove = ricalcolaRatePercentuali(rate, 2000);
    expect(nuove.map((r) => r.amount)).toEqual([600, 800, rate[2].amount]);
  });
  it("una rata scritta a mano (senza percentuale) non si tocca", () => {
    const rate: Installment[] = [
      { position: 0, label: "A mano", type: "deposit", amount: 123, is_paid: false },
      { position: 1, label: "Da modello", type: "deposit", amount: 0, is_paid: false, percent: 50 },
      { position: 2, label: "Saldo", type: "balance", amount: 0, is_paid: false },
    ];
    expect(ricalcolaRatePercentuali(rate, 1000).map((r) => r.amount)).toEqual([123, 500, 0]);
  });
  it("una rata già incassata non si tocca", () => {
    const rate: Installment[] = [{ position: 0, label: "A", type: "deposit", amount: 100, is_paid: true, percent: 50 }, { position: 1, label: "S", type: "balance", amount: 0, is_paid: false }];
    expect(ricalcolaRatePercentuali(rate, 1000)[0].amount).toBe(100);
  });
  it("lo stesso totale non crea oggetti nuovi", () => {
    const rate = rateDaModello(treRate, 1000);
    const nuove = ricalcolaRatePercentuali(rate, 1000);
    expect(nuove[0]).toBe(rate[0]);
    expect(nuove[1]).toBe(rate[1]);
  });
  it("conti esatti a mezzo centesimo: 1,005 al 50% è 0,50 o 0,51 come in SQL (arrotondamento verso l'alto)", () => {
    const m = { righe: [rata("a", 50, "deposit", "data_fissa"), rata("b", 50, "balance", "data_fissa")] };
    expect(rateDaModello(m, 1.01)[0].amount).toBe(0.51);
    expect(rateDaModello(m, 1.01)[1].amount).toBe(0.5);
  });
});

describe("puoCambiarePiano", () => {
  const r = (patch: Partial<Installment> = {}): Installment => ({ id: "r1", position: 0, label: "A", type: "deposit", amount: 10, is_paid: false, ...patch });
  it("senza incassi, fatture o SAL sì", () => {
    expect(puoCambiarePiano([r(), r({ id: "r2" })], new Set())).toEqual({ ok: true, motivo: null });
    expect(puoCambiarePiano([], new Set())).toEqual({ ok: true, motivo: null });
  });
  it("una rata incassata, con fattura o legata a un SAL lo impedisce, dicendo perché", () => {
    expect(puoCambiarePiano([r({ is_paid: true })], new Set()).motivo).toMatch(/già incassate/);
    expect(puoCambiarePiano([r({ documento_fiscale_id: "d1" })], new Set()).motivo).toMatch(/fattura/);
    expect(puoCambiarePiano([r()], new Set(["r1"])).motivo).toMatch(/SAL/);
  });
});

describe("saldoDaAllineare", () => {
  const rate = (saldo: number, extra: Partial<Installment> = {}): Installment[] => [
    { id: "a", position: 0, label: "Acconto", type: "deposit", amount: 3000, is_paid: false },
    { id: "s", position: 1, label: "Saldo", type: "balance", amount: saldo, is_paid: false, ...extra },
  ];
  it("il saldo salvato senza IVA si propone di allinearlo al calcolato (totale con IVA meno le altre rate)", () => {
    expect(saldoDaAllineare(rate(7000), 12200)).toEqual({ id: "s", label: "Saldo", salvato: 7000, calcolato: 9200 });
  });
  it("se coincide (o per meno di un euro) non c'è niente da fare", () => {
    expect(saldoDaAllineare(rate(9200), 12200)).toBeNull();
    expect(saldoDaAllineare(rate(9200.5), 12200)).toBeNull();
  });
  it("tiene conto del costo della finanziaria", () => {
    expect(saldoDaAllineare(rate(9200), 12200, 1000)).toEqual({ id: "s", label: "Saldo", salvato: 9200, calcolato: 8200 });
  });
  it("un saldo incassato, senza id, o un piano senza saldo non si propone", () => {
    expect(saldoDaAllineare(rate(7000, { is_paid: true }), 12200)).toBeNull();
    expect(saldoDaAllineare(rate(7000, { id: undefined }), 12200)).toBeNull();
    expect(saldoDaAllineare([rate(0)[0]], 12200)).toBeNull();
    expect(saldoDaAllineare(rate(7000), 0)).toBeNull();
  });
  it("con più rate «saldo» conta l'ultima", () => {
    const piano: Installment[] = [
      { id: "a", position: 0, label: "Acconto", type: "deposit", amount: 1000, is_paid: false },
      { id: "s1", position: 1, label: "SAL 1", type: "balance", amount: 4000, is_paid: false },
      { id: "s2", position: 2, label: "Saldo", type: "balance", amount: 100, is_paid: false },
    ];
    expect(saldoDaAllineare(piano, 10000)).toEqual({ id: "s2", label: "Saldo", salvato: 100, calcolato: 5000 });
  });
});

describe("quandoSiIncassa", () => {
  it("legge il momento d'incasso di qualsiasi rata, anche senza evento o con lo stato della commessa", () => {
    expect(quandoSiIncassa(undefined, null)).toBe("a una data precisa");
    expect(quandoSiIncassa("data_fissa", null)).toBe("a una data precisa");
    expect(quandoSiIncassa("fine_lavori", null)).toBe("a fine lavori");
    expect(quandoSiIncassa("sal_numero", 3)).toBe("al SAL n. 3");
    expect(quandoSiIncassa("stato_commessa", null)).toBe("quando la commessa arriva allo stato scelto");
    expect(quandoSiIncassa("boh", null)).toBe("a una data precisa");
  });
});

describe("rataPerServer", () => {
  it("manda tutti i campi che order_rate_sostituisci legge, con i valori di sempre per quelli mancanti", () => {
    expect(rataPerServer({ position: 0, label: "A", type: "deposit", amount: 10, is_paid: false })).toEqual({
      position: 0, label: "A", type: "deposit", amount: 10, is_paid: false, paid_date: null, expected_date: null,
      trigger_evento: "data_fissa", trigger_status_id: null, trigger_numero: null, giorni_preavviso: 7,
    });
  });
  it("con l'id lo manda: la rata esistente si aggiorna al suo posto e tiene i suoi legami", () => {
    expect(rataPerServer({ id: "r1", position: 1, label: "A", type: "deposit", amount: 10, is_paid: false })).toMatchObject({ id: "r1", position: 1 });
    expect(rataPerServer({ position: 1, label: "A", type: "deposit", amount: 10, is_paid: false })).not.toHaveProperty("id");
  });
  it("non manda la percentuale (è solo del modulo di nuova commessa)", () => {
    expect(rataPerServer({ position: 0, label: "A", type: "deposit", amount: 10, is_paid: false, percent: 30 })).not.toHaveProperty("percent");
  });
});
