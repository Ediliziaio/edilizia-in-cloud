import type { QueryClient } from "@tanstack/react-query";
/** The POS and safety views share the inventory, but use distinct authorized projections. */
export function invalidaFontiSicurezzaMezzi(
  qc: QueryClient,
  companyId: string | null | undefined,
) {
  if (!companyId) return Promise.resolve([]);
  return Promise.all(
    ["pos-mezzi", "pos-documenti-mezzo", "sicurezza-commessa-ponteggi"].map(
      (fonte) => qc.invalidateQueries({ queryKey: [fonte, companyId] }),
    ),
  );
}
