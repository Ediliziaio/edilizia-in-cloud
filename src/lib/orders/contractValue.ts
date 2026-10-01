/** Net agreed revenue: base contract plus approved changes, including credits.
 * Pending/rejected variations never change what the customer owes. */
export function agreedContractValue(base: number, variations: ReadonlyArray<{status: string; impatto_economico: number | string | null}>) {
  return Math.round((Number(base || 0) + variations.reduce((sum, row) => {
    const amount = Number(row.impatto_economico ?? 0);
    return sum + (row.status === 'approvato' && Number.isFinite(amount) ? amount : 0);
  }, 0)) * 100) / 100;
}

export function variationStatusLabel(status: string) {
  return ({ approvato: 'Approvata', rifiutato: 'Rifiutata', annullato: 'Annullata', in_attesa: 'In attesa' } as Record<string, string>)[status] ?? 'Da verificare';
}
