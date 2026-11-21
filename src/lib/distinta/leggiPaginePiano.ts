/** Legge le pagine ordinate finché il database restituisce l'ultima pagina. */
export async function leggiPaginePiano<T>(leggi: (da: number, a: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const righe: T[] = [];
  for (let da = 0; da < 50_000; da += 500) {
    const { data, error } = await leggi(da, da + 499);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Lettura del piano incompleta.");
    righe.push(...data as T[]);
    if (data.length < 500) return righe;
  }
  throw new Error("La commessa contiene troppi dati per leggere il piano completo.");
}
