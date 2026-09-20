/**
 * temaColori.ts — aritmetica dei colori per i documenti (PDF e HTML).
 *
 * Modulo puro, usato dal browser e dalle edge function. Serve a una cosa sola:
 * prendere il colore che l'azienda ha scelto e ricavarne le varianti che un
 * documento usa davvero (fondo scuro, tinta chiara, testo sopra), senza mai
 * perdere leggibilità. Un'azienda con il marchio lime o giallo deve ottenere un
 * documento SUO, non un documento illeggibile.
 */

export interface Rgb { r: number; g: number; b: number }

/** "#abc", "abc", "#AABBCC" → "#AABBCC"; tutto il resto → null. */
export function normalizzaHex(valore: unknown): string | null {
  if (typeof valore !== "string") return null;
  const grezzo = valore.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(grezzo)) {
    return `#${grezzo.split("").map((c) => c + c).join("")}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(grezzo)) return `#${grezzo}`.toUpperCase();
  return null;
}

export function hexToRgb(hex: string): Rgb {
  const h = (normalizzaHex(hex) ?? "#000000").slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Mescola `hex` con `con`: quota 0 = hex, quota 1 = con. */
export function mescola(hex: string, con: string, quota: number): string {
  const a = hexToRgb(hex), b = hexToRgb(con);
  const q = Math.max(0, Math.min(1, quota));
  return rgbToHex({ r: a.r + (b.r - a.r) * q, g: a.g + (b.g - a.g) * q, b: a.b + (b.b - a.b) * q });
}

export const scurisci = (hex: string, quota: number): string => mescola(hex, "#000000", quota);
export const schiarisci = (hex: string, quota: number): string => mescola(hex, "#FFFFFF", quota);

/** Luminanza relativa WCAG (0 = nero, 1 = bianco). */
export function luminanza(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Rapporto di contrasto WCAG fra due colori (1 … 21). */
export function contrasto(a: string, b: string): number {
  const la = luminanza(a), lb = luminanza(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Il colore, scurito quanto basta perché il testo bianco sopra si legga.
 * Un blu notte resta identico; un lime diventa un verde oliva: la tinta è
 * quella dell'azienda, la leggibilità è garantita.
 */
export function fondoPerTestoBianco(hex: string, minimo = 4.5): string {
  let c = normalizzaHex(hex) ?? "#1E3A5F";
  for (let i = 0; i < 24 && contrasto(c, "#FFFFFF") < minimo; i++) c = scurisci(c, 0.08);
  return c;
}

/** Il colore, scurito quanto basta per essere letto come TESTO su fondo chiaro. */
export function testoSuChiaro(hex: string, fondo = "#FFFFFF", minimo = 4.5): string {
  let c = normalizzaHex(hex) ?? "#1E3A5F";
  for (let i = 0; i < 24 && contrasto(c, fondo) < minimo; i++) c = scurisci(c, 0.08);
  return c;
}

/** Il colore, schiarito quanto basta per essere letto come TESTO su fondo scuro. */
export function testoSuScuro(hex: string, fondo: string, minimo = 4.5): string {
  let c = normalizzaHex(hex) ?? "#FBBF24";
  for (let i = 0; i < 24 && contrasto(c, fondo) < minimo; i++) c = schiarisci(c, 0.1);
  return c;
}

/** Bianco o quasi-nero: quello dei due che si legge meglio sopra `fondo`. */
export function testoSopra(fondo: string): string {
  return contrasto(fondo, "#FFFFFF") >= contrasto(fondo, "#0F172A") ? "#FFFFFF" : "#0F172A";
}

/** "249,115,22" — per i `rgba(…)` dei fogli di stile. */
export function rgbElenco(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r},${g},${b}`;
}
