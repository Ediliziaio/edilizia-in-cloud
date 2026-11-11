import { expect, it } from "vitest";
import { modelloElemento } from "./elementi";

it("la scrivania è riconoscibile e lascia libero lo spazio sotto il piano", () => {
  const m = modelloElemento("scrivania"), b = m.blocchi(1.2, .6, .75);
  expect(m.nome).toBe("Scrivania");
  expect(b.some((p) => Math.abs(p.x) < p.l / 2 && Math.abs(p.z) < p.p / 2 && p.y <= .4 && p.y + p.h >= .4)).toBe(false);
  expect(Math.max(...b.map((p) => p.y + p.h))).toBeCloseTo(.75);
  expect(Math.max(...b.map((p) => p.x + p.l / 2)) - Math.min(...b.map((p) => p.x - p.l / 2))).toBeCloseTo(1.2);
});

it("la libreria mostra vani aperti senza cambiare l'ingombro scelto", () => {
  const b = modelloElemento("libreria").blocchi(1.6, .35, 2);
  expect(b.some((p) => Math.abs(p.x) < p.l / 2 && Math.abs(p.z) < p.p / 2 && p.y <= .2 && p.y + p.h >= .2)).toBe(false);
  expect(Math.max(...b.map((p) => p.y + p.h))).toBeCloseTo(2);
  expect(Math.max(...b.map((p) => p.x + p.l / 2)) - Math.min(...b.map((p) => p.x - p.l / 2))).toBeCloseTo(1.6);
});
