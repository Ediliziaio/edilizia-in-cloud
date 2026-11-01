import { describe, expect, it } from "vitest";
import { aPlanimetria, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { conVendita, unitaDellEdificio } from "@/lib/planimetrie/unita";
import { pdfSchedaUnita } from "@/lib/planimetrie/unitaPdf";
import { nuovaPlanimetria, validaPlanimetria } from "../../../shared/planimetrie/modello.ts";

function palazzina() {
  let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
  const stanza = (x: number, w: number, nome: string, destinazione: Parameters<typeof C.modificaLocale>[2]["destinazione"], unita: string, h = 500) => {
    const r = C.aggiungiStanza(p, C.rettangolo({ x, y: 0 }, { x: x + w, y: h }));
    p = C.modificaLocale(r.pianta, r.id, { nome, destinazione, unita });
  };
  stanza(0, 800, "Soggiorno", "soggiorno", "A"); // 40 mq (filo interno un po' meno)
  stanza(800, 400, "Terrazzo", "terrazzo", "A");
  stanza(1200, 400, "Scala", "altro", "Parti comuni");
  stanza(1600, 600, "Soggiorno", "soggiorno", "B");
  stanza(2200, 300, "Box", "garage", "B");
  return aPlanimetria(p, nuovaPlanimetria("Palazzina"));
}

describe("unità, millesimi e listino", () => {
  it("parti comuni escluse, coefficienti per terrazzo e box, millesimi che fanno 1000", () => {
    const u = unitaDellEdificio(palazzina());
    expect(u.map((x) => x.sigla)).toEqual(["A", "B"]);
    const [a, b] = u;
    const terrazzo = a.locali.find((l) => l.nome === "Terrazzo")!;
    expect(terrazzo.coefficiente).toBe(0.3);
    expect(a.mqCommerciali).toBeCloseTo(a.locali[0].mq + terrazzo.mq * 0.3, 1);
    expect(b.locali.find((l) => l.nome === "Box")!.coefficiente).toBe(0.5);
    expect(a.millesimi + b.millesimi).toBeCloseTo(1000, 6);
  });
  it("listino: prezzo al mq per la commerciale, stato; si salva nel documento valido e si toglie", () => {
    let doc = conVendita(palazzina(), "A", { prezzoMq: 2500, stato: "prenotata", note: "  vista mare " });
    expect(validaPlanimetria(doc).ok).toBe(true);
    const a = unitaDellEdificio(doc)[0];
    expect(a.prezzo).toBe(Math.round(2500 * a.mqCommerciali));
    expect(doc.vendite!.A).toEqual({ prezzoMq: 2500, stato: "prenotata", note: "vista mare" });
    doc = conVendita(doc, "A", { stato: "libera" });
    expect(doc.vendite).toBeUndefined();
    expect(validaPlanimetria({ ...doc, vendite: { A: { stato: "regalata" } } }).ok).toBe(false);
  });
  it("scheda PDF dell'unità", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
    const u = unitaDellEdificio(conVendita(palazzina(), "A", { prezzoMq: 2500 }))[0];
    const dati = await pdfSchedaUnita({ titolo: "Palazzina", unita: u, piante: [{ piano: "Piano terra", png }] });
    expect((await PDFDocument.load(dati)).getPageCount()).toBe(1);
  });
});
