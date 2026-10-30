import { describe, expect, it } from "vitest";
import { piantaVuota, quantitaLocale, contornoInterno, type Pianta } from "@/components/planimetrie/editor/adattatore";
import {
  aggiungiApertura,
  aggiungiParete,
  aggiungiStanza,
  aggiungiStanzaDaMisure,
  confermaMisura,
  confermaTutte,
  contaStimate,
  eliminaApertura,
  eliminaLocale,
  eliminaMuro,
  giraApertura,
  impostaLatoStanza,
  impostaLunghezzaParete,
  modificabile,
  rettangolo,
  spostaAngolo,
  spostaApertura,
  spostaParete,
  trattiScoperti,
  visibile,
} from "@/components/planimetrie/editor/comandi";
import { aggancia, muroPiuVicino } from "@/components/planimetrie/editor/geometria";
import { annulla, esegui, nuovaStoria, ripeti } from "@/components/planimetrie/editor/storia";
import { leggiDueMisure, leggiMisura, scriviMetri, scriviMq } from "@/components/planimetrie/editor/misure";

const arrotonda2 = (n: number) => Math.round(n * 100) / 100;

/** Bilocale: soggiorno 4×5 e camera 3×5 affiancati, assi dei muri da 10 cm. */
function bilocale(): Pianta {
  let p = piantaVuota();
  p = aggiungiStanza(p, rettangolo({ x: 0, y: 0 }, { x: 410, y: 510 }), { nome: "Soggiorno", destinazione: "soggiorno" }).pianta;
  p = aggiungiStanza(p, rettangolo({ x: 410, y: 0 }, { x: 720, y: 510 }), { nome: "Camera", destinazione: "camera" }).pianta;
  return p;
}

describe("misure scritte a mano", () => {
  it("legge metri, centimetri e la virgola italiana", () => {
    expect(leggiMisura("4,20")).toBe(420);
    expect(leggiMisura("4.2")).toBe(420);
    expect(leggiMisura("420")).toBe(420);
    expect(leggiMisura("90")).toBe(90);
    expect(leggiMisura("420 cm")).toBe(420);
    expect(leggiMisura("4,2 m")).toBe(420);
    expect(leggiMisura("4 m 20")).toBe(420);
    expect(leggiMisura("1200 mm")).toBe(120);
  });
  it("rifiuta quel che non è una misura", () => {
    expect(leggiMisura("")).toBeNull();
    expect(leggiMisura("ciao")).toBeNull();
    expect(leggiMisura("0")).toBeNull();
    expect(leggiMisura("-3")).toBeNull();
  });
  it("legge due misure per la stanza", () => {
    expect(leggiDueMisure("3,50 x 4")).toEqual([350, 400]);
    expect(leggiDueMisure("3.5 per 4,20")).toEqual([350, 420]);
    expect(leggiDueMisure("350×420")).toEqual([350, 420]);
    expect(leggiDueMisure("350")).toBeNull();
  });
  it("scrive all'italiana", () => {
    expect(scriviMetri(420)).toBe("4,20");
    expect(scriviMq(12.345)).toBe("12,35 mq");
  });
});

describe("stanze", () => {
  it("una stanza crea quattro pareti e misura il pavimento al netto dei muri", () => {
    const { pianta, id } = aggiungiStanza(piantaVuota(), rettangolo({ x: 0, y: 0 }, { x: 410, y: 510 }));
    expect(pianta.muri).toHaveLength(4);
    const q = quantitaLocale(pianta, pianta.locali.find((l) => l.id === id)!);
    // asse 410×510, muri da 10 → interno 400×500
    expect(arrotonda2(q.mq)).toBe(20);
    expect(arrotonda2(q.perimetro)).toBe(18);
    expect(q.lati.map(Math.round)).toEqual([400, 500, 400, 500]);
  });

  it("due stanze vicine non raddoppiano la parete in comune", () => {
    const p = bilocale();
    expect(p.muri).toHaveLength(7);
    const camera = p.locali.find((l) => l.nome === "Camera")!;
    expect(arrotonda2(quantitaLocale(p, camera).mq)).toBe(15);
  });

  it("la stanza a misure usa le misure interne", () => {
    const { pianta, id } = aggiungiStanzaDaMisure(piantaVuota(), 350, 400, { nome: "Bagno", destinazione: "bagno" });
    const l = pianta.locali.find((x) => x.id === id)!;
    expect(arrotonda2(quantitaLocale(pianta, l).mq)).toBe(14);
    expect(l.destinazione).toBe("bagno");
  });

  it("la seconda stanza a misure si mette accanto alla prima, con la parete in comune", () => {
    let p = aggiungiStanzaDaMisure(piantaVuota(), 400, 500).pianta;
    p = aggiungiStanzaDaMisure(p, 300, 500).pianta;
    expect(p.muri).toHaveLength(7);
    expect(p.locali.map((l) => arrotonda2(quantitaLocale(p, l).mq))).toEqual([20, 15]);
  });

  it("tratti scoperti: solo la parte di lato che non ha ancora una parete", () => {
    const p = aggiungiStanza(piantaVuota(), rettangolo({ x: 0, y: 0 }, { x: 300, y: 300 })).pianta;
    const tratti = trattiScoperti(p, { x: 300, y: -100 }, { x: 300, y: 400 });
    expect(tratti).toHaveLength(2);
    expect(tratti[0][1]).toEqual({ x: 300, y: 0 });
    expect(tratti[1][0]).toEqual({ x: 300, y: 300 });
  });

  it("contorno interno di una stanza a L", () => {
    const l = [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 300 },
      { x: 300, y: 300 },
      { x: 300, y: 600 },
      { x: 0, y: 600 },
    ];
    const { pianta, id } = aggiungiStanza(piantaVuota(), l);
    const loc = pianta.locali.find((x) => x.id === id)!;
    // asse: 600×300 + 300×300 = 27 mq; interno: (595-5)×(295-5) + (295-5)×(595-295) = 590·290 + 290·300
    expect(arrotonda2(quantitaLocale(pianta, loc).mq)).toBe(arrotonda2((590 * 290 + 290 * 300) / 10_000));
    expect(contornoInterno(pianta, loc)).toHaveLength(6);
  });

  it("eliminare una stanza toglie solo le pareti che non servono all'altra", () => {
    const p = bilocale();
    const camera = p.locali.find((l) => l.nome === "Camera")!;
    const dopo = eliminaLocale(p, camera.id);
    expect(dopo.locali).toHaveLength(1);
    expect(dopo.muri).toHaveLength(4);
  });
});

describe("pareti", () => {
  it("allungare un lato della stanza sposta la parete in fondo e la stanza resta dritta", () => {
    const p = aggiungiStanza(piantaVuota(), rettangolo({ x: 0, y: 0 }, { x: 410, y: 510 })).pianta;
    const loc = p.locali[0];
    const dopo = impostaLatoStanza(p, loc.id, 0, 420);
    const q = quantitaLocale(dopo, dopo.locali[0]);
    expect(q.lati.map(Math.round)).toEqual([420, 500, 420, 500]);
    expect(arrotonda2(q.mq)).toBe(21);
  });

  it("allungare la camera spinge anche la parete in comune? no: la camera si allarga verso l'esterno", () => {
    const p = bilocale();
    const camera = p.locali.find((l) => l.nome === "Camera")!;
    const dopo = impostaLatoStanza(p, camera.id, 0, 350);
    const sogg = dopo.locali.find((l) => l.nome === "Soggiorno")!;
    expect(arrotonda2(quantitaLocale(dopo, sogg).mq)).toBe(20);
    expect(arrotonda2(quantitaLocale(dopo, dopo.locali.find((l) => l.nome === "Camera")!).mq)).toBe(17.5);
  });

  it("allargare la camera sposta la sua parete esterna anche se il lato va verso il soggiorno", () => {
    const p = bilocale();
    const camera = p.locali.find((l) => l.nome === "Camera")!;
    // il lato 2 va da destra a sinistra (720 → 410): la fine è sulla parete in comune
    const dopo = impostaLatoStanza(p, camera.id, 2, 350);
    const q = (nome: string) => arrotonda2(quantitaLocale(dopo, dopo.locali.find((l) => l.nome === nome)!).mq);
    expect(q("Soggiorno")).toBe(20);
    expect(q("Camera")).toBe(17.5);
  });

  it("allargare il soggiorno non tocca la camera: si sposta la parete esterna", () => {
    const p = bilocale();
    const sogg = p.locali.find((l) => l.nome === "Soggiorno")!;
    const dopo = impostaLatoStanza(p, sogg.id, 0, 450);
    const q = (nome: string) => arrotonda2(quantitaLocale(dopo, dopo.locali.find((l) => l.nome === nome)!).mq);
    expect(q("Soggiorno")).toBe(22.5);
    expect(q("Camera")).toBe(15);
  });

  it("spostare una parete porta con sé le pareti collegate e gli angoli delle stanze", () => {
    const p = aggiungiStanza(piantaVuota(), rettangolo({ x: 0, y: 0 }, { x: 410, y: 510 })).pianta;
    const destra = p.muri.find((m) => m.p1.x === 410 && m.p2.x === 410)!;
    const dopo = spostaParete(p, destra.id, { x: 100, y: 0 });
    expect(arrotonda2(quantitaLocale(dopo, dopo.locali[0]).mq)).toBe(25);
    const sopra = dopo.muri.find((m) => m.p1.y === 0 && m.p2.y === 0)!;
    expect(Math.max(sopra.p1.x, sopra.p2.x)).toBe(510);
  });

  it("spostare una parete porta con sé quelle che continuano dritte sulla stessa linea", () => {
    // camera sopra, disimpegno sotto: la facciata a destra è fatta di due pareti in fila
    let p = aggiungiStanza(piantaVuota(), rettangolo({ x: 0, y: 0 }, { x: 300, y: 400 })).pianta;
    p = aggiungiStanza(p, rettangolo({ x: 0, y: 400 }, { x: 300, y: 600 })).pianta;
    const sopra = p.muri.find((m) => m.p1.x === 300 && m.p2.x === 300 && Math.max(m.p1.y, m.p2.y) === 400)!;
    const dopo = spostaParete(p, sopra.id, { x: 50, y: 0 });
    const destra = dopo.muri.filter((m) => m.p1.x === 350 && m.p2.x === 350);
    expect(destra).toHaveLength(2);
    expect(dopo.muri.every((m) => m.p1.x === m.p2.x || m.p1.y === m.p2.y)).toBe(true);
  });

  it("scrivere la lunghezza di una parete libera la allunga dalla fine", () => {
    const { pianta, id } = aggiungiParete(piantaVuota(), { x: 0, y: 0 }, { x: 300, y: 0 });
    const dopo = impostaLunghezzaParete(pianta, id!, 420);
    expect(dopo.muri[0].p2).toEqual({ x: 420, y: 0 });
  });

  it("una parete troppo corta non nasce", () => {
    const r = aggiungiParete(piantaVuota(), { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(r.id).toBeNull();
    expect(r.pianta.muri).toHaveLength(0);
  });

  it("trascinare un angolo muove tutte le pareti che ci arrivano", () => {
    let p = aggiungiParete(piantaVuota(), { x: 0, y: 0 }, { x: 300, y: 0 }).pianta;
    p = aggiungiParete(p, { x: 300, y: 0 }, { x: 300, y: 200 }).pianta;
    const dopo = spostaAngolo(p, { x: 300, y: 0 }, { x: 350, y: 0 });
    expect(dopo.muri[0].p2).toEqual({ x: 350, y: 0 });
    expect(dopo.muri[1].p1).toEqual({ x: 350, y: 0 });
  });
});

describe("porte e finestre", () => {
  it("una porta resta dentro la parete e si gira con un clic", () => {
    const { pianta, id } = aggiungiParete(piantaVuota(), { x: 0, y: 0 }, { x: 300, y: 0 });
    let r = aggiungiApertura(pianta, id!, "porta", 5);
    const porta = r.pianta.aperture[0];
    expect(porta.posizione).toBe(40); // metà della larghezza
    expect(porta.larghezza).toBe(80);
    let p = spostaApertura(r.pianta, porta.id, id!, 1000);
    expect(p.aperture[0].posizione).toBe(260);
    p = giraApertura(p, porta.id);
    expect(p.aperture[0].verso).toEqual({ cerniera: "fine", lato: "sinistra" });
    p = giraApertura(giraApertura(giraApertura(p, porta.id), porta.id), porta.id);
    expect(p.aperture[0].verso).toEqual({ cerniera: "inizio", lato: "sinistra" });
    r = aggiungiApertura(p, id!, "finestra", 150);
    expect(r.pianta.aperture[1].davanzale).toBe(90);
  });

  it("quando la parete si accorcia la porta resta nello stesso punto o rientra", () => {
    let { pianta, id } = aggiungiParete(piantaVuota(), { x: 0, y: 0 }, { x: 400, y: 0 });
    pianta = aggiungiApertura(pianta, id!, "porta", 100).pianta;
    // si sposta l'inizio della parete: la porta non deve muoversi nel disegno
    const dopo = spostaAngolo(pianta, { x: 0, y: 0 }, { x: 50, y: 0 });
    expect(dopo.aperture[0].posizione).toBe(50);
    const corta = impostaLunghezzaParete(dopo, id!, 100);
    expect(corta.aperture[0].posizione).toBe(50); // 100 - 80/2 = 60, ma il centro è a 50 → resta
    const cortissima = impostaLunghezzaParete(dopo, id!, 60);
    expect(cortissima.aperture[0].posizione).toBe(30); // più stretta della porta: al centro
  });

  it("il muro più vicino si trova anche cliccando sullo spessore", () => {
    const { pianta } = aggiungiParete(piantaVuota(), { x: 0, y: 0 }, { x: 300, y: 0 }, { spessore: 30 });
    expect(muroPiuVicino(pianta, { x: 100, y: 14 }, 5)?.t).toBe(100);
    expect(muroPiuVicino(pianta, { x: 100, y: 40 }, 5)).toBeNull();
  });
});

describe("stato di fatto e progetto", () => {
  it("nel progetto una parete esistente diventa da demolire, e un secondo clic la rimette", () => {
    const p = bilocale();
    const comune = p.muri.find((m) => m.p1.x === 410 && m.p2.x === 410)!;
    const conPorta = aggiungiApertura(p, comune.id, "porta", 200).pianta;
    const demolita = eliminaMuro(conPorta, comune.id, "progetto");
    expect(demolita.muri).toHaveLength(7);
    expect(demolita.muri.find((m) => m.id === comune.id)!.stato).toBe("da_demolire");
    expect(demolita.aperture[0].stato).toBe("da_demolire");
    const rimessa = eliminaMuro(demolita, comune.id, "progetto");
    expect(rimessa.muri.find((m) => m.id === comune.id)!.stato).toBe("esistente");
  });

  it("le pareti nuove nel progetto si cancellano davvero", () => {
    const r = aggiungiParete(bilocale(), { x: 0, y: 200 }, { x: 410, y: 200 }, { stato: "nuovo" });
    expect(eliminaMuro(r.pianta, r.id!, "progetto").muri).toHaveLength(7);
  });

  it("le cose nuove non si vedono nello stato di fatto, e nel progetto non si spostano le esistenti", () => {
    expect(visibile("nuovo", "fatto")).toBe(false);
    expect(visibile("da_demolire", "fatto")).toBe(true);
    expect(visibile("nuovo", "progetto")).toBe(true);
    expect(modificabile("esistente", "progetto")).toBe(false);
    expect(modificabile("nuovo", "progetto")).toBe(true);
    expect(modificabile("esistente", "fatto")).toBe(true);
  });

  it("una porta esistente nel progetto va da demolire", () => {
    const { pianta, id } = aggiungiParete(piantaVuota(), { x: 0, y: 0 }, { x: 300, y: 0 });
    const r = aggiungiApertura(pianta, id!, "porta", 100);
    expect(eliminaApertura(r.pianta, r.id!, "progetto").aperture[0].stato).toBe("da_demolire");
    expect(eliminaApertura(r.pianta, r.id!, "fatto").aperture).toHaveLength(0);
  });
});

describe("misure stimate", () => {
  it("si vedono come stimate e si confermano una per una o tutte insieme", () => {
    const r = aggiungiStanza(piantaVuota(), rettangolo({ x: 0, y: 0 }, { x: 410, y: 510 }), { origine: "stimata" });
    expect(contaStimate(r.pianta)).toBe(5);
    expect(quantitaLocale(r.pianta, r.pianta.locali[0]).stimata).toBe(true);
    const unaConfermata = confermaMisura(r.pianta, "muro", r.pianta.muri[0].id);
    expect(contaStimate(unaConfermata)).toBe(4);
    const tutte = confermaTutte(r.pianta);
    expect(contaStimate(tutte)).toBe(0);
    expect(quantitaLocale(tutte, tutte.locali[0]).stimata).toBe(false);
  });

  it("scrivere una misura la rende rilevata", () => {
    const r = aggiungiStanza(piantaVuota(), rettangolo({ x: 0, y: 0 }, { x: 410, y: 510 }), { origine: "stimata" });
    const dopo = impostaLatoStanza(r.pianta, r.id, 0, 400);
    expect(dopo.muri.filter((m) => m.origine === "rilevata")).toHaveLength(1);
  });
});

describe("aggancio del cursore", () => {
  const p = aggiungiStanza(piantaVuota(), rettangolo({ x: 0, y: 0 }, { x: 400, y: 300 })).pianta;

  it("si aggancia a un angolo vicino", () => {
    expect(aggancia(p, { x: 404, y: 296 }, { tolleranza: 10 })).toEqual({ punto: { x: 400, y: 300 }, guida: "angolo" });
  });
  it("si aggancia a una parete", () => {
    const a = aggancia(p, { x: 203, y: 6 }, { tolleranza: 10 });
    expect(a.guida).toBe("parete");
    expect(a.punto).toEqual({ x: 205, y: 0 });
  });
  it("una parete in corso va dritta a 90°", () => {
    const a = aggancia(p, { x: 700, y: 512 }, { tolleranza: 10, da: { x: 500, y: 500 } });
    expect(a.guida).toBe("dritto");
    expect(a.punto).toEqual({ x: 700, y: 500 });
  });
  it("andando dritti si ferma allineata con un angolo", () => {
    const a = aggancia(p, { x: 404, y: 700 }, { tolleranza: 10, da: { x: 404, y: 500 } });
    expect(a.punto.x).toBe(404);
    const b = aggancia(p, { x: 396, y: 505 }, { tolleranza: 10, da: { x: 600, y: 500 } });
    expect(b).toMatchObject({ punto: { x: 400, y: 500 }, guida: "allineato" });
  });
  it("altrimenti la griglia di 5 cm", () => {
    expect(aggancia(p, { x: 812, y: 913 }, { tolleranza: 10 })).toEqual({ punto: { x: 810, y: 915 }, guida: "griglia" });
  });
});

describe("annulla e ripeti", () => {
  it("torna indietro e avanti, e una modifica nuova cancella il ripeti", () => {
    const vuota = piantaVuota();
    let s = nuovaStoria(vuota);
    const uno = aggiungiParete(vuota, { x: 0, y: 0 }, { x: 100, y: 0 }).pianta;
    s = esegui(s, uno);
    const due = aggiungiParete(uno, { x: 100, y: 0 }, { x: 100, y: 100 }).pianta;
    s = esegui(s, due);
    s = annulla(s);
    expect(s.presente).toBe(uno);
    s = annulla(s);
    expect(s.presente).toBe(vuota);
    expect(annulla(s)).toBe(s);
    s = ripeti(s);
    expect(s.presente).toBe(uno);
    s = esegui(s, aggiungiParete(uno, { x: 0, y: 0 }, { x: 0, y: 100 }).pianta);
    expect(s.futuro).toHaveLength(0);
    expect(esegui(s, s.presente)).toBe(s);
  });
});
