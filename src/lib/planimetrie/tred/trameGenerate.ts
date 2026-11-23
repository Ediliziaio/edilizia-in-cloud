/**
 * Piastrelle e resine disegnate dal codice, punto per punto: colore, rilievo (mappa normale) e lucentezza.
 *
 * Perché dal codice: una piastrella è una griglia esatta. Disegnandola si ottengono fughe dritte, formato
 * reale al millimetro, ripetizione senza cuciture, nessun file da scaricare e nessuna licenza da rispettare.
 * Il colore è quasi bianco: la tinta del campione lo moltiplica, così un solo disegno serve molti colori.
 *
 * Funzioni pure (niente canvas, niente three.js): si provano nei test e girano anche fuori dal browser.
 */

export interface FormatoTrama {
  /** Lato in metri del riquadro che si ripete (larghezza, altezza). */
  metri: [number, number];
  /** Piastrelle nel riquadro. */
  colonne: number;
  righe: number;
  /** Corsi sfalsati di mezza piastrella (posa a correre). */
  sfalsata?: boolean;
  /** Larghezza della fuga in millimetri (0 = superficie continua). */
  fugaMm: number;
  /** Bordo arrotondato della piastrella, in millimetri. */
  biselloMm: number;
  /** Differenza di tono fra una piastrella e l'altra (0–1). */
  stonalizzazione: number;
  /** Nuvolature dentro la piastrella (0–1) e loro grandezza in metri. */
  nuvole: number;
  scalaNuvoleM: number;
  /** Grana fine (0–1). */
  grana: number;
  /** Lucentezza della piastrella rispetto alla ruvidità del campione: la fuga resta sempre opaca. */
  superficieIrregolare?: number;
  /** Colori veri (0–255) di pezzo e fuga, per le facciate: senza, il disegno è quasi bianco e lo tinge il campione. */
  colori?: { pezzo: [number, number, number]; fuga: [number, number, number] };
  /** Ruvidità scritta nella mappa per il pezzo (predefinita: quella delle piastrelle). */
  ruviditaPezzo?: number;
  /** Solo per l'acqua: quanto sono ripide le increspature. */
  onde?: number;
  /** Forza del rilievo nel visore. */
  rilievo: number;
  provenienza: string;
}

const GENERATA = "Disegnata dal codice di Edilizia in Cloud (nessuna licenza di terzi)";

export const TRAME_GENERATE: Readonly<Record<string, FormatoTrama>> = {
  // i due nomi storici dei campioni restano: le piante salvate continuano a leggerli
  piastrelle: { metri: [1.2, 1.2], colonne: 2, righe: 2, fugaMm: 3, biselloMm: 2, stonalizzazione: .035, nuvole: .05, scalaNuvoleM: .35, grana: .02, rilievo: .9, provenienza: GENERATA },
  cemento: { metri: [1.2, 1.2], colonne: 2, righe: 2, fugaMm: 3, biselloMm: 1.5, stonalizzazione: .05, nuvole: .16, scalaNuvoleM: .28, grana: .05, rilievo: .8, provenienza: GENERATA },
  gres_30x60: { metri: [1.2, 1.2], colonne: 2, righe: 4, sfalsata: true, fugaMm: 3, biselloMm: 2, stonalizzazione: .05, nuvole: .09, scalaNuvoleM: .3, grana: .03, rilievo: .9, provenienza: GENERATA },
  gres_120: { metri: [2.4, 2.4], colonne: 2, righe: 2, fugaMm: 2, biselloMm: 1.5, stonalizzazione: .03, nuvole: .12, scalaNuvoleM: .6, grana: .02, rilievo: .7, provenienza: GENERATA },
  cotto_30: { metri: [1.2, 1.2], colonne: 4, righe: 4, fugaMm: 7, biselloMm: 5, stonalizzazione: .16, nuvole: .14, scalaNuvoleM: .12, grana: .07, superficieIrregolare: .5, rilievo: 1.3, provenienza: GENERATA },
  mosaico: { metri: [.6, .6], colonne: 12, righe: 12, fugaMm: 2.5, biselloMm: 2, stonalizzazione: .12, nuvole: .04, scalaNuvoleM: .1, grana: .02, rilievo: 1.1, provenienza: GENERATA },
  metro: { metri: [.6, .6], colonne: 4, righe: 8, sfalsata: true, fugaMm: 2.5, biselloMm: 6, stonalizzazione: .03, nuvole: .03, scalaNuvoleM: .1, grana: .01, superficieIrregolare: .35, rilievo: 1.2, provenienza: GENERATA },
  // l'acqua: nessun disegno, solo increspature che muovono i riflessi del cielo
  onde: { metri: [1.6, 1.6], colonne: 1, righe: 1, fugaMm: 0, biselloMm: 0, stonalizzazione: 0, nuvole: .025, scalaNuvoleM: .2, grana: 0, superficieIrregolare: 1.5, onde: 5, rilievo: 1, provenienza: GENERATA },
  // facciate: mattoni 25×5,5 con fuga di malta chiara, pietra squadrata a corsi, intonaco a grana fine
  facciata_mattone: { metri: [1.04, 1.04], colonne: 4, righe: 16, sfalsata: true, fugaMm: 10, biselloMm: 3, stonalizzazione: .2, nuvole: .1, scalaNuvoleM: .06, grana: .09, superficieIrregolare: .7, rilievo: 1.5,
    colori: { pezzo: [176, 96, 70], fuga: [196, 188, 172] }, ruviditaPezzo: .88, provenienza: GENERATA },
  facciata_pietra: { metri: [1.6, 1.6], colonne: 4, righe: 8, sfalsata: true, fugaMm: 9, biselloMm: 9, stonalizzazione: .2, nuvole: .2, scalaNuvoleM: .09, grana: .07, superficieIrregolare: 1.1, rilievo: 1.6,
    colori: { pezzo: [198, 186, 164], fuga: [150, 142, 128] }, ruviditaPezzo: .9, provenienza: GENERATA },
  facciata_intonaco: { metri: [2, 2], colonne: 1, righe: 1, fugaMm: 0, biselloMm: 0, stonalizzazione: 0, nuvole: .035, scalaNuvoleM: .5, grana: .05, superficieIrregolare: .35, rilievo: .6, ruviditaPezzo: .95, provenienza: GENERATA },
  resina: { metri: [2.4, 2.4], colonne: 1, righe: 1, fugaMm: 0, biselloMm: 0, stonalizzazione: 0, nuvole: .1, scalaNuvoleM: .7, grana: .025, superficieIrregolare: .25, rilievo: .35, provenienza: GENERATA },
};

export const eTramaGenerata = (trama: string): boolean => Object.hasOwn(TRAME_GENERATE, trama);

/** Quota di ruvidità scritta nella mappa per la piastrella: il materiale la riporta alla ruvidità del campione. */
export const RUVIDITA_PIASTRELLA_IN_MAPPA = .6;

export interface MappeTrama { lato: number; colore: Uint8ClampedArray; normale: Uint8ClampedArray; rugosita: Uint8ClampedArray }

const casuale = (a: number, b: number, seme: number): number => {
  let h = (a * 374761393 + b * 668265263 + seme * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/** Rumore morbido che si ripete ogni `periodo` celle: nessuna cucitura sul bordo del riquadro. */
function rumore(x: number, y: number, periodo: number, seme: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const p = (i: number, j: number) => casuale(((i % periodo) + periodo) % periodo, ((j % periodo) + periodo) % periodo, seme);
  const alto = p(x0, y0) * (1 - sx) + p(x0 + 1, y0) * sx;
  const basso = p(x0, y0 + 1) * (1 - sx) + p(x0 + 1, y0 + 1) * sx;
  return alto * (1 - sy) + basso * sy;
}

const morbido = (a: number, b: number, x: number) => {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const cache = new Map<string, MappeTrama>();

/** Le tre mappe di una trama, in RGBA. `lato` in pixel (potenza di due: 512 sul telefono, 1024 altrove). */
export function generaTrama(trama: string, lato = 1024): MappeTrama | null {
  const f = TRAME_GENERATE[trama];
  if (!f) return null;
  const chiave = `${trama}/${lato}`;
  const gia = cache.get(chiave);
  if (gia) return gia;
  const n = lato;
  const seme = [...trama].reduce((s, c) => s + c.charCodeAt(0), 7);
  const pxPerMetro = n / f.metri[0];
  const pxPerMetroY = n / f.metri[1];
  const mezzaFuga = (f.fugaMm / 2000) * pxPerMetro;
  const bisello = Math.max(.75, (f.biselloMm / 1000) * pxPerMetro);
  const larghezza = n / f.colonne, altezzaPiastrella = n / f.righe;
  const celleNuvole = Math.max(2, Math.round(f.metri[0] / f.scalaNuvoleM));
  const altezza = new Float32Array(n * n);
  const colore = new Uint8ClampedArray(n * n * 4);
  const rugosita = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    const riga = Math.floor(y / altezzaPiastrella);
    const sfalso = f.sfalsata && riga % 2 ? larghezza / 2 : 0;
    const fy = y - riga * altezzaPiastrella;
    const dy = Math.min(fy, altezzaPiastrella - fy) * (pxPerMetro / pxPerMetroY);
    for (let x = 0; x < n; x++) {
      const xs = (x + sfalso) % n;
      const colonna = Math.floor(xs / larghezza);
      const fx = xs - colonna * larghezza;
      const bordo = Math.min(Math.min(fx, larghezza - fx), dy);
      const i = y * n + x;
      const inFuga = f.fugaMm > 0 && bordo < mezzaFuga;
      const u = x / n * celleNuvole, v = y / n * celleNuvole;
      const scostamento = casuale(colonna, riga, seme + 3) * celleNuvole;
      const nuvola = (rumore(u + scostamento, v + scostamento, celleNuvole, seme) * .6
        + rumore((u + scostamento) * 2, (v + scostamento) * 2, celleNuvole * 2, seme + 11) * .3
        + rumore((u + scostamento) * 4, (v + scostamento) * 4, celleNuvole * 4, seme + 23) * .1) - .5;
      const grana = casuale(x, y, seme + 31) - .5;
      let tono: number, alto: number, ruvido: number;
      if (inFuga) {
        tono = .62 + grana * .08;
        alto = -.6 + grana * .12;
        ruvido = 1;
      } else {
        const piastrella = (casuale(colonna, riga, seme) - .5) * 2 * f.stonalizzazione;
        const spalla = f.fugaMm > 0 ? morbido(mezzaFuga, mezzaFuga + bisello, bordo) : 1;
        tono = (.93 + piastrella + nuvola * f.nuvole * 2 + grana * f.grana * 2) * (.9 + .1 * spalla);
        alto = spalla - 1 + nuvola * (f.superficieIrregolare ?? .08) * .5 + grana * f.grana * .6;
        ruvido = (f.ruviditaPezzo ?? RUVIDITA_PIASTRELLA_IN_MAPPA) + nuvola * (f.superficieIrregolare ?? .08) * .35 + (1 - spalla) * .2;
      }
      altezza[i] = alto;
      if (f.colori) {
        // nelle facciate la fuga ha il suo colore (la malta è più chiara del mattone): il tono fa solo la variazione
        const base = inFuga ? f.colori.fuga : f.colori.pezzo, k = inFuga ? tono / .62 : tono / .93;
        for (let canale = 0; canale < 3; canale++) colore[4 * i + canale] = Math.round(Math.min(255, Math.max(0, base[canale] * k)));
      } else {
        const c = Math.round(Math.min(1, Math.max(0, tono)) * 255);
        colore[4 * i] = colore[4 * i + 1] = colore[4 * i + 2] = c;
      }
      colore[4 * i + 3] = 255;
      const r = Math.round(Math.min(1, Math.max(0, ruvido)) * 255);
      rugosita[4 * i] = rugosita[4 * i + 1] = rugosita[4 * i + 2] = r;
      rugosita[4 * i + 3] = 255;
    }
  }
  // dalla quota alla mappa normale (la tela ha la Y verso il basso, la texture verso l'alto)
  const normale = new Uint8ClampedArray(n * n * 4);
  // le onde sono pendenze dolci e larghe: la loro forza segue la risoluzione, così a 512 e a 1024 sono uguali
  const forza = f.onde ? 2.2 * f.onde * n / 128 : 2.2;
  for (let y = 0; y < n; y++) {
    const su = ((y - 1 + n) % n) * n, giu = ((y + 1) % n) * n;
    for (let x = 0; x < n; x++) {
      const sx = (x - 1 + n) % n, dx = (x + 1) % n;
      const nx = (altezza[y * n + sx] - altezza[y * n + dx]) * forza;
      const ny = (altezza[giu + x] - altezza[su + x]) * forza;
      const l = Math.hypot(nx, ny, 1);
      const i = 4 * (y * n + x);
      normale[i] = Math.round((nx / l * .5 + .5) * 255);
      normale[i + 1] = Math.round((ny / l * .5 + .5) * 255);
      normale[i + 2] = Math.round((1 / l * .5 + .5) * 255);
      normale[i + 3] = 255;
    }
  }
  const mappe = { lato: n, colore, normale, rugosita };
  cache.set(chiave, mappe);
  return mappe;
}

/** Libera le mappe tenute in memoria (i test e il cambio di profilo). */
export const svuotaTrameGenerate = () => cache.clear();
