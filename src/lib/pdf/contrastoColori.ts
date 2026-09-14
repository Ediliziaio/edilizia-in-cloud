/**
 * Colori leggibili a partire dal colore dell'azienda.
 *
 * Nei PDF il colore principale fa due lavori: scrive titoli e numeri su fondo
 * bianco, e fa da fondo a riquadri con il testo bianco sopra. Con un colore
 * chiaro (il lime di Renova, #C8E600) nessuno dei due si legge. Qui si calcola
 * un inchiostro della stessa tinta, più scuro, per scrivere sul bianco, e un
 * testo scuro per scrivere sopra il colore. Un colore che già si leggeva resta
 * identico: i PDF delle altre aziende non cambiano.
 *
 * Contrasto WCAG 2: 3:1 basta per testi grandi e grafici; quando il colore va
 * scurito, si arriva al 4,5:1 dei testi normali.
 */

const BIANCO = "#FFFFFF";
const SCURO = "#0F172A";
const LEGGIBILE = 3;
const BEN_LEGGIBILE = 4.5;

type Rgb = [number, number, number];

function canali(colore: string): Rgb | null {
  const esteso = colore.trim().replace(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i, "#$1$1$2$2$3$3");
  const m = esteso.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminanza(rgb: Rgb): number {
  const lineare = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lineare(rgb[0]) + 0.7152 * lineare(rgb[1]) + 0.0722 * lineare(rgb[2]);
}

const esadecimale = (rgb: Rgb) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

/** Il rapporto di contrasto fra due colori, da 1 a 21. Un colore non valido non si confronta: 21. */
export function contrasto(a: string, b: string): number {
  const ra = canali(a);
  const rb = canali(b);
  if (!ra || !rb) return 21;
  const la = luminanza(ra);
  const lb = luminanza(rb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Il colore per scrivere sul bianco: lo stesso se si legge, altrimenti la stessa tinta scurita. */
export function inchiostroSuBianco(colore: string): string {
  const rgb = canali(colore);
  if (!rgb || contrasto(colore, BIANCO) >= LEGGIBILE) return colore;
  for (let passo = 1; passo < 20; passo++) {
    const scurito = esadecimale(rgb.map((c) => c * (1 - passo * 0.05)) as Rgb);
    if (contrasto(scurito, BIANCO) >= BEN_LEGGIBILE) return scurito;
  }
  return SCURO;
}

/** Il colore del testo sopra un fondo di quel colore: bianco se si legge, altrimenti scuro. */
export function testoSopra(colore: string): string {
  return contrasto(colore, BIANCO) >= LEGGIBILE ? BIANCO : SCURO;
}
