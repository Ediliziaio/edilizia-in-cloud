// Larghezza e altezza della prima pagina di un PDF (in punti), lette dal
// /MediaBox. Servono a non deformare la pianta: il modello dà le coordinate da
// 0 a 1000 su ciascun lato, e senza le proporzioni del foglio un A3 orizzontale
// diventerebbe quadrato. Se la pagina è ruotata di 90° si scambiano.

export function dimensioniPdf(bytes: Uint8Array): { larghezza: number; altezza: number } | null {
  // L'intestazione e il primo oggetto pagina stanno di solito nei primi 2 MB.
  const testo = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 2_000_000)));
  const box = testo.match(/\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/);
  if (!box) return null;
  const [x0, y0, x1, y1] = box.slice(1).map(Number);
  let larghezza = Math.abs(x1 - x0);
  let altezza = Math.abs(y1 - y0);
  if (!(larghezza > 0 && altezza > 0)) return null;
  const rotazione = testo.match(/\/Rotate\s+(-?\d+)/);
  if (rotazione && Math.abs(Number(rotazione[1])) % 180 === 90) [larghezza, altezza] = [altezza, larghezza];
  return { larghezza, altezza };
}
