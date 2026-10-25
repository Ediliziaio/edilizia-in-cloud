import { QuoteSchedulePanel } from './QuoteSchedulePanel';
import type { QuoteProject } from '@/lib/preventivi/quoteProject';

export type QuoteWizardProjectContext = {
  project: QuoteProject; scope: string;
  generatedNotes?: string;
  onChange: (project: QuoteProject) => void;
  onRegenerate: () => void;
};

/** Same structured phases as the chat, not a second independently editable schedule. */
export default function QuoteWizardProjectPanel({ context, documentFields = false }: {
  context: QuoteWizardProjectContext; documentFields?: boolean;
}) {
  const { project, scope, onChange, onRegenerate } = context;
  return <details className="my-3 rounded-xl border border-blue-100 bg-white p-3" aria-label="Dati AI condivisi con il wizard">
    <summary className="cursor-pointer text-sm font-medium text-blue-950">{documentFields ? 'Dati immobile, note e fasi' : 'Ipotesi e fasi importate dalla chat'}</summary>
    <div className="mt-3 space-y-3">
      {documentFields && <>
        <label className="block text-sm">Indirizzo cantiere<input aria-label="Indirizzo cantiere condiviso" className="mt-1 w-full rounded border p-2" value={project.address} maxLength={300} onChange={e => onChange({ ...project, address: e.target.value })} /></label>
        <label className="block text-sm">Note per il documento<textarea aria-label="Note documento condivise" className="mt-1 w-full rounded border p-2" rows={3} maxLength={3000} value={project.notes} onChange={e => onChange({ ...project, notes: e.target.value })} /></label>
      </>}
      <label className="block text-sm">Tipologia immobile<input aria-label="Tipologia immobile condivisa" className="mt-1 w-full rounded border p-2" value={project.propertyType} maxLength={100} onChange={e => onChange({ ...project, propertyType: e.target.value })} /></label>
      {project.proposalNotes !== undefined && <label className="block text-sm">Ipotesi ed esclusioni della proposta<textarea aria-label="Ipotesi ed esclusioni importate" className="mt-1 w-full rounded border p-2" rows={5} maxLength={9000} value={project.proposalNotes} onChange={e => onChange({ ...project, proposalNotes: e.target.value })} /></label>}
      {project.schedule ? <QuoteSchedulePanel schedule={project.schedule} stale={project.schedule.sourceScope !== scope} onChange={schedule => onChange({ ...project, schedule })} onRegenerate={onRegenerate} />
        : <p className="text-xs text-slate-600">Nessun cronoprogramma importato. Le righe del preventivo non diventano automaticamente fasi o assegnazioni di cantiere.</p>}
      <p className="text-xs text-slate-500">Questi dati sono condivisi con la chat e restano locali. Fasi e disponibilità non sono prenotazioni; le ipotesi non aggiornate non entrano nel documento cliente.</p>
    </div>
  </details>;
}
