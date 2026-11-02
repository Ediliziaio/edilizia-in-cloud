import { describe, expect, it } from "vitest";
import { aPlanimetria, rinominaLivello, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { costruisciScena, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { prospetto } from "@/lib/planimetrie/prospetti";
import { nuovaPlanimetria, validaPlanimetria } from "../../../shared/planimetrie/modello.ts";
import { altezzeLocale, falde } from "../../../shared/planimetrie/sottotetto.ts";
import { verificaPianta } from "../../../shared/planimetrie/verifiche.ts";

/** Mansarda 8 × 5 m (colmo lungo x), una camera sola; tetto a due falde al 40%, imposta 1,20. */
function mansarda(imposta = 120, pendenza = 40) {
  let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
  const r = C.aggiungiStanza(p, C.rettangolo({ x: 0, y: 0 }, { x: 800, y: 500 }));
  p = C.modificaLocale(r.pianta, r.id, { nome: "Camera", destinazione: "camera" });
  const doc = aPlanimetria(p, nuovaPlanimetria("Mansarda"));
  return rinominaLivello(doc, doc.livelli[0].id, { tetto: { tipo: "due_falde", pendenza, sporto: 50, mansarda: { imposta } } });
}

describe("sottotetto ad altezza variabile", () => {
  it("altezza minima all'imposta, massima al colmo, media in mezzo; superficie utile sopra 1,50", () => {
    const doc = mansarda();
    expect(validaPlanimetria(doc).ok).toBe(true);
    const liv = doc.livelli[0];
    const f = falde(liv, liv.fatto)!;
    expect(f).not.toBeNull();
    const a = altezzeLocale(liv.fatto.locali[0], f)!;
    // larghezza interna circa 5 m: dal muro al colmo 2,5 m (più metà muro) × 40% ≈ +1,0 m
    expect(a.minima).toBeGreaterThanOrEqual(115);
    expect(a.minima).toBeLessThan(135);
    expect(a.massima).toBeGreaterThan(215);
    expect(a.massima).toBeLessThan(240);
    expect(a.media).toBeCloseTo((a.minima + a.massima) / 2, -1);
    expect(a.superficieUtile).toBeLessThan(a.superficie);
    expect(a.superficieUtile).toBeGreaterThan(a.superficie * 0.3);
    // senza mansarda: niente falde
    expect(falde({ tetto: { tipo: "due_falde", pendenza: 40, sporto: 50 } }, liv.fatto)).toBeNull();
    expect(validaPlanimetria(rinominaLivello(doc, liv.id, { tetto: { tipo: "due_falde", pendenza: 40, sporto: 50, mansarda: { imposta: -5 } } })).ok).toBe(false);
  });

  it("verifiche: media bassa non conforme, media alta regolare; la superficie è quella utile", () => {
    const bassa = verificaPianta(mansarda(120, 40)).find((v) => v.codice === "altezza")!;
    expect(bassa.esito).toBe("non_conforme");
    expect(bassa.valore).toMatch(/media/);
    const alta = verificaPianta(mansarda(200, 60)).find((v) => v.codice === "altezza")!;
    expect(alta.esito).not.toBe("non_conforme");
  });

  it("3D: niente soffitto piano, muri fin sotto le falde, tetto che parte dall'imposta", () => {
    const pt = pianteDaPlanimetria(mansarda()).fatto;
    const s = costruisciScena(pt, { vista: "fatto", soffitto: true });
    expect(s.mesh.some((m) => m.id.startsWith("soffitto:"))).toBe(false);
    const tetto = s.mesh.find((m) => m.id === "tetto")!;
    const ys = tetto.posizioni.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeLessThan(1.2);
    const muri = s.mesh.filter((m) => m.genere === "muro" && m.id.startsWith("muro:"));
    const piuAlto = Math.max(...muri.flatMap((m) => m.posizioni.filter((_, i) => i % 3 === 1)));
    // i muri di testata arrivano al colmo (sopra i 2 m), non restano a 2,70 né a 1,20
    expect(piuAlto).toBeGreaterThan(2);
    expect(piuAlto).toBeLessThan(2.6);
  });

  it("prospetto: la falda parte più in basso con la mansarda", () => {
    const doc = mansarda();
    const st = doc.livelli[0].fatto;
    const con = prospetto(st, "sud", doc.livelli[0].tetto);
    const senza = prospetto(st, "sud", { tipo: "due_falde", pendenza: 40, sporto: 50 });
    const zMin = (d: typeof con) => Math.min(...d.primitive.filter((p) => p.tipo === "poligono").flatMap((p) => (p.tipo === "poligono" ? p.punti.map((q) => q.z) : [])));
    expect(zMin(con)).toBeLessThan(zMin(senza));
  });
});

describe("lucernari e superficie commerciale del sottotetto", () => {
  it("un lucernario conta come superficie finestrata della stanza", async () => {
    const { superficieFinestrata } = await import("../../../shared/planimetrie/verifiche.ts");
    const { CATALOGO } = await import("@/components/planimetrie/editor/catalogo");
    const doc = mansarda();
    const st = doc.livelli[0].fatto;
    const prima = superficieFinestrata(st.locali[0], st);
    const c = st.locali[0].contorno;
    const centro = { x: c.reduce((t, p) => t + p.x, 0) / c.length, y: c.reduce((t, p) => t + p.y, 0) / c.length };
    const voce = CATALOGO.find((v) => v.tipo === "lucernario")!;
    const conLucernario = { ...st, elementi: [...st.elementi, { id: "luc1", tipo: "lucernario", posizione: centro, rotazione: 0, larghezza: voce.larghezza, profondita: voce.profondita }] };
    expect(superficieFinestrata(st.locali[0], conLucernario as typeof st) - prima).toBeCloseTo(0.78 * 1.18, 3);
  });
  it("unità in mansarda: la parte sotto 1,50 m conta al 30%", async () => {
    const { unitaDellEdificio } = await import("@/lib/planimetrie/unita");
    const doc = mansarda();
    const liv = doc.livelli[0];
    const conUnita = { ...doc, livelli: [{ ...liv, fatto: { ...liv.fatto, locali: [{ ...liv.fatto.locali[0], unita: "A" }, ...liv.fatto.locali.slice(1)] } }] };
    const due = { ...conUnita, livelli: [{ ...conUnita.livelli[0], fatto: { ...conUnita.livelli[0].fatto, locali: [...conUnita.livelli[0].fatto.locali, { ...conUnita.livelli[0].fatto.locali[0], id: "copia", unita: "B" }] } }] };
    const [a] = unitaDellEdificio(due);
    const coeff = a.locali[0].coefficiente;
    expect(coeff).toBeLessThan(1);
    expect(coeff).toBeGreaterThan(0.3);
  });
});

describe("lucernari nei prospetti", () => {
  it("si vedono sulla falda che scende verso chi guarda, non dall'altra parte", () => {
    const doc = mansarda();
    const st = doc.livelli[0].fatto;
    const ys = st.locali[0].contorno.map((p) => p.y), xs = st.locali[0].contorno.map((p) => p.x);
    // a metà fra la gronda sud (y più basso) e il colmo
    const pos = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) + 120 };
    const conLuc = { ...st, elementi: [...st.elementi, { id: "l1", tipo: "lucernario", posizione: pos, rotazione: 0, larghezza: 78, profondita: 118 }] } as typeof st;
    const vetri = (lato: "sud" | "nord") => prospetto(conLuc, lato, doc.livelli[0].tetto).primitive.filter((p) => p.tipo === "rett" && p.stile === "vetro" && p.z1 > 100);
    expect(vetri("sud")).toHaveLength(1);
    expect(vetri("nord")).toHaveLength(0);
  });
});
