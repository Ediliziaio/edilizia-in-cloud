import { intersezioneAssi, sulTratto } from "../../../../shared/planimetrie/geometria.ts";
import type { Muro, Pianta, Punto } from "./adattatore";
import { direzione, dist, lunghezzaMuro, proiettaSuMuro } from "./geometria";

export interface InterferenzaTramezzo {
  punto: Punto;
  testo: string;
}

/** Sposta il tramezzo nuovo e fa scorrere i capi sugli appoggi, mantenendo gli assi di riferimento. */
export function traslaTramezzo(pianta: Pianta, muro: Muro, delta: Punto): { pianta: Pianta; dopo: Muro; interferenze: InterferenzaTramezzo[] } {
  const altri = pianta.muri.filter(m => m.id !== muro.id && m.stato !== "da_demolire");
  const sposta = (p: Punto) => ({ x: p.x + delta.x, y: p.y + delta.y });
  const asse = { p1: sposta(muro.p1), p2: sposta(muro.p2) };
  const dopo: Muro = { ...muro, ...asse };
  const interferenze: InterferenzaTramezzo[] = [];
  const appoggi = new Set<string>();
  for (const estremo of ["p1", "p2"] as const) {
    const contatti = altri.filter(m => {
      const i = intersezioneAssi(muro, m);
      return i && sulTratto(i.tB, m) && dist(i.punto, muro[estremo]) <= 1;
    });
    if (!contatti.length) continue;
    const collegamenti = contatti.map(m => ({ m, i: intersezioneAssi(asse, m) }));
    const primo = collegamenti[0].i;
    if (!primo || collegamenti.some(({ m, i }) => !i || !sulTratto(i.tB, m) || dist(i.punto, primo.punto) > 1)) {
      throw new Error("Con questo spostamento il tramezzo perde un appoggio. Scegli una distanza diversa.");
    }
    dopo[estremo] = primo.punto;
    for (const { m } of collegamenti) {
      appoggi.add(m.id);
      const t = proiettaSuMuro(primo.punto, m).t;
      const vano = pianta.aperture.find(a => a.muroId === m.id && a.stato !== "da_demolire" &&
        Math.abs(a.posizione - t) <= a.larghezza / 2 + muro.spessore / 2);
      if (vano) interferenze.push({ punto: primo.punto,
        testo: `Il tramezzo interferisce con ${vano.tipo === "varco" ? "un varco" : vano.tipo === "porta" ? "una porta" : "un serramento"} sulla parete di appoggio.` });
    }
  }
  const lunghezza = lunghezzaMuro(dopo);
  const u = direzione(muro);
  if (lunghezza < 5 || (dopo.p2.x - dopo.p1.x) * u.x + (dopo.p2.y - dopo.p1.y) * u.y <= 0) {
    throw new Error("Lo spostamento non lascia un tratto utilizzabile fra gli appoggi.");
  }

  for (const m of altri) {
    if (appoggi.has(m.id)) continue;
    const incrocio = intersezioneAssi(dopo, m);
    if (incrocio && sulTratto(incrocio.tA, dopo) && sulTratto(incrocio.tB, m)) {
      interferenze.push({ punto: incrocio.punto, testo: "Il nuovo tracciato incontra un’altra parete." });
      continue;
    }
    const prima = intersezioneAssi(muro, m);
    if (prima && prima.tA > 0 && prima.tA < 1 && sulTratto(prima.tB, m)) {
      interferenze.push({ punto: prima.punto, testo: "Il tramezzo è collegato a un’altra parete sul tratto da spostare." });
      continue;
    }
    const p = proiettaSuMuro(m.p1, dopo), q = proiettaSuMuro(m.p2, dopo);
    const spessore = (m.spessore + muro.spessore) / 2;
    if (Math.max(p.distanza, q.distanza) < spessore && Math.abs(p.t - q.t) > 1) {
      interferenze.push({ punto: p.punto, testo: "Il nuovo tracciato si sovrappone a un’altra parete." });
    }
  }

  const avanzamento = proiettaSuMuro(asse.p1, dopo).tLibero;
  const aperture = pianta.aperture.map(a => {
    if (a.muroId !== muro.id) return a;
    const posizione = a.posizione + avanzamento;
    if (posizione - a.larghezza / 2 < -0.02 || posizione + a.larghezza / 2 > lunghezza + 0.02) {
      throw new Error("Il nuovo tratto è troppo corto per un’apertura del tramezzo.");
    }
    return { ...a, posizione };
  });
  return { pianta: { ...pianta, muri: pianta.muri.map(m => m.id === muro.id ? dopo : m), aperture }, dopo, interferenze };
}
