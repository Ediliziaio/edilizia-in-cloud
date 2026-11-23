import type { CostruttoreMesh } from "./costruttore";
import type { V3 } from "./tipi";

type Posa = { x: number; z: number };
type Fabbrica = (materiale: string) => CostruttoreMesh;

function riferimento(centro: Posa, rotazione: number) {
  const cos = Math.cos(rotazione), sin = Math.sin(rotazione);
  const vettore = (x: number, y: number, z: number): V3 => [x * cos - z * sin, y, x * sin + z * cos];
  const punto = (x: number, y: number, z: number): V3 => {
    const v = vettore(x, y, z);
    return [v[0] + centro.x, v[1], v[2] + centro.z];
  };
  return { punto, vettore };
}

export function costruisciTenda(centro: Posa, r: number, l: number, p: number, h: number, chiusa: boolean, fabbrica: Fabbrica) {
  if (h <= 0) return;
  const { punto, vettore } = riferimento(centro, r);
  const guida = Math.min(.026, p * .35, h * .16);
  fabbrica("telaio").scatola(centro.x, centro.z, h - guida, l, guida, guida, r, 0, 0, 0, guida * .15);
  const tessuto = fabbrica("lino_tenda");
  const larghezza = l * (chiusa ? .497 : .21), ampiezza = Math.min(.045, p * .37);
  const onde = Math.max(3, Math.min(18, Math.round(larghezza / .105)));
  const corsa = h - guida - Math.min(.028, h * .075);
  const passi = onde * 10, fasce = 12;
  for (const lato of [-1, 1]) {
    const inizio = lato < 0 ? -l / 2 : l / 2 - larghezza;
    const vertice = (i: number, j: number): [V3, V3] => {
      const u = i / passi, v = j / fasce, fase = 2 * Math.PI * onde * u + .21 * v;
      const amp = ampiezza * (.47 + .53 * v);
      const norm = vettore(-amp * Math.cos(fase) * 2 * Math.PI * onde / larghezza, 0, 1);
      const modulo = Math.hypot(...norm);
      return [
        punto(inizio + u * larghezza, h - guida - corsa * v, amp * Math.sin(fase)),
        [norm[0] / modulo, 0, norm[2] / modulo],
      ];
    };
    for (let j = 0; j < fasce; j++) for (let i = 0; i < passi; i++) {
      const [a, na] = vertice(i, j), [b, nb] = vertice(i + 1, j);
      const [c, nc] = vertice(i + 1, j + 1), [d, nd] = vertice(i, j + 1);
      tessuto.quadLiscio([a, b, c, d], [na, nb, nc, nd]);
    }
  }
}

export function costruisciQuadro(centro: Posa, r: number, l: number, p: number, h: number, salvia: boolean, fabbrica: Fabbrica) {
  if (h <= 0) return;
  const { punto, vettore } = riferimento(centro, r);
  const altezza = Math.min(l * .89, h * .62), base = h - altezza;
  const cornice = Math.min(.019, Math.min(l, altezza) * .075);
  fabbrica("rovere_chiaro").scatola(centro.x, centro.z, base, l, p * .85, altezza, r, 0, -p * .075, 0, cornice * .27);
  const tela = fabbrica("carta");
  tela.scatola(centro.x, centro.z, base + cornice, l - 2 * cornice, p * .09, altezza - 2 * cornice, r, 0, p * .368);
  const colore = (mat: string, x: number, y: number, rx: number, ry: number, strato: number) => {
    const perimetro = Array.from({ length: 48 }, (_, i) => {
      const a = i / 48 * 2 * Math.PI;
      return punto(l * (x + rx * Math.cos(a)), base + altezza * (y + ry * Math.sin(a)), p * strato);
    });
    fabbrica(mat).poligono(perimetro, vettore(0, 0, 1));
  };
  colore(salvia ? "libro_verde" : "libro_ruggine", -.15, .51, .26, .35, .427);
  colore(salvia ? "libro_tela" : "terracotta", .18, .37, .22, .23, .44);
  colore(salvia ? "grafite" : "libro_verde", .14, .69, .09, .115, .45);
}

export function costruisciScaldasalviette(centro: Posa, r: number, l: number, p: number, h: number, fabbrica: Fabbrica) {
  if (h <= 0) return;
  const { punto } = riferimento(centro, r);
  const tubo = Math.min(.015, l * .074, p * .2, h * .06);
  const asse = l / 2 - tubo, z = -p * .12;
  const basso = h * .33, alto = h - tubo;
  const struttura = fabbrica("grafite");
  for (const x of [-asse, asse]) {
    struttura.tubo([punto(x, basso, z), punto(x, alto, z)], tubo);
    for (const y of [basso + (alto - basso) * .16, alto - (alto - basso) * .16]) {
      fabbrica("metallo").tubo([punto(x, y, -p / 2), punto(x, y, z)], tubo * .68, 10);
    }
  }
  for (let i = 0; i < 10; i++) {
    const y = basso + (alto - basso) * (.06 + i * .095);
    struttura.tubo([punto(-asse, y, z), punto(asse, y, z)], tubo * .66, 10);
  }
  const piega = h * .79, caduta = h * .23;
  const telo = fabbrica("tessuto");
  telo.scatola(centro.x, centro.z, piega - caduta, l * .63, p * .17, caduta, r, 0, p * .32, 0, tubo * .65);
  telo.scatola(centro.x, centro.z, piega - tubo * .78, l * .63, p * .45, tubo * 1.18, r, 0, p * .13, 0, tubo * .65);
  fabbrica("lino_avorio").scatola(centro.x, centro.z, piega - caduta + h * .022,
    l * .62, p * .02, h * .013, r, 0, p * .414);
}
