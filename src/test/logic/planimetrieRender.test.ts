import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { riepilogoStanza, statoPerAmbito, vincoliDellaStanza } from "../../../shared/render-planimetria/vincoli.ts";
import { bloccoPartenza3D, bloccoPianta, inquadrateValide, righeQaPianta } from "../../../shared/render-planimetria/prompt.ts";
import { svgPiantaStanza } from "../../../shared/render-planimetria/piantaStanza.ts";

// Render AI dalla pianta (fase 5b): i vincoli che il render deve rispettare escono
// dalla pianta vera, con nomi stabili per porte e finestre.

const leggi = (nome: string): Planimetria =>
  JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi", nome), "utf8"));

const bilocale = leggi("bilocale.json");
const trilocale = leggi("trilocale.json");

describe("vincoliDellaStanza", () => {
  it("dà misure, pareti e aperture del bagno del bilocale", () => {
    const v = vincoliDellaStanza(bilocale, { livello_id: "pt", ambito: "fatto", locale_id: "l3" })!;
    expect(v).not.toBeNull();
    expect(v.locale.nome).toBe("Bagno");
    expect(v.locale.destinazione).toBe("bagno");
    expect(v.locale.rettangolare).toBe(true);
    expect(v.locale.stimata).toBe(false);
    expect(v.pareti).toHaveLength(4);
    // Il prodotto dei lati del rettangolo è la superficie.
    expect(v.locale.larghezza_cm * v.locale.profondita_cm / 10_000).toBeCloseTo(v.locale.superficie_mq, 1);
    expect(v.aperture.length).toBeGreaterThan(0);
    for (const a of v.aperture) {
      expect(a.parete).toBeGreaterThanOrEqual(1);
      expect(a.parete).toBeLessThanOrEqual(4);
      const parete = v.pareti[a.parete - 1];
      expect(a.da_inizio_parete_cm + a.larghezza_cm).toBeLessThanOrEqual(parete.lunghezza_cm + 1);
    }
  });

  it("numera porte e finestre per tipo, una sola volta ciascuna", () => {
    for (const id of ["l1", "l2", "l3"]) {
      const v = vincoliDellaStanza(bilocale, { livello_id: "pt", ambito: "fatto", locale_id: id })!;
      const etichette = v.aperture.map((a) => a.etichetta);
      expect(new Set(etichette).size).toBe(etichette.length);
      expect(new Set(v.aperture.map((a) => a.id)).size).toBe(v.aperture.length);
    }
  });

  it("ogni apertura del bilocale finisce in almeno una stanza", () => {
    const viste = new Set<string>();
    for (const id of ["l1", "l2", "l3"]) {
      for (const a of vincoliDellaStanza(bilocale, { livello_id: "pt", ambito: "fatto", locale_id: id })!.aperture) viste.add(a.id);
    }
    expect([...viste].sort()).toEqual(bilocale.livelli[0].fatto.aperture.map((a) => a.id).sort());
  });

  it("la prima parete è quella più in basso, e il giro è antiorario", () => {
    const v = vincoliDellaStanza(bilocale, { livello_id: "pt", ambito: "fatto", locale_id: "l1" })!;
    const yMedia = (i: number) => (v.pareti[i].da.y + v.pareti[i].a.y) / 2;
    for (let i = 1; i < v.pareti.length; i++) expect(yMedia(0)).toBeLessThanOrEqual(yMedia(i) + 0.5);
    let area = 0;
    for (let i = 0; i < v.contorno.length; i++) {
      const a = v.contorno[i], b = v.contorno[(i + 1) % v.contorno.length];
      area += a.x * b.y - b.x * a.y;
    }
    expect(area).toBeGreaterThan(0);
  });

  it("legge lo stato di progetto della proposta", () => {
    const ambito = `progetto:${trilocale.livelli[0].proposte[0].id}`;
    const stato = statoPerAmbito(trilocale, trilocale.livelli[0].id, ambito)!;
    expect(stato).not.toBeNull();
    const locale = stato.locali[0];
    const v = vincoliDellaStanza(trilocale, { livello_id: trilocale.livelli[0].id, ambito, locale_id: locale.id });
    expect(v?.locale.id).toBe(locale.id);
  });

  it("null per stanza, livello o ambito che non esistono", () => {
    expect(vincoliDellaStanza(bilocale, { livello_id: "pt", ambito: "fatto", locale_id: "nessuna" })).toBeNull();
    expect(vincoliDellaStanza(bilocale, { livello_id: "p9", ambito: "fatto", locale_id: "l1" })).toBeNull();
    expect(vincoliDellaStanza(bilocale, { livello_id: "pt", ambito: "progetto:Z", locale_id: "l1" })).toBeNull();
    expect(vincoliDellaStanza(bilocale, { livello_id: "pt", ambito: "altro", locale_id: "l1" })).toBeNull();
  });

  it("segna stimate le misure dedotte dall'AI", () => {
    const copia: Planimetria = JSON.parse(JSON.stringify(bilocale));
    copia.livelli[0].fatto.locali[2].origine = "stimata";
    const v = vincoliDellaStanza(copia, { livello_id: "pt", ambito: "fatto", locale_id: "l3" })!;
    expect(v.locale.stimata).toBe(true);
    expect(bloccoPianta(v, { partenza: "foto" })).toContain("approximately");
  });

  it("riepilogo in parole semplici", () => {
    const v = vincoliDellaStanza(bilocale, { livello_id: "pt", ambito: "fatto", locale_id: "l3" })!;
    const r = riepilogoStanza(v);
    expect(r).toMatch(/× \d+,\d\d m, alta 2,70 m/);
    expect(r).toMatch(/mq/);
  });
});

describe("prompt della pianta", () => {
  const v = vincoliDellaStanza(bilocale, { livello_id: "pt", ambito: "fatto", locale_id: "l1" })!;

  it("elenca tutte le aperture con il loro nome e la pianta allegata", () => {
    const testo = bloccoPianta(v, { partenza: "foto", immaginePianta: 3 });
    expect(testo).toContain("Image 3 is the floor plan");
    for (const a of v.aperture) expect(testo).toContain(a.label);
    expect(testo).toContain(`exactly ${v.aperture.length} opening`);
    expect(testo).not.toContain("approximately");
  });

  it("dalla vista 3D dice dove stanno nell'immagine le aperture inquadrate", () => {
    const a = v.aperture[0];
    const inquadrate = inquadrateValide(v, [
      { id: a.id, posizione: "sinistra", riquadro: { x0: 0.05, y0: 0.2, x1: 0.25, y1: 0.8 } },
      { id: "estranea", posizione: "centro", riquadro: { x0: 0.4, y0: 0.2, x1: 0.6, y1: 0.8 } },
      { id: a.id, posizione: "destra", riquadro: { x0: 0.7, y0: 0.2, x1: 0.9, y1: 0.8 } },
      { id: v.aperture[1]?.id, posizione: "centro", riquadro: { x0: 0.5, y0: 0.2, x1: 0.4, y1: 0.8 } },
    ]);
    expect(inquadrate).toHaveLength(1);
    const testo = bloccoPianta(v, { partenza: "vista_3d", inquadrate });
    expect(testo).toContain(`${a.label}, left: from 5% to 25% across`);
    expect(bloccoPartenza3D()).toContain("NOT a photograph");
    const qa = righeQaPianta(v, { partenza: "vista_3d", inquadrate }).join("\n");
    expect(qa).toContain("plan_openings_mismatch");
    expect(qa).toContain(a.label);
  });

  it("vista 3D senza aperture inquadrate: pareti piene", () => {
    expect(bloccoPianta(v, { partenza: "vista_3d", inquadrate: [] })).toContain("walls in the image must stay solid");
    expect(righeQaPianta(v, { partenza: "vista_3d", inquadrate: [] }).join("\n")).toContain("No opening is expected");
  });

  it("inquadrateValide scarta ciò che non è un elenco", () => {
    expect(inquadrateValide(v, null)).toEqual([]);
    expect(inquadrateValide(v, "x")).toEqual([]);
  });
});

describe("svgPiantaStanza", () => {
  it("disegna pareti numerate e nomi delle aperture", () => {
    const v = vincoliDellaStanza(bilocale, { livello_id: "pt", ambito: "fatto", locale_id: "l1" })!;
    const svg = svgPiantaStanza(v, { lato: 512 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="512"');
    for (const a of v.aperture) expect(svg).toContain(a.etichetta);
    expect(svgPiantaStanza(v, { lingua: "en" })).toContain(v.aperture[0].label);
    expect(svg.match(/<circle/g)).toHaveLength(v.pareti.length);
  });

  it("non lascia passare testo che rompe l'SVG", () => {
    const copia: Planimetria = JSON.parse(JSON.stringify(bilocale));
    copia.livelli[0].fatto.locali[0].nome = "Sala <grande> & \"bella\"";
    const v = vincoliDellaStanza(copia, { livello_id: "pt", ambito: "fatto", locale_id: "l1" })!;
    const svg = svgPiantaStanza(v);
    expect(svg).toContain("Sala &lt;grande&gt; &amp; &quot;bella&quot;");
  });
});
