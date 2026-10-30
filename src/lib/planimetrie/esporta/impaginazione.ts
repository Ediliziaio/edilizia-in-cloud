/**
 * Dove va cosa sul foglio, e a che scala. Tutto in millimetri, origine in alto
 * a sinistra. Nessuna libreria: così si prova a parte (la scala sbagliata è
 * l'errore che non si deve fare).
 */

export type FormatoFoglio = "A4" | "A3";
export type Orientamento = "orizzontale" | "verticale";

/** Le scale che un tecnico si aspetta, dalla più grande alla più piccola. */
export const SCALE_STANDARD = [20, 25, 50, 100, 200, 500] as const;

const FOGLI: Record<FormatoFoglio, { corto: number; lungo: number }> = {
  A4: { corto: 210, lungo: 297 },
  A3: { corto: 297, lungo: 420 },
};

export const MM_IN_PUNTI = 72 / 25.4;

export function dimensioniFoglio(formato: FormatoFoglio, orientamento: Orientamento) {
  const f = FOGLI[formato];
  return orientamento === "orizzontale" ? { larghezza: f.lungo, altezza: f.corto } : { larghezza: f.corto, altezza: f.lungo };
}

export interface Rettangolo {
  x: number;
  y: number;
  larghezza: number;
  altezza: number;
}

export interface Impaginazione {
  foglio: { larghezza: number; altezza: number };
  cornice: Rettangolo;
  /** Dove sta il disegno della pianta. */
  disegno: Rettangolo;
  /** La colonna (orizzontale) o la fascia (verticale) con legenda, tabella e cartiglio. */
  laterale: Rettangolo;
  cartiglio: Rettangolo;
  /** Sopra il cartiglio: legenda, tabella dei locali, barra di scala. */
  informazioni: Rettangolo;
}

export const MARGINE = 10;
const COLONNA = 84;
const FASCIA = 64;
const ALTEZZA_CARTIGLIO = 58;
/** Lo spazio fra il bordo del riquadro del disegno e la pianta (titolo in alto). */
export const RESPIRO = { lati: 4, alto: 11 };

export function impagina(formato: FormatoFoglio, orientamento: Orientamento): Impaginazione {
  const foglio = dimensioniFoglio(formato, orientamento);
  const cornice = { x: MARGINE, y: MARGINE, larghezza: foglio.larghezza - 2 * MARGINE, altezza: foglio.altezza - 2 * MARGINE };
  if (orientamento === "orizzontale") {
    const laterale = { x: cornice.x + cornice.larghezza - COLONNA, y: cornice.y, larghezza: COLONNA, altezza: cornice.altezza };
    const cartiglio = { x: laterale.x, y: laterale.y + laterale.altezza - ALTEZZA_CARTIGLIO, larghezza: COLONNA, altezza: ALTEZZA_CARTIGLIO };
    return {
      foglio, cornice, laterale, cartiglio,
      disegno: { x: cornice.x, y: cornice.y, larghezza: cornice.larghezza - COLONNA, altezza: cornice.altezza },
      informazioni: { x: laterale.x, y: laterale.y, larghezza: COLONNA, altezza: laterale.altezza - ALTEZZA_CARTIGLIO },
    };
  }
  const laterale = { x: cornice.x, y: cornice.y + cornice.altezza - FASCIA, larghezza: cornice.larghezza, altezza: FASCIA };
  const largCartiglio = 92;
  const cartiglio = { x: laterale.x + laterale.larghezza - largCartiglio, y: laterale.y, larghezza: largCartiglio, altezza: FASCIA };
  return {
    foglio, cornice, laterale, cartiglio,
    disegno: { x: cornice.x, y: cornice.y, larghezza: cornice.larghezza, altezza: cornice.altezza - FASCIA },
    informazioni: { x: laterale.x, y: laterale.y, larghezza: laterale.larghezza - largCartiglio, altezza: FASCIA },
  };
}

/** Lo spazio utile per la pianta dentro il riquadro del disegno. */
export function spazioUtile(i: Impaginazione) {
  return {
    larghezza: i.disegno.larghezza - 2 * RESPIRO.lati,
    altezza: i.disegno.altezza - RESPIRO.alto - RESPIRO.lati,
  };
}

/** Quanti mm sul foglio fanno `cm` centimetri della pianta alla scala 1:`scala`. */
export const cmInMm = (cm: number, scala: number) => (cm * 10) / scala;

/** Le dimensioni della pianta disegnata (cm della pianta) per ogni scala: la scena le dà. */
export type MisuraAScala = (scala: number) => { larghezzaCm: number; altezzaCm: number };

export function entra(misura: MisuraAScala, scala: number, i: Impaginazione): boolean {
  const m = misura(scala);
  const s = spazioUtile(i);
  return cmInMm(m.larghezzaCm, scala) <= s.larghezza + 1e-6 && cmInMm(m.altezzaCm, scala) <= s.altezza + 1e-6;
}

/** La scala più grande (il disegno più grande) fra quelle standard che entra nel foglio. */
export function scalaAutomatica(misura: MisuraAScala, i: Impaginazione): number | null {
  for (const s of SCALE_STANDARD) if (entra(misura, s, i)) return s;
  return null;
}

export class ErroreImpaginazione extends Error {
  constructor(
    messaggio: string,
    /** I fogli dove alla scala chiesta la pianta entra. */
    readonly fogliChestanno: { formato: FormatoFoglio; orientamento: Orientamento }[],
    /** La scala che entra nel foglio scelto, se c'è. */
    readonly scalaPossibile: number | null,
  ) {
    super(messaggio);
    this.name = "ErroreImpaginazione";
  }
}

const NOMI_FOGLIO = (f: FormatoFoglio, o: Orientamento) => `${f} ${o}`;

/**
 * La scala da usare: quella chiesta se entra, altrimenti un errore che dice
 * cosa scegliere. «auto» prende la più grande che entra.
 */
export function risolviScala(
  misura: MisuraAScala, formato: FormatoFoglio, orientamento: Orientamento, scala: number | "auto",
): number {
  const i = impagina(formato, orientamento);
  const possibile = scalaAutomatica(misura, i);
  if (scala === "auto") {
    if (possibile !== null) return possibile;
    throw new ErroreImpaginazione(
      `La pianta non entra in un ${NOMI_FOGLIO(formato, orientamento)} nemmeno a 1:${SCALE_STANDARD[SCALE_STANDARD.length - 1]}.`,
      [], null,
    );
  }
  if (entra(misura, scala, i)) return scala;
  const fogli: { formato: FormatoFoglio; orientamento: Orientamento }[] = [];
  for (const f of ["A4", "A3"] as FormatoFoglio[]) {
    for (const o of ["orizzontale", "verticale"] as Orientamento[]) {
      if (entra(misura, scala, impagina(f, o))) fogli.push({ formato: f, orientamento: o });
    }
  }
  const consigli = [
    fogli.length ? `a 1:${scala} serve un ${NOMI_FOGLIO(fogli[0].formato, fogli[0].orientamento)}` : "",
    possibile !== null ? `in questo foglio va bene 1:${possibile}` : "",
  ].filter(Boolean).join(", oppure ");
  throw new ErroreImpaginazione(
    `A 1:${scala} la pianta non entra in un ${NOMI_FOGLIO(formato, orientamento)}${consigli ? `: ${consigli}` : ""}.`,
    fogli, possibile,
  );
}

/** Il passo della barra di scala: segmenti tra 8 e 15 mm, a numeri tondi. */
export function passoBarraScala(scala: number): number {
  const candidati = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 50];
  let scelto = candidati[0];
  for (const c of candidati) if ((c * 1000) / scala <= 15) scelto = c;
  return scelto;
}
