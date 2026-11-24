import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download,ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { Notice,Panel,Status } from '../components';
import { activeTenderDocuments } from '../tender-ux';
import { downloadBlob } from '../api';
import { DocumentRequests } from '../ai/DocumentRequests';
import { TemplatesPanel } from '../pages/TemplatesPanel';
import { TechnicalPanel } from '../pages/TechnicalPanel';
import { EconomicPanel } from '../pages/EconomicPanel';
import { BatchTemplates } from './BatchTemplates';
import { CostImport } from './CostImport';
import { TechnicalLibrary } from './TechnicalLibrary';
import { DguePanel } from './DguePanel';
import type { GuidedJourney,Participation,Tender } from '../types';

export function JourneyDocuments({participation:p,tender:t,journey:j,view,save}:{participation:Participation;tender:Tender;journey:GuidedJourney;view:string;save:(patch:Partial<Pick<GuidedJourney,'configuration'|'confirmations'|'selected_document_ids'|'extras'>>)=>Promise<void>}){
 const{data,api,canEdit}=useWorkspace();const[busy,setBusy]=useState(false);const[signature,setSignature]=useState<Record<string,unknown>|null>(null);
 const docs=activeTenderDocuments(data.documents.filter(d=>d.participation_id===p.id&&['amministrativa','tecnica','economica'].includes(d.category)));
 async function run(action:()=>Promise<unknown>){setBusy(true);try{await action();}catch(e){toast.error(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 // Reject path separators and control characters in ZIP entries.
 // eslint-disable-next-line no-control-regex
 async function portalBundle(){const selected=docs.filter(d=>j.selected_document_ids.includes(d.id));if(!selected.length)throw Error('Scegli i documenti della bozza');const{default:JSZip}=await import('jszip');const zip=new JSZip();const names=new Set<string>();for(const doc of selected){if(/[\\/\x00-\x1f]/.test(doc.name)||doc.name==='..')throw Error('Nome file non esportabile in una cartella: scarica e verifica l’originale');const key=`${doc.category}/${doc.name}`;if(names.has(key))throw Error('Due file con lo stesso nome nella stessa busta: verifica quale va consegnato');names.add(key);zip.file(key,await(await api.blob(doc)).arrayBuffer());}zip.file('LEGGIMI.txt','BOZZA PER REVISIONE INTERNA. Verificare contenuti e requisiti sui documenti della procedura.');downloadBlob(await zip.generateAsync({type:'blob'}),'BOZZA_Dossier_per_revisione.zip');}
 return <div className="space-y-4">{view==='consegna'?<>
  <Panel title="File della bozza" description="Seleziona le versioni da raccogliere per la revisione interna.">
   {!docs.length&&<Notice>Carica o prepara i documenti nelle schede del fascicolo. Le fonti della procedura rimangono separate dall’offerta.</Notice>}
   <div className="space-y-3">{docs.map(d=><article key={d.id} className="ga-delivery-row"><label><input type="checkbox" checked={j.selected_document_ids.includes(d.id)} disabled={!canEdit||busy} onChange={e=>run(()=>save({selected_document_ids:e.target.checked?[...new Set([...j.selected_document_ids,d.id])]:j.selected_document_ids.filter(id=>id!==d.id)}))}/><span><strong>{d.name}</strong><small>{d.category} · v{d.version} · {d.signature_required?d.signature_declared?'Firma dichiarata dall’utente':'Firma richiesta':'Istruzioni di firma da verificare'}</small></span></label><Status tone={d.status==='approvato'?'success':'warning'}>{d.status==='approvato'?'Approvato':d.status==='in_verifica'?'In verifica':'Bozza'}</Status><div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={()=>run(async()=>downloadBlob(await api.blob(d),d.name))}><Download/>Originale</Button><Button size="sm" variant="outline" onClick={()=>run(async()=>setSignature(await api.local<Record<string,unknown>>('journey','signature',{participation_id:p.id,document_id:d.id})))}><ShieldCheck/>Controlli firma</Button></div></article>)}</div>
   {j.selected_document_ids.some(id=>!docs.some(d=>d.id===id))&&<div className="mt-3"><Notice>Una versione scelta è stata sostituita o esclusa: scegli la versione attuale dopo revisione.</Notice>{canEdit&&<Button className="mt-2" size="sm" variant="outline" onClick={()=>run(()=>save({selected_document_ids:j.selected_document_ids.filter(id=>docs.some(d=>d.id===id))}))}>Rimuovi dalla selezione le versioni non correnti</Button>}</div>}
   {signature&&<div className="mt-3 rounded border bg-slate-50 p-3 text-xs leading-6"><p className="font-semibold">Esiti dei controlli disponibili sul file</p><p>{String(signature.summary||'Verifica non disponibile')}</p><p>Attendibilità della catena: {String(signature.trust||'non verificata')} · revoca: {String(signature.revocation||'non verificata')}</p><p>Questi esiti non approvano il documento e non sostituiscono i controlli del portale.</p></div>}
   <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>run(portalBundle)}><Download/>Scarica archivio bozza</Button><Button size="sm" asChild><Link to={`/azienda/gare/partecipazioni/${p.id}?tab=revisioni`}>Apri controlli della bozza</Link></Button></div>
  </Panel><DocumentRequests participation={p}/>
 </>:<>
  <Notice>Prepara i documenti, controlla le anteprime e consegna le bozze al revisore.</Notice>
  <BatchTemplates participation={p}/><details className="ga-guide-tool"><summary>Compila un singolo modello e gestisci le anteprime</summary><TemplatesPanel participation={p}/></details><details className="ga-guide-tool"><summary>Prepara il DGUE elettronico della procedura</summary><DguePanel participation={p}/></details>
  {j.configuration.expected_categories.includes('tecnica')&&<details className="ga-guide-tool"><summary>Offerta tecnica e sezioni riutilizzabili</summary><TechnicalLibrary participation={p}/><TechnicalPanel participation={p}/></details>}
  {j.configuration.expected_categories.includes('economica')&&<details className="ga-guide-tool"><summary>Computo e offerta economica</summary><CostImport participation={p}/><EconomicPanel participation={p} tender={t}/></details>}
 </>}</div>;
}
