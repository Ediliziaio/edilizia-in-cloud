interface RispostaFonte<T> { data: T[] | null; error: { message: string } | null; }

/** La prima vista resta rapida. La lettura completa conserva le pagine già riuscite in caso di guasto. */
export async function leggiPagineDrive<T extends { id: string }>(
  pagina: (from: number, to: number) => PromiseLike<RispostaFonte<T>>,
  limite: number,
  completa = false,
  signal?: AbortSignal,
) {
  const data = new Map<string, T>();
  for (let da = 0; ; da += limite) {
    signal?.throwIfAborted();
    const risposta = await pagina(da, da + limite - 1);
    signal?.throwIfAborted();
    for (const riga of risposta.data ?? []) data.set(riga.id, riga);
    const altre = (risposta.data?.length ?? 0) === limite;
    if (risposta.error || !completa || !altre) return { data: [...data.values()], error: risposta.error, altre };
  }
}
