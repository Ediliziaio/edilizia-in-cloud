import { describe, expect, it } from "vitest";
import { aPlanimetria, rinominaLivello, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { costruisciScena, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { CAMPI, disegnoCampo } from "@/lib/planimetrie/campiSport";
import { formeSimbolo, TIPI_CON_FORME } from "@/lib/planimetrie/esporta/simboli";
import { LISTINO_IMPIANTI, vociDallaPianta } from "@/lib/planimetrie/listinoImpianti";
import { facceTetto, fotovoltaicoSulTetto, superficieFalde } from "../../../shared/planimetrie/tetto.ts";
import { nuovaPlanimetria, validaPlanimetria } from "../../../shared/planimetrie/modello.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { tipoElementoDa } from "../../../supabase/functions/planimetria-genera/rispostaAI";

const R = { x0: 0, y0: 0, x1: 1200, y1: 800 };

describe("tetti", () => {
  it("una falda guarda a sud, lo shed fa denti con le vetrate a nord, due falde ha due esposizioni", () => {
    const una = facceTetto(R, 300, { tipo: "una_falda", pendenza: 20, sporto: 0 });
    expect(una.filter((f) => f.genere === "falda").map((f) => f.esposizione)).toEqual(["sud"]);
    const shed = facceTetto(R, 600, { tipo: "shed", pendenza: 40, sporto: 0 });
    expect(shed.filter((f) => f.genere === "vetrata").every((f) => f.esposizione === "nord")).toBe(true);
    expect(shed.filter((f) => f.genere === "falda").length).toBeGreaterThanOrEqual(1);
    const due = facceTetto(R, 300, { tipo: "due_falde", pendenza: 30, sporto: 0 });
    expect(due.filter((f) => f.genere === "falda").map((f) => f.esposizione).sort()).toEqual(["nord", "sud"]);
    // superficie di una falda inclinata > della sua proiezione
    expect(superficieFalde(una)).toBeGreaterThan(12 * 8);
  });
  it("fotovoltaico: pannelli solo sulla falda a sud, dentro il tetto; il massimo si rispetta", () => {
    const due = facceTetto(R, 300, { tipo: "due_falde", pendenza: 30, sporto: 0 });
    const fv = fotovoltaicoSulTetto(due, {});
    expect(fv.esposizione).toEqual(["sud"]);
    expect(fv.numero).toBeGreaterThan(8);
    // tutti i pannelli nella metà sud (y > 400) e dentro il rettangolo
    expect(fv.pannelli.flat().every((p) => p.y >= 395 && p.x >= 0 && p.x <= 1200)).toBe(true);
    expect(fv.kWp).toBeCloseTo(fv.numero * 0.43, 2);
    expect(fotovoltaicoSulTetto(due, { pannelliMax: 5 }).numero).toBe(5);
    // a padiglione la falda a sud è un trapezio: meno pannelli che a due falde
    const pad = fotovoltaicoSulTetto(facceTetto(R, 300, { tipo: "padiglione", pendenza: 30, sporto: 0 }), {});
    expect(pad.numero).toBeLessThan(fv.numero);
    // tetto piano: file distanziate
    expect(fotovoltaicoSulTetto(facceTetto(R, 300, { tipo: "piano", pendenza: 0, sporto: 0 }), {}).numero).toBeGreaterThan(0);
  });
  it("nel documento, nel 3D e nel computo (kWp, pannelli, copertura)", () => {
    let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
    p = C.aggiungiStanza(p, C.rettangolo({ x: 0, y: 0 }, { x: 1200, y: 800 })).pianta;
    const doc = rinominaLivello(aPlanimetria(p, nuovaPlanimetria("Casa")), "pt", { tetto: { tipo: "due_falde", pendenza: 30, sporto: 50, fotovoltaico: { potenzaPannelloW: 450 } } });
    expect(validaPlanimetria(doc).ok).toBe(true);
    const s = costruisciScena(pianteDaPlanimetria(doc).fatto, { vista: "fatto", soffitto: true });
    expect(s.mesh.some((m) => m.id === "tetto:fotovoltaico" && m.materiale === "pannello_fv")).toBe(true);
    const q = calcolaQuantita(doc);
    const n = q["fatto:impianti:fotovoltaico.pannelli"].valore;
    expect(n).toBeGreaterThan(8);
    expect(q["fatto:impianti:fotovoltaico.kwp"].valore).toBeCloseTo(n * 0.45, 2);
    expect(q["fatto:tetto:copertura.superficie_mq"].valore).toBeGreaterThan(12 * 8);
    const ids = vociDallaPianta(q, "fatto").map((v) => v.voce.id);
    expect(ids).toEqual(expect.arrayContaining(["impianti:fotovoltaico.kwp", "tetto:copertura.superficie_mq"]));
    expect(validaPlanimetria({ ...doc, livelli: [{ ...doc.livelli[0], tetto: { tipo: "a_cupola", pendenza: 30, sporto: 0 } }] }).ok).toBe(false);
  });
});

describe("campi sportivi", () => {
  it("ogni campo: nel catalogo (gruppo Sport), con simbolo, linee dentro l'ingombro e prezzo", () => {
    for (const c of CAMPI) {
      const v = CATALOGO.find((x) => x.tipo === c.tipo)!;
      expect(v.gruppo, c.tipo).toBe("Sport");
      expect(TIPI_CON_FORME.has(c.tipo), c.tipo).toBe(true);
      const g = disegnoCampo(c.tipo, v.larghezza, v.profondita)!;
      // il campo di gioco ha le misure regolamentari e sta dentro l'ingombro
      expect(g.gioco.x1 - g.gioco.x0, c.tipo).toBeCloseTo(c.gioco[0], 0);
      const tutti = g.linee.flat();
      expect(tutti.every((q) => Math.abs(q.x) <= v.larghezza / 2 + 1 && Math.abs(q.y) <= v.profondita / 2 + 1), c.tipo).toBe(true);
      expect(formeSimbolo(c.tipo, v.larghezza, v.profondita).length, c.tipo).toBeGreaterThan(2);
      expect(LISTINO_IMPIANTI.find((x) => x.id === `elementi:${c.tipo}.numero`)?.prezzo, c.tipo).toBeGreaterThan(0);
    }
  });
  it("tennis: rete, linee del singolo e del servizio; padel: pareti di vetro; calcio: porte; basket: canestri", () => {
    const t = disegnoCampo("campo_tennis", 3660, 1830)!;
    expect(t.rete).toBeDefined();
    expect(t.linee.length).toBeGreaterThanOrEqual(7);
    expect(disegnoCampo("campo_padel", 2100, 1100)!.pareti.filter((p) => p.vetro).length).toBe(6);
    expect(disegnoCampo("campo_calcio11", 11300, 7400)!.porte).toHaveLength(2);
    expect(disegnoCampo("campo_basket", 3200, 1900)!.canestri).toHaveLength(2);
    // più piccolo del regolamento: si riduce in proporzione
    expect(disegnoCampo("campo_tennis", 1200, 600)!.gioco.x1 * 2).toBeLessThanOrEqual(1200);
  });
  it("nel 3D, nel computo e dall'AI", () => {
    let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
    p = C.aggiungiElemento(p, CATALOGO.find((x) => x.tipo === "campo_padel")!, { x: 0, y: 0 }).pianta;
    p = C.aggiungiElemento(p, CATALOGO.find((x) => x.tipo === "campo_padel")!, { x: 0, y: 1400 }).pianta;
    const doc = aPlanimetria(p, nuovaPlanimetria("Centro padel"));
    expect(validaPlanimetria(doc).ok).toBe(true);
    const s = costruisciScena(pianteDaPlanimetria(doc).fatto, { vista: "fatto" });
    expect(new Set(s.mesh.map((m) => m.materiale))).toEqual(expect.objectContaining({}));
    expect(s.mesh.some((m) => m.materiale === "vetro")).toBe(true);
    expect(s.mesh.some((m) => m.materiale === "resina_blu")).toBe(true);
    expect(calcolaQuantita(doc)["fatto:elementi:esistente:campo_padel.numero"].valore).toBe(2);
    expect(tipoElementoDa("Campo da padel coperto")).toBe("campo_padel");
    expect(tipoElementoDa("calcetto")).toBe("campo_calcio5");
    expect(tipoElementoDa("campo di beach volley")).toBe("campo_beach_volley");
  });
});
