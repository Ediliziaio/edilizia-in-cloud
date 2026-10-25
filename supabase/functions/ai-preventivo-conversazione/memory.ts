import { jsonResponse, errorResponse } from '../_shared/headers.ts';
import type { requireCompanyAccess } from '../_shared/auth.ts';
import type { QuoteDemoMemoryRequest } from '../_shared/quoteDemoMemory.ts';
export { readQuoteDemoMemoryRequest } from '../_shared/quoteDemoMemory.ts';
export async function handleQuoteDemoMemory(db: Parameters<typeof requireCompanyAccess>[0], userId: string, request: QuoteDemoMemoryRequest, headers: Record<string, string>) {
  if (request.action === 'load') {
    const { data, error } = await db.from('quote_demo_memory').select('version,snapshot,updated_at').eq('owner_id', userId).eq('company_id', request.companyId).eq('scope_key', request.scopeKey).maybeSingle().abortSignal(AbortSignal.timeout(8_000));
    if (error) return errorResponse('Memoria demo non disponibile. Bozza locale conservata.', 503, headers);
    return jsonResponse({ record: data }, 200, headers);
  }
  const { data, error } = await db.rpc('save_quote_demo_memory', { p_owner: userId, p_scope: request.scopeKey, p_expected: request.expectedVersion!, p_snapshot: request.snapshot! }).abortSignal(AbortSignal.timeout(8_000));
  if (error) return errorResponse('Copia demo non salvata. La bozza locale resta intatta.', 503, headers);
  if (data == null) return errorResponse('Copia demo modificata da un altro dispositivo. Confronta le versioni prima di riprovare.', 409, headers);
  return jsonResponse({ version: Number(data) }, 200, headers);
}
