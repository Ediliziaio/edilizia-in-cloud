const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
export function readQuoteCadAccess(raw: unknown): { companyId: string; requestId: string; fileSize: number } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Accesso CAD non valido');
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some(k => !['companyId', 'requestId', 'fileSize'].includes(k)) || typeof r.companyId !== 'string' || !uuid.test(r.companyId)
    || typeof r.requestId !== 'string' || !uuid.test(r.requestId) || !Number.isSafeInteger(r.fileSize) || Number(r.fileSize) < 1 || Number(r.fileSize) > 64 * 1024 * 1024) throw new Error('Accesso CAD non valido');
  return { companyId: r.companyId, requestId: r.requestId, fileSize: Number(r.fileSize) };
}
