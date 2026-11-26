import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { missingValue } from '../dossier/placeholders.js';
import { canonicalField } from '../dossier/field-key';
import { Panel, Status } from '../components';
import { correctionUrl } from '../review/review-navigation';
import { reviewOperator, reviewTitle } from '../review/review-list';
import type { ReviewEntry } from '../review/types';
import type { GareDocument } from '../types';
import type { DgueCase } from '../office/types';

const identityLabels: Record<string, string> = {
 ragione_sociale: 'Ragione sociale', partita_iva: 'Partita IVA', codice_fiscale: 'Codice fiscale',
 pec: 'PEC', sede: 'Sede legale', firmatario: 'Firmatario', rappresentante: 'Legale rappresentante',
 referente: 'Referente gare', telefono: 'Telefono', email: 'Email', rea: 'Numero REA',
 camera_commercio: 'Camera di commercio', cf_rappresentante: 'Codice fiscale del rappresentante',
};
const fieldCodes = new Set(['MISSING_FIELD', 'PLACEHOLDER']);
const documentLink = (doc: GareDocument) => `/azienda/gare/partecipazioni/${doc.participation_id}?tab=documenti&documenti_vista=preparazione&revisiona=${doc.id}`;

interface OpenItem { label: string; targets: { id: string; label: string; url: string }[] }

function collectItems(docs: GareDocument[], reviews: ReviewEntry[], cases: DgueCase[]) {
 const checks = new Map(reviews.map(entry => [entry.document_id, entry]));
 const groups = new Map<string, { name: string; items: Map<string, OpenItem> }>();
 for (const doc of docs) {
  const entry = checks.get(doc.id);
  const report = entry?.latest?.report;
  const current = entry?.latest_current && report?.document_sha256 === doc.sha256;
  const operator = reviewOperator(doc);
  const explicitOperator = operator.key.startsWith('subject:');
  const group = groups.get(operator.key) || { name: operator.name, items: new Map<string, OpenItem>() };
  const xml = /\.xml$/i.test(doc.name);
  const partial = /\.json$/i.test(doc.name) && !!doc.generation_snapshot?.answers;
  if (partial) {
   const source = doc.generation_snapshot?.source_id;
   const caseId = doc.generation_snapshot?.dgue_case_id;
   const coveredByCase = cases.some(item => item.id === caseId && item.required);
   if (!coveredByCase) {
    group.items.set(doc.id, { label: 'Questionario DGUE da completare', targets: [{
     id: doc.id, label: 'Riprendi il questionario', url: (typeof source === 'string' && correctionUrl(doc)) || `/azienda/gare/partecipazioni/${doc.participation_id}?tab=documenti&documenti_vista=archivio&documento=${doc.id}`,
    }] });
    groups.set(operator.key, group);
   }
   continue;
  }
  const snapshot = doc.generation_snapshot;
  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields as { key: string; label: string }[] : [];
  const values = snapshot?.mapping as Record<string, unknown> | undefined;
  const required = !xml && Array.isArray(snapshot?.required_fields) ? snapshot.required_fields : [];
  const savedBlanks = required.filter(key => typeof key === 'string' && missingValue(values?.[key])).map(key => ({
   code: 'MISSING_FIELD', field_key: key, message: fields.find(f => f.key === key)?.label || key,
  }));
  const open = current && report ? report.blockers : savedBlanks;
  const requiredBlanks = new Set(open.filter(blocker => blocker.code === 'MISSING_FIELD').map(blocker => blocker.field_key));
  for (const blocker of open) {
   if (blocker.code === 'PLACEHOLDER' && requiredBlanks.has(blocker.field_key)) continue;
   const field = fields.find(f => f.key === blocker.field_key);
   const key = explicitOperator && !xml && field && fieldCodes.has(blocker.code) ? canonicalField(field) : null;
   const common = key && identityLabels[key];
   const id = common ? key : `${doc.id}:${blocker.code}:${blocker.field_key || blocker.message}`;
   if (!id) continue;
   const item: OpenItem = group.items.get(id) || { label: common || blocker.message.replace(/^Completa il campo obbligatorio:\s*/, ''), targets: [] };
   const url = blocker.field_key && blocker.code !== 'UNSUPPORTED_FIELD' ? correctionUrl(doc, blocker.field_key) : null;
   if (!item.targets.some(target => target.id === doc.id)) item.targets.push({ id: doc.id, label: reviewTitle(doc), url: url || documentLink(doc) });
   group.items.set(id, item);
  }
  const needsReview = (!current && (doc.status !== 'approvato' || !!entry?.latest)) || (current && !!doc.unresolved_fields && open.length === 0);
  if (needsReview) {
   const detail = report?.detail;
   const portalOpen = xml && doc.unresolved_fields === 1 && detail && 'profile' in detail && !detail.european_rules_passed;
   const label = current && portalOpen ? 'Profilo DGUE del portale da verificare'
    : current ? 'Punti aperti da verificare nel documento' : 'Controlli da eseguire o aggiornare';
   group.items.set(doc.id, { label, targets: [{ id: doc.id, label: reviewTitle(doc), url: documentLink(doc) }] });
  }
  if (group.items.size) groups.set(operator.key, group);
 }
 return groups;
}

export function OpenDocumentItems({ participationId, docs, reviews, cases, loading, unavailable }: {
 participationId: string; docs: GareDocument[]; reviews: ReviewEntry[]; cases: DgueCase[];
 loading: boolean; unavailable: boolean;
}) {
 const [query, setQuery] = useState('');
 const search = query.trim().toLocaleLowerCase('it');
 const groups = collectItems(docs, reviews, cases);
 const visible = [...groups].map(([id, group]) => ({ id, name: group.name, items: [...group.items].filter(([, item]) =>
  [group.name, item.label, ...item.targets.map(target => target.label)].some(value => value.toLocaleLowerCase('it').includes(search)),
 ) })).filter(group => group.items.length);
 const pendingCases = cases.filter(item => item.required && (!item.generated || item.source_current === false || item.subject_current === false));
 const visibleCases = pendingCases.filter(item => `DGUE ${item.identity.name}`.toLocaleLowerCase('it').includes(search));
 return <Panel className="ga-open-documents" title="Dati e controlli da completare"
  action={docs.some(doc => !/\.json$/i.test(doc.name) || !doc.generation_snapshot?.answers) && <Button size="sm" variant="outline" asChild>
   <Link to={`/azienda/gare/partecipazioni/${participationId}?tab=panoramica&fase_lavoro=revisiona`}>Rivedi le bozze <ArrowRight size={14}/></Link>
  </Button>}
  description="Campi delle bozze salvate, distinti per operatore. Apri il modello o la domanda interessata.">
  {loading ? <p role="status">Carico i controlli delle bozze…</p> : unavailable ? <p role="alert">Controlli non disponibili. Apri la revisione del documento per riprovare.</p> : <>
   {(groups.size > 0 || pendingCases.length > 0) && <Input className="mb-3" type="search" aria-label="Cerca dato o operatore" placeholder="Cerca campo, documento o operatore…" value={query} onChange={event => setQuery(event.target.value)}/>}
   {visible.map(group => <section className="ga-doc-items-group" key={group.id}>
    <h3>{group.name}</h3>
    {group.items.map(([key, item]) => <div key={key} className="ga-doc-item">
     <strong>{item.label}</strong>
     <div>{item.targets.map(target => <Link key={target.id} to={target.url}>{target.label} ↗</Link>)}</div>
    </div>)}
   </section>)}
   {visibleCases.length > 0 && <section className="ga-doc-items-group"><h3>Questionari DGUE</h3>
    {visibleCases.map(item => <div className="ga-doc-item" key={item.id}>
     <strong>{item.identity.name} · {item.lot_ids.length} lotti</strong>
     <Status tone="warning">{item.source_current === false ? 'Request sostituita' : item.subject_current === false ? 'Fascicolo da aggiornare' : 'Questionario da completare'}</Status>
     <Link to={`/azienda/gare/partecipazioni/${participationId}?${new URLSearchParams({ tab: 'documenti', documenti_vista: 'dgue', ...(item.source_current === false ? {} : { request: item.source_id, caso: item.id }) })}`}>Apri DGUE ↗</Link>
    </div>)}
   </section>}
   {search && !visible.length && !visibleCases.length && <p className="text-sm text-muted-foreground">Nessun risultato per questa ricerca.</p>}
   {!groups.size && !pendingCases.length && <p className="text-sm text-muted-foreground">{docs.length ? 'Nessun punto aperto nei rapporti correnti.' : 'I campi da completare compaiono qui dopo la preparazione delle bozze.'}</p>}
  </>}
 </Panel>;
}
