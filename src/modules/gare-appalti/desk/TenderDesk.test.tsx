import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Workspace, Participation, Tender } from '../types';
import { TenderDesk } from './TenderDesk';
const env = vi.hoisted(() => ({ local: vi.fn(), update: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined), edit: true, planError: false, startError: false, data: {} as Workspace, plan: {} as Record<string, unknown> }));
vi.mock('../WorkspaceContext', () => ({ useWorkspace: () => ({ api: { companyId: 'company', local: env.local, update: env.update }, data: env.data, canEdit: env.edit, canApprove: env.edit, refresh: env.refresh }) }));
vi.mock('../dossier/PreparationPanel', () => ({ PreparationPanel: () => <p>Analisi e proposte salvate</p> }));
vi.mock('../pages/SourceChanges', () => ({ SourceChanges: (): null => null }));
vi.mock('../pages/TenderOverview', () => ({ TenderOverview: () => <p>Dettagli della procedura</p> }));
const p = { id: 'p', tender_id: 't', stage: 'in_valutazione', decision: 'approfondisci', responsible: 'Anna' } as Participation;
const tender = { id: 't', base_amount: 1000, deadline_date: '2099-12-20', deadline_time: '12:00:00', timezone: 'Europe/Rome' } as Tender;
let host: HTMLDivElement, root: Root, cache: QueryClient;
async function until(check: () => boolean) { for(let i=0;i<80;i++){ await act(async()=>{await new Promise(r=>setTimeout(r,10));}); if(check())return; } expect(check()).toBe(true); }
function mount() {
 cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 act(()=>root.render(<QueryClientProvider client={cache}><MemoryRouter><TenderDesk participation={p} tender={tender} documents={env.data.documents} blockers={{ data: [], isPending: false, isError: false }} busy={false} run={vi.fn()} onModal={vi.fn()} onTab={vi.fn()} onAI={vi.fn()} documentList={() => null}/></MemoryRouter></QueryClientProvider>));
}
const nextButton=()=>host.querySelector<HTMLButtonElement>('.ga-desk-next>button')!;
beforeEach(() => {
 vi.clearAllMocks(); env.edit = true; env.planError = false; env.startError = false;
 env.data = { documents: [{ id: 'source', tender_id: 't', category: 'fonte', name: 'Bando.pdf' }], lots: [], participationLots: [], evidence: [], requirements: [], documentRequests: [], tasks: [], technicalCriteria: [], exports: [], submissions: [], companyAssets: [], journeys: [] } as unknown as Workspace;
 env.plan = { models: [], subjects: [], cases: [], source_coverage: [{ id: 'source', complete: false }], latest_run: null };
 env.local.mockImplementation(async (group: string, action: string) => {
  if (action === 'plan') { if (env.planError) throw Error('Piano non disponibile'); return env.plan; }
  if (action === 'list') return [];
  if (group === 'preparation' && action === 'start') { if (env.startError) throw Error('Motore locale non disponibile'); return { id: 'run' }; }
  throw Error('Unexpected API call');
 });
});
afterEach(()=>{act(()=>root?.unmount());host?.remove();cache?.clear();});
it('non avvia elaborazioni entrando nella gara; un clic esplicito avvia il coordinamento senza approvare o cambiare stato', async () => {
 mount(); await until(()=>!nextButton().disabled);
 expect(nextButton().textContent).toContain('Analizza e prepara');
 expect(env.local.mock.calls.some(c => c[1] === 'start')).toBe(false);
 act(()=>nextButton().click());
 await until(()=>host.textContent!.includes('Analisi e proposte salvate'));
 expect(env.local).toHaveBeenCalledWith('preparation', 'start', { participation_id: 'p', force: false });
 expect(env.local.mock.calls.filter(c => c[1] === 'start')).toHaveLength(1);
 expect(env.update).not.toHaveBeenCalled(); expect(p.stage).toBe('in_valutazione');
});
it('in sola lettura permette di consultare il percorso e non avvia la preparazione', async () => {
 env.edit = false; mount(); await until(()=>!nextButton().disabled);
 expect(nextButton().textContent).toContain('Consulta preparazione'); act(()=>nextButton().click());
 await until(()=>host.textContent!.includes('Analisi e proposte salvate')); expect(env.local.mock.calls.some(c => c[1] === 'start')).toBe(false);
});
it('mostra l’errore di avvio e lascia riprovare senza risultati o avanzamenti inventati', async () => {
 env.startError = true; mount(); await until(()=>!nextButton().disabled); act(()=>nextButton().click());
 await until(()=>!!host.querySelector('[role=alert]')); expect(host.querySelector('[role=alert]')!.textContent).toContain('Motore locale non disponibile');
 expect(nextButton().disabled).toBe(false); expect(env.update).not.toHaveBeenCalled(); expect(host.textContent).not.toContain('Analisi e proposte salvate');
});
it('un piano non disponibile non produce uno stato pronto e propone il recupero dei controlli', async () => {
 env.planError = true; mount(); await until(()=>nextButton().textContent!.includes('Ricarica controlli'));
 expect(host.querySelector('[role=alert]')!.textContent).toContain('Piano non disponibile'); expect(env.local.mock.calls.some(c => c[1] === 'start')).toBe(false);
});

it('attende il piano prima di rendere disponibili gli avvii anche nella lista laterale',async()=>{
 env.local.mockImplementation((_group:string,action:string)=>action==='plan'?new Promise(()=>{}):action==='list'?Promise.resolve([]):Promise.reject(Error('Unexpected API call')));
 mount(); await act(async()=>{await new Promise(r=>setTimeout(r,20));});
 expect(nextButton().disabled).toBe(true);
 expect([...host.querySelectorAll<HTMLButtonElement>('.ga-work-list article>button')].every(button=>button.disabled)).toBe(true);
 expect(env.local.mock.calls.some(c=>c[1]==='start')).toBe(false);
});
