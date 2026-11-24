import { Check, Circle } from 'lucide-react';
import type { GareDocument } from '../types';
import type { ReviewEntry } from './types';

export function ReviewProgress({ document: doc, entry, sent = false, current, reviewable }: { document: GareDocument; entry?: ReviewEntry; sent?: boolean; current?: boolean; reviewable?: boolean }) {
  const checked = (current ?? !!entry?.latest_current) && (reviewable ?? !!entry?.latest?.report.reviewable);
  const handed = sent || !!entry?.handoff_current;
  const approved = doc.status === 'approvato';
  const source = ['fonte', 'ricevuta'].includes(doc.category);
  const steps = [{ label: source ? 'Acquisito' : 'Generato', done: true }, { label: 'Controllato', done: checked }, ...source ? [] : [{ label: 'Al revisore', done: handed }, { label: 'Approvato', done: approved }]];
  return <ol className="ga-review-progress" aria-label="Stato del documento">{steps.map(step => <li key={step.label} data-done={step.done}><span>{step.done ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}</span>{step.label}<span className="sr-only">: {step.done ? 'completato' : 'da completare'}</span></li>)}</ol>;
}
