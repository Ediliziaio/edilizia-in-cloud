/** Net agreed revenue: base contract plus approved changes, including credits.
 * Pending/rejected variations never change what the customer owes. */
export function agreedContractValue(base: number, variations: ReadonlyArray<{status: string; impatto_economico: number | string | null}>) {
  return Math.round((Number(base || 0) + variations.reduce((sum, row) => {
    const amount = Number(row.impatto_economico ?? 0);
    return sum + (row.status === 'approvato' && Number.isFinite(amount) ? amount : 0);
  }, 0)) * 100) / 100;
}

/** Le varianti approvate con il giorno dell'approvazione (firma offline, firma, registrazione, richiesta). */
export function variantiApprovateDatate(variations: ReadonlyArray<{
  status: string; impatto_economico: number | string | null;
  offline_signed_on?: string | null; firmato_il?: string | null; approval_recorded_at?: string | null;
  richiesto_il?: string | null; created_at?: string | null;
}>): Array<{ importo: number; il: string | null }> {
  return variations.filter(v => v.status === 'approvato').map(v => {
    const il = v.offline_signed_on ?? v.firmato_il ?? v.approval_recorded_at ?? v.richiesto_il ?? v.created_at ?? null;
    return { importo: Number(v.impatto_economico ?? 0) || 0, il: il ? il.slice(0, 10) : null };
  });
}

export function variationStatusLabel(status: string) {
  return ({ approvato: 'Approvata', rifiutato: 'Rifiutata', annullato: 'Annullata', in_attesa: 'In attesa' } as Record<string, string>)[status] ?? 'Da verificare';
}
