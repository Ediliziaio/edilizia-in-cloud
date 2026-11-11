import { expect, it } from "vitest";
import { leggiRispostaAI } from "../../../supabase/functions/planimetria-genera/rispostaAI";
import { costruisciPlanimetria } from "../../../supabase/functions/planimetria-genera/costruisci";
import { PROMPT_SCHIZZO } from "../../../supabase/functions/planimetria-genera/prompt";
import { leggiMisura, scriviCentimetri, scriviMetri } from "@/components/planimetrie/editor/misure";
import { controllaPlanimetria } from "../../../shared/planimetrie/controllo";
import { aPlanimetria, daPlanimetria, datiVista } from "@/components/planimetrie/editor/adattatore";

it("una quota 194,5 cm non diventa 194 o 195 cm aprendo e riconfermando la misura", () => {
  expect(scriviMetri(194.5)).toBe("1,945");
  expect(leggiMisura(scriviMetri(194.5))).toBe(194.5);
  expect(scriviCentimetri(421.5)).toBe("421,5");
  expect(scriviMetri(420)).toBe("4,20");
});

it("conserva il rientro del bagno e i dubbi di lettura insieme agli avvisi geometrici", () => {
  const r = leggiRispostaAI({ sistema: "metri", leggibile: true, altezza_m: null,
    locali: [{ nome: "Bagno", destinazione: "bagno", contorno: [[0.2, 0], [1.945, 0], [1.945, 4.23], [0, 4.23], [0, 0.6], [0.2, 0.6]], misure_lette: true }], aperture: [], quote: [],
    elementi: [{ tipo: "vasca", riquadro: [0, 2, 0.69, 3.69], lato_muro: "sinistra" }],
    avvisi: ["Le quote totali 421,5 e 423 cm differiscono: verificare.", "Le quote totali 421,5 e 423 cm differiscono: verificare.", null, 10],
  }, "metri");
  const g = costruisciPlanimetria(r, { ingresso: "schizzo" });
  expect(g.planimetria.livelli[0].fatto.locali[0].contorno).toHaveLength(6);
  const muri = g.planimetria.livelli[0].fatto.muri;
  expect(muri).toHaveLength(6);
  const lunghezze = muri.map((m) => Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y));
  expect(lunghezze).toContain(20);
  expect(lunghezze).toContain(60);
  for (const m of muri) for (const p of [m.p1, m.p2]) {
    expect(muri.some((v) => v !== m && [v.p1, v.p2].some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.01))).toBe(true);
  }
  expect(controllaPlanimetria(g.planimetria).filter((p) => ["parete_staccata", "locale_non_chiuso"].includes(p.codice))).toEqual([]);
  const editor = daPlanimetria(g.planimetria);
  const vista = datiVista(editor, g.planimetria, "fatto");
  expect(vista.locali[0].lati).toEqual([174.5, 423, 194.5, 363, 20, 60]);
  expect(aPlanimetria(editor, g.planimetria).livelli[0].fatto.locali[0].contorno).toEqual(g.planimetria.livelli[0].fatto.locali[0].contorno);
  expect(g.planimetria.livelli[0].fatto.elementi[0].tipo).toBe("vasca");
  expect(g.generazione.avvisi.filter((a) => a.startsWith("Le quote totali"))).toHaveLength(1);
  expect(g.generazione.avvisi.join(" ")).toContain("Altezza dei locali non riconosciuta");
});

it("lo schizzo distingue quote di impianti e rivestimenti dalle altezze del soffitto", () => {
  expect(PROMPT_SCHIZZO).toContain('"H piastrelle"');
  expect(PROMPT_SCHIZZO).toContain("quote non conciliabili");
  expect(PROMPT_SCHIZZO).toContain("non completarla con una casa inventata");
  expect(PROMPT_SCHIZZO).toContain("Porte e finestre SOLO");
  expect(PROMPT_SCHIZZO).toContain("tre decimali");
});

it("conserva altezza e davanzale scritti del serramento, senza sostituirli con misure standard", () => {
  const r = leggiRispostaAI({ sistema: "metri", altezza_m: 2.66, locali: [{ nome: "Bagno", contorno: [[0,0],[1.945,0],[1.945,4.23],[0,4.23]], misure_lette: true }], aperture: [{ tipo: "finestra", da: [1.945,1.51], a: [1.945,2.51], altezza_m: 1.665, davanzale_m: 0.85 }] }, "metri");
  const g = costruisciPlanimetria(r, { ingresso: "schizzo" });
  expect(g.planimetria.livelli[0].fatto.aperture[0]).toMatchObject({ larghezza: 100, altezza: 166.5, davanzale: 85 });
  expect(g.planimetria.livelli[0].fatto.aperture[0].origineMisure?.altezza).not.toBe("stimata");
});

it.each([false, true])("conserva due ante e l'apertura verso l'interno anche con gli stipiti invertiti (%s)", (invertiti) => {
  const da = [0.845, 0], a = [1.945, 0];
  const r = leggiRispostaAI({ sistema: "metri", locali: [{ nome: "Bagno", contorno: [[0,0],[1.945,0],[1.945,4.23],[0,4.23]], misure_lette: true }], aperture: [{ tipo: "portafinestra", da: invertiti ? a : da, a: invertiti ? da : a, ante: 2, cardine: invertiti ? "a" : "da", apertura_verso: "basso" }] }, "metri");
  const g = costruisciPlanimetria(r, { ingresso: "schizzo" });
  expect(g.planimetria.livelli[0].fatto.aperture[0]).toMatchObject({ ante: 2, verso: { cardine: "p1", lato: "destra" } });
});

it("non trasforma un dettaglio illeggibile in un numero di ante o un verso arbitrario", () => {
  const r = leggiRispostaAI({ sistema: "metri", locali: [{ nome: "Bagno", contorno: [[0,0],[2,0],[2,4],[0,4]] }], aperture: [{ tipo: "porta", da: [0.5,4], a: [1.3,4], ante: 20, cardine: "forse", apertura_verso: "interno" }] }, "metri");
  const ap = costruisciPlanimetria(r, { ingresso: "schizzo" }).planimetria.livelli[0].fatto.aperture[0];
  expect(ap.ante).toBeUndefined();
  expect(ap.verso).toBeNull();
});
