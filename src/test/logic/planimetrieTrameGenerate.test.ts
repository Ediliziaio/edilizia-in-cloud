import { describe, expect, it } from "vitest";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { validaPlanimetria } from "../../../shared/planimetrie/modello.ts";
const valida = (doc: unknown): string[] => { const esito = validaPlanimetria(doc); return "errori" in esito ? esito.errori : []; };
import { CAMPIONI_FINITURE, PAVIMENTI_STANZA, PIASTRELLE_PARETE, campioneFinitura, campioneRivestimento } from "../../../shared/planimetrie/finiture.ts";
import { costruisciScena, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { MATERIALI, definizioneMateriale, rotazionePosa } from "@/lib/planimetrie/tred/materiali";
import { RUVIDITA_PIASTRELLA_IN_MAPPA, TRAME_GENERATE, generaTrama } from "@/lib/planimetrie/tred/trameGenerate";
import { uvFinitura } from "@/lib/planimetrie/tred/uvFiniture";
import { CAMPIONI_PBR } from "@/lib/planimetrie/tred/campioniPbr";
import { FOTO_FINITURE } from "@/lib/planimetrie/fotoFiniture";

const documento = () => structuredClone(bilocale) as unknown as Planimetria;
const rettangolo = (l: number, h: number) => [{ x: 0, y: 0 }, { x: l, y: 0 }, { x: l, y: h }, { x: 0, y: h }];

describe("piastrelle disegnate dal codice", () => {
  it("fuga incisa, opaca e più scura; piastrella alla ruvidità di riferimento", () => {
    const m = generaTrama("piastrelle", 256)!;
    const px = (x: number, y: number) => 4 * (y * 256 + x);
    // (0,0) è l'incrocio delle fughe; (64,64) il centro della prima piastrella
    expect(m.rugosita[px(0, 0)]).toBe(255);
    expect(m.colore[px(0, 0)]).toBeLessThan(m.colore[px(64, 64)] - 40);
    expect(Math.abs(m.rugosita[px(64, 64)] / 255 - RUVIDITA_PIASTRELLA_IN_MAPPA)).toBeLessThan(.06);
    // al centro la superficie è piana: la normale guarda in su
    expect(m.normale[px(64, 64) + 2]).toBeGreaterThan(245);
  });

  it("la resina (senza fughe) si ripete senza cuciture in orizzontale e in verticale", () => {
    const n = 128, m = generaTrama("resina", n)!;
    let orizzontale = 0, verticale = 0, interno = 0;
    for (let k = 0; k < n; k++) {
      orizzontale += Math.abs(m.colore[4 * (k * n + n - 1)] - m.colore[4 * (k * n)]);
      verticale += Math.abs(m.colore[4 * ((n - 1) * n + k)] - m.colore[4 * k]);
      interno += Math.abs(m.colore[4 * (k * n + 60)] - m.colore[4 * (k * n + 61)]);
    }
    expect(orizzontale).toBeLessThan(interno * 1.6 + 40);
    expect(verticale).toBeLessThan(interno * 1.6 + 40);
  });

  it("ogni trama usata da un campione ha una texture: generata, PBR o fotografia", () => {
    for (const c of [...CAMPIONI_FINITURE.pavimento, ...CAMPIONI_FINITURE.pareti, ...PIASTRELLE_PARETE]) {
      const trama = c.id === "gres_legno" ? "rovere_gres" : c.trama;
      expect(!!TRAME_GENERATE[trama] || !!CAMPIONI_PBR[trama] || !!FOTO_FINITURE[trama] || trama === "intonaco", c.id).toBe(true);
    }
  });

  it("il formato dichiarato corrisponde al disegno: misura reale, non stirata", () => {
    for (const c of [...PAVIMENTI_STANZA, ...PIASTRELLE_PARETE]) {
      const f = TRAME_GENERATE[c.trama];
      if (!f || !c.formatoCm) continue;
      const lati = [f.metri[0] / f.colonne * 100, f.metri[1] / f.righe * 100].sort((a, b) => a - b);
      expect(lati[0], c.id).toBeCloseTo(c.formatoCm[0], 1);
      expect(lati[1], c.id).toBeCloseTo(c.formatoCm[1], 1);
      expect(MATERIALI[`finitura:pavimento:${c.id}`]?.tessitura?.metri ?? MATERIALI[`finitura:pareti:${c.id}`]?.tessitura?.metri).toEqual(f.metri);
    }
  });
});

describe("posa del pavimento", () => {
  it("le doghe seguono il lato lungo della stanza; le piastrelle quadrate non girano", () => {
    expect(rotazionePosa(rettangolo(5, 3), "rovere", undefined)).toBe(0);
    expect(rotazionePosa(rettangolo(3, 5), "rovere", undefined)).toBe(90);
    expect(rotazionePosa(rettangolo(3, 5), "piastrelle", undefined)).toBe(0);
    expect(rotazionePosa(rettangolo(5, 3), "rovere", "traversa")).toBe(90);
    expect(rotazionePosa(rettangolo(5, 3), "piastrelle", "diagonale")).toBe(45);
  });

  it("in una casa ruotata la posa segue i muri, non il foglio", () => {
    const a = 30 * Math.PI / 180;
    const ruotata = rettangolo(5, 3).map(p => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) }));
    expect(rotazionePosa(ruotata, "rovere", undefined)).toBeCloseTo(30, 1);
    expect(rotazionePosa(ruotata, "piastrelle", undefined)).toBeCloseTo(30, 1);
  });

  it("la rotazione gira le UV del pavimento e lascia stare le pareti", () => {
    const piano = uvFinitura([1, 0, 0], [0, 1, 0], [1, 1], 90);
    expect(piano[0]).toBeCloseTo(0);
    expect(piano[1]).toBeCloseTo(-1);
    const parete = uvFinitura([1, 2, 0], [0, 0, 1], [1, 1], 90);
    expect([...parete]).toEqual([1, 2]);
  });

  it("la posa scelta si salva nel locale, passa la validazione e arriva al materiale del 3D", () => {
    const doc = documento();
    const l = doc.livelli[0].fatto.locali[0];
    l.finiture = { pavimento: "Gres avorio", posaPavimento: "diagonale" };
    expect(valida(doc).filter(e => /posa/.test(e))).toEqual([]);
    const scena = costruisciScena(pianteDaPlanimetria(doc).fatto, { vista: "fatto" });
    const pavimento = scena.mesh.find(m => m.id === `pavimento:${l.id}`)!;
    expect(pavimento.materiale).toMatch(/^finitura:pavimento:piastrelle@\d/);
    const dritto = rotazionePosa(l.contorno, "piastrelle", undefined);
    expect(scena.materiali[pavimento.materiale].tessitura?.rotazione).toBeCloseTo((dritto + 45) % 180, 1);
    (l.finiture as Record<string, unknown>).posaPavimento = "a caso";
    expect(valida(doc).some(e => /posa del pavimento/.test(e))).toBe(true);
  });

  it("un materiale girato eredita tutto dal materiale di base", () => {
    const base = definizioneMateriale("finitura:pavimento:rovere")!;
    const girato = definizioneMateriale("finitura:pavimento:rovere@90")!;
    expect(girato.tessitura).toEqual({ ...base.tessitura, rotazione: 90 });
    expect(definizioneMateriale("muro@90")).toEqual(definizioneMateriale("muro"));
  });
});

describe("nuovi campioni", () => {
  it("le descrizioni libere trovano il campione giusto", () => {
    expect(campioneFinitura("resina grigia", "pavimento")?.id).toBe("resina");
    expect(campioneFinitura("mosaico bianco", "pavimento")?.id).toBe("mosaico_bianco");
    expect(campioneFinitura("gres grande formato", "pavimento")?.id).toBe("gres_grande");
    expect(campioneFinitura("gres antracite 30x60", "pavimento")?.id).toBe("gres_antracite");
    expect(campioneFinitura("gres effetto cemento", "pavimento")?.id).toBe("cemento");
    expect(campioneFinitura("cotto", "pavimento")?.trama).toBe("cotto_30");
  });

  it("il rivestimento accetta le piastrelle da parete e i pavimenti non in legno", () => {
    expect(campioneRivestimento(PIASTRELLE_PARETE[0].descrizione)).toMatchObject({ superficie: "pareti", campione: { id: "metro_bianco" } });
    expect(campioneRivestimento("Gres avorio")).toMatchObject({ superficie: "pavimento", campione: { id: "piastrelle" } });
    const doc = documento();
    const l = doc.livelli[0].fatto.locali[0];
    l.finiture = { rivestimento: { materiale: PIASTRELLE_PARETE[1].descrizione, altezza: 120 } };
    const scena = costruisciScena(pianteDaPlanimetria(doc).fatto, { vista: "fatto" });
    const riv = scena.mesh.find(m => m.id === `finitura:rivestimento:${l.id}`)!;
    expect(riv.materiale).toBe("finitura:pareti:metro_salvia");
    expect(scena.materiali[riv.materiale].tessitura?.trama).toBe("metro");
  });
});

describe("battiscopa", () => {
  it("corre lungo i muri, si interrompe alle porte e manca dove il rivestimento arriva a terra", () => {
    const doc = documento();
    const pianta = pianteDaPlanimetria(doc).fatto;
    const scena = costruisciScena(pianta, { vista: "fatto" });
    const interni = pianta.locali.filter(l => !l.finiture?.rivestimento && scena.mesh.some(m => m.id === `soffitto:${l.id}`));
    expect(interni.length).toBeGreaterThan(0);
    for (const l of interni) {
      const b = scena.mesh.find(m => m.id === `battiscopa:${l.id}`);
      expect(b, l.nome).toBeDefined();
      // resta a terra: mai più alto di 7 cm, mai sotto il pavimento
      const quote = b!.posizioni.filter((_, i) => i % 3 === 1);
      expect(Math.max(...quote)).toBeCloseTo(.07, 3);
      expect(Math.min(...quote)).toBeCloseTo(0, 3);
    }
    // davanti a ogni porta non c'è battiscopa: nessun vertice dentro il vano
    const porte = pianta.aperture.filter(a => a.tipo === "porta");
    expect(porte.length).toBeGreaterThan(0);
    for (const porta of porte) {
      const muro = pianta.muri.find(m => m.id === porta.muroId)!;
      const lungo = Math.hypot(muro.b.x - muro.a.x, muro.b.y - muro.a.y);
      const d = { x: (muro.b.x - muro.a.x) / lungo, y: (muro.b.y - muro.a.y) / lungo };
      for (const b of scena.mesh.filter(m => m.id.startsWith("battiscopa:"))) {
        for (let i = 0; i < b.posizioni.length; i += 3) {
          const x = b.posizioni[i] * 100 - muro.a.x, y = b.posizioni[i + 2] * 100 - muro.a.y;
          const lungoMuro = x * d.x + y * d.y, daMuro = Math.abs(x * d.y - y * d.x);
          const nelVano = daMuro < muro.spessore / 2 + 3 && Math.abs(lungoMuro - porta.posizione) < porta.larghezza / 2 - 1;
          expect(nelVano, `${b.id} davanti a ${porta.id}`).toBe(false);
        }
      }
    }
    const conRivestimento = documento();
    const stanza = conRivestimento.livelli[0].fatto.locali.find(x => x.id === interni[0].id)!;
    stanza.finiture = { rivestimento: { materiale: "Gres avorio", altezza: 120 } };
    const scena2 = costruisciScena(pianteDaPlanimetria(conRivestimento).fatto, { vista: "fatto" });
    expect(scena2.mesh.some(m => m.id === `battiscopa:${stanza.id}`)).toBe(false);
  });
});

describe("ritocchi dopo la revisione", () => {
  it("un marmo in grande formato resta un marmo", () => {
    expect(campioneFinitura("marmo calacatta grande formato", "pavimento")?.id).toBe("marmo_calacatta");
  });
});
