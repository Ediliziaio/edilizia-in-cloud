export function esitoPagina<Esito extends string>(
  candidati: readonly { id: string }[],
  esiti: ReadonlyMap<string, Esito>,
  altriCandidati: boolean,
) {
  const conteggi: Partial<Record<Esito, number>> = {};
  let ultimo: string | null = null;
  let valutati = 0;
  for (const { id } of candidati) {
    const esito = esiti.get(id);
    if (!esito) break;
    conteggi[esito] = (conteggi[esito] ?? 0) + 1;
    ultimo = id;
    valutati++;
  }
  const altri = altriCandidati || valutati < candidati.length;
  return { ...conteggi, valutati, altri, next_cursor: altri ? ultimo : null };
}
