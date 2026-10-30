import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { SALES_AREAS } from '@/lib/moduli-vendita/areas';
import { findTettiTemplateModule } from '@/lib/moduli-vendita/tettiTemplateModules';

const state = vi.hoisted(() => ({
  id: 'synthetic-project' as string | undefined, params: new URLSearchParams(), supported: true,
  snapshot: null as unknown, computoStatus: 'modifiche', save: vi.fn(async () => ({ id: 'synthetic-project' })),
  finishComputo: (() => {}) as () => void,
}));
vi.mock('react-router-dom', () => ({ useParams: () => ({ id: state.id }), useSearchParams: () => [state.params, vi.fn()], useNavigate: () => vi.fn(), useInRouterContext: () => false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'synthetic-user' }, effectiveCompany: { id: 'demo', name: 'Azienda sintetica' } }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canViewMargins: false, canViewCosts: false }) }));
vi.mock('@/hooks/useSalvaUscendo', () => ({ useSalvaUscendo: () => ({ segnaSalvato: vi.fn() }) }));
vi.mock('@/hooks/useSupportoModelliPreventivo', () => ({ useSupportoModelloPreventivo: () => ({ supported: state.supported, isLoading: false }) }));
vi.mock('@/hooks/useTettiModelSupport', () => ({ useTettiModelSupport: () => ({ supported: state.supported, isLoading: false }) }));
vi.mock('@/components/preventivatore/EsigenzeCliente', () => ({ EsigenzeCliente: (): null => null }));
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'is', 'order', 'limit']) chain[name] = () => chain;
  chain.maybeSingle = async () => ({ data: null as null, error: null as null });
  return { supabase: { from: () => chain } };
});

const families = [
  ['bagni', 'Bagni', 'Bgn'], ['climatizzazione', 'Climatizzazione', 'Clm'],
  ['elettrico', 'Elettrico', 'Ele'], ['termoidraulico', 'Termoidraulico', 'Idr'],
  ['pavimenti', 'Pavimenti', 'Pav'], ['piscine', 'Piscine', 'Pis'],
  ['ristrutturazione', 'Ristrutturazione', 'Rst'], ['tetti', 'Tetti', 'Tet'],
] as const;
type Row = { id: string; descrizione: string; quantita: number; prezzo_unitario: number; [key: string]: unknown };
const row = (id: string, title: string, price: number): Row => ({ id, descrizione: title, company_id: 'demo', progetto_id: 'synthetic-project', capitolo_nome: 'Fase sintetica', unita_misura: 'mq', quantita: 1, prezzo_unitario: price, sconto_pct: 0, costo_materiali: 0, costo_manodopera: 0, ordine: 0 });
const components = new Map<string, ComponentType>();
type StepProps = { form: Record<string, unknown>; onChange: (key: string, value: unknown) => void };
beforeAll(async () => {
  for (const [module, name, prefix] of families) {
    const path = `/src/pages/azienda/${module}/${name}Wizard`;
    vi.doMock(`/src/hooks/use${name}Progetto`, () => ({
      [`use${name}Progetto`]: () => ({ data: state.id ? { progetto: { id: state.id, company_id: 'demo', cliente_nome: 'Cliente sintetico', code: 'PROVA', stato: 'bozza', iva_pct: 10, sconto_pct: 0, detrazione_pct: 0, prezzo_manuale: null as null, modello_snapshot: state.snapshot }, computo: [row('saved', 'Voce salvata', 100)], media: [] as never[] } : undefined, isLoading: false, refetch: vi.fn() }),
      useUpsertProgetto: () => ({ mutateAsync: state.save, isPending: false }),
      [`use${prefix}TemplatePdf`]: () => ({ data: { company_id: 'demo', ragione_sociale: 'Azienda sintetica' } }),
      [`get${prefix}TemplatePdf`]: vi.fn(),
    }));
    vi.doMock(`${path}/StepCliente`, () => ({ default: ({ form, onChange }: StepProps) => <label>Cliente di prova<input aria-label="Cliente di prova" value={String(form.cliente_nome ?? '')} onChange={e => onChange('cliente_nome', e.target.value)} /></label> }));
    vi.doMock(`${path}/StepImmobile`, () => ({ default: ({ form, onChange, model }: StepProps & { model?: { id: string } }) => <div><p>Intervento nativo: {model?.id ?? 'generale'}</p><label>Nota di prova<input aria-label="Nota di prova" value={String(form.note ?? '')} onChange={e => onChange('note', e.target.value)} /></label></div> }));
    vi.doMock(`${path}/StepComputo`, () => ({ default: ({ initialComputo, onVociChange, onStato }: { initialComputo: Row[]; onVociChange: (rows: Row[]) => void; onStato: (s: string) => void }) => <button onClick={() => { onVociChange([...initialComputo, row('live', 'Voce aggiunta in locale', 200)]); onStato(state.computoStatus); state.finishComputo = () => onStato('salvato'); }}>Modifica computo sintetico</button> }));
    vi.doMock(`${path}/StepMedia`, () => ({ default: () => <p>Foto sintetiche</p> }));
    vi.doMock(`${path}/StepEconomia`, () => ({ default: ({ form, onChange }: StepProps) => <label>IVA sintetica<input type="number" aria-label="IVA sintetica" value={Number(form.iva_pct ?? 0)} onChange={e => onChange('iva_pct', Number(e.target.value))} /></label> }));
    vi.doMock(`${path}/StepPdf`, () => ({ default: ({ progetto, computo }: { progetto: Record<string, unknown>; computo: Row[] }) => <section aria-label="Payload PDF sintetico"><p>{String(progetto.note ?? '')}</p><p>IVA: {String(progetto.iva_pct)}</p>{computo.map(r => <p key={r.id}>{r.descrizione}</p>)}</section> }));
    components.set(module, (await import(/* @vite-ignore */ path + '.tsx')).default);
  }
});
beforeEach(() => { state.id = 'synthetic-project'; state.params = new URLSearchParams(); state.supported = true; state.snapshot = null; state.computoStatus = 'modifiche'; state.save.mockClear(); localStorage.clear(); });
afterEach(cleanup);
function mount(module: string) {
  const Wizard = components.get(module)!;
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Wizard /></QueryClientProvider>);
}
const nav = () => screen.getByRole('navigation', { name: /Fasi del preventivo/ });

describe.each(families)('%s: wizard originale con confini dati simulati', (module) => {
  if (module === 'bagni') it('il collegamento diretto al PDF esistente prevale sull avanzamento automatico', async () => {
    state.params = new URLSearchParams({ step: 'pdf' }); mount(module);
    expect(await screen.findByRole('region', { name: 'Payload PDF sintetico' })).toHaveTextContent('Voce salvata');
    expect(within(nav()).getByRole('button', { name: 'PDF' })).toHaveAttribute('aria-current', 'step');
  });
  it('espone tutti i sei passi e trasferisce note e IVA fino al PDF', async () => {
    mount(module);
    const buttons = within(nav()).getAllByRole('button'); expect(buttons).toHaveLength(6);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nota di prova' }), { target: { value: 'Impianti esclusi, nota sintetica' } });
    fireEvent.click(within(nav()).getByRole('button', { name: 'Economia' }));
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'IVA sintetica' }), { target: { value: '22' } });
    fireEvent.click(within(nav()).getByRole('button', { name: 'PDF' }));
    const payload = await screen.findByRole('region', { name: 'Payload PDF sintetico' });
    expect(payload).toHaveTextContent('Impianti esclusi'); expect(payload).toHaveTextContent('IVA: 22'); expect(payload).toHaveTextContent('Voce salvata');
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'synthetic-project', note: 'Impianti esclusi, nota sintetica', iva_pct: 22 }));
  });
  it.each(['modifiche', 'salvando', 'errore'])('non apre un PDF vecchio con il computo in stato %s', async status => {
    state.computoStatus = status;
    mount(module);
    fireEvent.click(within(nav()).getByRole('button', { name: 'Computo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Modifica computo sintetico' }));
    fireEvent.click(within(nav()).getByRole('button', { name: 'PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('modifiche');
    expect(screen.queryByRole('region', { name: 'Payload PDF sintetico' })).not.toBeInTheDocument();
    act(() => state.finishComputo());
    expect(await screen.findByRole('region', { name: 'Payload PDF sintetico' })).toHaveTextContent('Voce aggiunta in locale');
  });
  it.each(SALES_AREAS.filter(a => a.sourceModule === module).flatMap(a => a.interventions))('$id: sceglie il modello nativo senza creare progetti', async model => {
    state.id = undefined; state.params = new URLSearchParams({ modello: model.id });
    mount(module);
    const title = module === 'tetti' ? findTettiTemplateModule(model.id)!.title : model.title;
    expect(await screen.findByRole('heading', { name: `Preventivo · ${title}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crea e continua/ })).toBeEnabled();
    expect(state.save).not.toHaveBeenCalled();
  });
  it('rifiuta modelli sconosciuti e impedisce la creazione quando il supporto manca', async () => {
    state.id = undefined; state.params = new URLSearchParams({ modello: 'non-esiste' });
    const view = mount(module); expect(await screen.findByRole('alert')).toHaveTextContent(/non.*riconosciuto/);
    expect(state.save).not.toHaveBeenCalled(); view.unmount();
    const model = SALES_AREAS.find(a => a.sourceModule === module)!.interventions[0];
    state.params = new URLSearchParams({ modello: model.id }); state.supported = false; mount(module);
    expect(screen.getByRole('button', { name: /Crea e continua/ })).toBeDisabled(); expect(state.save).not.toHaveBeenCalled();
  });
  it('blocca un modello salvato danneggiato senza sostituirlo con un documento generico', async () => {
    state.snapshot = { version: 1, companyId: 'altra-azienda', modelId: 'manutenzione', template: {} };
    mount(module); expect(await screen.findByRole('alert')).toHaveTextContent(/non.*valid|altra azienda/);
    expect(screen.queryByRole('navigation', { name: /Fasi del preventivo/ })).not.toBeInTheDocument();
  });
});
