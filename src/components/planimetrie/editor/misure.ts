/**
 * Misure scritte a mano: «4,20», «4.20 m», «420 cm», «4 m 20».
 * Tutto torna in centimetri.
 */

/**
 * Legge una misura scritta da una persona. Senza unità: sotto 30 sono metri
 * («4,20» → 420 cm), da 30 in su centimetri («420» → 420 cm, «90» → 90 cm).
 * Restituisce null se non è una misura valida e positiva.
 */
export function leggiMisura(testo: string): number | null {
  const t = testo.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;

  // «4 m 20» / «4m20»
  const mcm = t.match(/^(\d+)\s*m\s*(\d{1,2})(?:\s*cm)?$/);
  if (mcm) return Number(mcm[1]) * 100 + Number(mcm[2]);

  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(m|mt|metri|cm|mm)?$/);
  if (!m) return null;
  const valore = Number(m[1].replace(",", "."));
  if (!Number.isFinite(valore) || valore <= 0) return null;
  const unita = m[2];
  let cm: number;
  if (unita === "cm") cm = valore;
  else if (unita === "mm") cm = valore / 10;
  else if (unita) cm = valore * 100;
  else cm = valore < 30 ? valore * 100 : valore;
  return Math.round(cm * 10) / 10;
}

/** «4,20» — metri con due decimali, virgola italiana. */
export function scriviMetri(cm: number): string {
  return (cm / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** «90» — centimetri interi, per porte e finestre. */
export function scriviCentimetri(cm: number): string {
  return Math.round(cm).toLocaleString("it-IT");
}

/** «12,35 mq» */
export function scriviMq(mq: number): string {
  return `${mq.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mq`;
}

/** Legge «3,50 x 4» / «3.5 per 4,20» / «350×420». */
export function leggiDueMisure(testo: string): [number, number] | null {
  const parti = testo.toLowerCase().split(/\s*(?:x|×|\*|per)\s*/);
  if (parti.length !== 2) return null;
  const a = leggiMisura(parti[0]);
  const b = leggiMisura(parti[1]);
  return a && b ? [a, b] : null;
}
