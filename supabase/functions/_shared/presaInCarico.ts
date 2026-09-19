// Presa in carico atomica di una riga di coda (19/09/2026).
//
// Il cron delle automazioni gira ogni minuto e un giro lento si sovrappone al
// successivo. Prima ognuno leggeva le righe «da fare» e poi le segnava come
// prese: nel mezzo l'altro giro leggeva le stesse, e i passi partivano due
// volte (email doppie, tag doppi, opportunità doppie).
//
// Qui la riga cambia stato con un solo UPDATE … WHERE stato = atteso. Postgres
// blocca la riga: il secondo UPDATE aspetta il primo, rilegge la condizione sul
// valore nuovo e non tocca niente. Uno solo dei due giri riceve la riga indietro.
export async function prendiInCarico(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tabella: string,
  id: string,
  colonna: string,
  atteso: unknown,
  nuovo: Record<string, unknown>,
): Promise<{ presa: boolean; errore?: string }> {
  const { data, error } = await supabase
    .from(tabella)
    .update(nuovo)
    .eq("id", id)
    .eq(colonna, atteso)
    .select("id");
  if (error) return { presa: false, errore: error.message };
  return { presa: Array.isArray(data) && data.length > 0 };
}
