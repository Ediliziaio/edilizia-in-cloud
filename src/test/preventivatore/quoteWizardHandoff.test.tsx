import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { aiEditorDraft, applyAiEditorProject } from '@/lib/preventivi/quoteAiEditorBridge';
import { emptyQuoteProject } from '@/lib/preventivi/quoteProject';
import { emptyChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { quoteScheduleDocumentText, quoteScheduleScope, type LocalQuoteSchedule } from '@/lib/preventivi/quoteSchedule';
import { quoteAiWorkflow } from '@/lib/moduli-vendita/quoteAiWorkflow';
import { SALES_AREAS } from '@/lib/moduli-vendita/areas';
import { quoteBuilder } from '@/lib/moduli-vendita/quoteBuilders';
import { buildLocalQuotePdfData } from '@/lib/preventivi/localQuotePdf';
import { applyBathroomBudgetExample } from '@/lib/preventivi/quoteBathroomBudgetExample';
import QuoteWizardProjectPanel from '@/components/quotes/dev/QuoteWizardProjectPanel';

afterEach(cleanup);
const scope = 'test-scope';
const schedule = (): LocalQuoteSchedule => ({ confirmed: true, sourceRevision: 0, sourceScope: scope, startDate: null,
  proposal: { title: 'Programma sintetico', assumptions: ['Disponibilità da verificare'], tasks: [
    { id: 'a', title: 'Preparazioni', kind: 'work', minDays: 1, maxDays: 2, after: [], basis: 'Ipotesi di prova' },
    { id: 'b', title: 'Asciugatura', kind: 'wait', minDays: 3, maxDays: 4, after: ['a'], basis: 'Prodotto da confermare' },
  ] } });
describe('Dati documento condivisi tra chat e wizard', () => {
  it('trasferisce note, indirizzo lavori e tipologia senza confondere il cliente', () => {
    const project = { ...emptyQuoteProject(), address: 'Cantiere sintetico', propertyType: 'Appartamento', notes: 'Impianti esclusi' };
    const draft = aiEditorDraft(emptyChatDocument(), { tipoLavoro: 'Tinteggiatura', clientAddress: 'Sede cliente diversa', clientName: 'Cliente di prova', internalNotes: 'Solo interno', notes: 'Vecchia nota', indirizzoLavori: 'Vecchio cantiere' }, project);
    expect(draft).toMatchObject({ notes: project.notes, indirizzoLavori: project.address, tipoLavoro: 'Tinteggiatura',
      clientAddress: 'Sede cliente diversa', clientName: 'Cliente di prova', internalNotes: 'Solo interno' });
    const next = applyAiEditorProject(project, { ...draft, notes: 'Nuova esclusione', indirizzoLavori: 'Cantiere aggiornato' });
    expect(aiEditorDraft(emptyChatDocument(), draft, next)).toMatchObject({ notes: 'Nuova esclusione', indirizzoLavori: 'Cantiere aggiornato', clientAddress: 'Sede cliente diversa' });
    expect(project.notes).toBe('Impianti esclusi');
    expect(applyAiEditorProject(project, { tipoLavoro: 'Serramenti' }).propertyType).toBe('Appartamento');
  });
  it('rispetta cancellazioni esplicite e conserva fasi, ipotesi e costi separatamente', () => {
    const project = { ...emptyQuoteProject(), address: 'Cantiere', notes: 'Nota', proposalNotes: 'Assunzioni AI', schedule: schedule() };
    const next = applyAiEditorProject(project, { notes: '', indirizzoLavori: '' });
    expect(next).toMatchObject({ notes: '', address: '', proposalNotes: 'Assunzioni AI', schedule: schedule() });
    expect(applyAiEditorProject(next, { clientName: 'Altro' }).notes).toBe('');
  });
  it('rifiuta un trasferimento oltre limite senza modificare la bozza sorgente', () => {
    const project = { ...emptyQuoteProject(), notes: 'Conservata' };
    expect(() => applyAiEditorProject(project, { notes: 'x'.repeat(3001), indirizzoLavori: 'Non applicato' })).toThrow();
    expect(project).toMatchObject({ notes: 'Conservata', address: '' });
  });
});
describe('Fasi strutturate importate', () => {
  it('esporta solo programmi confermati e riferiti all’ambito corrente', () => {
    expect(quoteScheduleDocumentText(schedule(), scope)).toContain('Asciugatura: 3–4 giorni solari di attesa');
    expect(quoteScheduleDocumentText(schedule(), 'changed')).toBeUndefined();
    expect(quoteScheduleDocumentText({ ...schedule(), confirmed: false }, scope)).toBeUndefined();
  });
  it('le fasi sono modificabili nello stesso pannello e richiedono nuova conferma', () => {
    function Editor() {
      const [project, setProject] = useState({ ...emptyQuoteProject(), proposalNotes: 'Impianti esclusi', schedule: schedule() });
      return <QuoteWizardProjectPanel context={{ project, scope, onChange: next => setProject({ ...next, proposalNotes: next.proposalNotes ?? '', schedule: next.schedule! }), onRegenerate: vi.fn() }} documentFields />;
    }
    render(<Editor />);
    fireEvent.click(screen.getByText('Dati immobile, note e fasi'));
    expect(screen.getByRole('textbox', { name: 'Ipotesi ed esclusioni importate' })).toHaveValue('Impianti esclusi');
    fireEvent.change(screen.getByRole('textbox', { name: 'Ipotesi ed esclusioni importate' }), { target: { value: '' } });
    expect(screen.getByRole('textbox', { name: 'Ipotesi ed esclusioni importate' })).toHaveValue('');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Durata minima fase 1' }), { target: { value: '2' } });
    expect(screen.getByRole('button', { name: 'Conferma ipotesi del cronoprogramma' })).not.toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Durata minima fase 1' })).toHaveValue(2);
  });
  it('le fasi superate restano consultabili ma non confermabili', () => {
    render(<QuoteWizardProjectPanel context={{ project: { ...emptyQuoteProject(), schedule: schedule() }, scope: 'changed', onChange: vi.fn(), onRegenerate: vi.fn() }} />);
    fireEvent.click(screen.getByText('Ipotesi e fasi importate dalla chat'));
    expect(screen.getByRole('spinbutton', { name: 'Durata minima fase 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Conferma ipotesi del cronoprogramma' })).toBeDisabled();
  });
  it('il PDF Bagni conserva ipotesi e fasi effettive, non quelle campione del template', () => {
    const company = 'd2000000-0000-4000-a000-000000000002';
    const doc = applyBathroomBudgetExample(emptyChatDocument(), 0);
    const currentScope = quoteScheduleScope(doc.lines);
    const project = { ...emptyQuoteProject(), notes: 'Nota cliente', proposalNotes: 'Esclusioni AI conservate', schedule: { ...schedule(), sourceScope: currentScope } };
    const draft = { modelId: 'completo' as const, clientName: 'Demo', iva: null as null, rows: [] as never[] };
    const data = buildLocalQuotePdfData(doc, draft, project, company, 'Demo', undefined, currentScope);
    expect(JSON.stringify(data.scheda)).toContain('Esclusioni AI conservate');
    expect(data.modello.cronoprogramma.map(row => row.fase)).toEqual(['Preparazioni', 'Asciugatura']);
    expect(data.modello.mostraCronoprogramma).toBe(true);
    expect(buildLocalQuotePdfData(doc, draft, project, company, 'Demo', undefined, 'changed').modello.cronoprogramma).toEqual([]);
  });
});
describe('Routing verificato di tutte le aree e interventi', () => {
  it('usa l’intera tassonomia disponibile, non un campione di moduli', () => expect(SALES_AREAS).toHaveLength(14));
  it.each(SALES_AREAS.flatMap(area => area.interventions.map(intervention => ({ area, intervention, label: `${area.id}/${intervention.id}` }))))('$label non viene aperto in un wizard diverso', ({ area, intervention }) => {
    const workflow = quoteAiWorkflow(area, intervention);
    expect(workflow.engine).toBe(area.sourceModule); expect(workflow.modelId).toBe(intervention.id);
    if (['bagni', 'climatizzazione', 'elettrico', 'termoidraulico', 'pavimenti', 'piscine', 'ristrutturazione', 'tetti'].includes(area.sourceModule) && quoteBuilder(area, intervention)?.connected) expect(workflow.kind).toBe('wizard-ai');
    else if (['serramenti', 'fotovoltaico'].includes(area.sourceModule) && quoteBuilder(area, intervention)?.connected) expect(workflow.kind).toBe('native-ai');
    else expect(['manual-only', 'unavailable']).toContain(workflow.kind);
  });
  it('rifiuta identità o motori falsificati senza ripiegare sul classico', () => {
    const area = SALES_AREAS[0];
    expect(quoteAiWorkflow({ ...area, sourceModule: 'bagni' }, area.interventions[0]).kind).toBe('unavailable');
    expect(quoteAiWorkflow(area, { ...area.interventions[0], id: 'not-registered' }).kind).toBe('unavailable');
  });
});
