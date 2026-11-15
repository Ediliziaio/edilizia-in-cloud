/**
 * Il profilo HR da usare quando un dipendente ne ha più d'uno (15/11/2026: sei casi nel
 * database). PostgREST li restituisce in ordine qualsiasi, e `hr_profili[0]` prendeva date di
 * assunzione e cessazione a caso. Prima quello attivo, poi il più recente.
 */
export interface ProfiloHrDate {
  data_assunzione?: string | null;
  data_cessazione?: string | null;
  attivo?: boolean | null;
  updated_at?: string | null;
}

export function profiloHrPrincipale<T extends ProfiloHrDate>(profili: T[] | T | null | undefined): T | undefined {
  const elenco = Array.isArray(profili) ? profili : profili ? [profili] : [];
  return [...elenco].sort((a, b) => {
    const attivoA = a.attivo === false ? 1 : 0;
    const attivoB = b.attivo === false ? 1 : 0;
    if (attivoA !== attivoB) return attivoA - attivoB;
    return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
  })[0];
}
