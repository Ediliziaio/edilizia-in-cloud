import { describe, expect, it } from "vitest";
import {
  apertureDelLocale,
  areaPoligono,
  lunghezzaMuro,
  perimetroPoligono,
  ricostruisciLocali,
} from "../../../shared/planimetrie/geometria.ts";
import { controllaPlanimetria } from "../../../shared/planimetrie/controllo.ts";
import {
  nuovaPlanimetria,
  type Apertura,
  type Locale,
  type Muro,
  type Planimetria,
  type Punto,
  type StatoLavori,
} from "../../../shared/planimetrie/modello.ts";

// ─── Costruttori di prova ────────────────────────────────────────────────────

const muro = (id: string, x1: number, y1: number, x2: number, y2: number, spessore = 20, stato: StatoLavori = "esistente"): Muro => ({
  id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, spessore, altezza: 270,
  tipo: spessore >= 20 ? "esterno" : "tramezzo", stato, origine: "rilevata",
});

const rett = (x1: number, y1: number, x2: number, y2: number): Punto[] => [
  { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 },
];

const locale = (id: string, nome: string, contorno: Punto[]): Locale => ({
  id, nome, destinazione: "camera", contorno, altezza: 270, origine: "rilevata",
});

const apertura = (id: string, muroId: string, offset: number, larghezza: number, extra: Partial<Apertura> = {}): Apertura => ({
  id, muroId, tipo: "porta", offset, larghezza, altezza: 210, davanzale: 0, manovra: "battente",
  stato: "esistente", origine: "rilevata", ...extra,
});

/** Assi 0..420 × 0..320, spessore 20 → filo interno 10..410 × 10..310 (400×300). */
const quattroPareti = () => [
  muro("m1", 0, 0, 420, 0), muro("m2", 420, 0, 420, 320), muro("m3", 420, 320, 0, 320), muro("m4", 0, 320, 0, 0),
];

/**
 * Due stanze: perimetro come sopra più un tramezzo da 10 sull'asse x=210, da parete a parete
 * (attacco a T sugli assi di m1 e m3). Filo interno: sinistra 10..205, destra 215..410.
 */
const dueStanze = () => [...quattroPareti(), muro("t1", 210, 0, 210, 320, 10)];

function pianta(muri: Muro[], locali: Locale[] = [], aperture: Apertura[] = []): Planimetria {
  const p = nuovaPlanimetria("Prova");
  p.livelli[0].fatto.muri = muri;
  p.livelli[0].fatto.locali = locali;
  p.livelli[0].fatto.aperture = aperture;
  return p;
}

const area = (c: Punto[]) => Math.round(areaPoligono(c));

// ─── Geometria ───────────────────────────────────────────────────────────────

describe("geometria di base", () => {
  it("area e perimetro di un poligono, in qualunque verso", () => {
    expect(areaPoligono(rett(0, 0, 400, 300))).toBe(120000);
    expect(areaPoligono([...rett(0, 0, 400, 300)].reverse())).toBe(120000);
    expect(perimetroPoligono(rett(0, 0, 400, 300))).toBe(1400);
  });

  it("la lunghezza di una parete è quella dell'asse", () => {
    expect(lunghezzaMuro(muro("m", 0, 0, 300, 400))).toBe(500);
  });
});

describe("ricostruzione dei locali dalle pareti", () => {
  it("quattro pareti spesse 20 chiudono una stanza 400×300 al filo interno", () => {
    const [stanza, ...altre] = ricostruisciLocali(quattroPareti());
    expect(altre).toHaveLength(0);
    expect(area(stanza.contorno)).toBe(400 * 300);
    expect(perimetroPoligono(stanza.contorno)).toBeCloseTo(1400, 6);
    expect([...stanza.muriIds].sort()).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("un tramezzo attaccato a T divide in due stanze, togliendo mezzo spessore per parte", () => {
    const stanze = ricostruisciLocali(dueStanze());
    // sinistra: 10..205 × 10..310 = 195×300 ; destra: 215..410 × 10..310 = 195×300
    expect(stanze.map(s => area(s.contorno)).sort()).toEqual([58500, 58500]);
  });

  it("una pianta a L: assi (0,0)(620,0)(620,320)(320,320)(320,520)(0,520), spessore 20", () => {
    const muri = [
      muro("a", 0, 0, 620, 0), muro("b", 620, 0, 620, 320), muro("c", 620, 320, 320, 320),
      muro("d", 320, 320, 320, 520), muro("e", 320, 520, 0, 520), muro("f", 0, 520, 0, 0),
    ];
    const [stanza] = ricostruisciLocali(muri);
    // filo interno: (10,10)(610,10)(610,310)(310,310)(310,510)(10,510)
    // = 600×300 + 300×200 = 240.000 cm² ; perimetro 600+300+300+200+300+500 = 2200 cm
    expect(area(stanza.contorno)).toBe(240000);
    expect(perimetroPoligono(stanza.contorno)).toBeCloseTo(2200, 6);
  });

  it("ignora una parete che non chiude niente (un muretto libero)", () => {
    const stanze = ricostruisciLocali([...quattroPareti(), muro("x", 100, 0, 100, 150, 10)]);
    expect(stanze).toHaveLength(1);
    // il muretto non chiude ma il contorno passa ancora dal filo interno di m1
    expect(area(stanze[0].contorno)).toBe(120000);
  });

  it("le pareti da demolire non dividono: nel progetto le due stanze diventano una", () => {
    const muri = dueStanze();
    muri[4] = { ...muri[4], stato: "da_demolire" };
    const stanze = ricostruisciLocali(muri);
    expect(stanze).toHaveLength(1);
    expect(area(stanze[0].contorno)).toBe(120000);
  });

  it("pareti che si incrociano a X si spezzano nel punto d'incontro", () => {
    const muri = [...quattroPareti(), muro("v", 210, 0, 210, 320, 10), muro("o", 0, 160, 420, 160, 10)];
    expect(ricostruisciLocali(muri)).toHaveLength(4);
  });
});

describe("aperture di un locale", () => {
  it("una porta nel tramezzo appartiene a entrambe le stanze, una finestra esterna a una sola", () => {
    const sinistra = locale("s", "Sinistra", rett(10, 10, 205, 310));
    const destra = locale("d", "Destra", rett(215, 10, 410, 310));
    const p = pianta(dueStanze(), [sinistra, destra], [
      apertura("porta", "t1", 100, 80),
      apertura("fin", "m2", 100, 120, { tipo: "finestra", davanzale: 100, altezza: 140 }),
    ]);
    const stato = p.livelli[0].fatto;
    expect(apertureDelLocale(sinistra, stato).map(a => a.id)).toEqual(["porta"]);
    expect(apertureDelLocale(destra, stato).map(a => a.id).sort()).toEqual(["fin", "porta"]);
  });
});

// ─── Controllo ───────────────────────────────────────────────────────────────

const codici = (p: Planimetria) => controllaPlanimetria(p).map(pr => `${pr.gravita}:${pr.codice}:${pr.oggettoId ?? ""}`);

describe("controllo geometrico", () => {
  it("una stanza corretta non ha problemi", () => {
    const p = pianta(quattroPareti(), [locale("l1", "Camera", rett(10, 10, 410, 310))], [apertura("a1", "m1", 100, 80)]);
    expect(controllaPlanimetria(p)).toEqual([]);
  });

  it("prima di tutto controlla la forma: un documento rotto dà errori di forma", () => {
    const problemi = controllaPlanimetria({ schema: 1 } as unknown as Planimetria);
    expect(problemi.length).toBeGreaterThan(0);
    expect(problemi.every(pr => pr.gravita === "errore" && pr.codice === "forma_non_valida")).toBe(true);
  });

  it("una parete lunga zero è un errore", () => {
    expect(codici(pianta([...quattroPareti(), muro("z", 50, 50, 50, 50)]))).toContain("errore:parete_senza_lunghezza:z");
  });

  it("una parete con un capo libero è un avviso; a T o dentro lo spessore dell'altra va bene", () => {
    const libera = pianta([...quattroPareti(), muro("x", 100, 0, 100, 150, 10)]);
    expect(codici(libera)).toEqual(["avviso:parete_staccata:x"]);
    // tramezzo che arriva al filo della parete (y=10), non all'asse: dentro lo spessore, va bene
    const alFilo = pianta([...quattroPareti(), muro("t", 210, 10, 210, 310, 10)]);
    expect(codici(alFilo)).toEqual([]);
  });

  it("due pareti una sopra l'altra sono un errore", () => {
    expect(codici(pianta([...quattroPareti(), muro("dop", 100, 0, 300, 0)]))).toContain("errore:pareti_sovrapposte:dop");
  });

  it("un locale con area zero o con il contorno che si incrocia è un errore", () => {
    const piatto = locale("piatto", "Piatto", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]);
    const farfalla = locale("farf", "Farfalla", [{ x: 10, y: 10 }, { x: 410, y: 310 }, { x: 410, y: 10 }, { x: 10, y: 200 }]); // asimmetrica: area con segno non nulla
    const c = codici(pianta(quattroPareti(), [piatto, farfalla]));
    expect(c).toContain("errore:locale_senza_area:piatto");
    expect(c).toContain("errore:locale_contorno_incrociato:farf");
  });

  it("un locale fuori dalle pareti è un avviso: non è chiuso da pareti", () => {
    const p = pianta(quattroPareti(), [locale("fuori", "Fuori", rett(1000, 1000, 1200, 1200))]);
    expect(codici(p)).toContain("avviso:locale_non_chiuso:fuori");
  });

  it("aperture: parete mancante, fuori dalla parete, sovrapposte, più alte della parete", () => {
    const p = pianta(quattroPareti(), [locale("l1", "Camera", rett(10, 10, 410, 310))], [
      apertura("nessuna", "boh", 0, 80),
      apertura("fuori", "m2", 280, 80), // m2 è lunga 320: 280+80 = 360 > 320
      apertura("p1", "m1", 100, 80),
      apertura("p2", "m1", 150, 80), // 150 < 100+80: si sovrappone a p1
      apertura("alta", "m3", 50, 100, { tipo: "finestra", davanzale: 100, altezza: 200 }), // 300 > 270
    ]);
    const c = codici(p);
    expect(c).toContain("errore:apertura_senza_parete:nessuna");
    expect(c).toContain("errore:apertura_fuori_parete:fuori");
    expect(c).toContain("errore:aperture_sovrapposte:p2");
    expect(c).toContain("avviso:apertura_troppo_alta:alta");
  });

  it("i messaggi sono in italiano semplice e nominano il locale", () => {
    const p = pianta(quattroPareti(), [locale("piatto", "Bagno", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }])]);
    const msg = controllaPlanimetria(p).find(pr => pr.codice === "locale_senza_area")?.messaggio;
    expect(msg).toBe("Il locale «Bagno» non ha superficie: controlla il contorno.");
  });

  it("controlla anche le proposte, dicendo in quale", () => {
    const p = pianta(quattroPareti(), [locale("l1", "Camera", rett(10, 10, 410, 310))]);
    p.livelli[0].proposte.push({
      id: "A", nome: "Proposta A", ...JSON.parse(JSON.stringify(p.livelli[0].fatto)),
    });
    p.livelli[0].proposte[0].muri.push(muro("nuovo0", 100, 100, 100, 100, 10, "nuovo"));
    const problemi = controllaPlanimetria(p).filter(pr => pr.codice === "parete_senza_lunghezza");
    expect(problemi).toHaveLength(1);
    expect(problemi[0].ambito).toBe("progetto:A");
  });
});
