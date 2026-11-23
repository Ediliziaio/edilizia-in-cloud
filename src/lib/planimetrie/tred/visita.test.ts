import { describe, expect, it } from "vitest";
import { scenaEdificio, type PianoPer3D } from "./edificio";
import { interpolaPercorso, luogoVisita, mappaVisita, percorsoSulPavimentoVisita, percorsoVisita, spostaVisita } from "./visita";
import type { ElementoPer3D, PiantaPer3D, V3 } from "./tipi";

function casa(tipoScala: ElementoPer3D["tipo"] = "scala") {
  const contorno = [{ x: 10, y: 10 }, { x: 590, y: 10 }, { x: 590, y: 590 }, { x: 10, y: 590 }];
  const lati = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }, { x: 0, y: 600 }];
  const pianta: PiantaPer3D = {
    muri: lati.map((a, i) => ({ id: `m${i}`, a, b: lati[(i + 1) % 4], spessore: 20, altezza: 280, stato: "esistente" })),
    aperture: [
      { id: "uscita", muroId: "m2", tipo: "portafinestra", posizione: 300, larghezza: 100, altezza: 210, davanzale: 0, stato: "esistente", ante: 2 },
      { id: "finestra", muroId: "m2", tipo: "finestra", posizione: 120, larghezza: 100, altezza: 130, davanzale: 90, stato: "esistente" },
    ],
    locali: [{ id: "ingresso", nome: "Ingresso", contorno, altezza: 280, destinazione: "ingresso" }],
    elementi: [{ id: "s1", tipo: tipoScala, centro: { x: 210, y: 300 }, larghezza: tipoScala === "scala" ? 110 : 190, profondita: tipoScala === "scala_chiocciola" ? 190 : 320, rotazione: 0 }],
  };
  const sopra: PiantaPer3D = { ...pianta, elementi: [], aperture: [], locali: [{ ...pianta.locali[0], id: "sopra", nome: "Disimpegno" }] };
  const piani: PianoPer3D[] = [
    { id: "pt", nome: "Piano terra", quota: 0, piante: { fatto: pianta, progetto: pianta } },
    { id: "p1", nome: "Primo piano", quota: 300, piante: { fatto: sopra, progetto: sopra } },
  ];
  return piani;
}

const scena = (piani: PianoPer3D[]) => scenaEdificio(piani, { soffitto: true, passaggiAperti: true, terreno: 4 });

describe("visita 3D", () => {
  it.each(["scala", "scala_u", "scala_chiocciola"])("sale e scende dalla %s lungo i gradini disegnati", (tipo) => {
    const piani = casa(tipo);
    const mappa = mappaVisita(piani, "progetto", scena(piani));
    const salita = mappa.passaggi.find(a => a.tipo === "sali")!;
    const discesa = mappa.passaggi.find(a => a.tipo === "scendi")!;
    expect(salita.da.pianoId).toBe("pt");
    expect(salita.a.pianoId).toBe("p1");
    expect(salita.a.piedi[1]).toBeCloseTo(3);
    expect(discesa.punti).toEqual([...salita.punti].reverse());
    expect(salita.punti.every((p, i) => i === 0 || p[1] >= salita.punti[i - 1][1] - .001)).toBe(true);
    const percorso = interpolaPercorso(percorsoVisita(mappa, salita.da, salita)!);
    expect(percorso.punto(percorso.metri / 2)[1]).toBeGreaterThan(.4);
    expect(percorso.punto(percorso.metri)).toEqual(salita.a.piedi);
  });

  it("riconosce ingresso ed esterno oltre la portafinestra e blocca il passaggio attraverso una finestra", () => {
    const piani = casa(), modello = scena(piani);
    const mappa = mappaVisita(piani, "progetto", modello);
    const esci = mappa.passaggi.find(a => a.tipo === "esci")!, entra = mappa.passaggi.find(a => a.tipo === "entra")!;
    expect(luogoVisita(mappa, esci.da)?.nome).toBe("Ingresso");
    expect(luogoVisita(mappa, entra.da)).toMatchObject({ nome: "Esterno", esterno: true });
    expect(percorsoVisita(mappa, esci.da, esci)).not.toBeNull();
    expect(esci.a.piedi[2]).toBeGreaterThan(6);
    expect(spostaVisita(mappa, { pianoId: "pt", piedi: [4.8, 0, 5.85] }, 0, .25)).toBeNull();
    expect(modello.mesh.some(m => m.id.endsWith("/soglia:uscita"))).toBe(true);
    expect(modello.mesh.some(m => m.id.endsWith("/vetro:uscita"))).toBe(false);
    expect(scenaEdificio(piani).mesh.some(m => m.id.endsWith("/vetro:uscita"))).toBe(true);
  });

  it("evita il vuoto e tiene distinti i piani se manca il pavimento di arrivo", () => {
    const piani = casa();
    piani[1].piante.progetto = { ...piani[1].piante.progetto, locali: [] };
    const mappa = mappaVisita(piani, "progetto", scena(piani));
    expect(mappa.passaggi.some(p => p.tipo === "sali")).toBe(false);
    expect(spostaVisita(mappa, { pianoId: "p1", piedi: [2, 3, 2] as V3 }, .2, 0)).toBeNull();
    const esci = mappa.passaggi.find(p => p.tipo === "esci")!;
    expect(percorsoVisita(mappa, { pianoId: "pt", piedi: [1, 0, 1] }, esci)).toBeNull();
  });

  it("in visita conserva il vetro fisso a tutta altezza ed esclude la soglia percorribile", () => {
    const piani = casa();
    piani[0].piante.progetto.aperture[0].fisso = true;
    const modello = scena(piani);
    expect(modello.mesh.some(m => m.id.endsWith("/vetro:uscita"))).toBe(true);
    expect(modello.mesh.some(m => m.id.endsWith("/soglia:uscita"))).toBe(false);
    expect(mappaVisita(piani, "progetto", modello).passaggi.some(p => p.tipo === "esci")).toBe(false);
  });

  it("blocca un’apertura da tamponare in progetto e la rende percorribile nello stato di fatto", () => {
    const piani = casa();
    const base = piani[0].piante.fatto;
    const tamponata: PiantaPer3D = { ...base, aperture: base.aperture.map(a => a.id === "uscita" ? { ...a, stato: "demolire" } : a) };
    piani[0].piante = { fatto: tamponata, progetto: tamponata };
    expect(mappaVisita(piani, "progetto", scena(piani)).passaggi.some(p => p.tipo === "esci")).toBe(false);
    expect(mappaVisita(piani, "fatto", scenaEdificio(piani, { vista: "fatto", passaggiAperti: true, terreno: 4 })).passaggi.some(p => p.tipo === "esci")).toBe(true);
  });

  it("raggiunge il pavimento cliccato passando dalla portafinestra, non dalle finestre o da un altro piano", () => {
    const piani = casa();
    const mappa = mappaVisita(piani, "progetto", scena(piani));
    const esci = mappa.passaggi.find(p => p.tipo === "esci")!;
    const percorso = percorsoSulPavimentoVisita(mappa, esci.da, esci.a.piedi)!;
    expect(percorso[0]).toEqual(esci.da.piedi);
    expect(percorso.at(-1)).toEqual(esci.a.piedi);
    expect(percorsoSulPavimentoVisita(mappa, { pianoId: "pt", piedi: [4.8, 0, 5] }, [4.8, 0, 7])).toBeNull();
    expect(percorsoSulPavimentoVisita(mappa, esci.da, [3, 3, 4])).toBeNull();
  });

  it("si ferma davanti a un divano, passa sopra il tappeto e sceglie una partenza libera", () => {
    const piani = casa();
    const base = piani[0].piante.progetto;
    const posizioneIniziale = mappaVisita(piani, "progetto", scena(piani)).partenza[0].posizione.piedi;
    base.elementi.push(
      { id: "divano", tipo: "divano", centro: { x: 380, y: 360 }, larghezza: 200, profondita: 90, rotazione: 0 },
      { id: "tappeto", tipo: "tappeto", centro: { x: 380, y: 285 }, larghezza: 240, profondita: 150, rotazione: 0 },
      { id: "poltrona", tipo: "poltrona", centro: { x: posizioneIniziale[0] * 100, y: posizioneIniziale[2] * 100 },
        larghezza: 80, profondita: 80, rotazione: 0 },
    );
    const mappa = mappaVisita(piani, "progetto", scena(piani));
    expect(mappa.partenza[0].posizione.piedi).not.toEqual(posizioneIniziale);
    const sulTappeto = { pianoId: "pt", piedi: [3.8, 0, 2.85] as V3 };
    expect(spostaVisita(mappa, sulTappeto, 0, .10)?.piedi[2]).toBeCloseTo(2.95);
    expect(spostaVisita(mappa, sulTappeto, 0, .22)).toBeNull();
    expect(percorsoSulPavimentoVisita(mappa, sulTappeto, [3.8, 0, 4.3])).toBeNull();
  });
});
