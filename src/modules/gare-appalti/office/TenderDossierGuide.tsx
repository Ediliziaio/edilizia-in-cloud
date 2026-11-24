import { ArrowRight, Building2, CheckCircle2, FileText, Fingerprint } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Panel, Status } from '../components';
import { canonicalField } from '../dossier/field-key';
import { missingValue } from '../dossier/placeholders.js';
import { dossierHref } from './dossier-navigation';
import { subjectFields, subjectKinds, type OfficePlan } from './types';

const identity = [{ key: 'ragione_sociale', label: 'Ragione sociale' }, { key: 'partita_iva', label: 'Identificativo fiscale' }];
const reusableFields = [...identity, ...subjectFields];

export function TenderDossierGuide({ plan }: { plan: OfficePlan }) {
 const [params, setParams] = useSearchParams();
 const id = plan.participation.id;
 const base = `/azienda/gare/partecipazioni/${id}`;
 const actor = plan.subjects.find(s => s.id === params.get('operatore_gara'))
  || plan.subjects.find(s => s.kind === 'impresa') || plan.subjects[0];
 const context = new URLSearchParams(params);
 if (actor) context.set('operatore_gara', actor.id);
 const dossier = dossierHref(id, 'fascicolo', context, actor?.id);

 if (!actor) return <Panel title="Fascicolo per questa gara" description="Aggiungi l’operatore che compila moduli e DGUE.">
  <Button size="sm" asChild><Link to={dossier}>Apri fascicolo aziendale <ArrowRight size={14}/></Link></Button>
 </Panel>;

 const cases = plan.cases.filter(c => c.subject_id === actor.id);
 const models = plan.models;
 const keys = new Set(models.flatMap(m => m.fields
  .filter(f => f.required && f.supported)
  .map(f => canonicalField(f))));
 if (cases.some(c => c.required)) for (const key of ['ragione_sociale', 'partita_iva', 'firmatario', 'paese']) keys.add(key);
 const values = { ...actor.profile, ragione_sociale: actor.name, partita_iva: actor.tax_id } as Record<string, string>;
 const fields = reusableFields.filter(f => keys.has(f.key));
 const missing = fields.filter(f => missingValue(values[f.key]));
 const dgue = `${base}?tab=documenti&documenti_vista=dgue`;
 const review = `${base}?tab=panoramica&fase_lavoro=revisiona`;
 const modules = `${base}?${new URLSearchParams({
  tab: 'panoramica', fase_lavoro: 'prepara', prepara_vista: 'moduli', operatore_moduli: actor.id,
 })}`;

 return <Panel className="ga-tender-dossier" title="Fascicolo per questa gara" description="Verifica l’operatore e usa i suoi dati nei documenti della procedura."
  action={<Button size="sm" variant="outline" asChild><Link to={dossier}>Apri fascicolo operatore</Link></Button>}>
  <label className="ga-tender-actor"><span><Building2 size={15}/>Operatore della gara</span>
   <select value={actor.id} onChange={e => setParams(current => {
    const next = new URLSearchParams(current);
    next.set('operatore_gara', e.target.value);
    return next;
   }, { replace: true, preventScrollReset: true })}>
    {plan.subjects.map(s => <option value={s.id} key={s.id}>{s.name} · {subjectKinds[s.kind]}</option>)}
   </select>
  </label>
  <ol className="ga-dossier-steps">
   <li><Fingerprint size={18}/><div>
    <h3>1. Conferma l’identità</h3>
    <p>{actor.tax_id} · Revisione {actor.revision}</p>
    <Status tone={actor.current ? 'success' : 'warning'}>{actor.current ? 'Fascicolo riscontrato' : 'Identità da verificare'}</Status>
    {!actor.current && <Link to={dossier}>Verifica dati e prove <ArrowRight size={13}/></Link>}
   </div></li>
   <li><CheckCircle2 size={18}/><div>
    <h3>2. Completa i dati riutilizzabili</h3>
    {fields.length ? <><p>{fields.length - missing.length}/{fields.length} dati anagrafici presenti nei campi riconosciuti</p>
     {missing.length > 0 && <p className="ga-dossier-missing">{missing.map(f => f.label).join(' · ')}</p>}
     <details><summary>Vedi dati nei modelli e nel DGUE</summary><dl>
      {fields.map(f => <div key={f.key}><dt>{f.label}</dt><dd>{missingValue(values[f.key]) ? 'Da completare' : values[f.key]}</dd></div>)}
     </dl></details>
    </> : <p>I campi riutilizzabili compaiono quando sono riconosciuti nei modelli o associati a un caso DGUE richiesto.</p>}
    {!!missing.length && <Link to={dossier}>Completa il fascicolo <ArrowRight size={13}/></Link>}
   </div></li>
   <li><FileText size={18}/><div>
    <h3>3. Prepara e rivedi i documenti</h3>
    <p>{models.length} {models.length === 1 ? 'modello riconosciuto' : 'modelli riconosciuti'} · {cases.length} {cases.length === 1 ? 'caso DGUE' : 'casi DGUE'} per l’operatore</p>
    <div className="ga-dossier-destinations">
     <Link to={modules}>Compila i moduli <ArrowRight size={13}/></Link>
     {cases.length ? cases.map((c, i) => <Link key={c.id} to={`${dgue}&${new URLSearchParams({ request: c.source_id, caso: c.id })}`}>
      {cases.length === 1 ? 'Apri il DGUE dell’operatore' : `Apri DGUE ${i + 1}`} <ArrowRight size={13}/>
     </Link>) : <Link to={dgue}>Configura il DGUE <ArrowRight size={13}/></Link>}
     <Link to={review}>Apri la revisione <ArrowRight size={13}/></Link>
    </div>
   </div></li>
  </ol>
 </Panel>;
}
