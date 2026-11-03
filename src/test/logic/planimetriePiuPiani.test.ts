import { describe, expect, it } from "vitest";
import { aggiungiLivello, aPlanimetria, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { costruisciScena, pianiDaPlanimetria, scenaEdificio } from "@/lib/planimetrie/tred";
import { unisciPdf } from "@/components/planimetrie/EsportaPiantaDialog";
import { nuovaPlanimetria, validaPlanimetria } from "../../../shared/planimetrie/modello.ts";

function casa() {
  let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
  const r = C.aggiungiStanza(p, C.rettangolo({ x: 0, y: 0 }, { x: 500, y: 400 }));
  p = C.modificaLocale(r.pianta, r.id, { nome: "Soggiorno", destinazione: "soggiorno" });
  p = C.aggiungiElemento(p, CATALOGO.find((v) => v.tipo === "divano")!, { x: 250, y: 200 }).pianta;
  return aPlanimetria(p, nuovaPlanimetria("Duplex"));
}

describe("più piani", () => {
  it("piano identico: stanze, arredi e pareti copiati con id nuovi; il documento resta valido", () => {
    const doc = casa();
    const r = aggiungiLivello(doc, { nome: "Primo piano", quota: 300, base: "identico" });
    const nuovo = r.documento.livelli.find((l) => l.id === r.id)!;
    expect(nuovo.fatto.locali).toHaveLength(1);
    expect(nuovo.fatto.elementi).toHaveLength(1);
    expect(nuovo.fatto.muri.length).toBe(doc.livelli[0].fatto.muri.length);
    expect(nuovo.fatto.locali[0].id).not.toBe(doc.livelli[0].fatto.locali[0].id);
    expect(validaPlanimetria(r.documento).ok).toBe(true);
  });
  it("tutto l'edificio: interrato sotto, primo piano sopra, alla loro quota; esploso li stacca", () => {
    let doc = casa();
    doc = aggiungiLivello(doc, { nome: "Primo piano", quota: 300, base: "identico" }).documento;
    doc = aggiungiLivello(doc, { nome: "Interrato", quota: -300, base: "identico" }).documento;
    const piani = pianiDaPlanimetria(doc);
    expect(piani.map((p) => p.nome)).toEqual(["Interrato", "Piano terra", "Primo piano"]);
    // senza zoccolatura e marciapiede (solo il piano terra li ha): ogni piano ha le stesse mesh
    const uno = costruisciScena(piani[1].piante.fatto, { vista: "fatto", zoccolo: false });
    const tutti = scenaEdificio(piani, { vista: "fatto", zoccolo: false });
    expect(tutti.mesh.length).toBe(uno.mesh.length * 3);
    expect(tutti.limiti.min[1]).toBeCloseTo(-3, 1);
    expect(tutti.limiti.max[1]).toBeCloseTo(uno.limiti.max[1] + 3, 1);
    expect(new Set(tutti.mesh.map((m) => m.id)).size).toBe(tutti.mesh.length);
    const esploso = scenaEdificio(piani, { vista: "fatto", esploso: 3 });
    expect(esploso.limiti.max[1]).toBeCloseTo(tutti.limiti.max[1] + 6, 1);
    expect(scenaEdificio(piani, { vista: "fatto", finoA: piani[1].id }).limiti.max[1]).toBeCloseTo(uno.limiti.max[1], 1);
  });
  it("tutti i piani in un PDF: le pagine si sommano", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const un = async (n: number) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage(); return d.save(); };
    const unito = await PDFDocument.load(await unisciPdf([await un(1), await un(2)]));
    expect(unito.getPageCount()).toBe(3);
  });
});
