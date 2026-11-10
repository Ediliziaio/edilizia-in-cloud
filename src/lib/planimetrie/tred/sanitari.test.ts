import { expect, it } from "vitest";
import { costruisciElemento } from "./elementi";
import { CostruttoreMesh } from "./costruttore";

it.each(["wc", "bidet"] as const)("il %s è riconoscibile con vaschetta aperta e conserva centro e ingombro dopo la rotazione", (tipo) => {
  const ceramica = new CostruttoreMesh(), altri = new CostruttoreMesh();
  costruisciElemento(tipo, { x: 1.3, z: 2.6 }, 3 * Math.PI / 2, { l: .38, p: .55, h: .4 }, (m) => m === "ceramica" ? ceramica : altri);
  const assi = [0, 1, 2].map((k) => ceramica.posizioni.filter((_, i) => i % 3 === k));
  expect(Math.min(...assi[0])).toBeCloseTo(1.3 - .55 / 2);
  expect(Math.max(...assi[0])).toBeCloseTo(1.3 + .55 / 2);
  expect(Math.min(...assi[2])).toBeCloseTo(2.6 - .38 / 2);
  expect(Math.max(...assi[2])).toBeCloseTo(2.6 + .38 / 2);
  expect(Math.max(...assi[1])).toBeCloseTo(tipo === "wc" ? .78 : .4);
  // La vaschetta usa un profilo curvo, non il precedente blocco pieno.
  expect(new Set(assi[0].map((x) => x.toFixed(4))).size).toBeGreaterThan(12);
});
