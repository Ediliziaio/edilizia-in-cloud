/**
 * Una ristrutturazione a SAL da capo a fondo (15/11/2026), con i calcoli che usano il verbale e
 * «Crea fattura»: contratto 100.000 € + IVA 10%, acconto del 20% alla firma (fatturato e incassato),
 * ritenuta di garanzia del 5%, tre SAL a 28.000, 65.000 e 100.000 € di lavori.
 *
 * Alla fine la somma deve tornare: acconto + netti dei certificati + svincolo della ritenuta = contratto.
 * Prima l'acconto non si recuperava mai e il cliente riceveva fatture per 120.000 €.
 */
import { describe, expect, it } from "vitest";
import { anticipazioneDalPiano, certificatoATuttoOggi, percentualeRitenutaContratto, recuperoAnticipazione, type SalCertificato } from "@/lib/orders/salCertificato";
import { certificatoNelModulo, rataSaldoPerSalFinale } from "@/lib/orders/salNuovoVerbale";
import type { Installment } from "@/lib/orderUtils";
import { righeSal, salInFattura, type SalPerFattura } from "@/lib/orders/fatturaDaLavori";

const CONTRATTO = 100_000;
const IVA = 10;
const rate = [
  { type: "deposit", trigger_evento: "firma_contratto", amount: 22_000, is_paid: true },
  { type: "deposit", trigger_evento: "sal_numero", amount: 33_000, is_paid: false },
  { type: "deposit", trigger_evento: "sal_numero", amount: 44_000, is_paid: false },
  { type: "balance", trigger_evento: "fine_lavori", amount: 11_000, is_paid: false },
];

describe("ristrutturazione a SAL: acconto, ritenuta, tre certificati", () => {
  const anticipazione = anticipazioneDalPiano(rate, IVA);
  const ritenutaContratto = percentualeRitenutaContratto({ percentuale: "5", su: "sal", svincolo: "collaudo" });

  const cumulativi = [28_000, 65_000, 100_000];
  const certificati: SalCertificato[] = [];
  for (const cumulativo of cumulativi) {
    const precedente = certificati[certificati.length - 1] ?? null;
    certificati.push(certificatoNelModulo({
      cumulativo, precedente, giaMaturato: precedente ? precedente.lavori_contrattuali : 0,
      anticipazione, contratto: CONTRATTO, ritenutaContratto,
    }));
  }

  it("l'acconto è l'imponibile della rata pagata alla firma, non le rate dei SAL", () => {
    expect(anticipazione).toBe(20_000);
    expect(anticipazioneDalPiano(rate.map((r) => ({ ...r, is_paid: false })), IVA)).toBe(0);
  });

  it("il recupero va in proporzione ai lavori e all'ultimo SAL è tutto", () => {
    expect(certificati.map((c) => c.recupero_anticipazione)).toEqual([5_600, 13_000, 20_000]);
    expect(recuperoAnticipazione(20_000, 120_000, CONTRATTO)).toBe(20_000);
  });

  it("la ritenuta è quella del contratto, cumulativa", () => {
    expect(certificati.map((c) => c.ritenuta_pct)).toEqual([5, 5, 5]);
    expect(certificati.map((c) => c.ritenuta)).toEqual([1_400, 3_250, 5_000]);
  });

  it("i netti da fatturare tornano col contratto", () => {
    expect(certificati.map((c) => c.netto)).toEqual([21_000, 27_750, 26_250]);
    const fatturato = anticipazione + certificati.reduce((t, c) => t + c.netto, 0);
    const ritenutaDaSvincolare = certificati[2].ritenuta;
    expect(fatturato + ritenutaDaSvincolare).toBe(CONTRATTO);
    expect(certificatoATuttoOggi(certificati[2])).toBe(CONTRATTO - 5_000 - 20_000);
  });

  it("«Crea fattura» propone per ogni SAL il netto del suo certificato", () => {
    const sal: SalPerFattura[] = cumulativi.map((c, i) => ({
      id: `s${i + 1}`, numero_sal: i + 1, stato: "emesso", importo_totale: c, sal_certificati: certificati[i],
    }));
    const fatturato = { salFatturati: new Set<string>() };
    const quote = sal.map((s) => salInFattura(s, sal, fatturato, []).quota);
    expect(quote).toEqual([21_000, 27_750, 26_250]);
    expect(righeSal(sal[0], sal, IVA)[0].prezzo_unitario).toBe(21_000);
  });

  it("senza ritenuta nel contratto né certificato prima, la ritenuta è zero (non più il 10% d'ufficio)", () => {
    const c = certificatoNelModulo({ cumulativo: 28_000, precedente: null, giaMaturato: 0 });
    expect(c.ritenuta_pct).toBe(0);
    expect(c.netto).toBe(28_000);
  });

  it("il SAL finale prende la rata di saldo, così il saldo non si fattura due volte", () => {
    const piano: Installment[] = [
      { id: "a", position: 0, label: "Acconto", type: "deposit", amount: 22_000, is_paid: true, trigger_evento: "firma_contratto" },
      { id: "s1", position: 1, label: "SAL 1", type: "deposit", amount: 23_100, is_paid: false, trigger_evento: "sal_numero", trigger_numero: 1 },
      { id: "s2", position: 2, label: "SAL 2", type: "deposit", amount: 30_525, is_paid: false, trigger_evento: "sal_numero", trigger_numero: 2 },
      { id: "z", position: 3, label: "Saldo", type: "balance", amount: 0, is_paid: false, trigger_evento: "fine_lavori" },
    ];
    const emessi = [{ numero_sal: 1, installment_id: "s1" }, { numero_sal: 2, installment_id: "s2" }];
    expect(rataSaldoPerSalFinale(piano, emessi, 100_000, CONTRATTO)).toBe("z");
    expect(rataSaldoPerSalFinale(piano, emessi, 90_000, CONTRATTO)).toBe("");
    expect(rataSaldoPerSalFinale(piano, emessi.slice(0, 1), 100_000, CONTRATTO)).toBe("");
    expect(rataSaldoPerSalFinale(piano, [...emessi, { numero_sal: 3, installment_id: "z" }], 100_000, CONTRATTO)).toBe("");
  });
});
