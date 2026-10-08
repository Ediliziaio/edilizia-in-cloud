import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeRagSources, registerBrainToolSources } from '../../../supabase/functions/_shared/ragSources';
import { validateCitations } from '../../../supabase/functions/_shared/citationValidator';
import { memoryBatch, parseExtractedMemory } from '../../../supabase/functions/_shared/silvioMemoryValidation';
import { executeToolWithRouting } from '../../../supabase/functions/_shared/silvioToolExecution';
import { SILVIO_TOOLS, type ToolContext, type SilvioTool } from '../../../supabase/functions/_shared/silvioTools';
import { readFileSync } from 'node:fs';
import { toolCallSignature } from '../../../supabase/functions/_shared/silvioToolSignature';
import { AREE_CARICABILI, domainsForClassification, dominiPerAree, getToolsForChannel } from '../../../supabase/functions/_shared/silvioTools';

const row = (id: string, overrides = {}) => ({ id, content: 'Contenuto verificabile', title: id, similarity: 0.8, ...overrides });
const now = Date.parse('2026-10-07T12:00:00Z');

describe('catalogo leggero e loop reali', () => {
  it('distingue argomenti diversi e normalizza solo ordine delle chiavi', () => {
    const sig = (args: string) => toolCallSignature([{ function: { name: 'search_orders', arguments: args } }]);
    expect(sig('{"order":"A","limit":2}')).toBe(sig('{"limit":2,"order":"A"}'));
    expect(sig('{"order":"A"}')).not.toBe(sig('{"order":"B"}'));
  });
  it('tutte le aree caricabili sono offerte e i domini rimossi dal core si recuperano', () => {
    const schema = SILVIO_TOOLS.carica_strumenti.schema.function.parameters.properties.aree.items.enum;
    expect([...schema].sort()).toEqual(Object.keys(AREE_CARICABILI).sort());
    expect(dominiPerAree(['calendario', 'contenuti', 'assistenza']).sort()).toEqual(['calendar', 'generative', 'support']);
    const base = { role: 'company_admin', channel: 'internal_chat' as const, personaKey: 'silvio' };
    const domains = domainsForClassification({ primaryArea: 'finance' });
    const initial = getToolsForChannel({ ...base, domains });
    const expanded = getToolsForChannel({ ...base, domains: [...domains!, ...dominiPerAree(['contenuti'])] });
    expect(initial.some(t => t.schema.function.name === 'carica_strumenti')).toBe(true);
    expect(initial.length).toBeLessThan(getToolsForChannel(base).length);
    expect(expanded.some(t => t.domain === 'generative')).toBe(true);
  });
});

describe('fonti realmente disponibili', () => {
  it('esclude scadute, cancellate, date invalide e duplicati, conserva chunk e date', () => {
    const sources = normalizeRagSources([
      row('good', { metadata: { chunk_id: 'abcdefgh', last_verified_at: '2026-10-06', valid_until: '2026-11-01' } }),
      row('good'), row('expired', { metadata: { valid_until: '2026-10-01' } }),
      row('deleted', { deleted_at: '2026-10-01' }), row('bad-date', { valid_until: 'invalid' }),
      row('boundary', { valid_until: '2026-10-07T12:00:00Z' }),
    ], false, 0, now);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ id: 'S1', chunk_id: 'abcdefgh', last_verified_at: '2026-10-06' });
  });

  it('registra fonti dei tool con marker univoci anche su chiamate ripetute', () => {
    const sources = normalizeRagSources([row('initial')]);
    const first = { success: true, data: { risultati: [row('tool1')] } };
    registerBrainToolSources(first, sources);
    registerBrainToolSources({ success: true, data: { risultati: [row('tool2')] } }, sources);
    expect(sources.map(s => s.id)).toEqual(['S1', 'S1+', 'S2+']);
    expect(first.data.risultati[0]).toHaveProperty('citation_marker', '[S1+]');
    expect(validateCitations('Risultato [S1+] [S2+]', sources).invalidCitations).toEqual([]);
  });

  it('rimuove i marker inventati, compresi tool e chunk, senza nascondere il problema', () => {
    const result = validateCitations('Dato [S99] [S7+] [chunk:unknown1]', normalizeRagSources([row('one')]));
    expect(result.invalidCitations).toEqual(['S7+', 'S99']);
    expect(result.citationsMissing).toBe(true);
    expect(result.cleanedResponse).not.toMatch(/\[S99\]|\[S7\+\]|\[chunk:unknown1\]/);
    expect(result.cleanedResponse).toContain('non erano verificabili');
    expect(result.cleanedResponse).not.toContain('## Fonti');
  });

  it('non cancella le sezioni successive a Fonti e non presenta similarity come affidabilità', () => {
    const result = validateCitations('Dato [S1]\n\n## Fonti\n- inventata\n\n## Prossimi passi\nControlla il documento', normalizeRagSources([row('one')]));
    expect(result.cleanedResponse).toContain('## Prossimi passi\nControlla il documento');
    expect(result.cleanedResponse).not.toContain('inventata');
    expect(result.cleanedResponse).not.toContain('sim 0.80');
    expect(result.cleanedResponse).toContain('- [S1] one');
  });

  it('ripulisce no-rag senza distinzione maiuscole e rispetta warn', () => {
    expect(validateCitations('[NO-RAG] Ciao', [], 'warn').cleanedResponse).toBe('Ciao');
    expect(validateCitations('Dato [S99]', [], 'warn').cleanedResponse).toBe('Dato [S99]');
  });
});

describe('estrazione memoria validata', () => {
  it('una risposta incompleta fallisce: non va segnata come elaborata', () => {
    expect(() => parseExtractedMemory('{}')).toThrow();
    expect(() => parseExtractedMemory('not-json')).toThrow();
  });
  it('accetta solo facts con formato e confidence validi', () => {
    const result = parseExtractedMemory(JSON.stringify({ summary: 'Sintesi', topics: ['lavori', 2], facts: [
      { key: 'banca', value: 'X', confidence: 0.9 }, { key: 'oops', value: 'X', confidence: 12 },
      { key: 'bad key', value: 'X', confidence: 1 }, { key: 'low', value: 'X', confidence: 0.1 },
    ] }));
    expect(result.facts).toHaveLength(1);
    expect(result.topics).toEqual(['lavori']);
  });
  it('elabora batch limitati senza saltare i messaggi successivi', () => {
    const messages = [0, 1, 2].map(i => ({ id: String(i), content: 'x'.repeat(40), created_at: String(i) }));
    expect(memoryBatch(messages, 120).map(m => m.id)).toEqual(['0', '1']);
    expect(memoryBatch(messages.slice(2), 100).map(m => m.id)).toEqual(['2']);
  });
  it('riprende un messaggio lungo fino all’ultimo carattere senza spezzare emoji', () => {
    const content = 'a'.repeat(29) + '😀' + 'b'.repeat(79);
    let offset = 0;
    const parts: string[] = [];
    for (let turn = 0; turn < 10; turn++) {
      const [part] = memoryBatch([{ content, created_at: 'now', id: 'long' }], 30, offset);
      expect(part.start_offset).toBe(offset);
      expect(part.content).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
      parts.push(part.content);
      if (part.complete) break;
      expect(part.end_offset).toBeGreaterThan(offset);
      offset = part.end_offset;
    }
    expect(parts.join('')).toBe(content);
  });
  it('dopo la coda parziale elabora il messaggio successivo dall’inizio', () => {
    const batch = memoryBatch([{ content: '0123456789', created_at: 'now' }, { content: 'new', created_at: 'now' }], 100, 7);
    expect(batch.map(m => m.content)).toEqual(['789', 'new']);
    expect(batch.every(m => m.complete)).toBe(true);
  });
  it('rifiuta offset impossibili anziché avanzare in silenzio', () => {
    expect(() => memoryBatch([{ content: 'short', created_at: 'now' }], 100, 10)).toThrow();
    expect(() => memoryBatch([], 100, -1)).toThrow();
  });
});

describe('stesso controllo permessi dopo conferma', () => {
  const name = '__hardening_test__';
  afterEach(() => { delete SILVIO_TOOLS[name]; });
  function fixture(options: { permissions?: unknown; permissionError?: unknown; proposal?: unknown; output?: unknown; risk?: 'safe' | 'red' } = {}) {
    const executor = vi.fn().mockResolvedValue(options.output ?? { ok: true });
    SILVIO_TOOLS[name] = { schema: { type: 'function', function: { name, description: 'test', parameters: { type: 'object', properties: {} } } },
      executor, domain: 'cantiere', riskLevel: options.risk ?? 'safe', allowedRoles: ['company_admin', 'company_staff'] } as SilvioTool;
    const audit = vi.fn().mockResolvedValue({ error: null });
    const db = { from: (table: string) => {
      if (table === 'tool_execution_log') return { insert: audit };
      const query = { select: () => query, eq: () => query,
        maybeSingle: async () => table === 'staff_permissions'
          ? { data: options.permissions ?? null, error: options.permissionError ?? null }
          : { data: options.proposal, error: null } };
      return query;
    }, rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const ctx = { supabase: db, companyId: 'company', userId: 'user', primaryRole: 'company_staff', preApproved: true } as ToolContext;
    return { ctx, executor, audit };
  }
  it('blocca un permesso revocato prima della conferma senza eseguire', async () => {
    const { ctx, executor } = fixture({ permissions: { can_view_orders: false } });
    const result = await executeToolWithRouting(name, {}, ctx, 'proposal');
    expect(result.error?.code).toBe('forbidden_permission');
    expect(executor).not.toHaveBeenCalled();
  });
  it('errore lettura permessi non equivale a nessuna restrizione', async () => {
    const { ctx, executor } = fixture({ permissionError: { message: 'down' } });
    expect((await executeToolWithRouting(name, {}, ctx)).error?.code).toBe('permissions_unavailable');
    expect(executor).not.toHaveBeenCalled();
  });
  it('conferma rossa valida usa il percorso comune e non crea altra proposta', async () => {
    const { ctx, executor } = fixture({ risk: 'red', proposal: {
      id: 'proposal', action_type: name, company_id: 'company', user_id: 'user', resolved_by: 'user', status: 'confirmed',
    } });
    const result = await executeToolWithRouting(name, {}, { ...ctx, primaryRole: 'company_admin' }, 'proposal');
    expect(result.success).toBe(true);
    expect(result.proposalId).toBeUndefined();
    expect(executor).toHaveBeenCalledOnce();
  });
  it('una proposta di altra azienda non autorizza la scrittura', async () => {
    const { ctx, executor } = fixture({ risk: 'red', proposal: { status: 'confirmed', company_id: 'other' } });
    expect((await executeToolWithRouting(name, {}, ctx, 'proposal')).error?.code).toBe('invalid_confirmation');
    expect(executor).not.toHaveBeenCalled();
  });
  it('un executor che restituisce errore non viene registrato come successo', async () => {
    const { ctx, audit } = fixture({ output: { error: 'Non salvato' } });
    expect((await executeToolWithRouting(name, {}, ctx)).success).toBe(false);
    expect(audit.mock.calls[0][0]).toMatchObject({ status: 'error', error_message: 'Non salvato' });
  });
});

describe('contratti di integrazione locale', () => {
  const read = (file: string) => readFileSync(file, 'utf8');
  it('i consumatori secondari usano ricerca vincolata all’attore', () => {
    for (const name of ['kb-test-rag', 'ai-quote-supreme']) {
      const code = read(`supabase/functions/${name}/index.ts`);
      expect(code).toContain('rpc("silvio_match_brain"');
      expect(code).toContain('p_user_id: userId');
      expect(code).not.toContain('rpc("match_brain"');
    }
    const quote = read('supabase/functions/ai-quote-supreme/index.ts');
    expect(quote).toContain('if (canUseCompanyHistory && (body.customer_id || body.customer_name))');
    expect(quote).not.toContain('customer_name.eq.');
  });
  it('fallimenti di indicizzazione non avanzano il cursore, anche senza facts', () => {
    const code = read('supabase/functions/silvio-memory-extract/index.ts');
    expect(code).toContain('throw e; // Retry the same batch');
    expect(code).toContain('processed_offset: messages.at(-1)!.complete ? 0');
    expect(code).not.toContain('if (summaryEmbedding && extracted.facts.length');
  });
  it('autoapprendimento e schermata non trasformano errori parziali in successi', () => {
    const edge = read('supabase/functions/silvio-self-improvement/index.ts');
    expect(edge).toContain('if (logError) errors.push');
    expect(edge).not.toContain('ok: true');
    const ui = read('src/components/admin/silvio-hub/LearningTab.tsx');
    expect(ui).toContain('data?.ok !== true');
    expect(ui).toContain('onSettled:');
    expect(ui).toContain('logsQuery.isError');
  });
  it('i percorsi automatico e confermato condividono controllo esito e filtri', () => {
    const routing = read('supabase/functions/_shared/silvioToolExecution.ts');
    expect(routing.match(/assertToolSucceeded\(raw\);/g)).toHaveLength(2);
    expect(routing.match(/scope \? applyStaffScope\(raw, scope, tool.domain\) : raw/g)).toHaveLength(2);
    expect(routing).toContain('DECISION_RULES_AUTOEXEC_ENABLED = false');
    expect(read('supabase/functions/silvio-memory-extract/index.ts')).toContain('if (queueError) throw queueError');
  });
  it('chat non usa cronologia troncata come contatore della memoria', () => {
    const chat = read('supabase/functions/silvio-chat/index.ts');
    expect(chat).not.toContain('totalMsgInChannel');
    expect(chat).toContain('runtime.waitUntil(memoryWork)');
    expect(chat).toContain('silvio_recall_persona_memory');
  });
  it('migrazione isola tenant/utente e non autorizza anon', () => {
    const sql = read('supabase/migrations/20261007104833_silvio_context_isolation_and_memory.sql');
    expect(sql).toContain('auth.uid() IS DISTINCT FROM p_user_id');
    expect(sql).toContain('WHERE company_id = p_company_id AND user_id = p_user_id');
    expect(sql).toContain('d.valid_until > now()');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).not.toMatch(/GRANT.*TO anon/);
  });
  it('memorie demo opt-in e statistiche sui dati salvati', () => {
    const ui = read('src/pages/azienda/AIMemoryPage.tsx');
    expect(ui).toContain('[demoExamplesCompany, setDemoExamplesCompany] = useState<string | null>(null)');
    expect(ui).toContain('demoExamplesCompany === effectiveCompany.id');
    expect(ui).toContain('total: normalizedRealMemories.length');
    expect(ui).toContain('hits_count: 0');
  });
  it('runner non ripete azioni non supportate e usa la stessa chiave sui retry email', () => {
    const runner = read('supabase/functions/silvio-action-runner/index.ts');
    expect(runner).toContain('"Idempotency-Key": `silvio-action/${actionId}`');
    expect(runner).toContain('result.retryable === true');
    expect(runner).toContain('if (savedError) throw savedError');
    expect(runner).not.toContain('Action fallita 3x');
  });
});
