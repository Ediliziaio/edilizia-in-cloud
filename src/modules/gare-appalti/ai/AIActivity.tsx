import { Check, FileText, ListChecks, Pause, Sparkles, TriangleAlert } from 'lucide-react';
import './ai-activity.css';

export type ActivityStatus = 'queued' | 'running' | 'waiting_review' | 'done' | 'error' | 'interrupted' | 'cancelled';
type ActivityStage = 0 | 1 | 2;
interface Props {
 status: ActivityStatus;
 message: string;
 progress?: number;
 phase?: 'reading' | 'matching' | 'writing';
 sourceCount?: number;
 sourceNames?: string[];
 compact?: boolean;
 stage?: ActivityStage;
 labels?: readonly [string, string, string];
}

const icons = [FileText, Sparkles, ListChecks];
const activityLabels = {
 reading: ['Dati', 'Analisi', 'Risultati'],
 matching: ['Dati', 'Confronto', 'Risultati'],
 writing: ['Dati', 'Stesura', 'Bozza'],
} as const;

export function AIActivity({
 status, message, progress, phase = 'reading', sourceCount, sourceNames = [], compact = false,
 stage = 1, labels = activityLabels[phase],
}: Props) {
 const active = status === 'queued' || status === 'running';
 const finished = status === 'done' || status === 'waiting_review';
 const problem = status === 'error';
 const value = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : undefined;
 const Icon = finished ? Check : problem ? TriangleAlert : active ? Sparkles : Pause;
 const title = status === 'done' ? 'Elaborazione completata' : finished ? 'Proposte da rivedere'
  : problem ? 'Elaborazione da riprendere' : status === 'queued' ? 'Avvio dell’elaborazione'
  : active ? 'Elaborazione in corso' : status === 'cancelled' ? 'Elaborazione annullata' : 'Elaborazione interrotta';

 return <section className={`ga-ai-activity ${active ? 'is-active' : ''} ${finished ? 'is-finished' : ''} ${problem ? 'is-error' : ''} ${compact ? 'is-compact' : ''}`} aria-label="Stato dell’elaborazione AI">
  <header className="ga-ai-heading">
   <span className="ga-ai-header-icon" aria-hidden="true"><Icon size={17}/></span>
   <div><h3>{title}</h3><p aria-live="polite" aria-atomic="true">{message}</p></div>
   {active && value !== undefined && <strong className="ga-ai-percent">{Math.round(value)}%</strong>}
  </header>
  <ol className="ga-ai-pipeline" aria-label="Fasi dell’elaborazione">
   {labels.map((label, index) => {
    const StepIcon = icons[index];
    const completed = finished || ((status === 'running' || !!value) && index < stage);
    const current = status === 'running' && index === stage;
    return <li key={index} data-state={completed ? 'done' : current ? 'current' : 'waiting'} aria-current={current ? 'step' : undefined}>
     {index > 0 && <span className="ga-ai-edge" aria-hidden="true" data-flow={active && (current || (status === 'queued' && index === 1))}><i/><i/><i/></span>}
     <span className="ga-ai-node-icon" aria-hidden="true">{completed ? <Check size={16}/> : <StepIcon size={16}/>}</span>
     <span className="ga-ai-node-label">{label}{completed && <span className="sr-only"> · completato</span>}</span>
    </li>;
   })}
  </ol>
  {active && <div className={`ga-ai-progress ${value === undefined ? 'is-indeterminate' : ''}`} role="progressbar" aria-label="Avanzamento AI"
   aria-valuemin={value === undefined ? undefined : 0} aria-valuemax={value === undefined ? undefined : 100} aria-valuenow={value}
   aria-valuetext={value === undefined ? 'Elaborazione in corso, percentuale non disponibile' : `${Math.round(value)}% registrato dal servizio locale`}>
   <span style={value === undefined ? undefined : { width: `${value}%` }}/>
  </div>}
  {(sourceCount !== undefined || sourceNames.length > 0 || !active) && <footer className="ga-ai-meta">
   {sourceCount !== undefined && <span>{sourceCount} {sourceCount === 1 ? 'fonte' : 'fonti'}</span>}
   {sourceNames.length > 0 && <span className="ga-ai-source" title={sourceNames.join(' · ')}>{sourceNames[0]}{sourceNames.length > 1 ? ` +${sourceNames.length - 1}` : ''}</span>}
   {status === 'waiting_review' && <span>Le proposte richiedono la tua revisione</span>}
   {!active && !finished && <span>Riprendi dai passaggi salvati</span>}
  </footer>}
 </section>;
}
