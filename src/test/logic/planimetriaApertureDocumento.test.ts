import { describe, expect, it, vi } from "vitest";
import { generaPlanimetria, type RichiestaGenerazione } from "../../../supabase/functions/planimetria-genera/genera.ts";
import { costruisciPiani } from "../../../supabase/functions/planimetria-genera/costruisci.ts";
import { leggiRispostaAI } from "../../../supabase/functions/planimetria-genera/rispostaAI.ts";
import { applicaVerificaAperture, confrontaRilievoAperture } from "../../../supabase/functions/planimetria-genera/verificaAperture.ts";
import { rifiutaRenderStanza } from "../../../shared/render-planimetria/controlloRender.ts";

const ipotesi = {
  sistema: "immagine", leggibile: true,
  locali: [{ nome: "Soggiorno", contorno: [[100, 100], [600, 100], [600, 500], [100, 500]], superficie_scritta_mq: 20 }],
  aperture: [
    { tipo: "porta", da: [600, 200], a: [600, 280] },
    { tipo: "finestra", da: [100, 200], a: [100, 320] },
    { tipo: "finestra", da: [300, 100], a: [400, 100] }, // TV scambiato per finestra: geometricamente valida
  ],
  quote: [{ da: [100, 100], a: [600, 100], valore_m: 5 }, { da: [100, 100], a: [100, 500], valore_m: 4 }],
};
const richiesta: RichiestaGenerazione = { ingresso: "documento", file: { dataUrl: "data:image/png;base64,ORIGINALE", mime: "image/png", larghezza: 1000, altezza: 1000 } };
const pianta = () => costruisciPiani(leggiRispostaAI(ipotesi, "immagine"), { ingresso: "documento", larghezzaImmagine: 1000, altezzaImmagine: 1000 });
const verifiche = [
  { id: "a1", esito: "visibile", evidenza: "simbolo_porta" },
  { id: "a2", esito: "visibile", evidenza: "simbolo_finestra" },
  { id: "a3", esito: "assente", evidenza: "nessuna" },
];

describe("aperture confrontate con il documento originale", () => {
  it("toglie la falsa finestra sul muro senza spostare o ridimensionare quelle vere", async () => {
    const modello = vi.fn(async (messaggi, n) => {
      if (n === 3) {
        expect(messaggi).toHaveLength(2); // nessuna precedente risposta dell'AI
        expect(JSON.stringify(messaggi)).toContain("base64,ORIGINALE");
        expect(JSON.stringify(messaggi)).not.toContain('"da":[300,100]');
        expect(JSON.stringify(messaggi)).not.toContain('"id":"a1"');
        return { testo: JSON.stringify({ aperture: ipotesi.aperture.slice(0, 2).map((a) => ({ ...a, evidenza: a.tipo === "porta" ? "simbolo_porta" : "simbolo_finestra" })) }), modello: "revisore" };
      }
      return { testo: JSON.stringify(ipotesi), modello: "lettore" };
    });
    const esito = await generaPlanimetria(richiesta, modello);
    expect(modello.mock.calls.map((c) => c[1])).toEqual([1, 3]);
    if (esito.ok === false) throw new Error(esito.messaggio);
    expect(esito.pianta.planimetria.livelli[0].fatto.aperture).toEqual(pianta().planimetria.livelli[0].fatto.aperture.slice(0, 2));
    expect(esito.pianta.generazione.verifica_aperture).toEqual({ controllate: true, confermate: 2, escluse: 1, dubbie: 0 });
    expect(esito.pianta.generazione.avvisi.join(" ")).toContain("non è stata inserita");
    expect(esito.pianta.planimetria.letturaDocumento?.avvisiIniziali.join(" ")).toContain("non è stata inserita");
  });
  it("lo stesso numero di finestre non basta se il riscontro è su un'altra parete", () => {
    const g = pianta();
    const rilievo = { aperture: [{ tipo: "finestra", da: [300, 100], a: [400, 100], evidenza: "simbolo_finestra" }] };
    const out = applicaVerificaAperture(g, confrontaRilievoAperture(g, rilievo), true);
    expect(out.planimetria.livelli[0].fatto.aperture.map((a) => a.id)).toEqual(["a3"]);
  });
  it("accetta gli stipiti in ordine inverso ma non riusa un solo riscontro per due ipotesi", () => {
    const g = pianta();
    const reale = { ...ipotesi.aperture[1], da: ipotesi.aperture[1].a, a: ipotesi.aperture[1].da, evidenza: "simbolo_finestra" };
    expect(applicaVerificaAperture(g, confrontaRilievoAperture(g, { aperture: [reale] }), true).planimetria.livelli[0].fatto.aperture.map((a) => a.id)).toEqual(["a2"]);
    g.generazione.aperture_sorgente!.push({ ...g.generazione.aperture_sorgente![1], id: "duplicata" });
    expect(applicaVerificaAperture(g, confrontaRilievoAperture(g, { aperture: [reale] }), true).planimetria.livelli[0].fatto.aperture).toHaveLength(0);
    expect(confrontaRilievoAperture(g, { verifiche })).toBeNull();
  });
  it("un id omesso, duplicato o inventato non autorizza nuove aperture", () => {
    const g = pianta();
    const out = applicaVerificaAperture(g, { verifiche: [verifiche[0], verifiche[0], { id: "inventata", esito: "visibile", evidenza: "vano_interrotto" }] }, true);
    expect(out.planimetria.livelli[0].fatto.aperture).toHaveLength(0);
    expect(g.planimetria.livelli[0].fatto.aperture).toHaveLength(3);
  });
  it.each(["incerta", "true", true, null])("non conferma un esito ambiguo %s", (esito) => {
    expect(applicaVerificaAperture(pianta(), { verifiche: [{ id: "a1", esito, evidenza: "simbolo_porta" }] }, true).planimetria.livelli[0].fatto.aperture).toHaveLength(0);
  });
  it("non accetta un simbolo finestra come prova di una porta, né un sì senza evidenza", () => {
    const g = applicaVerificaAperture(pianta(), { verifiche: [{ ...verifiche[0], evidenza: "simbolo_finestra" }, { ...verifiche[1], evidenza: "nessuna" }] }, true);
    expect(g.planimetria.livelli[0].fatto.aperture).toHaveLength(0);
  });
  it("una portafinestra a battente può avere il simbolo di una porta: conferma solo il suo vano e il suo tipo", () => {
    const ap = { tipo: "portafinestra", da: [100, 200], a: [100, 310] };
    const g = costruisciPiani(leggiRispostaAI({ ...ipotesi, aperture: [ap] }, "immagine"), { ingresso: "documento", larghezzaImmagine: 1000, altezzaImmagine: 1000 });
    const riscontro = { aperture: [{ ...ap, evidenza: "simbolo_porta" }] };
    expect(applicaVerificaAperture(g, confrontaRilievoAperture(g, riscontro), true).planimetria.livelli[0].fatto.aperture).toEqual(g.planimetria.livelli[0].fatto.aperture);
    const altroTipo = { aperture: [{ ...ap, tipo: "porta", evidenza: "simbolo_porta" }] };
    expect(applicaVerificaAperture(g, confrontaRilievoAperture(g, altroTipo), true).planimetria.livelli[0].fatto.aperture).toHaveLength(0);
    expect(applicaVerificaAperture(g, { verifiche: [{ id: "a1", esito: "incerta", evidenza: "simbolo_porta" }] }, true).planimetria.livelli[0].fatto.aperture).toHaveLength(0);
  });
  it.each(["errore", "risposta malformata", "budget esaurito"])("%s: mantiene le stanze, senza inserire aperture non verificate", async (caso) => {
    let tempo = 0;
    const modello = vi.fn(async (_m, n) => {
      if (n === 3) { if (caso === "errore") throw new Error("provider 402"); return { testo: "non è JSON", modello: "revisore" }; }
      if (caso === "budget esaurito") tempo = 125_000;
      return { testo: JSON.stringify(ipotesi), modello: "lettore" };
    });
    const esito = await generaPlanimetria(richiesta, modello, { tempoMassimoMs: 140_000, ora: () => tempo });
    if (esito.ok === false) throw new Error(esito.messaggio);
    expect(esito.pianta.planimetria.livelli[0].fatto.locali).toHaveLength(1);
    expect(esito.pianta.planimetria.livelli[0].fatto.aperture).toHaveLength(0);
    expect(esito.pianta.generazione.verifica_aperture?.controllate).toBe(false);
    expect(esito.pianta.generazione.avvisi.join(" ")).toContain("controllo sul documento non è disponibile");
    expect(modello).toHaveBeenCalledTimes(caso === "budget esaurito" ? 1 : 2);
  });
  it("se il ripiego fallisce non richiama ancora lo stesso provider per la verifica", async () => {
    const modello = vi.fn(async (_m, n) => {
      if (n > 1) throw new Error("provider 402");
      return { testo: JSON.stringify({ ...ipotesi, locali: [{ ...ipotesi.locali[0], superficie_scritta_mq: 12 }] }), modello: "lettore" };
    });
    const esito = await generaPlanimetria(richiesta, modello);
    expect(esito.ok).toBe(true);
    expect(modello).toHaveBeenCalledTimes(2);
  });
  it("ogni piano conserva gli id e i segmenti del proprio foglio anche dopo il riordino dei livelli", () => {
    const r = leggiRispostaAI({ ...ipotesi,
      locali: [{ ...ipotesi.locali[0], piano: "Piano primo" }, { nome: "Bagno", contorno: [[100, 600], [300, 600], [300, 850], [100, 850]], piano: "Piano terra" }],
      aperture: [{ ...ipotesi.aperture[0], piano: "Piano primo" }, { tipo: "finestra", da: [150, 600], a: [220, 600], piano: "Piano terra" }],
    }, "immagine");
    const g = costruisciPiani(r, { ingresso: "documento", larghezzaImmagine: 1000, altezzaImmagine: 1000 });
    expect(g.generazione.aperture_sorgente?.map((a) => a.id)).toEqual(["a1", "p2-a1"]);
    const out = applicaVerificaAperture(g, { verifiche: [{ id: "p2-a1", esito: "visibile", evidenza: "simbolo_finestra" }] }, true);
    expect(out.planimetria.livelli.flatMap((l) => l.fatto.aperture.map((a) => a.id))).toEqual(["p2-a1"]);
  });
  it("un segmento oltre l'angolo non viene accorciato o trascinato dentro il muro", () => {
    const r = leggiRispostaAI({ ...ipotesi, aperture: [{ tipo: "finestra", da: [550, 100], a: [650, 100] }] }, "immagine");
    const g = costruisciPiani(r, { ingresso: "documento", larghezzaImmagine: 1000, altezzaImmagine: 1000 });
    expect(g.planimetria.livelli[0].fatto.aperture).toHaveLength(0);
    expect(g.generazione.aperture_da_rivedere).toBe(1);
  });
});

describe("il render da pianta non consegna aperture o materiali bocciati", () => {
  const contesto = { daPianta: true, materiali: true, da3D: true };
  it.each(["invented_openings", "plan_openings_mismatch", "geometry_change", "selected_material_mismatch", "unrequested_furniture"])("rifiuta %s anche quando manca il tempo per un retry", (category) => {
    expect(rifiutaRenderStanza({ checked: true, pass: false, issues: [{ category }] }, contesto)).toBe(true);
  });
  it("QA indisponibile o retry non verificato non diventa un successo", () => {
    expect(rifiutaRenderStanza(null, contesto)).toBe(true);
    expect(rifiutaRenderStanza({ checked: false, pass: true, issues: [] }, contesto)).toBe(true);
    expect(rifiutaRenderStanza({ checked: true, pass: true, issues: [] }, contesto)).toBe(false);
  });
  it("un pass contraddetto da un difetto strutturale non nasconde l'errore", () => {
    expect(rifiutaRenderStanza({ checked: true, pass: true, issues: [{ category: "invented_openings" }] }, contesto)).toBe(true);
  });
  it("anche fuori dalla pianta, un retry non verificato non cancella una bocciatura sui campioni", () => {
    expect(rifiutaRenderStanza({ checked: false, pass: true, issues: [] }, { daPianta: false, materiali: true, da3D: false }, true)).toBe(true);
  });
});
