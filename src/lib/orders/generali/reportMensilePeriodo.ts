/** Una rettifica eseguita oggi non può spostare il termine di un mese chiuso. */
export function dataFotografia(
  mese: string,
  aggiornataIl: string | null | undefined,
): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mese) || !aggiornataIl) return null;
  const data = aggiornataIl.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data < `${mese}-01`) return null;
  const [anno, numeroMese] = mese.split("-").map(Number);
  const fine = new Date(Date.UTC(anno, numeroMese, 0))
    .toISOString()
    .slice(0, 10);
  return data > fine ? fine : data;
}
