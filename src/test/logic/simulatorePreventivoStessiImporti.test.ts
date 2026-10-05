// Simulazione → preventivo: il preventivo creato deve avere lo stesso
// imponibile, sconto, IVA e totale della simulazione (05/10/2026).
//
// Il database ricalcola i totali del preventivo dalle righe a ogni salvataggio
// (do_recalculate_quote_totals + line_total generata). Qui quel conto è rifatto
// in centesimi interi, con l'arrotondamento di Postgres (metà lontano da zero),
// e applicato alle righe e alla testata che crea TrasformaDialog.
import { describe, it, expect } from "vitest";
import { calcolaSimulazione } from "@/lib/simulatore/calcolaSimulazione";
import { mapVociToQuoteItems, testataPreventivo } from "@/lib/simulatore/trasforma";
import { DEFAULT_SCENARI } from "@/lib/simulatore/tipi";
import type { ScenariConfig, SimulazioneDoc, VoceSim } from "@/lib/simulatore/tipi";

/** Un importo a due decimali (come lo salva una colonna numeric(…, 2)) in centesimi. */
const cent = (x: number): bigint => BigInt(Math.round(x * 100));

/** Divisione intera con arrotondamento a metà lontano da zero, come ROUND() di Postgres. */
function divArrotondata(num: bigint, den: bigint): bigint {
  const negativo = (num < 0n) !== (den < 0n);
  const a = num < 0n ? -num : num;
  const b = den < 0n ? -den : den;
  const q = (a * 2n + b) / (2n * b);
  return negativo ? -q : q;
}

/** do_recalculate_quote_totals (senza prezzo a mano), sulle righe salvate. */
function ricalcolaComeIlDatabase(
  righe: { quantity: number; unit_price: number; vat_rate: number }[],
  scontoPct: number,
) {
  const d = cent(scontoPct); // sconto × 100
  // line_total = round(quantity × unit_price, 2), quantity e unit_price a due decimali.
  const linee = righe.map((r) => ({ aliquota: cent(r.vat_rate), totale: divArrotondata(cent(r.quantity) * cent(r.unit_price), 100n) }));
  const base = linee.reduce((s, l) => s + l.totale, 0n);
  const netto = divArrotondata(base * (10000n - d), 10000n);
  const perAliquota = new Map<bigint, bigint>();
  for (const l of linee) perAliquota.set(l.aliquota, (perAliquota.get(l.aliquota) ?? 0n) + l.totale);
  let iva = 0n;
  for (const [aliquota, somma] of perAliquota) iva += divArrotondata(somma * aliquota * (10000n - d), 100_000_000n);
  return { subtotal: base, discount_amount: base - netto, vat_amount: iva, total: netto + iva };
}

const voce = (p: Partial<VoceSim>): VoceSim => ({
  id: "1", fase_id: null, descrizione: "x", fonte: "libera", riferimento_id: null,
  codice: null, quantita: 1, unita: "pz", costo_unitario: 0, ricarico_pct: 0,
  prezzo_unitario: 0, vat_rate: 10, bene_significativo: false,
  valore_posa_associata: null, is_manodopera: false, ordine: 0, ...p,
});

const doc = (voci: VoceSim[], scenari: Partial<ScenariConfig>): SimulazioneDoc => ({
  voci, fasi: [], scenari: { ...DEFAULT_SCENARI, ...scenari },
});

/** Il preventivo come lo salva il database, confrontato con la simulazione. */
function confronta(d: SimulazioneDoc) {
  const r = calcolaSimulazione(d);
  const testata = testataPreventivo(d, r);
  const righe = mapVociToQuoteItems(d.voci, "azienda", "preventivo", d.scenari);
  const db = ricalcolaComeIlDatabase(righe, testata.discount_percent);
  return {
    simulazione: {
      subtotal: cent(testata.subtotal),
      discount_amount: cent(testata.discount_amount),
      vat_amount: cent(testata.vat_amount),
      total: cent(testata.total),
    },
    database: db,
    r,
  };
}

describe("simulazione → preventivo: stessi importi", () => {
  it("10.000 € con lo sconto del 10% resta 9.000 € + IVA, non 10.000 €", () => {
    const { simulazione, database, r } = confronta(
      doc([voce({ quantita: 1, prezzo_unitario: 10000 })], { iva_mode: "singola", iva_rate_singola: 10, sconto_pct: 10 }),
    );
    expect(r.ricavo_netto).toBe(9000);
    expect(database).toEqual(simulazione);
    expect(database.total).toBe(990000n); // 9.900,00 €
  });

  it("beni significativi in mista: il preventivo non cresce della posa", () => {
    // Caldaia fornita e posata 1.000 € (300 di posa) + smaltimento 200 € al 10%.
    const { simulazione, database, r } = confronta(
      doc(
        [
          voce({ id: "c", quantita: 1, prezzo_unitario: 1000, bene_significativo: true, valore_posa_associata: 300 }),
          voce({ id: "s", quantita: 1, prezzo_unitario: 200, vat_rate: 10 }),
        ],
        { iva_mode: "mista", iva_rate_singola: 10, sconto_pct: 5 },
      ),
    );
    expect(database).toEqual(simulazione);
    expect(database.subtotal).toBe(120000n); // 1.200 €, non 1.500
    // Bene 700, limite 300 + 200 = 500 → 200 al 22%; il resto (1.000) al 10%. Sconto 5%.
    expect(r.riepilogo_iva).toEqual([
      { aliquota: 10, imponibile: 950, imposta: 95 },
      { aliquota: 22, imponibile: 190, imposta: 41.8 },
    ]);
  });

  it("in singola le righe con un'altra aliquota prendono quella della simulazione", () => {
    const { simulazione, database } = confronta(
      doc(
        [voce({ id: "a", quantita: 2, prezzo_unitario: 450, vat_rate: 22 }), voce({ id: "b", quantita: 1, prezzo_unitario: 99.99, vat_rate: 4 })],
        { iva_mode: "singola", iva_rate_singola: 10, sconto_pct: 0 },
      ),
    );
    expect(database).toEqual(simulazione);
  });

  it("sui mezzi centesimi lo sconto si arrotonda come nel database", () => {
    // 10,05 € −10% = 9,045 → 9,05 (sconto 1,00), non 9,04 (sconto 1,01).
    const { simulazione, database, r } = confronta(
      doc([voce({ quantita: 1, prezzo_unitario: 10.05 })], { iva_mode: "singola", iva_rate_singola: 22, sconto_pct: 10 }),
    );
    expect(r.ricavo_netto).toBe(9.05);
    expect(r.sconto_valore).toBe(1);
    expect(database).toEqual(simulazione);
  });

  it("una riga a metà centesimo si arrotonda come la line_total del database", () => {
    // 2,5 × 1,01 = 2,525 → 2,53; in virgola mobile 2,5249999… finiva a 2,52.
    const { simulazione, database, r } = confronta(
      doc([voce({ quantita: 2.5, prezzo_unitario: 1.01 })], { iva_mode: "singola", iva_rate_singola: 10, sconto_pct: 0 }),
    );
    expect(r.ricavo_lordo).toBe(2.53);
    expect(database).toEqual(simulazione);
  });

  it("su molte simulazioni a caso il preventivo torna al centesimo", () => {
    let seme = 20261005;
    const caso = () => {
      seme = (seme * 48271) % 2147483647;
      return seme / 2147483647;
    };
    const sconti = [0, 0.5, 3, 7.5, 10, 12.25, 15, 33.33, 50, 100];
    let diversi = 0;
    for (let giro = 0; giro < 400; giro++) {
      const mista = caso() < 0.5;
      const voci = Array.from({ length: 1 + Math.floor(caso() * 7) }, (_, i) =>
        voce({
          id: `v${i}`,
          ordine: i,
          // Qualche quantità e qualche prezzo con tre decimali: la riga diventa 1 × il totale.
          quantita: caso() < 0.15 ? Math.round(caso() * 100000) / 1000 : Math.round(caso() * 10000) / 100,
          prezzo_unitario: caso() < 0.15 ? Math.round(caso() * 1000000) / 1000 : Math.round(caso() * 500000) / 100,
          costo_unitario: Math.round(caso() * 100000) / 100,
          vat_rate: ([4, 10, 10, 22] as const)[Math.floor(caso() * 4)],
          bene_significativo: mista && caso() < 0.35,
          valore_posa_associata: caso() < 0.5 ? Math.round(caso() * 200000) / 100 : null,
          is_manodopera: caso() < 0.2,
        }),
      );
      const { simulazione, database } = confronta(
        doc(voci, {
          iva_mode: mista ? "mista" : "singola",
          iva_rate_singola: ([4, 10, 22] as const)[Math.floor(caso() * 3)],
          sconto_pct: sconti[Math.floor(caso() * sconti.length)],
        }),
      );
      if (JSON.stringify(database, (_, v) => (typeof v === "bigint" ? v.toString() : v)) !==
        JSON.stringify(simulazione, (_, v) => (typeof v === "bigint" ? v.toString() : v))) diversi += 1;
    }
    expect(diversi).toBe(0);
  });
});
