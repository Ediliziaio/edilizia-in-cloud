import { describe, expect, it, vi } from "vitest";
import { ricostruisciCanali } from "@/lib/planimetrie/canaliDaTavola";
import { bozzaComputoCanali, superficieRettifilo } from "@/lib/planimetrie/computoCanali";
import { rilevaRaccordiCanali, type AsseRaccordo } from "@/lib/planimetrie/raccordiCanali";
import { leggiDatiHvac, type TavolaTecnica } from "@/lib/planimetrie/tavolaTecnica";
import { costruisciScena } from "@/lib/planimetrie/tred/scena";
import { calcolaVoce, leggiBozzaComputo } from "@/lib/computo/editorNativo";
import { readPlanLocally, readPlanReading, type PlanReading, type PlanText } from "@/lib/preventivi/planReading";

const testo = (text: string, bbox: PlanText["bbox"]): PlanText => ({ text, bbox, confidence: 1 });
const area = { x: 0, y: 0.1, larghezza: 1, altezza: 0.8 };

describe("ricostruzione e computo della tavola HVAC", () => {
  it("conta un solo asse sotto una scritta, mantiene separate le reti e misura solo le sezioni leggibili", () => {
    const larghezza = 700, altezza = 500;
    const colori = new Uint8Array(larghezza * altezza);
    const disegna = (x: number, y: number, w: number, h: number, colore: number) => {
      for (let riga = y; riga < y + h; riga++) colori.fill(colore, riga * larghezza + x, riga * larghezza + x + w);
    };
    disegna(85, 122, 500, 22, 1);
    disegna(270, 128, 62, 10, 0); // Didascalia opaca sopra il canale.
    disegna(88, 172, 300, 15, 1);
    disegna(506, 76, 20, 336, 2);
    const assi = [
      testo("30000", [0.48, 0.02, 0.06, 0.012]), ...[0.16, 0.37, 0.58, 0.79].map(x => testo("7500", [x, 0.05, 0.06, 0.012])),
      testo("DIMENSIONS IN MILLIMETERS", [0.63, 0.95, 0.2, 0.015]),
    ];
    const verticali = [testo("12000", [0.02, 0.45, 0.012, 0.05]), testo("6000", [0.051, 0.25, 0.012, 0.05]), testo("6000", [0.051, 0.62, 0.012, 0.05])];
    const sezioni = [testo("S.A. 600x300", [0.386, 0.26, 0.088, 0.016]), testo("R.A. 600x300", [0.731, 0.37, 0.012, 0.14])];
    const tavola: Extract<TavolaTecnica, { tipo: "hvac" }> = {
      tipo: "hvac", area, codiceMandata: 1, colori, segniEsclusi: null, dati: leggiDatiHvac([...assi, ...sezioni], area, verticali),
      raster: { larghezza, altezza, pixel: new Uint8Array(larghezza * altezza) },
    };
    const studio = ricostruisciCanali(tavola, sezioni);
    expect(studio.tratti).toHaveLength(3);
    expect(studio.raccordi).toHaveLength(0);
    expect(studio.incroci).toMatchObject([{ reti: "distinte" }]);
    expect(studio.tratti.filter(t => t.rete === "mandata" && t.sezione)).toHaveLength(1);
    expect(studio.tratti.find(t => t.rete === "ripresa")?.sezione).toMatchObject({ larghezzaMm: 600, altezzaMm: 300 });
    const bozza = leggiBozzaComputo(JSON.stringify(bozzaComputoCanali(studio, "Uffici", 1)));
    expect(bozza.voci).toHaveLength(4);
    expect(bozza.voci.filter(v => v.daQuantificare).every(v => v.quantita === "" && !v.misure.length)).toBe(true);
    expect(bozza.voci.filter(v => !v.daQuantificare).map(v => calcolaVoce(v, true).quantita))
      .toEqual(studio.tratti.flatMap((t): number | number[] => superficieRettifilo(t) ?? []));
    expect(bozza.voci.every(v => !v.prezzo)).toBe(true);
    const senzaScala = ricostruisciCanali({ ...tavola, dati: { ...tavola.dati, verticale: null } }, sezioni);
    expect(senzaScala.tratti.every(t => t.lunghezzaM === null)).toBe(true);
    expect(bozzaComputoCanali(senzaScala, "Uffici", 1).voci.every(v => v.daQuantificare)).toBe(true);

    const conRaccordi = bozzaComputoCanali({
      ...studio,
      raccordi: [
        { id: "curva", tipo: "curva", rete: "mandata", punto: { x: .2, y: .2 }, rami: [], trattoCoperto: false },
        { id: "t", tipo: "derivazione", rete: "mandata", punto: { x: .4, y: .2 }, rami: [], trattoCoperto: false },
        { id: "curva-coperta", tipo: "curva", rete: "ripresa", punto: { x: .6, y: .2 }, rami: [], trattoCoperto: true },
      ],
    }, "Uffici", 1);
    expect(conRaccordi.voci.filter(v => v.unita === "cad").map(v => [v.daQuantificare, calcolaVoce(v, true).quantita]))
      .toEqual([[false, 1], [false, 1], [true, null]]);
    expect(conRaccordi.voci.filter(v => v.unita === "mq" && !v.daQuantificare)
      .map(v => calcolaVoce(v, true).quantita)).toEqual(bozza.voci.filter(v => !v.daQuantificare).map(v => calcolaVoce(v, true).quantita));
  });

  it("riconosce T e curve dalla continuità del colore e lascia distinte le reti che si incrociano", () => {
    const larghezza = 1000, altezza = 450;
    const colori = new Uint8Array(larghezza * altezza);
    const assi: AsseRaccordo[] = [
      { id: "mandata-1", rete: "mandata", verticale: false, asse: 100, inizio: 50, fine: 520, spessoreGrafico: 20 },
      { id: "ramo", rete: "mandata", verticale: true, asse: 260, inizio: 99, fine: 180, spessoreGrafico: 20 },
      { id: "mandata-2", rete: "mandata", verticale: true, asse: 520, inizio: 99, fine: 250, spessoreGrafico: 20 },
      { id: "ripresa-1", rete: "ripresa", verticale: true, asse: 380, inizio: 32, fine: 200, spessoreGrafico: 20 },
      { id: "ripresa-2", rete: "ripresa", verticale: false, asse: 320, inizio: 750, fine: 880, spessoreGrafico: 20 },
      { id: "ripresa-3", rete: "ripresa", verticale: true, asse: 880, inizio: 320, fine: 424, spessoreGrafico: 20 },
    ];
    for (const t of assi) {
      for (let lungo = t.inizio; lungo <= t.fine; lungo++) for (let b = -9; b <= 9; b++) {
        const [x, y] = t.verticale ? [t.asse + b, lungo] : [lungo, t.asse + b];
        colori[y * larghezza + x] = t.rete === "mandata" ? 1 : 2;
      }
    }
    const rilievo = rilevaRaccordiCanali(assi, { larghezza, altezza, colori, codiceMandata: 1 });
    expect(rilievo.raccordi.map(r => [r.tipo, r.rete, r.rami.length])).toEqual([
      ["derivazione", "mandata", 3], ["curva", "mandata", 2], ["curva", "ripresa", 2],
    ]);
    expect(rilievo.incroci).toMatchObject([{ reti: "distinte", tratti: ["mandata-1", "ripresa-1"] }]);
  });

  it("mostra l'incrocio tra due quote distinte e taglia i tratti fino alla tangente della curva", () => {
    const scena = costruisciScena({
      muri: [], aperture: [], locali: [], elementi: [],
      canaliAria: [
        { id: "a", rete: "mandata", da: { x: 0, y: 0 }, a: { x: 400, y: 0 }, quota: 300, larghezza: 60, altezza: 30 },
        { id: "b", rete: "mandata", da: { x: 400, y: 0 }, a: { x: 400, y: 400 }, quota: 300, larghezza: 60, altezza: 30 },
        { id: "c", rete: "ripresa", da: { x: 200, y: -50 }, a: { x: 200, y: 80 }, quota: 220, larghezza: 60, altezza: 30 },
      ],
      raccordiAria: [{ id: "r", tipo: "curva", rete: "mandata", punto: { x: 400, y: 0 }, coperto: false,
        rami: [{ trattoId: "a", asse: "x", verso: -1 }, { trattoId: "b", asse: "y", verso: 1 }] }],
      incrociAria: [{ id: "i", punto: { x: 200, y: 0 }, quoteCm: [220, 300] }],
    });
    const mesh = new Map(scena.mesh.map(m => [m.id, m]));
    expect(mesh.get("r")?.materiale).toBe("raccordo_mandata");
    expect(Math.max(...mesh.get("canale:a")!.posizioni.filter((_, i) => i % 3 === 0))).toBeCloseTo(3.52);
    const quote = mesh.get("i")!.posizioni.filter((_, i) => i % 3 === 1);
    expect(Math.min(...quote)).toBeCloseTo(2.2);
    expect(Math.max(...quote)).toBeCloseTo(3.02);
  });

  it("costruisce un rettangolare con dimensioni vere e rende distinguibile l'asse senza sezione", () => {
    const scena = costruisciScena({ muri: [], aperture: [], locali: [], elementi: [], canaliAria: [
      { id: "sa", rete: "mandata", da: { x: 0, y: 0 }, a: { x: 400, y: 0 }, larghezza: 60, altezza: 30, quota: 250 },
      { id: "ra", rete: "ripresa", da: { x: 0, y: 100 }, a: { x: 200, y: 100 }, quota: 250 },
    ] });
    expect(scena.mesh.map(m => m.materiale)).toEqual(["canale_mandata", "canale_ripresa_asse"]);
    const mandata = scena.mesh[0].posizioni;
    expect(Math.max(...mandata.filter((_, i) => i % 3 === 0))).toBe(4);
    expect(Math.max(...mandata.filter((_, i) => i % 3 === 1))).toBeCloseTo(2.65);
  });

  it("legge la sezione ruotata quando Vision restituisce un arrotondamento sul bordo", () => {
    const input = { version: 1, engine: "Apple Vision locale", page: 1, pages: 1, width: 891, height: 171,
      lines: [testo("300", [0.66, -0.000000001, 0.04, 0.34]), testo("R.A. 600x300", [0.07, 0.36, 0.27, 0.24])] };
    const lettura = readPlanReading(input);
    expect(lettura.lines.map(l => [l.text, l.bbox[1]])).toEqual([["300", 0], ["R.A. 600x300", 0.36]]);
    expect(() => readPlanReading({ ...input, lines: [testo("300", [0.66, -0.01, 0.04, 0.34])] })).toThrow();
  });

  it("riprova se il lettore locale sta ancora elaborando la richiesta precedente", async () => {
    const risposta: PlanReading = { version: 1, engine: "Apple Vision locale", page: 1, pages: 1, width: 100, height: 100, lines: [] };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429 })).mockResolvedValueOnce(Response.json(risposta));
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(readPlanLocally(new Blob(["tavola"]), 1, new AbortController().signal)).resolves.toEqual(risposta);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
