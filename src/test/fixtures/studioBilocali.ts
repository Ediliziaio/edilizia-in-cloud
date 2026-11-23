import { distanza, ricostruisciLocali, puntoNelPoligono } from "../../../shared/planimetrie/geometria";
import { nuovaPlanimetria, statoVuoto, type Apertura, type Destinazione, type Muro, type Planimetria, type Punto } from "../../../shared/planimetrie/modello";

/** Piante dimostrative. Le quote e le finestre modellano due casi distinti di riuso. */
export function esempioBilocali(negozio = false): Planimetria {
  const larghezza = 1900, profondita = 1000, altezza = 280;
  const muro = (id: string, p1: Punto, p2: Punto, tipo: Muro["tipo"] = "tramezzo"): Muro => ({
    id, p1, p2, tipo, spessore: tipo === "esterno" ? 30 : 10, altezza, origine: "rilevata", stato: "esistente",
  });
  const muri = [
    muro("ingresso", { x: 0, y: 0 }, { x: larghezza, y: 0 }, "esterno"),
    muro("levante", { x: larghezza, y: 0 }, { x: larghezza, y: profondita }, "esterno"),
    muro("finestre", { x: 0, y: profondita }, { x: larghezza, y: profondita }, "esterno"),
    muro("ponente", { x: 0, y: 0 }, { x: 0, y: profondita }, "esterno"),
    ...(negozio ? [] : [
      muro("corridoio-oggi", { x: 0, y: 196 }, { x: larghezza, y: 196 }),
      muro("camera-uno", { x: 610, y: 196 }, { x: 610, y: profondita }),
      muro("camera-due", { x: 1060, y: 196 }, { x: 1060, y: profondita }),
      muro("studio-oggi", { x: 1430, y: 196 }, { x: 1430, y: profondita }),
      muro("bagno-oggi", { x: 1430, y: 465 }, { x: larghezza, y: 465 }),
    ]),
  ];
  const aperture: Apertura[] = [{ id: "accesso-principale", muroId: "ingresso", tipo: "porta", offset: 905,
    larghezza: 100, altezza: 220, davanzale: 0, manovra: "battente", verso: null, stato: "esistente", origine: "rilevata" }];
  for (const [i, x] of [155, 495, 810, 1133, 1440, 1768].entries()) {
    if (negozio && [1, 3].includes(i)) continue;
    aperture.push({ id: "f" + i, muroId: "finestre", tipo: "finestra", offset: x - 100, larghezza: 200, altezza: 150,
      davanzale: 90, manovra: "battente", verso: null, stato: "esistente", origine: "rilevata" });
  }
  const centri: Array<[Punto, string, Destinazione]> = negozio
    ? [[{ x: 600, y: 600 }, "Area di vendita", "altro"]]
    : [
      [{x: 180, y: 100}, "Ingresso e corridoio", "corridoio"],
      [{x: 300, y: 600}, "Soggiorno e cucina", "soggiorno"],
      [{x: 800, y: 600}, "Camera 1", "camera"],
      [{x: 1200, y: 600}, "Camera 2", "camera"],
      [{x: 1600, y: 600}, "Studio", "studio"],
      [{x: 1600, y: 300}, "Bagno", "bagno"],
    ];
  const facce = ricostruisciLocali(muri);
  const locali = centri.map(([p, nome, destinazione], i) => ({
    id: "locale-" + (i + 1), nome, destinazione, contorno: facce.find(f => puntoNelPoligono(p, f.contorno))!.contorno,
    altezza, origine: "rilevata" as const,
  }));
  const titolo = negozio ? "Milano · Locale commerciale da valutare" : "Milano · Quadrilocale per tre bilocali";
  return {
    ...nuovaPlanimetria(titolo),
    riferimenti: { note: "Caso dimostrativo. Pianta e aperture simulate, senza indirizzo o particella associati." },
    livelli: [{ id: "pt", nome: "Piano terra", quota: 0, fatto: { ...statoVuoto(), muri, aperture, locali }, proposte: [] }],
  };
}

export function esempioBilocaliIrregolare(tipo: "terrazzo" | "ingressi"): Planimetria {
  const doc = esempioBilocali();
  const piano = doc.livelli[0];
  const fatto = piano.fatto;
  const aElle = tipo === "terrazzo";
  const perimetro: Punto[] = aElle
    ? [{ x: 0, y: 0 }, { x: 1900, y: 0 }, { x: 1900, y: 900 }, { x: 1260, y: 900 }, { x: 1260, y: 1040 }, { x: 0, y: 1040 }]
    : [{ x: 0, y: 0 }, { x: 1900, y: 0 }, { x: 1900, y: 880 }, { x: 0, y: 1020 }];
  const esterni = perimetro.map((p1, i): Muro => ({
    ...fatto.muri[0], id: "facciata-" + i, p1, p2: perimetro[(i + 1) % perimetro.length],
  }));
  const altezzaInX = (x: number) => aElle ? (x < 1260 ? 1040 : 900) : 1020 - 140 * x / 1900;
  const interni = fatto.muri.slice(4).map(m => ({
    ...m, p2: m.p2.y === 1000 ? { x: m.p2.x, y: altezzaInX(m.p2.x) } : m.p2,
  }));
  const porta = { ...fatto.aperture[0], muroId: esterni[0].id };
  const ingressi = aElle ? [porta] : [
    { ...porta, id: "ingresso-ovest", offset: 345 }, { ...porta, id: "ingresso-est", offset: 1150 },
  ];
  const finestre = fatto.aperture.slice(1).map((a, i): Apertura => {
    const m = esterni[aElle ? i < 4 ? 4 : 2 : 2];
    const orizzontale = Math.abs(m.p2.x - m.p1.x);
    const posizione = Math.abs(m.p1.x - a.offset - a.larghezza / 2) / orizzontale * distanza(m.p1, m.p2);
    const sulTerrazzo = aElle && (i === 0 || i === 4);
    return {
      ...a, muroId: m.id, offset: posizione - a.larghezza / 2,
      ...(sulTerrazzo && { tipo: "portafinestra" as const, altezza: 230, davanzale: 0 }),
    };
  });
  const muri = [...esterni, ...interni];
  const facce = ricostruisciLocali(muri);
  const punti = [{ x: 180, y: 100 }, { x: 300, y: 600 }, { x: 800, y: 600 }, { x: 1200, y: 600 }, { x: 1600, y: 600 }, { x: 1600, y: 300 }];
  const locali = fatto.locali.map((l, i) => ({ ...l, contorno: facce.find(f => puntoNelPoligono(punti[i], f.contorno))!.contorno }));
  if (aElle) {
    locali.push(
      { id: "terrazzo-ovest", nome: "Terrazzo ovest", destinazione: "terrazzo", altezza: 280, origine: "rilevata", unita: "Originale",
        contorno: [{ x: 28, y: 1055 }, { x: 570, y: 1055 }, { x: 570, y: 1305 }, { x: 28, y: 1305 }], aperto: true },
      { id: "balcone-est", nome: "Balcone est", destinazione: "balcone", altezza: 280, origine: "rilevata", unita: "Originale",
        contorno: [{ x: 1320, y: 915 }, { x: 1880, y: 915 }, { x: 1880, y: 1040 }, { x: 1320, y: 1040 }], aperto: true },
    );
  }
  piano.fatto = { ...fatto, muri, locali, aperture: [...ingressi, ...finestre], elementi: aElle ? [
    { id: "pilastro-a", tipo: "pilastro", etichetta: "Pilastro esistente", posizione: { x: 195, y: 780 }, rotazione: 0, larghezza: 34, profondita: 32, origine: "rilevata" },
    { id: "colonna-a", tipo: "colonna_scarico", posizione: { x: 565, y: 270 }, rotazione: 0, larghezza: 16, profondita: 16, origine: "rilevata" },
  ] : [] };
  if (aElle) piano.fatto.aree = [{
    id: "corte", nome: "Corte d’ingresso", tipo: "pavimentato",
    contorno: [{ x: 740, y: -115 }, { x: 1165, y: -115 }, { x: 1165, y: -15 }, { x: 740, y: -15 }],
  }];
  doc.titolo = aElle ? "Milano · Pianta a L con terrazzo e balcone" : "Milano · Pianta obliqua con due ingressi";
  doc.riferimenti = { note: "Piantina dimostrativa con geometria e misure di prova." };
  return doc;
}
