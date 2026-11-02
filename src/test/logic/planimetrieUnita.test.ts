import { numeraLocali, vistaDaPlanimetria } from "@/lib/planimetrie/esporta";
import { IMMAGINI_SIMBOLI, urlImmagineSimbolo } from "@/components/planimetrie/editor/catalogo";
import { existsSync } from "node:fs";
import { lavoriDaFare } from "@/lib/planimetrie/render/renderInSerie";
import { MOMENTI_ESTERNI, lasciaFotoDaPianta, prendiDaPianta } from "@/lib/planimetrie/render/fotoDaPianta";
import { describe, expect, it } from "vitest";
import { aPlanimetria, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { conVendita, riepilogoVendite, unitaDellEdificio } from "@/lib/planimetrie/unita";
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
  it("vendite: prezzo pattuito, caparra, incassi e date; riepilogo", () => {
    let doc = conVendita(palazzina(), "A", { prezzoMq: 2500, stato: "venduta", acquirente: " Rossi ", prezzoPattuito: 100000, caparra: 10000, incassato: 30000, dataPreliminare: "2026-10-01", dataRogito: "2027-03-15" });
    doc = conVendita(doc, "B", { prezzoMq: 2000, stato: "prenotata", caparra: 5000 });
    expect(validaPlanimetria(doc).ok).toBe(true);
    const [a, b] = unitaDellEdificio(doc);
    expect(a.prezzo).toBe(100000);
    expect(a.residuo).toBe(70000);
    expect(b.residuo).toBe(b.prezzo! - 5000);
    const r = riepilogoVendite([a, b]);
    expect(r).toMatchObject({ venduto: 100000, prenotato: b.prezzo, incassato: 35000, libere: 0 });
    expect(validaPlanimetria({ ...doc, vendite: { A: { dataRogito: "15/03/2027" } } }).ok).toBe(false);
    expect(validaPlanimetria({ ...doc, vendite: { A: { caparra: -1 } } }).ok).toBe(false);
  });
  it("scheda PDF dell'unità", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
    const u = unitaDellEdificio(conVendita(palazzina(), "A", { prezzoMq: 2500 }))[0];
    const dati = await pdfSchedaUnita({ titolo: "Palazzina", unita: u, piante: [{ piano: "Piano terra", png }] });
    expect((await PDFDocument.load(dati)).getPageCount()).toBe(1);
  });
});


describe("disegni e render", () => {
  it("locali numerati, anche continuando da un altro piano", () => {
    const v = numeraLocali(vistaDaPlanimetria(palazzina(), { modo: "fatto" }), 7);
    expect(v.locali.map((l) => l.nome.split(".")[0])).toEqual(["7", "8", "9", "10", "11"]);
  });
  it("le immagini dei simboli elencate esistono davvero (senza, la miniatura è il disegno)", () => {
    for (const t of IMMAGINI_SIMBOLI) expect(existsSync(`public/planimetrie/simboli/${t}.png`), t).toBe(true);
    expect(urlImmagineSimbolo("tipo_che_non_ce")).toBeNull();
  });
  it("render di tutto l'edificio: ogni lavoro sa il suo piano; la nota di luce passa alla pagina", () => {
    const l = lavoriDaFare([{ id: "a", nome: "Soggiorno", livelloId: "p1" }, { id: "b", nome: "Camera" }], [{ id: "x", nome: "X", descrizione: "", tavolozza: ["#000", "#111", "#222"] } as never]);
    expect(l.map((x) => x.livelloId)).toEqual(["p1", undefined]);
    lasciaFotoDaPianta("piscine", new File([new Uint8Array([1])], "v.png"), MOMENTI_ESTERNI.find((m) => m.id === "sera")!.nota);
    expect(prendiDaPianta("piscine")?.nota).toMatch(/Sera/);
  });
});
