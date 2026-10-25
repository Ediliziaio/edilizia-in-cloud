import { expect, it } from "vitest";
import { leggiPreventivoAi, riepilogoPreventivoAi } from "@/lib/preventivi/aiQuoteReview";
import { calcolaTotaliPreventivo } from "@/hooks/usePreventivoCosti";

it("100 righe: correzioni e calcoli restano locali, con costo misurato", () => {
  const input = { sezioni: [{ nome: "Campione sintetico massimo", righe: Array.from({ length: 100 }, (_, i) => ({
    nome: `Lavorazione ${i}`, item_category: "posa", quantita: 12.5, unita_misura: "mq", unit_price: 30.25,
  })) }] };
  const parsed = leggiPreventivoAi(input);
  const items = parsed.sezioni[0].righe.map(r => ({
    item_category: r.item_category, quantity: r.quantita!, unit_price: r.unit_price!,
    discount_percent: 0, vat_rate: 22, prezzo_acquisto: 10, is_optional: false,
  }));
  const samples: number[] = [];
  const baseline: number[] = [];
  // Warm the JIT before recording local microbenchmarks. These are not API SLOs.
  for (let i = 0; i < 20; i++) riepilogoPreventivoAi(parsed.sezioni);
  for (let i = 0; i < 200; i++) {
    const t0 = performance.now(); calcolaTotaliPreventivo(items, 10, 5); baseline.push(performance.now() - t0);
    const t1 = performance.now(); riepilogoPreventivoAi(leggiPreventivoAi(input).sezioni); samples.push(performance.now() - t1);
  }
  samples.sort((a, b) => a - b); baseline.sort((a, b) => a - b);
  console.info("PREVENTIVATORE_LOCAL_BENCHMARK", JSON.stringify({
    rows: 100, iterations: samples.length, baseline_existing_engine_p95_ms: baseline[189],
    validation_and_review_p50_ms: samples[99], validation_and_review_p95_ms: samples[189],
    scope: "CPU locale, non latenza AI o database",
  }));
  expect(riepilogoPreventivoAi(parsed.sezioni).totale).toBe(calcolaTotaliPreventivo(items, 0, 0).subtotale);
  expect(riepilogoPreventivoAi(parsed.sezioni).righe).toBe(100);
  // Only catches gross accidental blocking in this local suite, not a promised
  // end-user latency target. Production p95 still needs a representative pilot.
  expect(samples[189]).toBeLessThan(100);
});
