/**
 * Le rate di pagamento del cliente (06/10/2026): l'ultima rata chiude il conto, «Dividi in parti uguali» fa sempre
 * 100, l'importo è lo stesso conto del PDF. Funzioni pure, nessuna interfaccia.
 */
import { describe, expect, it } from "vitest";
import {
  anticipoDaRate, dividiInPartiUguali, importoRata, indiceRataFinanziata, rateConAnticipo, ribilanciaUltimaRata,
  schemaDopoAnticipo, totalePercentuali,
} from "@/lib/serramenti/ratePagamento";
import { SR_SCHEMI_PAGAMENTO, type SrPagamentoMilestone } from "@/types/serramenti";

const rate = (...percentuali: number[]): SrPagamentoMilestone[] =>
  percentuali.map((percentuale, i) => ({ label: `Step ${i + 1}`, percentuale, when: i === 0 ? "Firma" : null }));
const pct = (r: SrPagamentoMilestone[]) => r.map((x) => x.percentuale);

describe("totalePercentuali", () => {
  it("somma al centesimo di punto: 33,33 + 33,33 + 33,34 fa 100, non 99,99999999999999", () => {
    expect(totalePercentuali(rate(33.33, 33.33, 33.34))).toBe(100);
    expect(totalePercentuali(rate(0.1, 0.2))).toBe(0.3);
  });

  it("un valore illeggibile vale zero, e senza rate il totale è zero", () => {
    expect(totalePercentuali([{ label: "x", percentuale: Number.NaN, when: null }, ...rate(40)])).toBe(40);
    expect(totalePercentuali([])).toBe(0);
  });
});

describe("importoRata: lo stesso conto del PDF (totale × percentuale / 100)", () => {
  it("calcola sul totale IVA inclusa", () => {
    expect(importoRata(11_000, 30)).toBe(3_300);
    expect(importoRata(12_901.23, 40)).toBeCloseTo(5_160.492, 6);
  });
  it("una percentuale illeggibile non rompe: zero", () => {
    expect(importoRata(11_000, Number.NaN)).toBe(0);
    expect(importoRata(11_000, undefined as unknown as number)).toBe(0);
  });
});

describe("ribilanciaUltimaRata", () => {
  it("l'ultima prende quello che resta; le altre restano com'erano", () => {
    expect(pct(ribilanciaUltimaRata(rate(20, 40, 30)))).toEqual([20, 40, 40]);
    expect(pct(ribilanciaUltimaRata(rate(30, 35, 99)))).toEqual([30, 35, 35]);
  });

  it("nomi e «quando» non si toccano", () => {
    const prima = rate(20, 40, 30);
    const dopo = ribilanciaUltimaRata(prima);
    expect(dopo.map((r) => [r.label, r.when])).toEqual(prima.map((r) => [r.label, r.when]));
  });

  it("se le altre superano già 100 l'ultima va a zero, mai sotto", () => {
    expect(pct(ribilanciaUltimaRata(rate(80, 40, 30)))).toEqual([80, 40, 0]);
  });

  it("con decimali non lascia scorie della virgola mobile", () => {
    expect(pct(ribilanciaUltimaRata(rate(33.33, 33.33, 0)))).toEqual([33.33, 33.33, 33.34]);
    expect(pct(ribilanciaUltimaRata(rate(12.1, 24.3, 0)))).toEqual([12.1, 24.3, 63.6]);
  });

  it("con una sola rata prende tutto (100); senza rate non fa niente", () => {
    expect(pct(ribilanciaUltimaRata(rate(40)))).toEqual([100]);
    expect(ribilanciaUltimaRata([])).toEqual([]);
  });

  it("non modifica l'elenco che riceve", () => {
    const prima = rate(20, 40, 30);
    const copia = JSON.parse(JSON.stringify(prima));
    ribilanciaUltimaRata(prima);
    expect(prima).toEqual(copia);
  });
});

describe("dividiInPartiUguali", () => {
  it("tre rate: 33 / 33 / 34", () => {
    expect(pct(dividiInPartiUguali(rate(30, 40, 30)))).toEqual([33, 33, 34]);
  });

  it("il resto va alle ultime rate: sei rate fanno 16 / 16 / 17 / 17 / 17 / 17", () => {
    expect(pct(dividiInPartiUguali(rate(0, 0, 0, 0, 0, 0)))).toEqual([16, 16, 17, 17, 17, 17]);
  });

  it("due, quattro e cinque rate dividono giusto", () => {
    expect(pct(dividiInPartiUguali(rate(70, 30)))).toEqual([50, 50]);
    expect(pct(dividiInPartiUguali(rate(1, 1, 1, 1)))).toEqual([25, 25, 25, 25]);
    expect(pct(dividiInPartiUguali(rate(1, 1, 1, 1, 1)))).toEqual([20, 20, 20, 20, 20]);
  });

  it("per qualunque numero di rate da 1 a 40 fa sempre 100, intere, e la differenza tra due rate non supera 1", () => {
    for (let n = 1; n <= 40; n++) {
      const parti = pct(dividiInPartiUguali(rate(...Array(n).fill(0))));
      expect(parti.reduce((a, b) => a + b, 0)).toBe(100);
      expect(parti.every(Number.isInteger)).toBe(true);
      expect(Math.max(...parti) - Math.min(...parti)).toBeLessThanOrEqual(1);
      expect([...parti].sort((a, b) => a - b)).toEqual(parti); // le più grandi sono le ultime
    }
  });

  it("nomi e «quando» restano, e senza rate non fa niente", () => {
    const prima = rate(30, 40, 30);
    expect(dividiInPartiUguali(prima).map((r) => [r.label, r.when])).toEqual(prima.map((r) => [r.label, r.when]));
    expect(dividiInPartiUguali([])).toEqual([]);
  });
});

// ─── L'anticipo e le rate sono la stessa cosa (negli schemi con finanziamento) ──────────────────────────────
const nomi = (...voci: Array<[string, number]>): SrPagamentoMilestone[] =>
  voci.map(([label, percentuale]) => ({ label, percentuale, when: `quando ${label}` }));
const ACCONTO = SR_SCHEMI_PAGAMENTO.acconto_finanziato.milestones[0];
const TUTTO = SR_SCHEMI_PAGAMENTO.tutto_finanziato.milestones;
const ACCONTO_FIN = SR_SCHEMI_PAGAMENTO.acconto_finanziato.milestones;
const DUE_ACCONTI_FIN = SR_SCHEMI_PAGAMENTO.due_acconti_finanziato.milestones;

describe("indiceRataFinanziata: quale rata paga il finanziamento", () => {
  it("negli schemi di serie è l'ultima, quella che si chiama «Finanziamento»", () => {
    expect(indiceRataFinanziata(TUTTO)).toBe(0);
    expect(indiceRataFinanziata(ACCONTO_FIN)).toBe(1);
    expect(indiceRataFinanziata(DUE_ACCONTI_FIN)).toBe(2);
  });

  it("si riconosce dal nome (maiuscole comprese), anche se dopo c'è un'altra rata: l'ultima che parla di finanziamento", () => {
    expect(indiceRataFinanziata(nomi(["Acconto", 30], ["FINANZIAMENTO", 60], ["Saldo posa", 10]))).toBe(1);
    expect(indiceRataFinanziata(nomi(["Finanziamento A", 20], ["Acconto", 20], ["Finanziamento B", 60]))).toBe(2);
  });

  it("senza nessun nome che lo dica vale l'ultima rata", () => {
    expect(indiceRataFinanziata(nomi(["Acconto", 30], ["Resto", 70]))).toBe(1);
  });
});

describe("anticipoDaRate: tutte le rate tranne quella finanziata", () => {
  it("negli schemi di serie: 0, 30 e 50", () => {
    expect(anticipoDaRate(TUTTO)).toBe(0);
    expect(anticipoDaRate(ACCONTO_FIN)).toBe(30);
    expect(anticipoDaRate(DUE_ACCONTI_FIN)).toBe(50);
  });

  it("una rata dopo quella finanziata conta come anticipo (il cliente la paga di tasca sua)", () => {
    expect(anticipoDaRate(nomi(["Acconto", 30], ["Finanziamento", 60], ["Saldo posa", 10]))).toBe(40);
  });

  it("senza scorie della virgola mobile, entro 0 e 100; senza rate zero", () => {
    expect(anticipoDaRate(nomi(["A", 33.33], ["B", 33.33], ["Finanziamento", 33.34]))).toBe(66.66);
    expect(anticipoDaRate(nomi(["A", 80], ["B", 70], ["Finanziamento", 0]))).toBe(100);
    expect(anticipoDaRate([])).toBe(0);
  });
});

describe("rateConAnticipo: l'anticipo cambia e le rate lo seguono", () => {
  it("acconto + finanziato: l'acconto diventa l'anticipo e il finanziamento prende il resto", () => {
    expect(pct(rateConAnticipo(ACCONTO_FIN, 40, ACCONTO))).toEqual([40, 60]);
    expect(pct(rateConAnticipo(ACCONTO_FIN, 10, ACCONTO))).toEqual([10, 90]);
  });

  it("due acconti: l'anticipo si divide nelle stesse proporzioni di prima (20:30), e il finanziamento prende il resto", () => {
    expect(pct(rateConAnticipo(DUE_ACCONTI_FIN, 40, ACCONTO))).toEqual([16, 24, 60]);
    expect(pct(rateConAnticipo(DUE_ACCONTI_FIN, 35, ACCONTO))).toEqual([14, 21, 65]);
    expect(pct(rateConAnticipo(DUE_ACCONTI_FIN, 50, ACCONTO))).toEqual([20, 30, 50]);
  });

  it("acconti prima tutti a zero: si dividono in parti uguali", () => {
    expect(pct(rateConAnticipo(nomi(["A", 0], ["B", 0], ["Finanziamento", 100]), 40, ACCONTO))).toEqual([20, 20, 60]);
  });

  it("l'ultima rata dell'acconto chiude il conto al centesimo: la somma fa ESATTAMENTE l'anticipo", () => {
    const dopo = rateConAnticipo(nomi(["A", 10], ["B", 10], ["C", 10], ["Finanziamento", 70]), 33.33, ACCONTO);
    expect(pct(dopo).slice(0, 3).reduce((a, b) => a + b, 0)).toBeCloseTo(33.33, 10);
    expect(dopo[3].percentuale).toBe(66.67);
    expect(totalePercentuali(dopo)).toBe(100);
  });

  it("anticipo 0: restano solo le rate del finanziamento (tutto finanziato), con nome e «quando» di prima", () => {
    const dopo = rateConAnticipo(ACCONTO_FIN, 0, ACCONTO);
    expect(dopo).toEqual([{ ...ACCONTO_FIN[1], percentuale: 100 }]);
  });

  it("tutto finanziato con un anticipo > 0: si aggiunge davanti la rata dell'acconto; con 0 non cambia niente", () => {
    expect(rateConAnticipo(TUTTO, 30, ACCONTO)).toEqual([{ ...ACCONTO, percentuale: 30 }, { ...TUTTO[0], percentuale: 70 }]);
    expect(rateConAnticipo(TUTTO, 0, ACCONTO)).toEqual([{ ...TUTTO[0], percentuale: 100 }]);
  });

  it("con una rata dopo quella finanziata l'ordine resta e il finanziamento prende il resto: acconto 30 e saldo 10 → anticipo 50", () => {
    const dopo = rateConAnticipo(nomi(["Acconto", 30], ["Finanziamento", 60], ["Saldo posa", 10]), 50, ACCONTO);
    expect(dopo.map((r) => r.label)).toEqual(["Acconto", "Finanziamento", "Saldo posa"]);
    expect(pct(dopo)).toEqual([37.5, 50, 12.5]);
  });

  it("nomi e «quando» non si toccano; l'elenco di partenza non cambia", () => {
    const prima = JSON.parse(JSON.stringify(DUE_ACCONTI_FIN));
    const dopo = rateConAnticipo(DUE_ACCONTI_FIN, 40, ACCONTO);
    expect(dopo.map((r) => [r.label, r.when])).toEqual(prima.map((r: SrPagamentoMilestone) => [r.label, r.when]));
    expect(DUE_ACCONTI_FIN).toEqual(prima);
  });

  it("lo stesso anticipo che c'è già: le stesse rate (niente da riscrivere)", () => {
    expect(rateConAnticipo(ACCONTO_FIN, 30, ACCONTO)).toEqual(ACCONTO_FIN);
    expect(rateConAnticipo(DUE_ACCONTI_FIN, 50, ACCONTO)).toEqual(DUE_ACCONTI_FIN);
  });

  it("l'anticipo sta tra 0 e 100: oltre il finanziamento va a 0, sotto zero vale zero", () => {
    expect(pct(rateConAnticipo(ACCONTO_FIN, 150, ACCONTO))).toEqual([100, 0]);
    expect(rateConAnticipo(ACCONTO_FIN, -5, ACCONTO)).toHaveLength(1);
  });

  it("per qualunque anticipo le rate fanno 100 e l'anticipo che dicono è quello chiesto (0, 0,5, ... 100)", () => {
    const partenze = [ACCONTO_FIN, DUE_ACCONTI_FIN, TUTTO, nomi(["A", 7], ["B", 13], ["C", 29], ["Finanziamento", 51]),
      nomi(["Acconto", 30], ["Finanziamento", 60], ["Saldo posa", 10])];
    for (const partenza of partenze) {
      for (let x = 0; x <= 100; x += 0.5) {
        const dopo = rateConAnticipo(partenza, x, ACCONTO);
        expect(totalePercentuali(dopo), `${partenza.length} rate, anticipo ${x}`).toBe(100);
        expect(anticipoDaRate(dopo), `${partenza.length} rate, anticipo ${x}`).toBeCloseTo(x, 8);
        expect(dopo.every((r) => r.percentuale >= 0)).toBe(true);
      }
    }
  });
});

describe("schemaDopoAnticipo: lo schema che corrisponde alle rate", () => {
  it("con una sola rata è «tutto finanziato»; con un acconto dove non c'era è «acconto + finanziato»; altrimenti resta", () => {
    expect(schemaDopoAnticipo("acconto_finanziato", TUTTO)).toBe("tutto_finanziato");
    expect(schemaDopoAnticipo("due_acconti_finanziato", TUTTO)).toBe("tutto_finanziato");
    expect(schemaDopoAnticipo("tutto_finanziato", ACCONTO_FIN)).toBe("acconto_finanziato");
    expect(schemaDopoAnticipo("acconto_finanziato", ACCONTO_FIN)).toBe("acconto_finanziato");
    expect(schemaDopoAnticipo("due_acconti_finanziato", DUE_ACCONTI_FIN)).toBe("due_acconti_finanziato");
  });
});
