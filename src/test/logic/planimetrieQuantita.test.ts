import { describe, expect, it } from "vitest";
import { calcolaQuantita, leggiChiave, type MappaQuantita } from "../../../shared/planimetrie/quantita.ts";
import {
  nuovaPlanimetria,
  type Apertura,
  type Locale,
  type Muro,
  type Planimetria,
  type Punto,
  type StatoLavori,
  type StatoPianta,
} from "../../../shared/planimetrie/modello.ts";

// Tutti i risultati attesi sono calcolati a mano nei commenti. Misure in cm nel
// documento, quantità in m / mq / mc.

const muro = (id: string, x1: number, y1: number, x2: number, y2: number, spessore = 20, stato: StatoLavori = "esistente"): Muro => ({
  id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, spessore, altezza: 270,
  tipo: spessore >= 20 ? "esterno" : "tramezzo", stato, origine: "rilevata",
});
const rett = (x1: number, y1: number, x2: number, y2: number): Punto[] => [
  { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 },
];
const locale = (id: string, nome: string, contorno: Punto[], extra: Partial<Locale> = {}): Locale => ({
  id, nome, destinazione: "camera", contorno, altezza: 270, origine: "rilevata", ...extra,
});
const apertura = (id: string, muroId: string, offset: number, larghezza: number, extra: Partial<Apertura> = {}): Apertura => ({
  id, muroId, tipo: "porta", offset, larghezza, altezza: 210, davanzale: 0, manovra: "battente",
  stato: "esistente", origine: "rilevata", ...extra,
});
const quattroPareti = () => [
  muro("m1", 0, 0, 420, 0), muro("m2", 420, 0, 420, 320), muro("m3", 420, 320, 0, 320), muro("m4", 0, 320, 0, 0),
];
function pianta(fatto: Partial<StatoPianta>): Planimetria {
  const p = nuovaPlanimetria("Prova");
  Object.assign(p.livelli[0].fatto, fatto);
  return p;
}
const v = (q: MappaQuantita, chiave: string) => {
  if (!q[chiave]) throw new Error(`manca la quantità ${chiave}; ci sono: ${Object.keys(q).join(", ")}`);
  return q[chiave].valore;
};

/**
 * Stanza rettangolare: filo interno 400×300, altezza 270.
 * - porta 80×210 su m1 (1,68 mq: sotto la soglia, non si detrae)
 * - portafinestra 240×240 su m3 (5,76 mq: sopra i 4 mq, si detrae)
 */
function rettangolo(): Planimetria {
  return pianta({
    muri: quattroPareti(),
    locali: [locale("l1", "Camera", rett(10, 10, 410, 310))],
    aperture: [
      apertura("porta", "m1", 100, 80),
      apertura("pf", "m3", 100, 240, { tipo: "portafinestra", altezza: 240 }),
    ],
  });
}

describe("quantità di un locale rettangolare", () => {
  const q = calcolaQuantita(rettangolo());

  it("pavimento, perimetro, soffitto, volume", () => {
    expect(v(q, "fatto:locale:l1.pavimento_mq")).toBe(12); // 4,00 × 3,00
    expect(v(q, "fatto:locale:l1.perimetro_ml")).toBe(14); // 2 × (4 + 3)
    expect(v(q, "fatto:locale:l1.soffitto_mq")).toBe(12);
    expect(v(q, "fatto:locale:l1.volume_mc")).toBe(32.4); // 12 × 2,70
  });

  it("pareti lorde e nette: si detrae solo il vuoto oltre i 4 mq, per intero", () => {
    expect(v(q, "fatto:locale:l1.pareti_lorde_mq")).toBe(37.8); // 14 × 2,70
    expect(v(q, "fatto:locale:l1.pareti_nette_mq")).toBe(32.04); // 37,80 − 5,76 (la porta da 1,68 resta)
  });

  it("battiscopa: perimetro meno le aperture a filo pavimento", () => {
    expect(v(q, "fatto:locale:l1.battiscopa_ml")).toBe(10.8); // 14 − 0,80 − 2,40
  });

  it("ogni quantità ha unità, descrizione per il computo e origine", () => {
    expect(q["fatto:locale:l1.pavimento_mq"]).toMatchObject({
      chiave: "fatto:locale:l1.pavimento_mq", unita: "mq", origine: "rilevata", ambito: "fatto", livelloId: "pt", oggettoId: "l1",
      descrizione: "Pavimento — Camera",
    });
    expect(q["fatto:locale:l1.battiscopa_ml"].unita).toBe("ml");
    expect(q["fatto:locale:l1.volume_mc"].unita).toBe("mc");
  });

  it("senza rivestimento indicato non c'è la quantità del rivestimento", () => {
    expect(q["fatto:locale:l1.rivestimento_mq"]).toBeUndefined();
  });
});

describe("soglia di deduzione delle aperture", () => {
  const conFinestra = (larghezza: number, altezza: number) => {
    const p = rettangolo();
    p.livelli[0].fatto.aperture = [apertura("f", "m2", 50, larghezza, { tipo: "finestra", altezza, davanzale: 50 })];
    return p;
  };

  it("un vuoto di esattamente 4,00 mq non si detrae (si detrae solo oltre)", () => {
    expect(v(calcolaQuantita(conFinestra(200, 200)), "fatto:locale:l1.pareti_nette_mq")).toBe(37.8);
  });

  it("un vuoto di 4,02 mq si detrae per intero", () => {
    expect(v(calcolaQuantita(conFinestra(200, 201)), "fatto:locale:l1.pareti_nette_mq")).toBe(33.78); // 37,80 − 4,02
  });

  it("la soglia si può cambiare, anche a zero (si detrae tutto)", () => {
    const q = calcolaQuantita(rettangolo(), { sogliaDeduzioneMq: 0 });
    expect(v(q, "fatto:locale:l1.pareti_nette_mq")).toBe(30.36); // 37,80 − 5,76 − 1,68
  });

  it("modo «eccedenza»: si detrae solo la parte oltre la soglia", () => {
    const q = calcolaQuantita(rettangolo(), { deduzione: "eccedenza" });
    expect(v(q, "fatto:locale:l1.pareti_nette_mq")).toBe(36.04); // 37,80 − (5,76 − 4)
  });

  it("di un'apertura più alta del locale si conta solo la parte dentro l'altezza", () => {
    const p = rettangolo();
    p.livelli[0].fatto.aperture = [apertura("alta", "m3", 100, 200, { tipo: "portafinestra", altezza: 300 })];
    // 2,00 × 2,70 = 5,40 mq (non 6,00): 37,80 − 5,40
    expect(v(calcolaQuantita(p), "fatto:locale:l1.pareti_nette_mq")).toBe(32.4);
  });
});

describe("forme non rettangolari", () => {
  it("pianta a L: filo interno (10,10)(610,10)(610,310)(310,310)(310,510)(10,510)", () => {
    const contorno = [{ x: 10, y: 10 }, { x: 610, y: 10 }, { x: 610, y: 310 }, { x: 310, y: 310 }, { x: 310, y: 510 }, { x: 10, y: 510 }];
    const q = calcolaQuantita(pianta({ locali: [locale("l", "Soggiorno", contorno, { destinazione: "soggiorno" })] }));
    expect(v(q, "fatto:locale:l.pavimento_mq")).toBe(24); // 6×3 + 3×2
    expect(v(q, "fatto:locale:l.perimetro_ml")).toBe(22); // 6+3+3+2+3+5
    expect(v(q, "fatto:locale:l.pareti_lorde_mq")).toBe(59.4); // 22 × 2,70
    expect(v(q, "fatto:locale:l.volume_mc")).toBe(64.8); // 24 × 2,70
  });

  it("stanza 400×300 con una nicchia 100×50 su un lato", () => {
    const contorno = [
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 250, y: 300 },
      { x: 250, y: 350 }, { x: 150, y: 350 }, { x: 150, y: 300 }, { x: 0, y: 300 },
    ];
    const q = calcolaQuantita(pianta({ locali: [locale("n", "Camera", contorno)] }));
    expect(v(q, "fatto:locale:n.pavimento_mq")).toBe(12.5); // 12 + 1,00 × 0,50
    expect(v(q, "fatto:locale:n.perimetro_ml")).toBe(15); // 14 − 1,00 + 1,00 + 0,50 + 0,50
    expect(v(q, "fatto:locale:n.pareti_lorde_mq")).toBe(40.5); // 15 × 2,70
    expect(v(q, "fatto:locale:n.battiscopa_ml")).toBe(15); // nessuna porta
  });
});

/**
 * Due stanze divise da un tramezzo da 10 sull'asse x=210: filo interno 195×300 ciascuna.
 * - porta 80×210 nel tramezzo: è di tutte e due le stanze
 * - finestra 120×140 (davanzale 100) su m2: solo la stanza di destra
 * - portafinestra 180×240 su m4 (4,32 mq, si detrae): solo la stanza di sinistra
 */
function dueStanze(): Planimetria {
  return pianta({
    muri: [...quattroPareti(), muro("t1", 210, 0, 210, 320, 10)],
    locali: [
      locale("s", "Sinistra", rett(10, 10, 205, 310)),
      locale("d", "Destra", rett(215, 10, 410, 310), { destinazione: "studio" }),
    ],
    aperture: [
      apertura("porta", "t1", 100, 80),
      apertura("fin", "m2", 60, 120, { tipo: "finestra", davanzale: 100, altezza: 140 }),
      apertura("pf", "m4", 110, 180, { tipo: "portafinestra", altezza: 240 }),
    ],
  });
}

describe("porte su pareti diverse", () => {
  const q = calcolaQuantita(dueStanze());

  it("ogni stanza conta le sue aperture; la porta in comune vale per entrambe", () => {
    // perimetro 2 × (1,95 + 3,00) = 9,90 ; lorde 9,90 × 2,70 = 26,73
    expect(v(q, "fatto:locale:s.perimetro_ml")).toBe(9.9);
    expect(v(q, "fatto:locale:s.pareti_lorde_mq")).toBe(26.73);
    expect(v(q, "fatto:locale:s.pareti_nette_mq")).toBe(22.41); // − portafinestra 4,32
    expect(v(q, "fatto:locale:s.battiscopa_ml")).toBe(7.3); // 9,90 − 0,80 − 1,80
    expect(v(q, "fatto:locale:d.pareti_nette_mq")).toBe(26.73); // finestra 1,68: non si detrae
    expect(v(q, "fatto:locale:d.battiscopa_ml")).toBe(9.1); // 9,90 − 0,80 (la finestra non tocca terra)
  });

  it("totali della pianta e per destinazione", () => {
    expect(v(q, "fatto:pianta.pavimento_mq")).toBe(11.7); // 5,85 × 2
    expect(v(q, "fatto:pianta.battiscopa_ml")).toBe(16.4); // 7,30 + 9,10
    expect(v(q, "fatto:destinazione:camera.pavimento_mq")).toBe(5.85);
    expect(v(q, "fatto:destinazione:studio.pavimento_mq")).toBe(5.85);
  });

  it("aperture contate per stato, tipo e misura (larghezza × altezza in cm)", () => {
    expect(v(q, "fatto:aperture:esistente:porta:80x210.numero")).toBe(1);
    expect(v(q, "fatto:aperture:esistente:finestra:120x140.numero")).toBe(1);
    expect(v(q, "fatto:aperture:esistente:portafinestra:180x240.numero")).toBe(1);
    expect(v(q, "fatto:aperture:esistente:porta.numero")).toBe(1);
    expect(q["fatto:aperture:esistente:porta.numero"].unita).toBe("n");
  });

  it("le pareti esistenti si misurano una per una sull'asse", () => {
    expect(v(q, "fatto:muro:t1.lunghezza_ml")).toBe(3.2);
    expect(v(q, "fatto:muro:t1.superficie_mq")).toBe(8.64); // 3,20 × 2,70 (porta 1,68 sotto soglia)
    expect(v(q, "fatto:muro:t1.volume_mc")).toBe(0.864); // 8,64 × 0,10
  });
});

describe("stato di fatto e proposta: muro demolito e muro nuovo", () => {
  /**
   * Proposta A: il tramezzo t1 (con la sua porta) si demolisce; un tramezzo nuovo n1 da 10
   * sull'asse y=220, da parete a parete, divide la stanza in due:
   *   sotto 10..410 × 10..215 = 400×205 → 8,20 mq ; sopra 10..410 × 225..310 = 400×85 → 3,40 mq
   */
  function conProposta(): Planimetria {
    const p = dueStanze();
    const f = p.livelli[0].fatto;
    p.livelli[0].proposte.push({
      id: "A", nome: "Proposta A",
      muri: [...f.muri.filter(m => m.id !== "t1"), { ...f.muri.find(m => m.id === "t1")!, stato: "da_demolire" }, muro("n1", 0, 220, 420, 220, 10, "nuovo")],
      aperture: f.aperture.map(a => a.id === "porta" ? { ...a, stato: "da_demolire" as const } : a),
      locali: [
        locale("sotto", "Soggiorno", rett(10, 10, 410, 215), { destinazione: "soggiorno" }),
        locale("sopra", "Studio", rett(10, 225, 410, 310), { destinazione: "studio" }),
      ],
      elementi: [], quote: [], testi: [],
    });
    return p;
  }
  const q = calcolaQuantita(conProposta());

  it("demolizioni: il tramezzo t1 (3,20 m × 2,70 × 0,10)", () => {
    expect(v(q, "progetto:A:demolizioni.muri_ml")).toBe(3.2);
    expect(v(q, "progetto:A:demolizioni.muri_mq")).toBe(8.64);
    expect(v(q, "progetto:A:demolizioni.muri_mc")).toBe(0.864);
  });

  it("costruzioni: il tramezzo n1 (4,20 m × 2,70 × 0,10)", () => {
    expect(v(q, "progetto:A:costruzioni.muri_ml")).toBe(4.2);
    expect(v(q, "progetto:A:costruzioni.muri_mq")).toBe(11.34);
    expect(v(q, "progetto:A:costruzioni.muri_mc")).toBe(1.134);
  });

  it("i locali del progetto hanno chiavi proprie; quelli del fatto restano", () => {
    expect(v(q, "progetto:A:locale:sotto.pavimento_mq")).toBe(8.2);
    expect(v(q, "progetto:A:locale:sopra.pavimento_mq")).toBe(3.4);
    expect(v(q, "progetto:A:pianta.pavimento_mq")).toBe(11.6);
    expect(v(q, "fatto:pianta.pavimento_mq")).toBe(11.7);
    expect(q["progetto:A:locale:sotto.pavimento_mq"].descrizione).toBe("Pavimento — Soggiorno (Proposta A)");
  });

  it("la porta del tramezzo demolito non conta più nei locali del progetto, ma si conta fra le aperture da demolire", () => {
    expect(v(q, "progetto:A:aperture:da_demolire:porta:80x210.numero")).toBe(1);
    expect(v(q, "progetto:A:locale:sotto.battiscopa_ml")).toBe(10.3); // 2 × (4 + 2,05) − 1,80 della portafinestra
  });

  it("nello stato di fatto non ci sono demolizioni né costruzioni", () => {
    expect(Object.keys(q).some(k => k.startsWith("fatto:demolizioni") || k.startsWith("fatto:costruzioni"))).toBe(false);
  });
});

describe("origine delle quantità", () => {
  it("una quantità che usa una misura stimata è stimata; le altre no", () => {
    const p = rettangolo();
    p.livelli[0].fatto.locali[0].origineMisure = { altezza: "stimata" };
    const q = calcolaQuantita(p);
    expect(q["fatto:locale:l1.pavimento_mq"].origine).toBe("rilevata"); // usa solo il contorno
    expect(q["fatto:locale:l1.volume_mc"].origine).toBe("stimata");
    expect(q["fatto:locale:l1.pareti_lorde_mq"].origine).toBe("stimata");
    expect(q["fatto:pianta.volume_mc"].origine).toBe("stimata");
  });

  it("una porta con la larghezza letta dal disegno rende «da documento» il battiscopa", () => {
    const p = rettangolo();
    p.livelli[0].fatto.aperture[0].origineMisure = { larghezza: "da_documento" };
    const q = calcolaQuantita(p);
    expect(q["fatto:locale:l1.battiscopa_ml"].origine).toBe("da_documento");
    expect(q["fatto:locale:l1.pavimento_mq"].origine).toBe("rilevata");
  });
});

describe("casi limite", () => {
  it("una pianta vuota non ha quantità", () => {
    expect(calcolaQuantita(nuovaPlanimetria())).toEqual({});
  });

  it("il rivestimento del bagno: perimetro × altezza, meno i vuoti oltre soglia nella fascia", () => {
    const p = rettangolo();
    p.livelli[0].fatto.locali[0].finiture = { rivestimento: { materiale: "gres", altezza: 200 } };
    // 14 × 2,00 = 28 ; portafinestra nella fascia: 2,40 × 2,00 = 4,80 > 4 → si detrae ; porta 0,80 × 2,00 = 1,60 no
    expect(v(calcolaQuantita(p), "fatto:locale:l1.rivestimento_mq")).toBe(23.2);
  });

  it("i locali di più piani si sommano nei totali", () => {
    const p = pianta({ locali: [locale("a", "A", rett(0, 0, 400, 300))] });
    p.livelli.push({ id: "p1", nome: "Primo piano", quota: 300, proposte: [], fatto: {
      muri: [], aperture: [], elementi: [], quote: [], testi: [], locali: [locale("b", "B", rett(0, 0, 200, 300))],
    } });
    const q = calcolaQuantita(p);
    expect(v(q, "fatto:pianta.pavimento_mq")).toBe(18);
    expect(q["fatto:locale:b.pavimento_mq"].livelloId).toBe("p1");
  });

  it("le chiavi si leggono indietro", () => {
    expect(leggiChiave("progetto:A:locale:l1.pavimento_mq")).toEqual({ ambito: "progetto:A", propostaId: "A", soggetto: "locale:l1", misura: "pavimento_mq" });
    expect(leggiChiave("fatto:aperture:esistente:porta:80x210.numero")).toEqual({ ambito: "fatto", propostaId: null, soggetto: "aperture:esistente:porta:80x210", misura: "numero" });
    expect(leggiChiave("sbagliata")).toBeNull();
  });
});
