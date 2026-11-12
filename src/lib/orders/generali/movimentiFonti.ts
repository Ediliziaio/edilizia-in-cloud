/** Compatible with existing databases: the reserved note prefix persists the pending state. */
export const MOVIMENTO_PREVISTO = "[EIC:MOVIMENTO_PREVISTO]";
export const notaMovimento = (nota: string | null) => (nota ?? "").replaceAll(MOVIMENTO_PREVISTO, "").trim();
export function movimentoPrevisto(m: { data: string; nota: string | null }, oggi: string) {
  return m.data > oggi || (m.nota ?? "").includes(MOVIMENTO_PREVISTO);
}
