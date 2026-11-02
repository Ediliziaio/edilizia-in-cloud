import { describe, expect, it } from "vitest";
import { costruisciPiani } from "../../../supabase/functions/planimetria-genera/costruisci";
import { controllaScala, controllaSuperfici, pulisciLocali } from "../../../supabase/functions/planimetria-genera/pulizia";
import type { RispostaAI } from "../../../supabase/functions/planimetria-genera/rispostaAI";
import { generaPlanimetria } from "../../../supabase/functions/planimetria-genera/genera";

const opz = { ingresso: "documento" as const, larghezzaImmagine: 1000, altezzaImmagine: 1000 };
const stanza = (nome: string, x0: number, y0: number, x1: number, y1: number, extra: Partial<RispostaAI["locali"][0]> = {}): RispostaAI["locali"][0] => ({
  nome, destinazione: "altro" as const, contorno: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][],
  superficie_scritta_mq: null, altezza_scritta_m: null, misure_lette: false, ...extra,
});
const risposta = (locali: RispostaAI["locali"], extra: Partial<RispostaAI> = {}): RispostaAI => ({
  leggibile: true, motivo_non_leggibile: null, sistema: "immagine", locali, aperture: [], quote: [], elementi: [], aree: [], altezza_m: null, ...extra,
} as RispostaAI);

describe("pulizia dei locali letti dall'AI", () => {
  it("toglie gli arredi letti come stanze e tiene le stanze vere", () => {
    const r = risposta([stanza("soggiorno", 0, 0, 500, 500), stanza("mobili cucina", 0, 0, 100, 50, { destinazione: "cucina" }), stanza("armadio", 0, 0, 40, 40, { destinazione: "disimpegno" }), stanza("Bagno", 500, 0, 800, 300)]);
    const p = pulisciLocali(r);
    expect(p.risposta.locali.map((l) => l.nome)).toEqual(["soggiorno", "Bagno"]);
    expect(p.scartati).toEqual(["mobili cucina", "armadio"]);
  });

  it("non svuota mai la pianta", () => {
    const r = risposta([stanza("armadio", 0, 0, 40, 40)]);
    expect(pulisciLocali(r).risposta.locali).toHaveLength(1);
  });

  it("dà un nome alle sigle delle piante a quadretti, senza toccare i nomi veri", () => {
    const r = risposta([stanza("S", 0, 0, 500, 500), stanza("W", 500, 0, 700, 300), stanza("L", 0, 500, 400, 900), stanza("Cucina", 500, 300, 900, 700), stanza("C", 700, 0, 900, 300, { destinazione: "camera" })]);
    const p = pulisciLocali(r);
    expect(p.risposta.locali.map((l) => l.nome)).toEqual(["Soggiorno", "Bagno", "Camera", "Cucina", "Cucina"]);
    expect(p.risposta.locali[0].destinazione).toBe("soggiorno");
    expect(p.risposta.locali[4].destinazione).toBe("cucina");
    expect(p.rinominati).toHaveLength(4);
  });
});

describe("controllo dei metri quadri scritti", () => {
  // due stanze da 5 × 5 m e 4 × 3 m su un'immagine di 1000 px a 1 cm/px: 25 mq e 12 mq calcolati
  const base = (scritta1: number, scritta2: number, scala: number) => costruisciPiani(
    risposta([stanza("Soggiorno", 100, 100, 600, 600, { superficie_scritta_mq: scritta1 }), stanza("Camera", 600, 100, 1000, 400, { superficie_scritta_mq: scritta2 })],
      { quote: [{ da: [100, 100], a: [600, 100], valore_m: (500 * scala) / 100 }] as never }),
    opz,
  );

  it("non cambia nulla se i mq tornano", () => {
    const g = base(25, 12, 1);
    const c = controllaSuperfici(g);
    expect(c).toBe(g);
  });

  it("corregge la scala quando tutti i mq scritti sbagliano allo stesso modo", () => {
    // il modello ha letto la quota 5 m al posto di 10 m: calcolate 25 e 12 mq, scritte 100 e 48 mq (×4)
    const g = base(100, 48, 1);
    const prima = g.planimetria.livelli[0].fatto.locali[0];
    const c = controllaSuperfici(g);
    const dopo = c.planimetria.livelli[0].fatto.locali[0];
    const larg = (l: typeof prima) => Math.max(...l.contorno.map((p) => p.x)) - Math.min(...l.contorno.map((p) => p.x));
    expect(larg(dopo) / larg(prima)).toBeCloseTo(2, 1);
    expect(c.generazione.scala?.metodo).toBe("superficie_letta");
    expect(c.generazione.avvisi.some((a) => /portate a quelle dei metri quadri/.test(a))).toBe(true);
  });

  it("se le stanze sbagliano in modo diverso avvisa e lascia la scala da confermare, senza muovere nulla", () => {
    const g = base(100, 13, 1);
    const c = controllaSuperfici(g);
    expect(c.planimetria).toBe(g.planimetria);
    expect(c.generazione.scala?.da_confermare).toBe(true);
    expect(c.generazione.avvisi.some((a) => /non tornano/.test(a))).toBe(true);
  });
});

describe("la generazione usa i due controlli", () => {
  it("toglie l'arredo e lo dice all'utente", async () => {
    const json = JSON.stringify(risposta([stanza("Soggiorno", 100, 100, 600, 600), stanza("armadio", 100, 100, 140, 140)]));
    const esito = await generaPlanimetria(
      { ingresso: "documento", file: { dataUrl: "data:image/png;base64,AAAA", mime: "image/png", larghezza: 1000, altezza: 1000 } },
      async () => ({ testo: json, modello: "prova" }),
    );
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      expect(esito.pianta.planimetria.livelli[0].fatto.locali.map((l) => l.nome)).toEqual(["Soggiorno"]);
      expect(esito.pianta.generazione.avvisi.some((a) => /arredo/.test(a))).toBe(true);
    }
  });
});

describe("scala sospetta", () => {
  const conPorte = (larghezzaPx: number, quotaM: number) => costruisciPiani(
    risposta(
      [stanza("Camera", 100, 100, 400, 400, { destinazione: "camera" }), stanza("Bagno", 400, 100, 600, 400, { destinazione: "bagno" })],
      {
        quote: [{ da: [100, 100], a: [400, 100], valore_m: quotaM }, { da: [100, 400], a: [400, 400], valore_m: quotaM }] as never,
        aperture: [
          { tipo: "porta", da: [400, 150], a: [400, 150 + larghezzaPx] },
          { tipo: "porta", da: [100, 150], a: [100, 150 + larghezzaPx] },
        ] as never,
      },
    ),
    opz,
  );

  it("lascia stare una scala con porte da 80 cm e stanze normali", () => {
    // 300 px = 4 m → 1,33 cm/px: porta da 60 px = 80 cm; camera 4 × 4 m = 16 mq, bagno 2,7 × 4 = 10,7 mq
    const g = conPorte(60, 4);
    expect(controllaScala(g)).toBe(g);
  });

  it("avvisa se le porte risultano larghe il doppio", () => {
    const g = conPorte(120, 4);
    const c = controllaScala(g);
    expect(c.generazione.scala?.da_confermare).toBe(true);
    expect(c.generazione.avvisi.some((a) => /porte risultano larghe/.test(a))).toBe(true);
  });

  it("avvisa se camere e bagni sono enormi", () => {
    const g = conPorte(60, 12); // stesse stanze ma tre volte più grandi
    const c = controllaScala(g);
    expect(c.generazione.scala?.da_confermare).toBe(true);
    expect(c.generazione.avvisi.some((a) => /più grandi del normale/.test(a))).toBe(true);
  });
});

describe("stanze sovrapposte", () => {
  it("mostra la pianta da sistemare invece di rifiutarla", async () => {
    // Soggiorno e portico si sovrappongono per metà, a ogni tentativo
    const json = JSON.stringify(risposta([stanza("Soggiorno", 100, 100, 600, 600, { destinazione: "soggiorno" }), stanza("Portico", 100, 300, 600, 700, { destinazione: "altro" })]));
    const esito = await generaPlanimetria(
      { ingresso: "documento", file: { dataUrl: "data:image/png;base64,AAAA", mime: "image/png", larghezza: 1000, altezza: 1000 } },
      async () => ({ testo: json, modello: "prova" }),
    );
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.pianta.generazione.avvisi.some((a) => /si sovrappongono|si sovrappone/.test(a))).toBe(true);
  });
});
