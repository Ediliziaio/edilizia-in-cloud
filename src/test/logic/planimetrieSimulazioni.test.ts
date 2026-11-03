/**
 * Simulazioni di punta a punta del modulo Planimetrie: si costruiscono piante intere con gli stessi comandi
 * dell'editor e se ne leggono tutti i prodotti (documento, computo, verifiche, abachi, 3D, SVG e DXF).
 * Servono a vedere che niente esploda e che nessun numero esca NaN quando le funzioni lavorano insieme.
 */
import { describe, expect, it } from "vitest";
import * as C from "@/components/planimetrie/editor/comandi";
import { aggiungiLivello, aPlanimetria, daPlanimetria, piantaVuota, type Pianta } from "@/components/planimetrie/editor/adattatore";
import { generaTelaio } from "@/components/planimetrie/editor/telaio";
import { copiaGruppoSuTuttiIPiani, copiaSuTuttiIPiani } from "@/lib/planimetrie/copiaSuiPiani";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita";
import { verificaPianta } from "../../../shared/planimetrie/verifiche";
import { abacoSerramenti, abacoStanze, csvSerramenti, riepilogoControtelai, riepilogoOscuranti } from "@/lib/planimetrie/abachi";
import { pianiDaPlanimetria, scenaEdificio } from "@/lib/planimetrie/tred/edificio";
import { esportaDxf, esportaSvg, vistaDaPlanimetria } from "@/lib/planimetrie/esporta";

let n = 0;
const id = () => `arredo-sim${++n}`;

/** Un appartamento 8 × 6 m con soggiorno, camera e bagno e qualche serramento. */
function appartamento(): Pianta {
  let p = piantaVuota();
  p = C.aggiungiStanzaDaMisure(p, 600, 500, { nome: "Soggiorno", destinazione: "soggiorno", stato: "esistente", origineIn: { x: 0, y: 0 } }).pianta;
  p = C.aggiungiStanzaDaMisure(p, 350, 500, { nome: "Camera", destinazione: "camera", stato: "esistente" }).pianta;
  p = C.aggiungiStanzaDaMisure(p, 250, 500, { nome: "Bagno", destinazione: "bagno", stato: "esistente" }).pianta;
  return p;
}

function ogniNumeroFinito(oggetto: unknown, percorso = "$"): string[] {
  if (typeof oggetto === "number") return Number.isFinite(oggetto) ? [] : [percorso];
  if (Array.isArray(oggetto)) return oggetto.flatMap((x, i) => ogniNumeroFinito(x, `${percorso}[${i}]`));
  if (oggetto && typeof oggetto === "object") return Object.entries(oggetto).flatMap(([k, v]) => ogniNumeroFinito(v, `${percorso}.${k}`));
  return [];
}

function controllaTutto(doc: Planimetria) {
  const val = validaPlanimetria(doc);
  expect(val.ok, "errori" in val ? val.errori.slice(0, 5).join(" | ") : "").toBe(true);
  const q = calcolaQuantita(doc);
  expect(ogniNumeroFinito(Object.values(q).map((x) => x.valore))).toEqual([]);
  expect(() => verificaPianta(doc, "fatto")).not.toThrow();
  for (const l of doc.livelli) {
    expect(ogniNumeroFinito(abacoSerramenti(doc, l.id, "fatto"))).toEqual([]);
    expect(ogniNumeroFinito(abacoStanze(doc, l.id, "fatto"))).toEqual([]);
    const v = vistaDaPlanimetria(doc, { modo: "fatto", livelloId: l.id });
    expect(esportaSvg(v).svg).toContain("<svg");
    expect(esportaDxf(v).dati.length).toBeGreaterThan(200);
  }
  const s = scenaEdificio(pianiDaPlanimetria(doc), { vista: "fatto", fondazioni: true, esploso: 3, impianti: true });
  expect(s.mesh.length).toBeGreaterThan(0);
  expect(ogniNumeroFinito(s.mesh.flatMap((m) => m.posizioni.slice(0, 600)))).toEqual([]);
  for (const m of s.mesh) expect(Math.max(...m.indici)).toBeLessThan(m.posizioni.length / 3);
  return { q, s };
}

describe("simulazione A · condominio a 4 piani con ascensore, scale e serramenti di ogni tipo", () => {
  it("regge tutto e ascensore e scale bucano i solai", () => {
    let p = appartamento();
    const muroSopra = p.muri.find((m) => m.p1.y === m.p2.y && m.p1.y === Math.min(...p.muri.map((x) => x.p1.y)))!;
    // serramenti di ogni sistema
    const metti = (tipo: "porta" | "finestra" | "portafinestra", t: number, campi: object) => {
      const r = C.aggiungiApertura(p, muroSopra.id, tipo, t, { stato: "esistente" });
      p = r.pianta;
      if (r.id) p = C.modificaApertura(p, r.id, campi as never);
      return r.id;
    };
    metti("porta", 80, { sistema: "scorrevole_scomparsa", manovra: "scorrevole" });
    metti("finestra", 250, { ante: 3, sistema: "scorrevole", manovra: "scorrevole", larghezza: 200 });
    metti("portafinestra", 450, { sistema: "alzante_scorrevole", manovra: "scorrevole", ante: 2, larghezza: 220 });
    metti("finestra", 600, { sistema: "vasistas", ante: 1, larghezza: 70 });
    // ascensore, scala a U e chiocciola
    p = C.aggiungiElemento(p, { tipo: "ascensore", larghezza: 150, profondita: 150, altezza: 280 }, { x: 1100, y: 100 }, { stato: "esistente" }).pianta;
    const sc = C.aggiungiElemento(p, { tipo: "scala_u", larghezza: 200, profondita: 360, altezza: 280 }, { x: 1400, y: 200 }, { stato: "esistente" });
    p = sc.pianta;
    p = C.aggiungiElemento(p, { tipo: "scala_chiocciola", larghezza: 160, profondita: 160, altezza: 280 }, { x: 1700, y: 100 }, { stato: "esistente" }).pianta;
    let doc = aPlanimetria(p);
    const l0 = doc.livelli[0].id;
    for (const [nome, quota] of [["Primo piano", 300], ["Secondo piano", 600], ["Terzo piano", 900]] as const) {
      doc = aggiungiLivello(doc, { nome, quota, base: "identico", daLivelloId: l0 }).documento;
    }
    // l'ascensore e le scale su tutti i piani, nello stesso punto
    for (const e of doc.livelli[0].fatto.elementi) {
      const r = copiaSuTuttiIPiani(doc, l0, e.id, id);
      if (r) doc = r.documento;
    }
    expect(doc.livelli).toHaveLength(4);
    const { q, s } = controllaTutto(doc);
    // un solo ascensore con 4 fermate
    const asc = Object.entries(q).filter(([k]) => k.startsWith("fatto:elementi:esistente:ascensore."));
    expect(asc.map(([, v]) => v.valore)).toEqual([1]);
    expect(Object.entries(q).find(([k]) => k.endsWith("ascensore_fermate.numero"))?.[1].valore).toBe(4);
    // il controtelaio speciale compare nel computo e nell'abaco
    expect(Object.keys(q).some((k) => k.includes("controtelaio_scomparsa"))).toBe(true);
    const righe = abacoSerramenti(doc, l0, "fatto");
    expect(righe.some((r) => r.sistema === "Scorrevole a scomparsa")).toBe(true);
    expect(csvSerramenti(righe)).toContain("Alzante scorrevole");
    expect(Array.isArray(riepilogoControtelai(righe))).toBe(true);
    // il 3D: soffitto e pavimento bucati e una sola cabina (al piano terra)
    expect(s.mesh.filter((m) => /elemento:.*:laccato$/.test(m.id) && m.nome.includes("Ascensore")).length).toBe(1);
    void sc;
  });
});

describe("simulazione B · capannone con telaio strutturale, ripetuto su due piani", () => {
  it("telaio 6 × 3 campate: validazione, computo, 3D e disegni", () => {
    const base = piantaVuota();
    const r = generaTelaio(base, {
      campateX: [600, 600, 600, 600, 600, 600], campateY: [800, 800, 800], pilastro: { larghezza: 40, profondita: 40 }, trave: { larghezza: 40, altezza: 60 },
      solaio: 25, origine: { x: 0, y: 0 }, stato: "esistente", etichette: true,
    });
    let doc = aPlanimetria(r.pianta);
    doc = aggiungiLivello(doc, { nome: "Primo piano", quota: 400, base: "vuoto" }).documento;
    const c = copiaGruppoSuTuttiIPiani(doc, doc.livelli[0].id, r.elementi, id);
    expect(c.aggiunti).toBe(r.elementi.length);
    const { q } = controllaTutto(c.documento);
    expect(Object.entries(q).find(([k]) => k.endsWith("struttura:esistente:pilastri.cls_mc"))?.[1].valore).toBeGreaterThan(10);
    expect(Object.entries(q).find(([k]) => k.endsWith("struttura:esistente:solai.superficie_mq"))?.[1].unita).toBe("mq");
  });
});

describe("simulazione C · villetta con muro di contenimento, pareti nuove portanti e fondazioni", () => {
  it("muro di contenimento e cordoli nel computo, verifiche senza eccezioni", () => {
    let p = appartamento();
    p = C.aggiungiElemento(p, { tipo: "muro_contenimento", larghezza: 800, profondita: 250, altezza: 320 }, { x: 300, y: 900 }, { stato: "nuovo" }).pianta;
    const nuovo = C.aggiungiParete(p, { x: -200, y: -100 }, { x: 900, y: -100 }, { stato: "nuovo" });
    p = C.modificaMuro(nuovo.pianta, nuovo.id, { tipo: "portante", spessore: 30 });
    const doc = aPlanimetria(p, undefined, undefined, "A");
    const { q } = controllaTutto(doc);
    const k = (s: string) => Object.entries(q).find(([x]) => x.endsWith(s))?.[1];
    expect(k("muri_contenimento.cls_mc")?.valore).toBeGreaterThan(5);
    expect(k("muri_contenimento.drenaggio_ml")?.valore).toBeCloseTo(8, 3);
    expect(Object.keys(q).some((x) => x.includes("fondazioni:cordolo.lunghezza_ml"))).toBe(true);
    const ver = verificaPianta(doc, "progetto:A");
    expect(ver.some((x) => x.codice === "contenimento")).toBe(true);
  });
});

describe("simulazione D · modifiche a catena sull'editor", () => {
  it("cambiare tipo, sistema e ante di un'apertura non rompe il documento", () => {
    let p = appartamento();
    const m = p.muri[0];
    const r = C.aggiungiApertura(p, m.id, "finestra", 120, { stato: "esistente" });
    p = r.pianta;
    const aid = r.id!;
    for (const campi of [
      { sistema: "scorrevole", manovra: "scorrevole", ante: 2 },
      { tipo: "porta" },               // una porta non può restare «scorrevole» di finestra: il sistema si adatta
      { sistema: "scorrevole_scomparsa", manovra: "scorrevole" },
      { tipo: "finestra" },            // la finestra non è a scomparsa: torna a battente
      { sistema: "anta_ribalta", manovra: "battente", ante: 1 },
      { sistema: "fisso", manovra: "nessuna" },
    ]) {
      p = C.modificaApertura(p, aid, campi as never);
      const doc = aPlanimetria(p);
      expect(validaPlanimetria(doc).ok).toBe(true);
      expect(() => daPlanimetria(doc)).not.toThrow();
    }
    const a = p.aperture.find((x) => x.id === aid)!;
    expect(a.sistema).toBe("fisso");
    expect(a.manovra).toBe("nessuna");
  });
});

describe("simulazione E · finestre con tapparelle, veneziane, persiane e scuri su due piani", () => {
  it("regge computo, abaco, esportazioni e 3D, e gli oscuranti sopravvivono al salvataggio", () => {
    let p = appartamento();
    const muroSopra = p.muri.find((m) => m.p1.y === m.p2.y && m.p1.y === Math.min(...p.muri.map((x) => x.p1.y)))!;
    const metti = (tipo: "finestra" | "portafinestra", t: number, campi: object) => {
      const r = C.aggiungiApertura(p, muroSopra.id, tipo, t, { stato: "nuovo" });
      p = r.pianta;
      if (r.id) p = C.modificaApertura(p, r.id, campi as never);
      return r.id!;
    };
    const f1 = metti("finestra", 70, { larghezza: 100, altezza: 140, davanzale: 90, oscurante: "tapparella", zanzariera: "laterale" });
    const f2 = metti("finestra", 190, { larghezza: 100, altezza: 140, davanzale: 90, oscurante: "tapparella", cassonetto: "a_filo", motore: true });
    const f3 = metti("portafinestra", 320, { larghezza: 120, altezza: 220, davanzale: 0, oscurante: "veneziana", cassonetto: "esterno", motore: true });
    const f4 = metti("finestra", 440, { larghezza: 90, altezza: 120, davanzale: 90, oscurante: "persiana", ante: 2 });
    const f5 = metti("finestra", 545, { larghezza: 90, altezza: 120, davanzale: 90, oscurante: "scuro", ante: 2, zanzariera: "plisse" });
    let doc = aPlanimetria(p);
    const l0 = doc.livelli[0].id;
    doc = aggiungiLivello(doc, { nome: "Primo piano", quota: 300, base: "identico", daLivelloId: l0 }).documento;
    const { q, s } = controllaTutto(doc);
    const v = (suffisso: string) => Object.entries(q).filter(([k]) => k.endsWith(suffisso)).reduce((t, [, x]) => t + x.valore, 0);
    // le finestre nuove stanno nella proposta del primo piano: 2 tapparelle, 1 veneziana, 1 persiana, 1 scuro
    expect(v("oscuranti:nuovo:tapparella.numero")).toBe(2);
    expect(v("oscuranti:nuovo:veneziana.numero")).toBe(1);
    expect(v("oscuranti:nuovo:persiana.numero")).toBe(1);
    expect(v("oscuranti:nuovo:scuro.numero")).toBe(1);
    expect(v("oscuranti:nuovo:motore.numero")).toBe(2);
    expect(v("cassonetti:nuovo:monoblocco.numero")).toBe(1);
    expect(v("cassonetti:nuovo:a_filo.numero")).toBe(1);
    expect(v("cassonetti:nuovo:esterno.numero")).toBe(1);
    expect(v("serramenti:nuovo:controtelaio_monoblocco.numero")).toBe(1);
    expect(v("zanzariere:nuovo:laterale.numero")).toBe(1);
    expect(v("zanzariere:nuovo:plisse.numero")).toBe(1);
    // il 3D del progetto ha un pezzo di oscurante per ogni finestra che ne ha
    const progetto = scenaEdificio(pianiDaPlanimetria(doc), { vista: "progetto" });
    expect(progetto.mesh.filter((m) => m.id.includes("oscurante:")).length).toBe(5);
    expect(progetto.mesh.filter((m) => m.id.includes("zanzariera:")).length).toBe(2);
    // l'abaco li elenca e il riepilogo da ordinare li somma
    const righe = abacoSerramenti(doc, l0, "progetto:A");
    expect(righe.filter((r) => r.oscurante !== "—")).toHaveLength(5);
    expect(csvSerramenti(righe)).toContain("Veneziana esterna");
    expect(riepilogoOscuranti(righe).length).toBeGreaterThan(4);
    // salvataggio e riapertura: niente si perde (nel documento e tornando all'editor)
    const idAperture = [f1, f2, f3, f4, f5];
    const salvate = doc.livelli[0].proposte[0].aperture;
    for (const aid of idAperture) expect(salvate.find((x) => x.id === aid)?.oscurante).toBeDefined();
    expect(salvate.find((x) => x.id === f3)).toMatchObject({ oscurante: "veneziana", cassonetto: "esterno", motore: true });
    const ripresa = daPlanimetria(doc);
    expect(ripresa.aperture.find((x) => x.id === f2)).toMatchObject({ oscurante: "tapparella", cassonetto: "a_filo", motore: true });
    // modifiche a catena: cambiare tipo e togliere l'oscurante pulisce cassonetto e motore
    let q2 = C.modificaApertura(p, f3, { oscurante: "persiana" });
    expect(q2.aperture.find((x) => x.id === f3)).toMatchObject({ oscurante: "persiana" });
    expect(q2.aperture.find((x) => x.id === f3)?.cassonetto).toBeUndefined();
    q2 = C.modificaApertura(q2, f3, { oscurante: undefined });
    expect(validaPlanimetria(aPlanimetria(q2)).ok).toBe(true);
  });
});
