import { describe, expect, it } from "vitest";
import { costruisciPiani, quotaDalNome } from "../../../supabase/functions/planimetria-genera/costruisci";
import { controllaGenerata } from "../../../supabase/functions/planimetria-genera/controlloAI";
import { leggiRispostaAI, tipoElementoDa, type RispostaAI } from "../../../supabase/functions/planimetria-genera/rispostaAI";
import { PROMPT_DESCRIZIONE, PROMPT_DOCUMENTO, VERSIONE_PROMPT } from "../../../supabase/functions/planimetria-genera/prompt";
import { validaPlanimetria } from "../../../shared/planimetrie/modello";

const opz = { ingresso: "documento" as const, larghezzaImmagine: 1000, altezzaImmagine: 1000 };
const stanza = (nome: string, x0: number, y0: number, x1: number, y1: number, extra: Partial<RispostaAI["locali"][0]> = {}): RispostaAI["locali"][0] => ({
  nome, destinazione: "altro" as const, contorno: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][],
  superficie_scritta_mq: null, altezza_scritta_m: null, misure_lette: false, ...extra,
});

describe("lettura AI p2: fogli difficili", () => {
  it("il prompt chiede piani, appartamenti, elementi e sa dei fogli scuri e ruotati", () => {
    expect(VERSIONE_PROMPT).toBe("p3");
    for (const s of ["piano:", "unita:", "ELEMENTI", "pilastro", "sfondo nero", "ruotate", "80/210", "capannoni"]) expect(PROMPT_DOCUMENTO).toContain(s);
  });

  it("legge piano, unità ed elementi in modo tollerante", () => {
    const r = leggiRispostaAI({
      locali: [{ nome: "Camera", contorno: [[0, 0], [10, 10]], piano: " Sottotetto ", unita: "A" }],
      aperture: [{ tipo: "portone", da: [0, 0], a: [5, 0] }, { tipo: "varco", da: [0, 0], a: [5, 0], piano: "Sottotetto" }],
      elementi: [
        { tipo: "Letto matrimoniale", riquadro: [10, 10, 30, 40], lato_muro: "sinistra" },
        { tipo: "colonna", riquadro: ["5", 5, 8, 8] },
        { tipo: "astronave", riquadro: [1, 1, 2, 2] },
        { tipo: "wc", riquadro: [1, 1, 1, 9] },
      ],
    }, "immagine");
    expect(r.locali[0]).toMatchObject({ piano: "Sottotetto", unita: "A" });
    expect(r.aperture.map((a) => a.tipo)).toEqual(["varco"]);
    expect(r.elementi!.map((e) => e.tipo)).toEqual(["letto_matrimoniale", "pilastro"]);
    expect(r.elementi![0].lato_muro).toBe("sinistra");
    expect(tipoElementoDa("W.C.")).toBe("wc");
    expect(tipoElementoDa("guardaroba")).toBe("armadio");
  });

  it("due piani sullo stesso foglio diventano due livelli con la stessa scala e id unici", () => {
    const r: RispostaAI = {
      sistema: "immagine", leggibile: true, motivo_non_leggibile: null, altezza_m: 2.7,
      locali: [
        stanza("Soggiorno", 100, 100, 500, 400, { piano: "Piano terra" }),
        stanza("Cucina", 510, 100, 800, 400, { piano: "Piano terra" }),
        stanza("Sottotetto", 100, 600, 800, 900, { piano: "Sottotetto" }),
      ],
      aperture: [{ tipo: "porta", da: [505, 200], a: [505, 280] }, { tipo: "finestra", da: [300, 600], a: [420, 600] }],
      quote: [{ valore_m: 4, da: [100, 100], a: [500, 100] }, { valore_m: 7, da: [100, 600], a: [800, 600] }],
      elementi: [{ tipo: "pilastro", riquadro: [440, 840, 470, 870], lato_muro: null }],
    };
    const g = costruisciPiani(r, opz);
    const p = g.planimetria;
    expect(p.livelli.map((l) => l.nome)).toEqual(["Piano terra", "Sottotetto"]);
    expect(p.livelli[1].quota).toBe(300);
    // la quota viene dal nome del piano: l'interrato sotto zero, il secondo piano a 6 m
    expect(quotaDalNome("Interrato", 2, 3)).toBe(-300);
    expect(quotaDalNome("Piano secondo", 0, 4)).toBe(600);
    expect(quotaDalNome("Mansarda", 1, 3)).toBe(600);
    expect(quotaDalNome("Zona notte", 1, 2)).toBe(300);
    expect(validaPlanimetria(p).ok).toBe(true);
    const ids = p.livelli.flatMap((l) => [...l.fatto.muri, ...l.fatto.locali, ...l.fatto.aperture].map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
    // la finestra senza piano va al piano che la contiene
    expect(p.livelli[0].fatto.aperture).toHaveLength(1);
    expect(p.livelli[1].fatto.aperture).toHaveLength(1);
    expect(p.livelli[1].fatto.aperture[0].muroId.startsWith("p2-")).toBe(true);
    // scala unica: 1 px = 1 cm (400 px = 4 m)
    const sotto = p.livelli[1].fatto.locali[0].contorno;
    expect(Math.max(...sotto.map((q) => q.x)) - Math.min(...sotto.map((q) => q.x))).toBeCloseTo(700, 0);
    // il pilastro: 30 × 30 cm
    expect(p.livelli[1].fatto.elementi[0]).toMatchObject({ tipo: "pilastro", larghezza: 30, profondita: 30 });
    expect(g.generazione.avvisi.some((a) => /2 piani/.test(a))).toBe(true);
    expect(controllaGenerata(p).filter((x) => x.codice === "apertura_larghezza")).toHaveLength(0);
  });

  it("più appartamenti: il nome dice di quale; un letto con la testata a sinistra è ruotato", () => {
    const r: RispostaAI = {
      sistema: "immagine", leggibile: true, motivo_non_leggibile: null, altezza_m: null,
      locali: [stanza("Camera", 100, 100, 500, 500, { unita: "A" }), stanza("Camera", 510, 100, 900, 500, { unita: "B" })],
      aperture: [], quote: [{ valore_m: 4, da: [100, 100], a: [500, 100] }],
      elementi: [{ tipo: "letto_matrimoniale", riquadro: [120, 200, 320, 360], lato_muro: "sinistra" }],
    };
    const p = costruisciPiani(r, opz).planimetria;
    expect(p.livelli).toHaveLength(1);
    expect(p.livelli[0].fatto.locali.map((l) => l.nome)).toEqual(["A · Camera", "B · Camera"]);
    const letto = p.livelli[0].fatto.elementi[0];
    // 200 × 160 sul foglio, testata a sinistra → largo 160, lungo 200, girato
    expect(letto).toMatchObject({ larghezza: 160, profondita: 200, rotazione: -270 });
  });

  it("capannone: 12 m di altezza e un portone di 8 m passano", () => {
    const r: RispostaAI = {
      sistema: "immagine", leggibile: true, motivo_non_leggibile: null, altezza_m: 12,
      locali: [stanza("Capannone", 50, 50, 950, 650)],
      aperture: [{ tipo: "varco", da: [300, 650], a: [700, 650] }],
      quote: [{ valore_m: 18, da: [50, 50], a: [950, 50] }],
    };
    const p = costruisciPiani(r, opz).planimetria;
    expect(p.livelli[0].fatto.locali[0].altezza).toBe(1200);
    expect(p.livelli[0].fatto.aperture[0].larghezza).toBeCloseTo(800, 0);
    expect(controllaGenerata(p).filter((x) => x.codice === "apertura_larghezza")).toHaveLength(0);
  });
});

import { daInvertire, luminanzaMedia, misuraRidotta } from "@/components/planimetrie/editor/generazione";

describe("preparazione dell'immagine", () => {
  it("riduce solo le immagini grandi, tenendo le proporzioni", () => {
    expect(misuraRidotta(4000, 3000)).toEqual({ larghezza: 2400, altezza: 1800 });
    expect(misuraRidotta(1200, 800)).toEqual({ larghezza: 1200, altezza: 800 });
  });
  it("una schermata CAD a fondo nero si inverte, un catastale no", () => {
    const pixel = (r: number, g: number, b: number, n = 64) => new Uint8ClampedArray(Array.from({ length: n }, () => [r, g, b, 255]).flat());
    expect(daInvertire(luminanzaMedia(pixel(20, 28, 36), 1))).toBe(true);
    expect(daInvertire(luminanzaMedia(pixel(245, 245, 245), 1))).toBe(false);
  });
});

import { calcolaQuantita } from "../../../shared/planimetrie/quantita";
import { magliaPilastri } from "@/components/planimetrie/editor/arreda";
import * as C from "@/components/planimetrie/editor/comandi";

describe("condomini e capannoni", () => {
  it("le stanze lette con l'appartamento portano la sigla e il computo ha i totali per appartamento", () => {
    const r: RispostaAI = {
      sistema: "immagine", leggibile: true, motivo_non_leggibile: null, altezza_m: null,
      locali: [stanza("Camera", 100, 100, 500, 500, { unita: "A" }), stanza("Bagno", 100, 510, 500, 700, { unita: "A" }), stanza("Camera", 510, 100, 900, 500, { unita: "B" })],
      aperture: [], quote: [{ valore_m: 4, da: [100, 100], a: [500, 100] }],
    };
    const p = costruisciPiani(r, opz).planimetria;
    expect(p.livelli[0].fatto.locali.map((l) => l.unita)).toEqual(["A", "A", "B"]);
    const q = calcolaQuantita(p);
    const a = q["fatto:unita:a.pavimento_mq"].valore, b = q["fatto:unita:b.pavimento_mq"].valore;
    expect(a).toBeGreaterThan(b);
    expect(a + b).toBeCloseTo(q["fatto:pianta.pavimento_mq"].valore, 2);
  });

  it("maglia di pilastri a 6 m in un capannone 24 × 18: lontano dai muri, contati nel computo", () => {
    const st = C.aggiungiStanza({ versione: 1, unita: "cm", muri: [], aperture: [], locali: [] }, C.rettangolo({ x: 0, y: 0 }, { x: 2400, y: 1800 }));
    const r = magliaPilastri(st.pianta, st.id, "fatto", 600);
    // x: 600, 1200, 1800 · y: 600, 1200 → 6 pilastri
    expect(r.aggiunti).toHaveLength(6);
    const xs = [...new Set(r.pianta.elementi!.map((e) => e.centro.x))].sort((a, b) => a - b);
    expect(xs).toEqual([600, 1200, 1800]);
    expect(magliaPilastri(st.pianta, st.id, "fatto", 100).aggiunti).toHaveLength(0);
  });
});

describe("progetto da descrizione su più piani", () => {
  it("in metri, due piani con le stesse coordinate diventano due livelli e le aperture seguono il loro piano", () => {
    const m = (nome: string, x0: number, y0: number, x1: number, y1: number, piano: string) =>
      ({ nome, destinazione: "altro" as const, contorno: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][], superficie_scritta_mq: null as number | null, altezza_scritta_m: null as number | null, misure_lette: false, piano });
    const r: RispostaAI = {
      sistema: "metri", leggibile: true, motivo_non_leggibile: null, altezza_m: null,
      locali: [m("Soggiorno", 0, 0, 6, 5, "Piano terra"), m("Camera", 0, 0, 4, 4, "Primo piano"), m("Bagno", 4, 0, 6, 4, "Primo piano")],
      aperture: [{ tipo: "porta", da: [4, 1], a: [4, 1.8], piano: "Primo piano" }, { tipo: "finestra", da: [2, 0], a: [3.2, 0], piano: "Piano terra" }],
      quote: [],
    };
    const p = costruisciPiani(r, { ingresso: "descrizione" }).planimetria;
    expect(p.livelli.map((l) => [l.nome, l.fatto.locali.length, l.fatto.aperture.length])).toEqual([["Piano terra", 1, 1], ["Primo piano", 2, 1]]);
    expect(validaPlanimetria(p).ok).toBe(true);
  });
  it("il prompt della descrizione sa di ville, bifamiliari e capannoni", () => {
    expect(PROMPT_DESCRIZIONE).toMatch(/bifamiliare/);
    expect(PROMPT_DESCRIZIONE).toMatch(/Capannone/);
    expect(PROMPT_DESCRIZIONE).toMatch(/piano/);
  });
});

describe("AI: lotto e giardino", () => {
  it("legge le aree con i sinonimi e le mette nel documento, solo al piano terra", () => {
    const r = leggiRispostaAI({
      sistema: "metri",
      locali: [
        { nome: "Soggiorno", destinazione: "soggiorno", contorno: [[0, 0], [6, 0], [6, 5], [0, 5]], piano: "Piano terra" },
        { nome: "Camera", destinazione: "camera", contorno: [[0, 0], [6, 0], [6, 5], [0, 5]], piano: "Primo piano" },
      ],
      aperture: [], quote: [],
      elementi: [{ tipo: "Piscina interrata", riquadro: [8, 1, 16, 5], lato_muro: null }],
      aree: [
        { tipo: "confine del terreno", contorno: [[-5, -5], [25, -5], [25, 20], [-5, 20]] },
        { tipo: "giardino", contorno: [[7, 0], [20, 0], [20, 10], [7, 10]] },
        { tipo: "nuvola", contorno: [[0, 0], [1, 0], [1, 1]] },
      ],
    }, "metri");
    expect(r.aree?.map((a) => a.tipo)).toEqual(["lotto", "prato"]);
    expect(tipoElementoDa("Piscina interrata")).toBe("piscina");
    const p = costruisciPiani(r, { ingresso: "descrizione" as const }).planimetria;
    expect(validaPlanimetria(p).ok).toBe(true);
    const terra = p.livelli.find((l) => l.quota === 0)!;
    expect(terra.fatto.aree?.map((a) => a.tipo)).toEqual(["lotto", "prato"]);
    expect(p.livelli.find((l) => l.quota === 300)!.fatto.aree ?? []).toEqual([]);
    // 30 × 25 m di lotto
    const lotto = terra.fatto.aree![0];
    const xs = lotto.contorno.map((c) => c.x), ys = lotto.contorno.map((c) => c.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(3000, -1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2500, -1);
    expect(terra.fatto.elementi.some((e) => e.tipo === "piscina")).toBe(true);
    expect(PROMPT_DESCRIZIONE).toContain("piscina");
    expect(PROMPT_DOCUMENTO).toContain("AREE ESTERNE");
  });
});
