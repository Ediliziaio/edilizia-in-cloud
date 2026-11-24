/**
 * Trilocale generato dal vivo il 24/11/2026 da «Trilocale di 85 mq con ingresso, soggiorno,
 * cucina abitabile, due camere, due bagni e un ripostiglio»: il bagno 1 e la camera 2 hanno
 * la porta verso uno spazio che il modello non ha disegnato (l'angolo in basso a sinistra è
 * vuoto), il ripostiglio non ha porte. Caso reale per il riparatore degli accessi.
 */
import type { Planimetria } from "../../../shared/planimetrie/modello";

const MURI: [string, number, number, number, number, string, number][] = [["m1",-15,1410,882.4,1410,"esterno",30],["m2",253.5,1410,253.5,210,"tramezzo",8],["m3",-15,1190,253.5,1190,"tramezzo",10],["m4",-15,1410,-15,587.5,"esterno",30],["m5",512.2,1410,512.2,0,"tramezzo",10],["m6",-15,587.5,512.2,587.5,"tramezzo",8],["m7",882.4,1410,882.4,0,"esterno",30],["m8",512.2,1040,882.4,1040,"tramezzo",10],["m9",512.2,630,882.4,630,"tramezzo",10],["m10",253.5,330,512.2,330,"tramezzo",10],["m11",512.2,370,882.4,370,"tramezzo",10],["m12",512.2,0,882.4,0,"esterno",30],["m13",253.5,210,512.2,210,"esterno",30]];
const APERTURE: [string, string, string, number, number][] = [["a1","porta","m1",140,90],["a2","porta","m3",140,80],["a3","porta","m2",115,80],["a4","porta","m5",165,80],["a5","porta","m5",520,80],["a6","porta","m2",925,80],["a7","porta","m5",880,80],["a8","porta","m5",1195,80],["a9","finestra","m4",425,120],["a10","finestra","m1",685,120],["a11","finestra","m7",525,120],["a12","finestra","m7",885,70],["a13","finestra","m7",1195,120]];
const LOCALI: [string, string, string, [number, number][]][] = [["l1","Ingresso","ingresso",[[0,1395],[249.5,1395],[249.5,1195],[0,1195]]],["l2","Disimpegno","disimpegno",[[257.5,1395],[507.2,1395],[507.2,591.5],[257.5,591.5],[257.5,1195]]],["l3","Soggiorno","soggiorno",[[0,1185],[249.5,1185],[249.5,591.5],[0,591.5]]],["l4","Cucina","cucina",[[517.2,1395],[867.4,1395],[867.4,1045],[517.2,1045]]],["l5","Camera 1","camera",[[517.2,1035],[867.4,1035],[867.4,635],[517.2,635]]],["l6","Bagno 1","bagno",[[257.5,583.5],[507.2,583.5],[507.2,335],[257.5,335]]],["l7","Bagno 2","bagno",[[517.2,625],[867.4,625],[867.4,375],[517.2,375]]],["l8","Camera 2","camera",[[517.2,365],[867.4,365],[867.4,15],[517.2,15]]],["l9","Ripostiglio","ripostiglio",[[257.5,325],[507.2,325],[507.2,225],[257.5,225]]]];

export const piantaAiTrilocaleIsolato = (): Planimetria => ({
  schema: 1, titolo: "Trilocale da descrizione", unita: "cm",
  livelli: [{ id: "pt", nome: "Piano", quota: 0, proposte: [], fatto: {
    muri: MURI.map(([id, x1, y1, x2, y2, tipo, spessore]) => ({ id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, tipo, spessore, altezza: 270, stato: "esistente", origine: "stimata" })),
    aperture: APERTURE.map(([id, tipo, muroId, offset, larghezza]) => ({ id, tipo, muroId, offset, larghezza, altezza: tipo === "finestra" ? 140 : 210, davanzale: tipo === "finestra" ? 90 : 0, manovra: "battente", stato: "esistente", origine: "stimata" })),
    locali: LOCALI.map(([id, nome, destinazione, contorno]) => ({ id, nome, destinazione, altezza: 270, origine: "stimata", contorno: contorno.map(([x, y]) => ({ x, y })) })),
    elementi: [] as unknown[], quote: [] as unknown[], testi: [] as unknown[],
  } }],
}) as unknown as Planimetria;
