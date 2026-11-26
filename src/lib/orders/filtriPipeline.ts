/** Restringe gli ID prima della paginazione; le fasi personalizzate non sono order_statuses. */
export function ordiniNelleFasi(
  assegnazioni: Record<string, string>,
  fase: string | null,
  incluse: readonly string[],
  escluse: readonly string[],
): string[] {
  return Object.entries(assegnazioni).filter(([, id]) =>
    (!fase || id === fase) && (!incluse.length || incluse.includes(id)) && !escluse.includes(id),
  ).map(([ordine]) => ordine);
}
