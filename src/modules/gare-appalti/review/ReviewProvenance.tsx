import { useState } from 'react';
import { FileText, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../WorkspaceContext';
import { SourceReader } from '../reader/SourceReader';
import type { GareDocument } from '../types';
import type { FormProposal } from '../dossier/FormAssistance';
import { reviewValueChanges } from './review-provenance';

const labels: Record<string, string> = {
  ragione_sociale: 'Ragione sociale', partita_iva: 'Partita IVA', codice_fiscale: 'Codice fiscale',
  pec: 'PEC', sede: 'Sede', sede_legale: 'Sede legale', firmatario: 'Firmatario', referente: 'Referente gare',
  rappresentante: 'Legale rappresentante', cf_rappresentante: 'Codice fiscale del rappresentante',
  potere_firma: 'Poteri di firma', telefono: 'Telefono', email: 'Email', paese: 'Paese', country: 'Paese',
  rea: 'Numero REA', camera_commercio: 'Camera di commercio', cig: 'CIG', cup: 'CUP',
};
const fieldName = (key: string, label?: string) => labels[(label || key).toLocaleLowerCase('it')] || label || labels[key.toLocaleLowerCase('it')] || key.replace(/_/g, ' ');
const display = (value: unknown) => value === undefined || value === null || value === '' ? 'Vuoto' : typeof value === 'object' ? JSON.stringify(value) : String(value);
export function ReviewProvenance({ document: doc }: { document: GareDocument }) {
  const { data } = useWorkspace();
  const [source, setSource] = useState<{ doc: GareDocument; citation?: NonNullable<FormProposal['citation']> } | null>(null);
  const snapshot = doc.generation_snapshot || {};
  const previous = data?.documents.find(d => d.id === doc.previous_id), before = previous?.generation_snapshot || {};
  const changes = previous ? reviewValueChanges(snapshot, before) : [];
  const fields = snapshot.fields as { key: string; label: string }[] | undefined;
  const bindings = snapshot.form_sources as { field_key: string; value: string; citation: NonNullable<FormProposal['citation']> }[] | undefined;
  const facts = snapshot.reusable_facts as { id: string; key: string; value: string; revision: number }[] | undefined;
  const assets = snapshot.reusable_assets as { id: string; title: string; revision: number }[] | undefined;
  const original = data?.documents.find(d => d.id === snapshot.source_id);
  if (!original && !bindings?.length && !facts?.length && !assets?.length && !previous) return null;
  return <details className="ga-review-provenance"><summary>Fonti, dati e modifiche{previous ? ` · ${changes.length} valori cambiati` : ''}</summary>
    {original && <button className="ga-origin-source" aria-label={`Apri originale ${original.name}`} onClick={() => setSource({ doc: original })}><FileText aria-hidden="true" /><span><strong>Modello originale</strong><small>{original.name} · v{original.version}</small></span></button>}
    {!!bindings?.length && <section className="ga-origin-group" aria-label="Valori dalle fonti della gara"><h4>Dalla gara</h4><dl className="ga-origin-values">{bindings.map((binding, i) => {
      const doc = data.documents.find(d => d.id === binding.citation?.document_id && d.sha256 === binding.citation.sha256);
      return <div key={i}><dt>{fieldName(binding.field_key, fields?.find(f => f.key === binding.field_key)?.label)}</dt><dd><span>{binding.value}</span><details><summary>Vedi riscontro</summary><blockquote>{binding.citation?.quote}</blockquote>{doc ? <button onClick={() => setSource({ doc, citation: binding.citation })}>Apri testo e originale</button> : <p>Versione della fonte non disponibile qui.</p>}</details></dd></div>;
    })}</dl></section>}
    {!!facts?.length && <section className="ga-origin-group" aria-label="Dati dal fascicolo aziendale"><h4>Dal fascicolo aziendale</h4><dl className="ga-origin-values">{facts.map(f => <div key={f.id}><dt>{fieldName(f.key)}</dt><dd>{display(f.value)}<small className="ga-origin-revision" title={`Revisione ${f.revision}`} aria-label={`Revisione ${f.revision}`}>r{f.revision}</small></dd></div>)}</dl></section>}
    {!!assets?.length && <section className="ga-origin-group" aria-label="Prove aziendali utilizzate"><h4>Prove collegate</h4>{assets.map(a => <p key={a.id} className="ga-origin-asset"><ShieldCheck aria-hidden="true" /><span>{a.title}<small className="ga-origin-revision" title={`Revisione ${a.revision}`} aria-label={`Revisione ${a.revision}`}>r{a.revision}</small></span></p>)}</section>}
    {previous ? <section className="ga-origin-history" aria-label="Confronto con la versione precedente"><p>{previous.name} · v{previous.version}</p>{changes.length ? changes.map(change => <div className="ga-origin-diff" key={change.key}><strong>{fieldName(change.key, fields?.find(f => f.key === change.key)?.label)}</strong><p>Prima: {display(change.before)}</p><p>Ora: {display(change.current)}</p></div>) : <p>Nessuna differenza nei valori salvati. Controlla comunque file e fonti.</p>}</section> : <p className="ga-origin-history">Prima versione</p>}
    {source && <SourceReader document={source.doc} initialPage={source.citation?.page} initialSection={source.citation?.section} initialQuote={source.citation?.quote} onClose={() => setSource(null)} />}
  </details>;
}
