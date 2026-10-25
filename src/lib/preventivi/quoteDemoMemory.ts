import { localDraftKey, readLocalQuoteSnapshot, type LocalDraftScope, type LocalQuoteSnapshot } from './localQuoteMemory';
import { readQuoteDemoMemoryRequest } from '../../../supabase/functions/_shared/quoteDemoMemory';
export type QuoteDemoCopy = { version: number; snapshot: LocalQuoteSnapshot; updatedAt: string };
export type QuoteDemoMemory = { load: (scope: LocalDraftScope) => Promise<QuoteDemoCopy | null>; save: (scope: LocalDraftScope, snapshot: LocalQuoteSnapshot, expected: number) => Promise<number> };
export function createQuoteDemoMemory(options: { endpoint: string; getIdentity: () => Promise<{ token: string; ownerId: string } | null>; publishableKey: string; fetch?: typeof fetch }): QuoteDemoMemory {
  const url = new URL(options.endpoint);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/functions/v1/ai-preventivo-conversazione' || url.search || url.hash || url.username || url.password) throw new Error('Memoria demo disponibile solo dal laboratorio locale.');
  const call = async (scope: LocalDraftScope, extra: Record<string, unknown>) => {
    localDraftKey(scope); // Account and flow validated before any network call.
    const request = readQuoteDemoMemoryRequest({ companyId: scope.companyId, scopeKey: `${scope.mode}${scope.flow ? `:flow:${scope.flow}` : scope.scenarioId ? `:scenario:${scope.scenarioId}` : ''}`, ...extra });
    const identity = await options.getIdentity(); if (!identity || identity.ownerId !== scope.ownerId) throw new Error('Account cambiato o sessione scaduta: copia demo non inviata. Accedi nuovamente.');
    const response = await (options.fetch ?? fetch)(`${url.href}/memory`, { method: 'POST', signal: AbortSignal.timeout(12_000), headers: { Authorization: `Bearer ${identity.token}`, apikey: options.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    if (!response.ok) throw new Error(response.status === 409 ? 'Copia demo aggiornata da un altro dispositivo: confrontala prima di salvare. Nessuna sovrascrittura.' : 'Memoria demo non disponibile. La bozza locale è conservata.');
    const text = await response.text(); if (text.length > 650_000) throw new Error('Copia demo troppo grande.'); return JSON.parse(text);
  };
  return {
    async load(scope) {
      const result = await call(scope, { action: 'load' }); if (result.record === null) return null;
      const r = result.record;
      if (!r || !Number.isSafeInteger(r.version) || r.version < 1 || typeof r.updated_at !== 'string' || !Number.isFinite(Date.parse(r.updated_at))) throw new Error('Copia demo non valida.');
      return { version: r.version, updatedAt: r.updated_at, snapshot: readLocalQuoteSnapshot(r.snapshot) };
    },
    async save(scope, snapshot, expected) {
      const result = await call(scope, { action: 'save', snapshot: readLocalQuoteSnapshot(snapshot), expectedVersion: expected });
      if (!Number.isSafeInteger(result.version) || result.version !== expected + 1) throw new Error('Salvataggio demo da verificare: non viene ripetuto automaticamente.');
      return result.version;
    },
  };
}
