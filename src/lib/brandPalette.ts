/**
 * brandPalette — dalla tinta del logo a una palette che non rompe l'interfaccia.
 *
 * Il colore di un logo (un verde lime, un giallo…) quasi mai va bene come
 * colore dei bottoni: il testo bianco sopra non si legge e la barra laterale
 * esce sbiadita. Qui da UN colore si ricava tutto il resto, mantenendo la tinta
 * ma regolando la luminosità finché il contrasto è leggibile (WCAG AA, 4.5:1).
 * Funzioni pure: le usano la pagina White-Label, il tema e i test.
 */

export interface PaletteBrand {
  /** Bottoni, link, voce attiva: la tinta del logo, scurita se serve per il contrasto. */
  primary: string;
  /** La tinta del logo così com'è (decorazioni, grafici). */
  secondary: string;
  /** Fondo chiaro delle voci attive/hover, stessa tinta, molto delicato. */
  accent: string;
  /** Testo sopra il primario: bianco o quasi nero, secondo il contrasto. */
  textOnPrimary: string;
}

type Rgb = [number, number, number];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function hexValido(v: string | null | undefined): v is string {
  return typeof v === "string" && HEX.test(v.trim());
}

export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const x = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${x(r)}${x(g)}${x(b)}`.toUpperCase();
}

/** h 0–360, s e l 0–1. */
export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function luminanzaRelativa([r, g, b]: Rgb): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Rapporto di contrasto WCAG tra due colori HEX (1–21). */
export function contrasto(a: string, b: string): number {
  const la = luminanzaRelativa(hexToRgb(a));
  const lb = luminanzaRelativa(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const BIANCO = "#FFFFFF";
const QUASI_NERO = "#111827";

/** Bianco o quasi nero, quello che si legge meglio sul fondo dato. */
export function testoLeggibileSu(fondo: string): string {
  return contrasto(fondo, BIANCO) >= contrasto(fondo, QUASI_NERO) ? BIANCO : QUASI_NERO;
}

/**
 * Scurisce (tenendo tinta e saturazione) finché il colore ha almeno `minimo`
 * di contrasto con il testo indicato. Se è già leggibile lo lascia com'è.
 */
export function garantisciContrasto(colore: string, testo: string, minimo = 4.5): string {
  if (!hexValido(colore) || !hexValido(testo)) return colore;
  if (contrasto(colore, testo) >= minimo) return colore.toUpperCase();
  const [h, s, l0] = rgbToHsl(hexToRgb(colore));
  const scurisci = luminanzaRelativa(hexToRgb(testo)) > 0.5; // testo chiaro → fondo scuro
  let l = l0;
  for (let i = 0; i < 100; i++) {
    l += scurisci ? -0.01 : 0.01;
    if (l <= 0.04 || l >= 0.96) break;
    const prova = rgbToHex(hslToRgb(h, s, l));
    if (contrasto(prova, testo) >= minimo) return prova;
  }
  return rgbToHex(hslToRgb(h, s, Math.max(0.04, Math.min(0.96, l))));
}

/** Tinta molto chiara dello stesso colore: fondo delle voci attive. */
export function tintaChiara(colore: string): string {
  const [h, s] = rgbToHsl(hexToRgb(colore));
  return rgbToHex(hslToRgb(h, Math.min(0.55, Math.max(0.2, s)), 0.94));
}

/** Da UN colore (tipicamente quello del logo) all'intera palette. */
export function paletteDaColore(colore: string): PaletteBrand {
  const base = hexValido(colore) ? colore.toUpperCase() : "#1E40AF";
  // Per i bottoni si tenta col testo bianco; se la tinta è chiara si scurisce.
  const primary = garantisciContrasto(base, BIANCO, 4.5);
  return {
    primary,
    secondary: base,
    accent: tintaChiara(base),
    textOnPrimary: testoLeggibileSu(primary),
  };
}

/**
 * Il colore "del marchio" in un insieme di pixel RGBA: il più frequente tra
 * quelli colorati (si scartano bianchi, grigi e quasi neri, che sono sfondo o
 * testo). Raggruppa per tinta (24 settori) e per luminosità. null se il logo è
 * tutto grigio/bianco/nero.
 */
export function coloreDominante(rgba: ArrayLike<number>): string | null {
  const SETTORI = 24;
  const peso = new Array<number>(SETTORI).fill(0);
  const somma = Array.from({ length: SETTORI }, () => [0, 0, 0, 0]);
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a < 200) continue;
    const rgb: Rgb = [rgba[i], rgba[i + 1], rgba[i + 2]];
    const [h, s, l] = rgbToHsl(rgb);
    if (s < 0.25 || l < 0.12 || l > 0.92) continue;
    const k = Math.floor((h / 360) * SETTORI) % SETTORI;
    // Più il colore è saturo, più conta: il marchio è il tratto "vivo".
    const w = s;
    peso[k] += w;
    somma[k][0] += rgb[0] * w;
    somma[k][1] += rgb[1] * w;
    somma[k][2] += rgb[2] * w;
    somma[k][3] += w;
  }
  let migliore = -1;
  for (let k = 0; k < SETTORI; k++) if (migliore < 0 || peso[k] > peso[migliore]) migliore = k;
  if (migliore < 0 || peso[migliore] <= 0) return null;
  const [r, g, b, w] = somma[migliore];
  return rgbToHex([r / w, g / w, b / w]);
}

/** Legge il logo da un URL e ne ricava il colore del marchio. null se non si riesce. */
export async function coloreDelLogo(url: string): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok();
      img.onerror = () => ko(new Error("immagine non leggibile"));
      img.src = url;
    });
    const lato = 96;
    const scala = Math.min(1, lato / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scala));
    const h = Math.max(1, Math.round(img.naturalHeight * scala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return coloreDominante(ctx.getImageData(0, 0, w, h).data);
  } catch {
    return null;
  }
}
