import { describe, expect, it } from "vitest";
import { aggiungiLivello, aPlanimetria, rinominaLivello, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { costruisciScena, pianiDaPlanimetria, pianteDaPlanimetria, scenaEdificio } from "@/lib/planimetrie/tred";
import { parapetti } from "@/lib/planimetrie/tred/scena";
import { nuovaPlanimetria, validaPlanimetria } from "../../../shared/planimetrie/modello.ts";

/** Soggiorno 6×4 con un terrazzo 6×2 davanti (a sud) e un vano scala con la scala. */
function casa() {
  let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
  let r = C.aggiungiStanza(p, C.rettangolo({ x: 0, y: 0 }, { x: 600, y: 400 }));
  p = C.modificaLocale(r.pianta, r.id, { nome: "Soggiorno", destinazione: "soggiorno" });
  r = C.aggiungiStanza(p, C.rettangolo({ x: 0, y: 400 }, { x: 600, y: 600 }));
  p = C.modificaLocale(r.pianta, r.id, { nome: "Terrazzo", destinazione: "terrazzo" });
  r = C.aggiungiStanza(p, C.rettangolo({ x: 600, y: 0 }, { x: 800, y: 400 }));
  p = C.modificaLocale(r.pianta, r.id, { nome: "Vano scala", destinazione: "altro" });
  p = C.aggiungiElemento(p, CATALOGO.find((v) => v.tipo === "scala")!, { x: 700, y: 200 }).pianta;
  return aPlanimetria(p, nuovaPlanimetria("Casa"));
}

describe("edificio più vero nel 3D", () => {
  it("parapetti: i muri attorno al terrazzo verso fuori sono bassi, quello verso il soggiorno no", () => {
    const pt = pianteDaPlanimetria(casa()).fatto;
    const bassi = parapetti(pt);
    expect(bassi.size).toBe(3); // sud, ovest ed est del terrazzo
    const comune = pt.muri.find((m) => Math.abs(m.a.y - m.b.y) < 1 && Math.abs(Math.abs(m.a.y) - 400) < 1 && Math.max(m.a.x, m.b.x) <= 601)!;
    expect(bassi.has(comune.id)).toBe(false);
    const s = costruisciScena(pt, { vista: "fatto" });
    const muro = (id: string) => s.mesh.filter((m) => m.riferimento === id && m.genere === "muro");
    const alto = (id: string) => Math.max(...muro(id).flatMap((m) => m.posizioni.filter((_, i) => i % 3 === 1)));
    expect(alto([...bassi][0])).toBeCloseTo(1.1, 2);
    expect(alto(comune.id)).toBeCloseTo(2.7, 2);
  });
  it("tetto a due falde: il colmo sale della pendenza sulla metà del lato corto; si salva e si valida", () => {
    const doc = rinominaLivello(casa(), "pt", { tetto: { tipo: "due_falde", pendenza: 30, sporto: 50 } });
    expect(validaPlanimetria(doc).ok).toBe(true);
    const pt = pianteDaPlanimetria(doc).fatto;
    const s = costruisciScena(pt, { vista: "fatto", soffitto: true });
    const tetto = s.mesh.find((m) => m.id === "tetto")!;
    const ys = tetto.posizioni.filter((_, i) => i % 3 === 1);
    // lato corto: 6 m + muri + 2 sporti ≈ 7,3 m → metà 3,65 × 30% ≈ 1,1 m sopra i 2,70
    expect(Math.max(...ys)).toBeGreaterThan(3.7);
    expect(Math.max(...ys)).toBeLessThan(4);
    expect(Math.min(...ys)).toBeCloseTo(2.7, 2);
    expect(s.mesh.some((m) => m.id === "tetto:timpani")).toBe(true);
    // senza soffitto (vista dall'alto per guardare dentro) il tetto non c'è
    expect(costruisciScena(pt, { vista: "fatto", soffitto: false }).mesh.some((m) => m.id === "tetto")).toBe(false);
    expect(rinominaLivello(doc, "pt", { tetto: null }).livelli[0].tetto).toBeUndefined();
  });
  it("più piani: foro della scala al piano sopra, tetto solo in cima, edificio grigio sotto un attico", () => {
    let doc = casa();
    doc = aggiungiLivello(doc, { nome: "Primo piano", quota: 300, base: "identico" }).documento;
    doc = rinominaLivello(doc, doc.livelli[1].id, { tetto: { tipo: "padiglione", pendenza: 35, sporto: 40 } });
    doc = rinominaLivello(doc, "pt", { tetto: { tipo: "piano", pendenza: 0, sporto: 0 } });
    const s = scenaEdificio(pianiDaPlanimetria(doc), { vista: "fatto", soffitto: true });
    const scala = (pid: string) => s.mesh.some((m) => m.id.startsWith(`${pid}/pavimento:`) && m.nome.includes("Vano scala"));
    expect(scala("pt")).toBe(true);
    expect(scala(doc.livelli[1].id)).toBe(false);
    expect(s.mesh.filter((m) => m.id.endsWith("/tetto")).map((m) => m.id)).toEqual([`${doc.livelli[1].id}/tetto`]);
    // la scala sale fino al piano sopra (3 m), non i 2,80 del catalogo
    const gradini = s.mesh.filter((m) => m.id.startsWith("pt/") && m.genere !== "muro" && m.genere !== "pavimento" && /scala/i.test(m.nome) && !/vano/i.test(m.nome));
    expect(gradini.length).toBeGreaterThan(0);
    expect(Math.max(...gradini.flatMap((m) => m.posizioni.filter((_, i) => i % 3 === 1)))).toBeCloseTo(3, 1);
    // attico al quarto piano
    const attico = rinominaLivello(casa(), "pt", { nome: "Quarto piano", quota: 1200 });
    const due = aggiungiLivello(attico, { nome: "Mansarda", quota: 1500, base: "esterni" }).documento;
    const sa = scenaEdificio(pianiDaPlanimetria(due), { vista: "fatto" });
    const sotto = sa.mesh.find((m) => m.id === "edificio-sotto")!;
    const ys = sotto.posizioni.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBeCloseTo(12, 2);
  });
});
