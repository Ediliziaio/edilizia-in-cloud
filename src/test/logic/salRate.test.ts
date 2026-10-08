// src/test/logic/salRate.test.ts
import { describe, expect, it } from "vitest";
import type { Installment } from "@/lib/orderUtils";
import { numeroNuovoSal, prossimoStatoSal, rataDaAllineareAlSal, rataDaSal, rateSalDaEmettere } from "@/lib/orders/salRate";

const rata = (patch: Partial<Installment>): Installment => ({
  id: "r", position: 0, label: "Rata", type: "deposit", amount: 1000, is_paid: false, ...patch,
});
const sal = (numero_sal: number, installment_id: string | null = null) => ({ numero_sal, installment_id });

describe("rateSalDaEmettere", () => {
  const piano = [
    rata({ id: "a", position: 0, label: "Acconto", trigger_evento: "firma_contratto" }),
    rata({ id: "b", position: 1, label: "SAL 2", trigger_evento: "sal_numero", trigger_numero: 2 }),
    rata({ id: "c", position: 2, label: "SAL 1", trigger_evento: "sal_numero", trigger_numero: 1 }),
    rata({ id: "d", position: 3, label: "Saldo", type: "balance", trigger_evento: "fine_lavori" }),
  ];
  it("sono le rate «al SAL n°» che non hanno ancora il verbale, nell'ordine dei SAL", () => {
    expect(rateSalDaEmettere(piano, []).map((r) => r.label)).toEqual(["SAL 1", "SAL 2"]);
  });
  it("una rata col verbale legato non c'è più", () => {
    expect(rateSalDaEmettere(piano, [sal(5, "c")]).map((r) => r.label)).toEqual(["SAL 2"]);
  });
  it("neanche quella il cui numero ha già un verbale, anche se non è legato", () => {
    expect(rateSalDaEmettere(piano, [sal(1)]).map((r) => r.label)).toEqual(["SAL 2"]);
  });
  it("una rata già incassata o senza id non si aspetta", () => {
    const p = [rata({ id: "a", trigger_evento: "sal_numero", trigger_numero: 1, is_paid: true }), rata({ id: undefined, trigger_evento: "sal_numero", trigger_numero: 2 })];
    expect(rateSalDaEmettere(p, [])).toEqual([]);
  });
  it("una rata «al SAL» senza numero si aspetta finché non c'è nessun verbale legato", () => {
    const p = [rata({ id: "x", trigger_evento: "sal_numero", trigger_numero: null })];
    expect(rateSalDaEmettere(p, [sal(1)])).toHaveLength(1);
    expect(rateSalDaEmettere(p, [sal(1, "x")])).toHaveLength(0);
  });
});

describe("numeroNuovoSal", () => {
  it("quello che la rata aspetta, se è libero", () => {
    expect(numeroNuovoSal({ trigger_numero: 3 }, [sal(1), sal(2)])).toBe(3);
  });
  it("se è già preso, o la rata non lo dice, il primo dopo l'ultimo", () => {
    expect(numeroNuovoSal({ trigger_numero: 2 }, [sal(1), sal(2)])).toBe(3);
    expect(numeroNuovoSal({ trigger_numero: null }, [sal(1), sal(4)])).toBe(5);
    expect(numeroNuovoSal(null, [])).toBe(1);
  });
});

describe("rataDaSal", () => {
  it("il netto da fatturare con l'IVA, al centesimo", () => {
    expect(rataDaSal(10000, 22)).toBe(12200);
    expect(rataDaSal(333.33, 22)).toBe(406.66);
    expect(rataDaSal(-50, 22)).toBe(0);
  });
});

describe("rataDaAllineareAlSal", () => {
  const base = { rata: { is_paid: false }, saldoFinale: false, importoMostrato: 10000, nettoDaFatturare: 10000, aliquotaIva: 22 };
  it("propone l'importo del SAL con l'IVA se la rata vale altro", () => {
    expect(rataDaAllineareAlSal(base)).toBe(12200);
  });
  it("se coincide (o per meno di un euro) non propone niente", () => {
    expect(rataDaAllineareAlSal({ ...base, importoMostrato: 12200 })).toBeNull();
    expect(rataDaAllineareAlSal({ ...base, importoMostrato: 12199.5 })).toBeNull();
  });
  it("non propone per una rata incassata, per il saldo finale, senza rata o senza importo da fatturare", () => {
    expect(rataDaAllineareAlSal({ ...base, rata: { is_paid: true } })).toBeNull();
    expect(rataDaAllineareAlSal({ ...base, saldoFinale: true })).toBeNull();
    expect(rataDaAllineareAlSal({ ...base, rata: null })).toBeNull();
    expect(rataDaAllineareAlSal({ ...base, nettoDaFatturare: 0 })).toBeNull();
    expect(rataDaAllineareAlSal({ ...base, nettoDaFatturare: -100 })).toBeNull();
  });
});

describe("prossimoStatoSal", () => {
  it("bozza → emetti, emesso → segna approvato, poi niente (firmato lo dice il cliente)", () => {
    expect(prossimoStatoSal("bozza")).toEqual({ stato: "emesso", etichetta: "Emetti" });
    expect(prossimoStatoSal("emesso")).toEqual({ stato: "approvato", etichetta: "Segna approvato" });
    expect(prossimoStatoSal("approvato")).toBeNull();
    expect(prossimoStatoSal("firmato")).toBeNull();
  });
});
