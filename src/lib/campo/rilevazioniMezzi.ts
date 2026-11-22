export const RILEVAZIONI_MEZZI = [
  { chiave: "ore", campo: "ore_lavorate", etichetta: "Ore lavorate", unita: "h", massimo: 24 },
  { chiave: "consumo", campo: "litri_consumati", etichetta: "Litri consumati", unita: "L", massimo: 10000 },
  { chiave: "litri", campo: "litri_riforniti", etichetta: "Litri riforniti", unita: "L", massimo: 10000 },
] as const;

export type OpzioniRilevazioniMezzi = Partial<Record<(typeof RILEVAZIONI_MEZZI)[number]["chiave"], boolean>>;
export type TestiRilevazioniMezzi = Partial<Record<(typeof RILEVAZIONI_MEZZI)[number]["campo"], string>>;
type Rilevazione = (typeof RILEVAZIONI_MEZZI)[number];

export function mezzoDaCantiere(tipo: string, unita: string | null) {
  return tipo === "macchina_movimento_terra" || tipo === "sollevamento" ||
    ((tipo === "altro" || tipo === "attrezzatura") && unita === "ore");
}

export function leggiRilevazioneMezzo(valore: string, campo: Rilevazione): number | null {
  const testo = valore.trim();
  if (!testo) return null;
  const numero = Number(testo.replace(",", "."));
  if (!/^\d{1,5}(?:[,.]\d{1,2})?$/.test(testo) || numero > campo.massimo) {
    throw new Error(`${campo.etichetta}: inserisci un numero tra 0 e ${campo.massimo.toLocaleString("it-IT")}, con al massimo due decimali.`);
  }
  return numero;
}
