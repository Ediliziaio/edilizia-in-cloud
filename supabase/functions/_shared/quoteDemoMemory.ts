export type QuoteDemoMemoryRequest = { companyId: string; scopeKey: string; action: 'load' | 'save'; expectedVersion?: number; snapshot?: Record<string, unknown> };
/** The stored object is data only; frontend applies its stricter full snapshot validator on restore. */
export function readQuoteDemoMemoryRequest(raw: unknown): QuoteDemoMemoryRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Memoria non valida.');
  const r = raw as Record<string, unknown>;
  if (typeof r.companyId !== 'string' || !/^[a-f\d-]{36}$/i.test(r.companyId) || typeof r.scopeKey !== 'string' || !/^(plan|real)(:flow:(classico|bagni:[a-z0-9_-]+)|:scenario:[a-z0-9_-]+)?$/.test(r.scopeKey) || r.scopeKey.length > 120 || !['load', 'save'].includes(String(r.action))) throw new Error('Ambito memoria non valido.');
  if (r.action === 'load') return { companyId: r.companyId, scopeKey: r.scopeKey, action: 'load' };
  const snapshot = r.snapshot as Record<string, unknown> | undefined;
  if (!Number.isSafeInteger(r.expectedVersion) || Number(r.expectedVersion) < 0 || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.version !== 1 || !snapshot.document || !Array.isArray(snapshot.messages) || snapshot.messages.length > 50 || snapshot.interrupted !== false || new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > 620_000) throw new Error('Copia demo non valida, in elaborazione o troppo grande.');
  // Binary originals and provider credentials have no place in a project snapshot.
  if (Object.keys(r).some(k => !['companyId', 'scopeKey', 'action', 'snapshot', 'expectedVersion'].includes(k)) || JSON.stringify(snapshot).includes('data:image/')) throw new Error('Allegati originali non ammessi nella memoria demo.');
  return { companyId: r.companyId, scopeKey: r.scopeKey, action: 'save', expectedVersion: Number(r.expectedVersion), snapshot };
}
