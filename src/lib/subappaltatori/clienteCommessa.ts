/** Stesso ordine di preferenza usato nella stampa della commessa. */
export function clienteCommessa(commessa: {
  customer?: { first_name: string | null; last_name: string | null } | null;
  client_company?: string | null;
  client_name?: string | null;
} | null | undefined): string {
  const account = [commessa?.customer?.first_name, commessa?.customer?.last_name]
    .map((part) => part?.trim()).filter(Boolean).join(" ");
  return account || commessa?.client_company?.trim() || commessa?.client_name?.trim() || "";
}
