import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { aPlanimetria, aggiungiLivello, daPlanimetria, piantaVuota } from "@/components/planimetrie/editor/adattatore";
import { aggiungiElemento, duplicaElemento, modificaElemento } from "@/components/planimetrie/editor/comandi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { vociDallaPianta } from "@/lib/planimetrie/listinoImpianti";
import { computoStudio, studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { accodaFoglioImpianti } from "@/lib/planimetrie/tavole";
import { costruisciScena, pianteDaPlanimetria, scenaEdificio } from "@/lib/planimetrie/tred";
import { ingombroDentroLocale } from "@/lib/planimetrie/tred/ingombroArredo";
import { puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import { nuovaPlanimetria, validaPlanimetria, type Locale, type Muro } from "../../../shared/planimetrie/modello.ts";
import { fasceRadianti, zoneRadianti } from "../../../shared/planimetrie/pavimentoRadiante.ts";
import { circuitiRadianti } from "../../../shared/planimetrie/circuitiRadianti.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";

const soggiorno: Locale = {
  id: "soggiorno", nome: "Soggiorno", destinazione: "soggiorno", altezza: 270, origine: "rilevata",
  contorno: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }],
};
const zona = { localeId: soggiorno.id, passoCm: 15, superficieEsclusaMq: 2 };

function progettoRadiante() {
  const doc = nuovaPlanimetria();
  const piano = doc.livelli[0];
  piano.fatto.locali = [structuredClone(soggiorno)];
  piano.proposte = [{ ...structuredClone(piano.fatto), id: "A", nome: "Radiante", pavimentoRadiante: [zona] }];
  return doc;
}

describe("pavimento radiante", () => {
  it("usa l'area netta con area esclusa e passo per calcolare le due voci stimate del computo", () => {
    const doc = progettoRadiante();
    const mappa = calcolaQuantita(doc);
    expect(mappa["fatto:impianti:radiante.superficie_mq"]).toBeUndefined();
    expect(mappa["progetto:A:impianti:radiante.superficie_mq"]).toMatchObject({ valore: 18, origine: "stimata", unita: "mq" });
    expect(mappa["progetto:A:impianti:radiante.tubo_ml"]).toMatchObject({ valore: 120, origine: "stimata", unita: "ml" });
    expect(vociDallaPianta(mappa, "progetto:A").map(p => [p.quantita, p.voce.prezzo])).toEqual([[18, null], [120, null]]);

    const righe = studioVariante(doc, "A").righe.filter(r => r.id.includes("-radiante-"));
    const bozza = computoStudio({ planimetriaId: "prova", versione: 1, varianteId: "A" }, "Prova radiante", righe);
    expect(bozza.voci[1]).toMatchObject({ quantita: "120", unita: "m", chiavePlanimetria: "progetto:A:locale:soggiorno.radiante_tubo_ml" });
    doc.livelli[0].fatto.pavimentoRadiante = [zona];
    expect(studioVariante(doc, "A").righe.filter(r => r.id.includes("-radiante-"))).toEqual([]);
  });

  it("aggancia il tratteggio a un contorno concavo e lascia libero l'incavo", () => {
    const contorno = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 350, y: 400 },
      { x: 350, y: 180 }, { x: 150, y: 180 }, { x: 150, y: 400 }, { x: 0, y: 400 }];
    const fasce = fasceRadianti(contorno, 15);
    expect(fasce.filter(([a]) => a.y > 180).length).toBeGreaterThan(10);
    for (const [a, b] of fasce) {
      expect(puntoNelPoligono({ x: (a.x + b.x) / 2, y: a.y }, contorno)).toBe(true);
      expect(a.y <= 180 || b.x <= 150 || a.x >= 350).toBe(true);
    }
  });

  it("salva e riapre la variante con valori distinti dal fatto, rimuove la zona e copia il piano tipo", () => {
    const doc = progettoRadiante();
    let p = daPlanimetria(doc);
    const prima = { ...zona, passoCm: 20 };
    p = { ...p, pavimentoRadiante: { fatto: [prima], progetto: [zona] } };
    const dopo = aPlanimetria(p, doc);
    expect(validaPlanimetria(dopo).ok).toBe(true);
    const riaperta = daPlanimetria(dopo);
    expect(riaperta.pavimentoRadiante).toEqual(p.pavimentoRadiante);
    const rimossa = aPlanimetria({ ...riaperta, pavimentoRadiante: { ...p.pavimentoRadiante, progetto: [] } }, dopo);
    expect(rimossa.livelli[0].proposte[0].pavimentoRadiante).toEqual([]);
    expect(rimossa.livelli[0].fatto.pavimentoRadiante).toEqual([prima]);
    const { documento, id } = aggiungiLivello(rimossa, { nome: "Piano tipo", quota: 320, base: "identico" });
    expect(validaPlanimetria(documento).ok).toBe(true);
    expect(documento.livelli[1].fatto.pavimentoRadiante?.[0].localeId).toBe(`soggiorno_${id}`);
  });

  it("rifiuta riferimenti inesistenti, duplicati, valori non validi ed esterni", () => {
    const doc = progettoRadiante();
    const p = doc.livelli[0].proposte[0];
    for (const zone of [[zona, zona], [{ ...zona, passoCm: 0 }], [{ ...zona, superficieEsclusaMq: -1 }], [{ ...zona, localeId: "altro" }]]) {
      p.pavimentoRadiante = zone;
      expect(validaPlanimetria(doc).ok).toBe(false);
    }
    p.pavimentoRadiante = [zona];
    p.locali[0].destinazione = "terrazzo";
    expect(validaPlanimetria(doc).ok).toBe(false);
    expect(zoneRadianti(p)).toEqual([]);
  });

  it("conserva i due locali di un open space quando si modifica soltanto l'impianto", () => {
    const doc = progettoRadiante();
    const { fatto, proposte: [pr] } = doc.livelli[0];
    const perimetro = [{ x: -10, y: -10 }, { x: 1010, y: -10 }, { x: 1010, y: 410 }, { x: -10, y: 410 }];
    const muri = perimetro.map((p1, i): Muro => ({
      id: `m${i}`, p1, p2: perimetro[(i + 1) % perimetro.length], spessore: 20, altezza: 270,
      tipo: "esterno", stato: "esistente", origine: "rilevata",
    }));
    const cucina: Locale = { ...soggiorno, id: "cucina", nome: "Cucina", destinazione: "cucina",
      contorno: soggiorno.contorno.map(p => ({ x: p.x + 500, y: p.y })) };
    fatto.muri = pr.muri = muri;
    fatto.locali = pr.locali = [soggiorno, cucina];
    pr.pavimentoRadiante = [];
    const precedente = daPlanimetria(doc);
    const dopo = aPlanimetria({ ...precedente, pavimentoRadiante: { progetto: [zona] } }, doc, "pt", "A", precedente);
    expect(dopo.livelli[0].proposte[0].locali).toEqual([soggiorno, cucina]);
    expect(calcolaQuantita(dopo)["progetto:A:impianti:radiante.superficie_mq"].valore).toBe(18);
    expect(validaPlanimetria(dopo).ok).toBe(true);
  });

  it("mostra lo stesso totale nel 3D e produce una tavola anche se ci sono solo zone radianti", async () => {
    const doc = progettoRadiante();
    const { progetto } = pianteDaPlanimetria(doc);
    expect(costruisciScena(progetto).mesh.some(m => m.id === "impianto:radiante")).toBe(false);
    const scena = costruisciScena(progetto, { impianti: true });
    expect(scena.mesh.find(m => m.id === "impianto:radiante")).toMatchObject({ materiale: "impianto_radiante", stratoEsploso: "impianti" });
    expect(scena.impianti).toEqual([expect.objectContaining({ linea: "radiante", superficieMq: 18, metri: 120 })]);
    const foglio = await accodaFoglioImpianti(null, doc.livelli[0].proposte[0], { intestazione: "Prova radiante" });
    expect(foglio?.punti).toBe(0);
    expect((await PDFDocument.load(foglio!.dati)).getPageCount()).toBe(1);
    expect(await accodaFoglioImpianti(null, doc.livelli[0].fatto, { intestazione: "Senza impianti" })).toBeNull();
  });

  it("somma metri e superfici delle zone quando il 3D mostra più piani", () => {
    const piante = pianteDaPlanimetria(progettoRadiante());
    const edificio = scenaEdificio([
      { id: "pt", nome: "Piano terra", quota: 0, piante },
      { id: "p1", nome: "Primo piano", quota: 300, piante },
    ], { vista: "progetto", impianti: true });
    expect(edificio.impianti).toEqual([expect.objectContaining({ linea: "radiante", superficieMq: 36, metri: 240 })]);
  });

  it("collega più locali allo stesso collettore e riporta i metri per circuito in 3D, computo e PDF", async () => {
    const doc = progettoRadiante();
    const p = doc.livelli[0].proposte[0];
    p.locali.push({ ...soggiorno, id: "bagno", nome: "Bagno", destinazione: "bagno",
      contorno: [{ x: 600, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 250 }, { x: 600, y: 250 }] });
    p.pavimentoRadiante = [zona, { localeId: "bagno", passoCm: 20, superficieEsclusaMq: 0 }];
    p.collettoreRadiante = { posizione: { x: 400, y: 160 }, quotaCm: 55, limiteCircuitoM: 90 };
    expect(validaPlanimetria(doc).ok).toBe(true);
    const circuiti = circuitiRadianti(p);
    expect(circuiti.filter(c => c.localeId === "soggiorno")).toHaveLength(2);
    expect(circuiti.filter(c => c.localeId === "bagno")).toHaveLength(1);
    expect(circuiti.reduce((s, c) => s + c.tuboAttivoM, 0)).toBeCloseTo(145);
    for (const c of circuiti) {
      expect(c.mandata[0]).toEqual(p.collettoreRadiante.posizione);
      expect(c.mandata.at(-1)).toEqual(c.serpentina[0]);
      expect(c.ritorno[0]).toEqual(c.serpentina.at(-1));
      expect(c.ritorno.at(-1)).toEqual(p.collettoreRadiante.posizione);
      expect(c.totaleM).toBeCloseTo(c.tuboAttivoM + c.mandataM + c.ritornoM);
      expect(c.superaObiettivo).toBe(false);
    }
    const metraggi = calcolaQuantita(doc);
    expect(metraggi["progetto:A:impianti:radiante.tubo_ml"].valore).toBeCloseTo(circuiti.reduce((s, c) => s + c.totaleM, 0), 4);
    expect(metraggi["progetto:A:impianti:radiante.collettori"].valore).toBe(1);
    const righe = studioVariante(doc, "A").righe.filter(r => r.id.includes("-radiante-circuito-"));
    expect(righe).toHaveLength(3);
    expect(righe[0].criterio).toContain("Mandata");
    expect(righe[0].quantita).toBe(Math.round(circuiti[0].totaleM * 100) / 100);

    const scena = costruisciScena(pianteDaPlanimetria(doc).progetto, { impianti: true });
    expect(scena.mesh.map(m => m.id)).toEqual(expect.arrayContaining(["impianto:radiante:mandata", "impianto:radiante:ritorno", "impianto:radiante:circuiti"]));
    expect(scena.impianti?.find(l => l.linea === "radiante")?.circuiti).toHaveLength(3);
    const fogli = await accodaFoglioImpianti(null, p, { intestazione: "Prova collettore" });
    expect((await PDFDocument.load(fogli!.dati)).getPageCount()).toBe(2);
  });

  it("aggiorna lo sviluppo quando cambia la quota del collettore e ripristina l’assenza con Annulla", () => {
    const modello = progettoRadiante();
    const prima = daPlanimetria(modello);
    const collettore = { posizione: { x: 250, y: 200 }, quotaCm: 55, limiteCircuitoM: 90 };
    const dopo = aPlanimetria({ ...prima, collettoriRadianti: { progetto: collettore } }, modello, "pt", "A", prima);
    const p = dopo.livelli[0].proposte[0];
    expect(daPlanimetria(dopo).collettoriRadianti?.progetto).toEqual(collettore);
    const orig = circuitiRadianti(p);
    const rialzato = circuitiRadianti({ ...p, collettoreRadiante: { ...collettore, quotaCm: 65 } });
    expect(rialzato).toHaveLength(orig.length);
    for (let i = 0; i < orig.length; i++) expect(rialzato[i].totaleM - orig[i].totaleM).toBeCloseTo(.2);
    const annulla = aPlanimetria(prima, dopo, "pt", "A", prima);
    expect(annulla.livelli[0].proposte[0].collettoreRadiante).toBeUndefined();
    expect(circuitiRadianti(annulla.livelli[0].proposte[0])).toEqual([]);
  });
});

describe("auto dettagliata nel catalogo", () => {
  it("posa e duplica la Highland in scala, mantiene la compatta nei progetti precedenti", () => {
    const auto = CATALOGO.find(a => a.tipo === "auto")!;
    const prima = aggiungiElemento(piantaVuota(), { ...auto, modello: "compatta", larghezza: 190, profondita: 400 }, { x: 0, y: 0 });
    const r = aggiungiElemento(prima.pianta, auto, { x: 0, y: -700 });
    const duplicata = duplicaElemento(r.pianta, r.id, "fatto");
    const doc = aPlanimetria(duplicata.pianta);
    expect(doc.livelli[0].fatto.elementi[0]).toMatchObject({ modello: "compatta", larghezza: 190, profondita: 400 });
    expect(doc.livelli[0].fatto.elementi[2]).toMatchObject({ modello: "highland", larghezza: 208.9, profondita: 472, altezza: 144 });
    const { fatto } = pianteDaPlanimetria(doc);
    const scena = costruisciScena(fatto);
    expect(scena.mesh.filter(m => m.auto?.modello === "highland")).toHaveLength(2);
    const rettangolo = [{ x: -100, y: -250 }, { x: 100, y: -250 }, { x: 100, y: 250 }, { x: -100, y: 250 }];
    const [compatta, highland] = doc.livelli[0].fatto.elementi;
    expect(ingombroDentroLocale({ ...highland, posizione: { x: 0, y: 0 } }, rettangolo)).toBe(false);
    expect(ingombroDentroLocale(compatta, rettangolo)).toBe(true);
    expect(validaPlanimetria(aPlanimetria(modificaElemento(r.pianta, r.id, { tipo: "scaffale" }))).ok).toBe(true);
  });
});
