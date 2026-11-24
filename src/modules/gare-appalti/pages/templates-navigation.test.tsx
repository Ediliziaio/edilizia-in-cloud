import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { TemplatesPanel } from './TemplatesPanel';
import type { Participation } from '../types';

const mock = vi.hoisted(() => ({ local: vi.fn(), subject: false }));
const contract = { id: 'model', name: 'Modello.docx', source_document_id: 'source', source_sha256: 'hash', format: 'docx_tokens', fields: [{ key: 'cig', label: 'CIG', supported: true, required: true }], mapping: { cig: 'ALTRO-OPERATORE' }, constraints: {} };
const contracts = [contract];
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: contracts }) }));
vi.mock('../WorkspaceContext', () => ({ useWorkspace: () => ({ canEdit: true, api: { companyId: 'company', local: mock.local }, data: { documents: [{ id: 'source', tender_id: 't', category: 'fonte', name: 'Modello.docx' }, { id: 'draft', participation_id: 'p', template_contract_id: 'model', generation_snapshot: { mapping: { cig: 'VALORE-DELLA-BOZZA' }, ...(mock.subject ? { subject_snapshot: { id: 'partner' } } : {}) } }] } }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
function render(view: string) { const el = document.createElement('div'); document.body.append(el); root = createRoot(el); act(() => root.render(<MemoryRouter initialEntries={[`/?documenti_vista=${view}&correggi_documento=draft`]}><TemplatesPanel participation={{ id: 'p', tender_id: 't' } as Participation} /></MemoryRouter>)); }
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); mock.subject = false; mock.local.mockClear(); });
it('una vista Modelli montata ma nascosta non apre finestre sopra la compilazione coordinata', () => { render('ufficio'); expect(document.querySelector('[role=dialog]')).toBeNull(); expect(mock.local).not.toHaveBeenCalled(); });
it('il modulo individuale recupera il valore della sua versione senza ispezione o scritture automatiche', () => { render('modelli'); expect(document.querySelector('[role=dialog]')).not.toBeNull(); expect(document.querySelector<HTMLInputElement>('input[aria-label="CIG"],input[name="field_cig"]')!.value).toBe('VALORE-DELLA-BOZZA'); expect(mock.local).not.toHaveBeenCalled(); });
it('un modulo di un operatore normalizzato non entra automaticamente nel percorso individuale', () => { mock.subject = true; render('modelli'); expect(document.querySelector('[role=dialog]')).toBeNull(); });
