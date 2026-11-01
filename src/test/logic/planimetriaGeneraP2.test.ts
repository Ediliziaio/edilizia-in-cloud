import { describe, expect, it } from "vitest";
import { costruisciPiani } from "../../../supabase/functions/planimetria-genera/costruisci";
import { controllaGenerata } from "../../../supabase/functions/planimetria-genera/controlloAI";
import { leggiRispostaAI, tipoElementoDa, type RispostaAI } from "../../../supabase/functions/planimetria-genera/rispostaAI";
import { PROMPT_DOCUMENTO, VERSIONE_PROMPT } from "../../../supabase/functions/planimetria-genera/prompt";
import { validaPlanimetria } from "../../../shared/planimetrie/modello";

const opz = { ingresso: "documento" as const, larghezzaImmagine: 1000, altezzaImmagine: 1000 };
const stanza = (nome: string, x0: number, y0: number, x1: number, y1: number, extra: Partial<RispostaAI["locali"][0]> = {}): RispostaAI["locali"][0] => ({
  nome, destinazione: "altro" as const, contorno: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][],
  superficie_scritta_mq: null, altezza_scritta_m: null, misure_lette: false, ...extra,
});

describe("lettura AI p2: fogli difficili", () => {
  it("il prompt chiede piani, appartamenti, elementi e sa dei fogli scuri e ruotati", () => {
    expect(VERSIONE_PROMPT).toBe("p2");
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
