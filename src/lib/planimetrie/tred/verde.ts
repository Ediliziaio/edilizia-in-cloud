import type { CostruttoreMesh } from "./costruttore";
import type { V3 } from "./tipi";

/** Numeri ripetibili: lo stesso albero nello stesso posto esce sempre uguale, due alberi vicini no. */
const generatore = (seme: number) => {
  let s = (Math.abs(Math.round(seme)) % 2147483646) + 1;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
};

type Fabbrica = (materiale: string) => CostruttoreMesh;

/**
 * Albero a chioma tonda: tronco che si assottiglia, due rami e una chioma fatta di più masse di due verdi.
 * `l` e `p` sono il diametro della chioma in pianta (il simbolo 2D), `h` l'altezza totale (0 = secondo la chioma).
 */
export function costruisciAlbero(l: number, p: number, h: number, centro: { x: number; z: number }, rotazione: number, fabbrica: Fabbrica): void {
  if (Math.min(l, p) <= 0) return;
  const rnd = generatore(centro.x * 913 + centro.z * 577 + l * 31);
  const c = Math.cos(rotazione), s = Math.sin(rotazione);
  const punto = (x: number, y: number, z: number): V3 => [centro.x + x * c - z * s, y, centro.z + x * s + z * c];
  const raggio = Math.min(l, p) / 2;
  const alto = h > 0 ? h : Math.max(3.2, raggio * 2.9);
  const fusto = Math.max(1.2, alto - raggio * 1.75);
  const corteccia = fabbrica("corteccia"), scure = fabbrica("fogliame"), chiare = fabbrica("fogliame_chiaro");
  const spessore = Math.max(.07, raggio * .09);
  corteccia.tubo([punto(0, 0, 0), punto(raggio * .03, fusto * .55, -raggio * .02), punto(-raggio * .02, fusto + raggio * .25, raggio * .02)], spessore, 9);
  for (const verso of [1, -1]) {
    const a = rnd() * Math.PI;
    corteccia.tubo([punto(0, fusto * .78, 0), punto(Math.cos(a) * raggio * .38 * verso, fusto + raggio * .32, Math.sin(a) * raggio * .38 * verso)], spessore * .55, 7);
  }
  // la massa centrale, poi le masse intorno: più basse e larghe sotto, una più piccola in cima
  const cuore = fusto + raggio * .78;
  scure.sfera(...punto(0, cuore, 0), raggio * .74, 4);
  const masse = 6;
  for (let i = 0; i < masse; i++) {
    const a = (i / masse) * Math.PI * 2 + rnd() * .5;
    const fuori = raggio * (.42 + rnd() * .14), r = raggio * (.44 + rnd() * .12);
    const y = cuore + raggio * (-.22 + rnd() * .34);
    (i % 2 ? chiare : scure).sfera(...punto(Math.cos(a) * fuori * (l / (raggio * 2)), y, Math.sin(a) * fuori * (p / (raggio * 2))), r, 3);
  }
  chiare.sfera(...punto(raggio * .08, cuore + raggio * .55, -raggio * .05), raggio * .46, 3);
}

/**
 * Siepe potata: il corpo squadrato con gli spigoli morbidi e, sopra e sui fianchi, i ciuffi dei getti nuovi,
 * così non sembra un muro verde.
 */
export function costruisciSiepe(l: number, p: number, h: number, centro: { x: number; z: number }, rotazione: number, fabbrica: Fabbrica): void {
  if (Math.min(l, p) <= 0) return;
  const alto = Math.max(h, .6);
  const rnd = generatore(centro.x * 733 + centro.z * 419 + l * 17);
  const c = Math.cos(rotazione), s = Math.sin(rotazione);
  const punto = (x: number, y: number, z: number): V3 => [centro.x + x * c - z * s, y, centro.z + x * s + z * c];
  const scure = fabbrica("fogliame"), chiare = fabbrica("fogliame_chiaro");
  scure.scatola(centro.x, centro.z, 0, l, p * .9, alto - p * .12, rotazione, 0, 0, 0, Math.min(p * .3, .12));
  const passo = Math.max(.28, p * .62), quanti = Math.max(1, Math.round(l / passo));
  for (let i = 0; i < quanti; i++) {
    const x = -l / 2 + (i + .5) * (l / quanti);
    const r = p * (.36 + rnd() * .1);
    (rnd() < .45 ? chiare : scure).sfera(...punto(x + (rnd() - .5) * passo * .3, alto - r * .62, (rnd() - .5) * p * .25), r, 2);
    if (i % 2 === 0) scure.sfera(...punto(x, alto * (.35 + rnd() * .3), (rnd() < .5 ? -1 : 1) * p * .3), p * .3, 2);
  }
}

/** Aiuola: cordolo in pietra, terra, cespugli bassi e macchie di fiori di tre colori. */
export function costruisciAiuola(l: number, p: number, centro: { x: number; z: number }, rotazione: number, fabbrica: Fabbrica): void {
  if (Math.min(l, p) <= 0) return;
  const rnd = generatore(centro.x * 311 + centro.z * 197 + l * 13);
  const c = Math.cos(rotazione), s = Math.sin(rotazione);
  const punto = (x: number, y: number, z: number): V3 => [centro.x + x * c - z * s, y, centro.z + x * s + z * c];
  fabbrica("pietra").scatola(centro.x, centro.z, 0, l, p, .16, rotazione, 0, 0, 0, .03);
  fabbrica("terra").scatola(centro.x, centro.z, .16, l - .14, p - .14, .03, rotazione);
  const verdi = fabbrica("fogliame"), chiari = fabbrica("fogliame_chiaro");
  const fiori = [fabbrica("fiore_rosa"), fabbrica("fiore_giallo"), fabbrica("fiore_bianco")];
  const quanti = Math.max(3, Math.round(l * p * 9));
  for (let i = 0; i < quanti; i++) {
    const x = (rnd() - .5) * (l - .34), z = (rnd() - .5) * (p - .34), r = .11 + rnd() * .09;
    (i % 3 ? verdi : chiari).sfera(...punto(x, .19 + r * .7, z), r, 2);
    if (i % 2 === 0) for (let k = 0; k < 3; k++) fiori[(i + k) % 3].sfera(...punto(x + (rnd() - .5) * r * 1.5, .19 + r * 1.45 + rnd() * .03, z + (rnd() - .5) * r * 1.5), .028, 2);
  }
}

/** Cancello a bacchette: pilastrini, telaio e tondini verticali; il carrabile ha due ante e i pilastri in muratura. */
export function costruisciCancello(l: number, p: number, h: number, centro: { x: number; z: number }, rotazione: number, fabbrica: Fabbrica, carrabile: boolean): void {
  if (l <= 0) return;
  const alto = Math.max(h, 1.2);
  const c = Math.cos(rotazione), s = Math.sin(rotazione);
  const ferro = fabbrica("grafite"), pilastri = fabbrica(carrabile ? "muro" : "grafite");
  const lato = carrabile ? .3 : .09;
  const a = (x: number) => ({ x: centro.x + x * c, z: centro.z + x * s });
  for (const verso of [-1, 1]) {
    const q = a(verso * (l / 2 + (carrabile ? lato / 2 : -lato / 2)));
    pilastri.scatola(q.x, q.z, 0, lato, lato, alto + (carrabile ? .25 : .08), rotazione);
    if (carrabile) fabbrica("pietra").scatola(q.x, q.z, alto + .25, lato + .08, lato + .08, .05, rotazione);
  }
  const luce = carrabile ? l : l - 2 * lato, ante = carrabile ? 2 : 1;
  for (let anta = 0; anta < ante; anta++) {
    const larga = luce / ante - .02, x0 = -luce / 2 + anta * (luce / ante) + .01;
    const mezzo = a(x0 + larga / 2);
    for (const quota of [.08, alto - .05]) ferro.scatola(mezzo.x, mezzo.z, quota, larga, .04, .04, rotazione);
    for (const x of [x0 + .02, x0 + larga - .02]) { const q = a(x); ferro.scatola(q.x, q.z, .08, .04, .04, alto - .09, rotazione); }
    const tondini = Math.max(2, Math.round(larga / .11));
    for (let i = 1; i < tondini; i++) { const q = a(x0 + (larga * i) / tondini); ferro.scatola(q.x, q.z, .1, .016, .016, alto - .14, rotazione); }
  }
}

/** Lampione da giardino: palo sottile, braccio corto e lanterna con il diffusore acceso. */
export function costruisciLampione(l: number, h: number, centro: { x: number; z: number }, fabbrica: Fabbrica): void {
  const alto = Math.max(h, 2.2), ferro = fabbrica("grafite");
  ferro.scatola(centro.x, centro.z, 0, .14, .14, .05, 0);
  ferro.tubo([[centro.x, .05, centro.z], [centro.x, alto - .34, centro.z]], .032, 8);
  ferro.scatola(centro.x, centro.z, alto - .34, Math.max(.2, l * .8), Math.max(.2, l * .8), .03, 0);
  fabbrica("luce_calda").sfera(centro.x, alto - .19, centro.z, .12, 3);
  ferro.scatola(centro.x, centro.z, alto - .06, Math.max(.24, l * .9), Math.max(.24, l * .9), .03, 0, 0, 0, 0, .02);
}
