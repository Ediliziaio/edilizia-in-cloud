import { itemsPreventivo, righeDaLavori, totaleRighe } from "@/lib/planimetrie/preventivoDaPianta";
import { describe, expect, it } from "vitest";
import { aPlanimetria, daPlanimetria, duplicaProposta, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { lavoriDaPianta, PREZZI_OPERE, stessoRiquadro } from "@/lib/planimetrie/primaEDopo";
import { pdfPrimaEDopo } from "@/lib/planimetrie/primaEDopoPdf";
import { nuovaPlanimetria } from "../../../shared/planimetrie/modello.ts";

const voce = (t: string) => CATALOGO.find((v) => v.tipo === t)!;

/** Due stanze affiancate (cucina 4×4 e soggiorno 5×4); nel progetto si apre la cucina sul soggiorno. */
function progetto() {
  let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
  let r = C.aggiungiStanza(p, C.rettangolo({ x: 0, y: 0 }, { x: 400, y: 400 }));
  p = C.modificaLocale(r.pianta, r.id, { nome: "Cucina", destinazione: "cucina" });
  r = C.aggiungiStanza(p, C.rettangolo({ x: 400, y: 0 }, { x: 900, y: 400 }));
  p = C.modificaLocale(r.pianta, r.id, { nome: "Soggiorno", destinazione: "soggiorno" });
  p = C.aggiungiElemento(p, voce("lavabo"), { x: 200, y: 30 }).pianta;
  let doc = aPlanimetria(p, nuovaPlanimetria("Casa"));
  const pr = duplicaProposta(doc, doc.livelli[0].id);
  doc = pr.documento;
  let q = daPlanimetria(doc, doc.livelli[0].id, pr.id);
  const divisorio = q.muri.find((m) => Math.abs(m.p1.x - 400) < 1 && Math.abs(m.p2.x - 400) < 1)!;
  q = C.eliminaMuro(q, divisorio.id, "progetto"); // da demolire
  const esterno = q.muri.find((m) => Math.abs(m.p1.y) < 1 && Math.abs(m.p2.y) < 1 && Math.min(m.p1.x, m.p2.x) >= 399)!;
  q = C.aggiungiApertura(q, esterno.id, "finestra", 200, { stato: "nuovo" }).pianta;
  q = C.aggiungiElemento(q, voce("split"), { x: 650, y: 30 }, { stato: "nuovo" }).pianta;
  q = C.aggiungiElemento(q, voce("divano"), { x: 650, y: 300 }, { stato: "nuovo" }).pianta;
  const lavabo = q.elementi!.find((e) => e.tipo === "lavabo")!;
  q = C.eliminaElemento(q, lavabo.id, "progetto");
  doc = aPlanimetria(q, doc, doc.livelli[0].id, pr.id);
  return { doc, propostaId: pr.id };
}

describe("prima e dopo: i lavori dalla pianta", () => {
  it("demolizione, finestra, split, divano e rimozione, ognuno nella sua stanza, con il totale", () => {
    const { doc, propostaId } = progetto();
    const r = lavoriDaPianta(doc, doc.livelli[0].id, propostaId);
    const tutti = r.stanze.flatMap((s) => s.lavori.map((l) => ({ ...l, stanza: s.stanza })));
    const demol = tutti.find((l) => l.genere === "demolizione" && l.unita === "mq")!;
    expect(demol.quantita).toBeCloseTo(4 * 2.7, 1);
    expect(demol.prezzo).toBe(PREZZI_OPERE.demolizioneTramezzo);
    const finestra = tutti.find((l) => l.genere === "serramenti")!;
    expect(finestra).toMatchObject({ stanza: "Soggiorno", prezzo: PREZZI_OPERE.finestra });
    expect(tutti.find((l) => l.descrizione.startsWith("Climatizzatore"))!.stanza).toBe("Soggiorno");
    expect(tutti.find((l) => l.genere === "arredi")).toMatchObject({ prezzo: null, importo: 0 });
    expect(tutti.find((l) => l.descrizione.startsWith("Rimozione"))!.stanza).toBe("Cucina");
    const somma = r.stanze.reduce((t, s) => t + s.totale, 0);
    expect(r.totale).toBeCloseTo(somma, 2);
    expect(r.totale).toBeGreaterThan(PREZZI_OPERE.finestra);
  });
  it("senza proposta non ci sono lavori", () => {
    const doc = aPlanimetria(C.aggiungiStanza({ versione: 1, unita: "cm", muri: [], aperture: [], locali: [] }, C.rettangolo({ x: 0, y: 0 }, { x: 300, y: 300 })).pianta, nuovaPlanimetria("X"));
    expect(lavoriDaPianta(doc, doc.livelli[0].id).righe).toBe(0);
  });
  it("le due piante prendono lo stesso riquadro", () => {
    const a = '<svg width="100mm" height="50mm" viewBox="0 0 100 50"></svg>';
    const b = '<svg width="80mm" height="90mm" viewBox="10 -20 80 90"></svg>';
    const [x, y] = stessoRiquadro(a, b);
    expect(x).toContain('viewBox="0 -20 100 90"');
    expect(y).toContain('viewBox="0 -20 100 90"');
    expect(x).toContain('width="1000" height="900"');
  });
  it("il PDF: una pagina con le piante, poi i lavori", async () => {
    const { PDFDocument } = await import("pdf-lib");
    // PNG 1×1 bianco
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
    const { doc, propostaId } = progetto();
    const dati = await pdfPrimaEDopo({ titolo: "Casa Rossi — è così", prima: png, dopo: png, lavori: lavoriDaPianta(doc, doc.livelli[0].id, propostaId) });
    expect((await PDFDocument.load(dati)).getPageCount()).toBeGreaterThanOrEqual(2);
  });
});


describe("dalla pianta al preventivo", () => {
  it("una riga per lavoro con la stanza davanti; arredi senza prezzo esclusi; quantità a due decimali", () => {
    const { doc, propostaId } = progetto();
    const lav = lavoriDaPianta(doc, doc.livelli[0].id, propostaId);
    const righe = righeDaLavori(lav);
    expect(righe.find((r) => r.genere === "arredi")!.inclusa).toBe(false);
    expect(totaleRighe(righe)).toBeCloseTo(lav.totale, 0);
    const items = itemsPreventivo(righe, 10);
    expect(items.every((i) => i.vat_rate === 10 && Number.isInteger(i.quantity * 100))).toBe(true);
    expect(items.find((i) => i.name.startsWith("Soggiorno — Nuova finestra"))).toMatchObject({ unit_of_measure: "pz", item_category: "posa" });
    expect(items.map((i) => i.sort_order)).toEqual(items.map((_, k) => k));
  });
});
