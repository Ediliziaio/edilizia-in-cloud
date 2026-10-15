import type { AxisSelection, FamilyWithAxes } from '@/types/articleFamily';

/** Attributi documentati dal produttore. Sono separati dagli assi che calcolano il prezzo. */
export interface VarianteTecnicaConfermata {
  codice: string;
  nome: string;
  fonte: string;
  valori: readonly { codice: string; nome: string }[];
  applicabileSe?: { asse: string; valori: readonly string[] };
}

export function variantiTecnicheVisibili(
  varianti: readonly VarianteTecnicaConfermata[],
  famiglia: FamilyWithAxes,
  selezione: AxisSelection,
): VarianteTecnicaConfermata[] {
  return varianti.filter(v => {
    // Non creare una seconda scelta in conflitto con l'asse già presente.
    if (famiglia.axes.some(a => a.codice === v.codice)) return false;
    if (!v.applicabileSe) return true;
    const condizione = v.applicabileSe;
    const asse = famiglia.axes.find(a => a.codice === condizione.asse);
    const valore = asse?.values.find(x => x.attivo && x.id === selezione[asse.codice]);
    return !!valore && condizione.valori.includes(valore.valore);
  });
}

/** Solo scelte ancora visibili e riconosciute: nessun valore libero o dato nascosto nel riepilogo. */
export function riepilogoVariantiTecniche(
  varianti: readonly VarianteTecnicaConfermata[],
  selezione: Record<string, string>,
): string[] {
  return varianti.flatMap(v => {
    const scelto = v.valori.find(x => x.codice === selezione[v.codice]);
    return scelto ? [`${v.nome}: ${scelto.nome}`] : [];
  });
}
