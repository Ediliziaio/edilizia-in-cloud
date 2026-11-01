import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aPlanimetria, daPlanimetria, piantaVuota } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello.ts";

const carica = (nome: string): Planimetria => JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi", nome), "utf8"));
const wc = CATALOGO.find((v) => v.tipo === "wc")!;

describe("arredi, quote e testi nell'editor (fase 3)", () => {
  it.each(["bilocale.json", "trilocale.json"])("%s: andata e ritorno dal documento non cambia arredi, quote, testi né quantità", (nome) => {
    const doc = carica(nome);
    const dopo = aPlanimetria(daPlanimetria(doc), doc);
    for (let i = 0; i < doc.livelli.length; i++) {
      const a = doc.livelli[i], b = dopo.livelli[i];
      expect(b.fatto.elementi).toEqual(a.fatto.elementi);
      expect(b.fatto.quote).toEqual(a.fatto.quote);
      expect(b.fatto.testi).toEqual(a.fatto.testi);
      a.proposte.forEach((p, j) => expect(b.proposte[j].elementi).toEqual(p.elementi));
    }
    expect(calcolaQuantita(dopo)).toEqual(calcolaQuantita(doc));
  });

  it("un arredo posato, spostato e ruotato finisce nel documento con y in su e rotazione antioraria", () => {
    let p = piantaVuota();
    const r = C.aggiungiElemento(p, wc, { x: 100, y: 50 });
    p = C.ruotaElemento(C.modificaElemento(r.pianta, r.id, { centro: { x: 120, y: 60 } }), r.id, 90);
    const doc = aPlanimetria(p);
    expect(validaPlanimetria(doc).ok).toBe(true);
    const e = doc.livelli[0].fatto.elementi.find((x) => x.id === r.id)!;
    expect(e).toMatchObject({ tipo: "wc", posizione: { x: 120, y: -60 }, rotazione: -90, larghezza: 38, profondita: 55 });
    // e torna uguale
    const di = daPlanimetria(doc).elementi!.find((x) => x.id === r.id)!;
    expect(di).toMatchObject({ centro: { x: 120, y: 60 }, rotazione: 90 });
  });

  it("la rotazione resta fra 0 e 359", () => {
    const r = C.aggiungiElemento(piantaVuota(), wc, { x: 0, y: 0 });
    expect(C.ruotaElemento(r.pianta, r.id, -90).elementi![0].rotazione).toBe(270);
    expect(C.ruotaElemento(r.pianta, r.id, 450).elementi![0].rotazione).toBe(90);
  });

  it("nel progetto un arredo di oggi si toglie (e si rimette), uno nuovo si elimina", () => {
    const oggi = C.aggiungiElemento(piantaVuota(), wc, { x: 0, y: 0 });
    const tolto = C.eliminaElemento(oggi.pianta, oggi.id, "progetto");
    expect(tolto.elementi![0].stato).toBe("da_demolire");
    expect(C.eliminaElemento(tolto, oggi.id, "progetto").elementi![0].stato).toBe("esistente");
    const nuovo = C.aggiungiElemento(oggi.pianta, wc, { x: 100, y: 0 }, { stato: "nuovo" });
    expect(C.eliminaElemento(nuovo.pianta, nuovo.id, "progetto").elementi).toHaveLength(1);
    // nel documento: il tolto è nel fatto ma non nella proposta, il nuovo solo nella proposta
    const doc = aPlanimetria({ ...nuovo.pianta, elementi: [{ ...nuovo.pianta.elementi![0], stato: "da_demolire" }, nuovo.pianta.elementi![1]] });
    const liv = doc.livelli[0];
    expect(liv.fatto.elementi.map((e) => e.id)).toEqual([oggi.id]);
    expect(liv.proposte[0].elementi.map((e) => e.id)).toEqual([nuovo.id]);
    const diNuovo = daPlanimetria(doc).elementi!;
    expect(diNuovo.find((e) => e.id === oggi.id)?.stato).toBe("da_demolire");
    expect(diNuovo.find((e) => e.id === nuovo.id)?.stato).toBe("nuovo");
  });

  it("quote e testi: si creano, si modificano, si eliminano e passano nel documento", () => {
    let p = piantaVuota();
    const q = C.aggiungiQuota(p, { x: 0, y: 0 }, { x: 420, y: 0 }, 40);
    p = C.modificaQuota(q.pianta, q.id, { scostamento: -60 });
    const t = C.aggiungiTesto(p, { x: 200, y: 100 }, "Bagno da rifare");
    p = C.modificaTesto(t.pianta, t.id, { rotazione: 90 });
    const doc = aPlanimetria(p);
    expect(validaPlanimetria(doc).ok).toBe(true);
    expect(doc.livelli[0].fatto.quote[0]).toMatchObject({ p2: { x: 420, y: 0 }, scostamento: 60 });
    expect(doc.livelli[0].fatto.testi[0]).toMatchObject({ testo: "Bagno da rifare", posizione: { x: 200, y: -100 }, rotazione: -90 });
    expect(C.eliminaTesto(C.eliminaQuota(p, q.id), t.id)).toMatchObject({ quote: [], testi: [] });
  });

  it("duplica accanto all'originale con lo stato della vista", () => {
    const r = C.aggiungiElemento(piantaVuota(), wc, { x: 0, y: 0 });
    const d = C.duplicaElemento(r.pianta, r.id, "progetto");
    const copia = d.pianta.elementi!.find((e) => e.id === d.id)!;
    expect(copia).toMatchObject({ tipo: "wc", centro: { x: 40, y: 40 }, stato: "nuovo" });
  });
});

describe("disegno più libero (fase 4)", () => {
  it("una stanza a L diventa un locale valido con le sue pareti", async () => {
    const L = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 400 }, { x: 0, y: 400 }];
    const r = C.aggiungiStanza(piantaVuota(), L, { spessore: 20 });
    expect(r.pianta.muri).toHaveLength(6);
    const doc = aPlanimetria(r.pianta);
    expect(validaPlanimetria(doc).ok).toBe(true);
    const mq = calcolaQuantita(doc)[`fatto:locale:${r.id}.pavimento_mq`].valore;
    // asse 12 m² meno mezzo muro da 20 cm lungo tutto il perimetro interno: fra 10 e 12 m²
    expect(mq).toBeGreaterThan(10);
    expect(mq).toBeLessThan(12);
  });

  it("le pareti si agganciano anche a 45°", async () => {
    const { aggancia } = await import("@/components/planimetrie/editor/geometria");
    const a = aggancia(piantaVuota(), { x: 103, y: 97 }, { tolleranza: 5, da: { x: 0, y: 0 } });
    expect(a.guida).toBe("dritto");
    expect(a.punto.x).toBe(a.punto.y);
  });
});

describe("piani (fase 5)", () => {
  it("un piano nuovo dal perimetro copia le pareti esterne con id nuovi, ed è un documento valido", async () => {
    const { aggiungiLivello, eliminaLivello, rinominaLivello } = await import("@/components/planimetrie/editor/adattatore");
    const doc = carica("trilocale.json");
    const esterni = doc.livelli[0].fatto.muri.filter((m) => m.tipo === "esterno" || m.tipo === "portante");
    const r = aggiungiLivello(doc, { nome: "Primo piano", quota: 300, base: "esterni" });
    expect(validaPlanimetria(r.documento).ok).toBe(true);
    const nuovo = r.documento.livelli.find((l) => l.id === r.id)!;
    expect(nuovo.fatto.muri).toHaveLength(esterni.length);
    expect(nuovo.fatto.muri.every((m) => m.id.endsWith(`_${r.id}`))).toBe(true);
    expect(nuovo.fatto.aperture).toHaveLength(0);
    const tutto = aggiungiLivello(doc, { nome: "Copia", quota: 600, base: "tutto" });
    expect(validaPlanimetria(tutto.documento).ok).toBe(true);
    expect(tutto.documento.livelli.at(-1)!.fatto.aperture.length).toBe(doc.livelli[0].fatto.aperture.length);
    const rinominato = rinominaLivello(r.documento, r.id, { nome: "Mansarda", quota: -300 });
    expect(rinominato.livelli[0]).toMatchObject({ id: r.id, nome: "Mansarda" });
    expect(eliminaLivello(rinominato, r.id).livelli).toHaveLength(1);
    expect(eliminaLivello(doc, doc.livelli[0].id).livelli).toHaveLength(1);
  });

  it("l'editor lavora sul piano scelto senza toccare gli altri", async () => {
    const { aggiungiLivello } = await import("@/components/planimetrie/editor/adattatore");
    const doc = aggiungiLivello(carica("bilocale.json"), { nome: "Primo piano", quota: 300, base: "vuoto" });
    const p = C.aggiungiStanzaDaMisure(daPlanimetria(doc.documento, doc.id), 300, 400, {}).pianta;
    const dopo = aPlanimetria(p, doc.documento, doc.id);
    expect(dopo.livelli[0]).toEqual(doc.documento.livelli[0]);
    expect(dopo.livelli.find((l) => l.id === doc.id)!.fatto.locali).toHaveLength(1);
    expect(validaPlanimetria(dopo).ok).toBe(true);
  });
});

describe("impianti di base nel computo (fase 7)", () => {
  it("prese e punti luce nuovi si contano per tipo e si scelgono in «Prendi dalla pianta»", async () => {
    const { quantitaPianta } = await import("@/lib/planimetrie/computo");
    const presa = CATALOGO.find((v) => v.tipo === "presa")!;
    const luce = CATALOGO.find((v) => v.tipo === "punto_luce")!;
    let p = C.aggiungiStanzaDaMisure(piantaVuota(), 300, 400, {}).pianta;
    for (let i = 0; i < 3; i++) p = C.aggiungiElemento(p, presa, { x: 50 + i * 40, y: 50 }, { stato: "nuovo" }).pianta;
    p = C.aggiungiElemento(p, luce, { x: 150, y: 200 }, { stato: "nuovo" }).pianta;
    const doc = aPlanimetria(p);
    const q = calcolaQuantita(doc);
    expect(q["progetto:A:elementi:nuovo:presa.numero"]).toMatchObject({ valore: 3, unita: "n" });
    expect(q["progetto:A:elementi:nuovo:punto_luce.numero"]?.descrizione).toContain("Punti luce nuovi");
    const scelte = quantitaPianta(q, "progetto:A").map((s) => s.id);
    expect(scelte).toContain("elementi:nuovo:presa.numero");
  });
});
