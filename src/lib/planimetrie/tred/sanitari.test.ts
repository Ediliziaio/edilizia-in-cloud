import { expect, it } from "vitest";
import { costruisciElemento } from "./elementi";
import { CostruttoreMesh } from "./costruttore";
import { costruisciScena } from "./scena";
import type { PiantaPer3D } from "./tipi";
import type { Elemento } from "../../../../shared/planimetrie/modello.ts";
import { bloccoModelliInquadrati, modelliInquadratiPerRender } from "../../../../shared/render-planimetria/prompt.ts";

it("i raccordi raggiungono la muratura e cambiano lato se davanti trovano una finestra", () => {
  const p: PiantaPer3D = {
    locali: [], aperture: [],
    muri: [
      { id: "dietro", a: { x: -5, y: -5 }, b: { x: 200, y: -5 }, spessore: 10, altezza: 260, stato: "esistente" },
      { id: "sinistra", a: { x: -5, y: -5 }, b: { x: -5, y: 200 }, spessore: 10, altezza: 260, stato: "esistente" },
    ],
    elementi: [{ id: "doccia", tipo: "doccia", centro: { x: 47, y: 45 }, larghezza: 80, profondita: 80, altezza: 205, rotazione: 0 }],
  };
  const doccia = () => costruisciScena(p).mesh.find(m => m.id === "elemento:doccia:inox");
  expect(Math.min(...doccia()!.posizioni.filter((_, i) => i % 3 === 2))).toBeCloseTo(-.002, 5);
  p.aperture.push({ id: "f1", muroId: "dietro", tipo: "finestra", posizione: 53, larghezza: 90, altezza: 145, davanzale: 88, stato: "esistente" });
  expect(Math.min(...doccia()!.posizioni.filter((_, i) => i % 3 === 0))).toBeCloseTo(-.002, 5);
  p.aperture.push({ ...p.aperture[0], id: "f2", muroId: "sinistra" });
  const senzaSupporto = costruisciScena(p);
  expect(senzaSupporto.mesh.some(m => m.id === "elemento:doccia:inox")).toBe(false);
  expect(senzaSupporto.avvisi).toContainEqual(expect.stringContaining("parete piena per il fissaggio"));
});

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

it("mantiene il vuoto sotto il WC sospeso e la cassetta solo nel modello a vista", () => {
  const quote = (modello: string) => {
    const c = new CostruttoreMesh(), altri = new CostruttoreMesh();
    costruisciElemento("wc", { x: 0, z: 0 }, 0, { l: .38, p: .55, h: .4, modello }, m => m === "ceramica" ? c : altri);
    const y = c.posizioni.filter((_, i) => i % 3 === 1);
    return [Math.min(...y), Math.max(...y)];
  };
  const [base, sommità] = quote("sospeso");
  expect(base).toBeGreaterThan(.14);
  expect(sommità).toBeCloseTo(.4);
  expect(quote("filo_muro")[0]).toBeCloseTo(0);
  expect(quote("filo_muro")[1]).toBeCloseTo(sommità);
  expect(quote("cassetta_vista")[1]).toBeCloseTo(.78);
});

it("descrive nel prompt il modello salvato solo se è visibile e non demolito", () => {
  const wc: Elemento = {
    id: "wc", tipo: "wc", modello: "sospeso", posizione: { x: 50, y: 70 }, rotazione: 90,
    larghezza: 38, profondita: 55, colore: "#f1eee7", stato: "esistente", origine: "rilevata",
  };
  const elementi: Elemento[] = [
    wc,
    { ...wc, id: "fuori-vista", tipo: "lavabo", modello: "appoggio" },
    { ...wc, id: "demolito", modello: "cassetta_vista", stato: "da_demolire" },
  ];
  const visibili = modelliInquadratiPerRender(elementi, ["wc", "demolito", "inesistente"]);
  expect(visibili).toHaveLength(1);
  expect(bloccoModelliInquadrati(visibili)).toContain("wall-hung ceramic WC with visible floor clearance below the bowl");
  expect(visibili[0]).toContain("38 cm × 55 cm");
  expect(visibili[0]).toContain("#f1eee7");
  expect(bloccoModelliInquadrati(modelliInquadratiPerRender(elementi, []))).toBe("");
});

it("il render riceve le misure salvate di cucina e letto visibili, anche con il modello di base", () => {
  const cucina: Elemento = { id: "cu", tipo: "cucina", posizione: { x: 10, y: 20 }, rotazione: 90,
    larghezza: 300, profondita: 63.5, altezza: 92, origine: "rilevata" };
  const letto: Elemento = { ...cucina, id: "letto", tipo: "letto_matrimoniale", larghezza: 180, profondita: 210, altezza: 54 };
  const righe = modelliInquadratiPerRender([cucina, letto, { ...letto, id: "altro", stato: "da_demolire" }], ["cu", "letto", "altro"]);
  expect(righe).toHaveLength(2);
  expect(righe[0]).toContain("300 cm × 63.5 cm, worktop height 92 cm");
  expect(righe[1]).toContain("180 cm × 210 cm, mattress top at 54 cm above the floor, headboard 100 cm high");
});
