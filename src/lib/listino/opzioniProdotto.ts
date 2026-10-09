import type { FamilyAxis } from "@/types/articleFamily";

/** Validate the single-parent visibility graph before saving; never infer supplier compatibility. */
export function problemaCondizione(codice: string, condizione: FamilyAxis["visibile_se"], assi: FamilyAxis[]): string | null {
  if (!condizione) return null;
  const controllore = assi.find(a => a.codice === condizione.asse);
  if (!controllore || condizione.asse === codice) return "Scegli un'altra opzione esistente.";
  if (!condizione.valori.length || condizione.valori.some(v => !controllore.values.some(x => x.valore === v && x.attivo))) return "Seleziona almeno una scelta attiva.";
  const visited = new Set([codice]);
  let current: string | undefined = condizione.asse;
  while (current) {
    if (visited.has(current)) return "Questa condizione crea un ciclo tra le opzioni.";
    visited.add(current);
    current = assi.find(a => a.codice === current)?.visibile_se?.asse;
  }
  return null;
}

export function prezzoOpzioneValido(input: string): boolean {
  if (!input.trim()) return true;
  const n = Number(input.replace(",", "."));
  return Number.isFinite(n) && n >= 0;
}

