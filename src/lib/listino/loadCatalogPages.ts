/** Evita il troncamento silenzioso del listino al limite REST di Supabase. */
export async function loadCatalogPages<T extends { id: string }>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 250,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("Dimensione pagina non valida");
  const rows: T[] = [];
  const ids = new Set<string>();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await load(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      if (ids.has(row.id)) throw new Error("Il listino è cambiato durante il caricamento. Aggiorna la pagina.");
      ids.add(row.id);
      rows.push(row);
    }
    if (page.length < pageSize) return rows;
  }
}
