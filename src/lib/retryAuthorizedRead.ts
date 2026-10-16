/** Nessun retry automatico su sessione/permessi invalidi. Nessun allentamento ACL. */
export function retryAuthorizedRead(count: number, error: unknown): boolean {
  const e = error as { code?: string; status?: number; message?: string } | null;
  if (e?.status === 401 || e?.status === 403 || ['42501','PGRST301','PGRST302','PGRST303'].includes(e?.code ?? '')) return false;
  if (/jwt|permission|unauthorized|forbidden/i.test(e?.message ?? '')) return false;
  return count < 1;
}
