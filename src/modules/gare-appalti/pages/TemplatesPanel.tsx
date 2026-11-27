import{ReviewDialog}from'../review/ReviewDialog';
import{type AssetSuggestion}from'../dossier/TemplateInput';
import{FormAssistance,FormAssistedInput,formSourceBindings,type FormProposal}from'../dossier/FormAssistance';
import{PdfMapping}from'../dossier/PdfMapping';
import {useSearchParams} from 'react-router-dom';
import {DetailsHelp} from '../ui/DetailsHelp';
import { useEffect,useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { ActionForm,Check,EditorDialog,Notice,Panel,SelectField,value } from '../components';
import { downloadBlob } from '../api';
import { latestDocuments } from '../domain';
import { TemplatePdfPreview } from './TemplatePdfPreview';
import type { GareDocument,Participation } from '../types';
import { messaggioErrore } from "@/lib/messaggioErrore";
interface Contract {asset_bindings?:Record<string,string>;asset_suggestions?:Record<string,AssetSuggestion[]>;fact_changes?:{field:string;previous:string;current:string}[];revision?:number;source_document_id:string;source_sha256:string;id:string;name:string;format:string;fields:{key:string;label:string;supported:boolean;required:boolean;reason?:string;max_length?:number;type?:string;options?:string[];location?:string}[];mapping:Record<string,string>;constraints:Record<string,unknown>}
export function TemplatesPanel({participation:p}:{participation:Participation}){
 const{api,data,canEdit,refresh}=useWorkspace();const[params,setParams]=useSearchParams();const correctionDoc=data.documents.find(d=>d.id===params.get('correggi_documento')&&d.participation_id===p.id);const focusedField=params.get('campo')||'';const[reviewDoc,setReviewDoc]=useState<GareDocument|null>(null);const[proposals,setProposals]=useState<FormProposal[]>([]);const[selectedContract,setContract]=useState<Contract|null>(null);const[busy,setBusy]=useState(false);const[preview,setPreview]=useState<GareDocument|null>(null);
 const contracts=useQuery({queryKey:['gare',api.companyId,'contracts',p.id],queryFn:async()=>{const{data,error}=await api.client.from('gare_document_contracts').select('*').eq('participation_id',p.id).eq('company_id',api.companyId).order('created_at',{ascending:true});if(error)throw error;const rows=data as Contract[];const seen=new Set();return rows.filter(c=>{const key=c.source_document_id+':'+c.source_sha256;if(seen.has(key))return false;seen.add(key);return true;});}});
 const sources=latestDocuments(data.documents.filter(d=>d.tender_id===p.tender_id&&d.category==='fonte')).filter(d=>/\.(docx?|pdf|p7m)$/i.test(d.name));
 const correctionModel=canEdit&&params.get('documenti_vista')==='modelli'&&correctionDoc&&!correctionDoc.generation_snapshot?.subject_snapshot
  ?contracts.data?.find(c=>c.id===correctionDoc.template_contract_id&&sources.some(d=>d.id===c.source_document_id)):undefined;
 const snapshot=correctionModel?correctionDoc?.generation_snapshot:undefined;
 const formSources=snapshot?.form_sources as {field_key:string;value:string;citation:NonNullable<FormProposal['citation']>}[]|undefined;
 const contract:Contract|null=selectedContract||(correctionModel?{
  ...correctionModel,
  mapping:(snapshot?.mapping as Record<string,string>)||correctionModel.mapping,
  constraints:{
   ...correctionModel.constraints,
   required_fields:snapshot?.required_fields||correctionModel.constraints.required_fields,
   signature_required:correctionDoc?.signature_required,
   source_bindings:Object.fromEntries((formSources||[]).map(({field_key,value,citation})=>[field_key,{value,citation}])),
  },
 }:null);
 useEffect(()=>{if(!contract||!focusedField)return;const el=document.getElementById(`template-field-${focusedField}`);el?.scrollIntoView({block:'center'});el?.querySelector<HTMLElement>('input,select,textarea')?.focus({preventScroll:true});},[contract?.id,focusedField]);
 const closeContract=()=>{setContract(null);if(params.has('correggi_documento')){const next=new URLSearchParams(params);next.delete('correggi_documento');next.delete('campo');setParams(next,{replace:true});}};
 if(!sources.length)return <Panel title="Modelli compilabili" description="DOC, DOCX e PDF della procedura"><p className="text-xs leading-5 text-muted-foreground">Non hai ancora caricato un modello supportato. Usa <strong>Carica documento</strong> per aggiungere l’originale della gara.</p></Panel>;
 return <Panel title="Compila un modello della gara" description="Scegli il modello, compila e controlla l’anteprima.">
 {canEdit&&<ActionForm label="Analizza campi del modello" busyLabel="Riconoscimento dei campi…" onSave={async f=>{setBusy(true);try{const c=await api.local<Contract>('templates','inspect',{participation_id:p.id,document_id:value(f,'source')});setProposals([]);setContract(c);await refresh();}finally{setBusy(false);}}}><SelectField key={params.get('modello_originale')||''} name="source" label="Modello originale" defaultValue={sources.find(d=>d.id===params.get('modello_originale'))?.id||''} required options={[{value:'',label:'Seleziona un originale'},...sources.map(d=>({value:d.id,label:`${d.name} · v${d.version}`}))]}/></ActionForm>}
 <details className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Formati supportati e percorso manuale</summary><p className="mt-2 leading-5">PDF non compilabili, firme, modelli protetti, caselle complesse e formati CAD richiedono il percorso manuale. Per XML/eDGUE, computi XLSX e controlli di integrità delle firme apri gli strumenti dedicati del percorso guidato. Nessuna firma viene apposta o verificata automaticamente.</p></details>
 <div className="mt-4 space-y-2">{contracts.data?.filter(c=>sources.some(d=>d.id===c.source_document_id)).map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><span>{c.name} · {c.fields.filter(f=>f.supported).length} campi</span>{canEdit&&<Button variant="outline" size="sm" disabled={busy} onClick={async()=>{setBusy(true);try{setProposals([]);setContract(await api.local<Contract>('templates','inspect',{participation_id:p.id,document_id:c.source_document_id}));}catch(e){toast.error(messaggioErrore(e));}finally{setBusy(false);}}}>Compila campi</Button>}</div>)}</div>
 {contract&&<EditorDialog initialFocusId={focusedField?`template-field-${focusedField}`:undefined} title="Compila e controlla i campi" description={contract.name} onClose={closeContract}>{contract.format==='pdf_mapped'&&<PdfMapping<Contract> contract={contract} onSaved={setContract}/>}<FormAssistance key={contract.id} contractId={contract.id} tenderId={p.tender_id} onResult={setProposals}/><ActionForm label="Genera bozza e anteprima" busyLabel="Generazione e anteprima…" afterSave={closeContract} onSave={async f=>{
 const result=await api.local<{document:GareDocument;warning:string|null}>('templates','fill',{contract_id:contract.id,source_bindings:formSourceBindings(f,contract.fields,key=>`field_${key}`),values:Object.fromEntries(contract.fields.filter(x=>x.supported).map(x=>[x.key,value(f,`field_${x.key}`)])),asset_bindings:Object.fromEntries(contract.fields.map(x=>[x.key,value(f,`asset_field_${x.key}`)]).filter(([,id])=>id)),required_fields:f.getAll('required').map(String),category:value(f,'category'),signature_required:f.has('signature'),conversion_confirmed:f.has('conversion_confirmed'),confirmed:true});await refresh();
 if(result.document.preview_path&&result.document.preview_sha256){setPreview(result.document);}else toast.warning(result.warning||'Anteprima da controllare manualmente');
 }}>{contract.constraints.warning&&<Notice>{String(contract.constraints.warning)}</Notice>}{contract.constraints.converted===true&&<Check name="conversion_confirmed" required label="Ho confrontato la conversione DOC con l’originale e verificato impaginazione e clausole"/>}{contract.fact_changes?.map(change=><Notice key={change.field}>Dato da riconfermare: {change.field}. Nel modello precedente: {change.previous||'vuoto'}. Dato aziendale attuale: {change.current}. Rivedi il campo qui sotto; il valore precedente è conservato.</Notice>)}<DetailsHelp>Conferma i valori proposti e confronta l’anteprima. I campi obbligatori vuoti impediscono l’approvazione.</DetailsHelp>
 {contract.fields.map(field=><div key={field.key} id={`template-field-${field.key}`} className="ga-form-field rounded-lg border p-3">{field.supported?<><FormAssistedInput defaultSourceBinding={(contract.constraints.source_bindings as Record<string,{value:string;citation:NonNullable<FormProposal['citation']>}>|undefined)?.[field.key]} proposals={proposals.filter(p=>p.field_key===field.key)} field={field} defaultSourceId={contract.asset_bindings?.[field.key]} suggestions={contract.asset_suggestions?.[field.key]} label={field.label} name={`field_${field.key}`} defaultValue={contract.mapping[field.key]||''}/><Check name="required" value={field.key} label="Dato obbligatorio per questo modello" defaultChecked={Array.isArray(contract.constraints.required_fields)?contract.constraints.required_fields.includes(field.key):field.required}/></>:<p className="text-sm">{field.label} · {field.reason}</p>}</div>)}
 <SelectField name="category" label="Busta" defaultValue="amministrativa" options={['amministrativa','tecnica','economica'].map(v=>({value:v,label:v}))}/><Check name="signature" label="La gara richiede la firma di questo documento" defaultChecked={contract.constraints.signature_required===true}/><Check name="confirmed" required label="Ho verificato dati, campi obbligatori e istruzioni del modello"/>
 </ActionForm></EditorDialog>}
 {preview&&<EditorDialog title="Anteprima della bozza compilata" description="Verifica visivamente testo, impaginazione e campi. Il documento è ancora da revisionare." onClose={()=>setPreview(null)}><TemplatePdfPreview key={preview.id} document={preview}/><Button onClick={()=>{setReviewDoc(preview);setPreview(null);}}>Controlla e invia alla revisione</Button><Button variant="outline" onClick={async()=>{try{downloadBlob(await api.blob({storage_path:preview.preview_path!,sha256:preview.preview_sha256!}),'Anteprima_modello.pdf');}catch(error){toast.error(error instanceof Error?error.message:'Download non riuscito');}}}>Scarica anteprima</Button></EditorDialog>}
 {reviewDoc&&<ReviewDialog document={reviewDoc} onClose={()=>setReviewDoc(null)}/>}
 </Panel>;
}
