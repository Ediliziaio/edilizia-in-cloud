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

  // Le tavole anglosassoni possono usare l'apostrofo e le virgolette tipografiche.
  const imperiali = t.match(/^(?:(\d+)\s*(?:['’′]|ft)(?:\s*-?\s*(\d+(?:[.,]\d+)?)\s*(?:["”″]|in))?|(\d+(?:[.,]\d+)?)\s*(?:["”″]|in))$/);
  if (imperiali) {
    const piedi = Number(imperiali[1] ?? 0);
    const pollici = Number((imperiali[2] ?? imperiali[3] ?? "0").replace(",", "."));
    const cm = piedi * 30.48 + pollici * 2.54;
    return Number.isFinite(cm) && cm > 0 ? Math.round(cm * 10) / 10 : null;
  }

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

/** «4,20», oppure «1,945» per una quota di 194,5 cm: non perde i mezzi centimetri. */
export function scriviMetri(cm: number): string {
  const arrotondata = Math.round(cm * 10) / 10;
  return (arrotondata / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: Number.isInteger(arrotondata) ? 2 : 3 });
}

/** Coordinate cartesiane digitate in metri, convertite in cm per il disegno. */
export function leggiCoordinata(testo: string): number | null {
  const t = testo.trim().replace("−", "-");
  if (!/^[+-]?(?:\d+(?:[.,]\d{1,4})?|[.,]\d{1,4})\s*m?$/i.test(t)) return null;
  const metri = Number(t.replace(/m$/i, "").replace(",", "."));
  return Number.isFinite(metri) && Math.abs(metri) <= 1e7 ? Math.round(metri * 10_000) / 100 + 0 : null;
}

/** «90» — centimetri interi, per porte e finestre. */
export function scriviCentimetri(cm: number): string {
  return cm.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

/** «12,35 mq» */
export function scriviMq(mq: number): string {
  return `${mq.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mq`;
}

/** La superficie disegnata torna con quella scritta sulla tavola: entro il 2%, o 0,2 m². */
export function tornaConLaTavola(mq: number, dichiarataMq: number): boolean {
  return Math.abs(mq - dichiarataMq) <= Math.max(0.2, dichiarataMq * 0.02);
}

/**
 * Come far tornare una stanza rettangolare con la superficie scritta sulla tavola
 * (24/11/2026): si cambia un lato solo, e l'opposto lo segue. Un lato per proposta,
 * in cm, arrotondato al mezzo centimetro. Vuoto se la stanza torna già, se non è un
 * rettangolo (lì il lato da toccare non si indovina) o se la correzione sarebbe
 * enorme (più della metà: è la tavola che conta un'altra cosa, non un errore di disegno).
 */
export function correzioniDallaTavola(lati: number[], mq: number, dichiarataMq: number): Array<{ lato: number; da: number; a: number }> {
  if (lati.length !== 4 || mq <= 0 || dichiarataMq <= 0 || tornaConLaTavola(mq, dichiarataMq)) return [];
  const uguale = (a: number, b: number) => Math.abs(a - b) <= Math.max(2, Math.max(a, b) * 0.02);
  if (!uguale(lati[0], lati[2]) || !uguale(lati[1], lati[3])) return [];
  const fattore = dichiarataMq / mq;
  if (fattore < 0.5 || fattore > 1.5) return [];
  return [0, 1].flatMap((lato) => {
    const a = Math.round(lati[lato] * fattore * 2) / 2;
    return a >= 30 ? [{ lato, da: lati[lato], a }] : [];
  });
}

/** Legge «3,50 x 4» / «3.5 per 4,20» / «350×420». */
export function leggiDueMisure(testo: string): [number, number] | null {
  const parti = testo.toLowerCase().split(/\s*(?:x|×|\*|per)\s*/);
  if (parti.length !== 2) return null;
  const a = leggiMisura(parti[0]);
  const b = leggiMisura(parti[1]);
  return a && b ? [a, b] : null;
}
