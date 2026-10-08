/** I codici importati restano invariati nel database: qui cambia solo la presentazione. */
export const PAGAMENTI_FORNITORI = [
  { value: "bonifico_unico", label: "Bonifico unico" },
  { value: "50_50", label: "50% acconto + 50% saldo" },
  { value: "30_70", label: "30% acconto + 70% saldo" },
  { value: "riba", label: "RIBA" },
  { value: "contanti", label: "Contanti" },
  { value: "altro", label: "Altro" },
  { value: "bonifico_30gg", label: "Bonifico a 30 giorni" },
  { value: "bonifico_60gg", label: "Bonifico a 60 giorni" },
  { value: "bonifico_90gg", label: "Bonifico a 90 giorni" },
] as const;

export function etichettaPagamentoFornitore(value: string | null): string {
  if (!value) return "—";
  return PAGAMENTI_FORNITORI.find(m => m.value === value)?.label
    ?? value.replace(/_/g, " ");
}
