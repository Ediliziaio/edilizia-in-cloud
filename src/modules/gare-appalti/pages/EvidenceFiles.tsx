import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { ActionForm,EditorDialog,Field,Notice } from '../components';
import { downloadBlob } from '../api';
import type { Evidence } from '../types';
import { messaggioErrore } from "@/lib/messaggioErrore";
export function EvidenceFiles({evidence:e}:{evidence:Evidence}){
 const{api,data,canEdit}=useWorkspace();const[open,setOpen]=useState(false);const files=data.evidenceFiles.filter(f=>f.evidence_id===e.id).sort((a,b)=>b.version-a.version);const latest=files[0];
 return <div className="my-3 text-xs"><div className="flex flex-wrap gap-2">{canEdit&&<Button size="sm" variant="outline" onClick={()=>setOpen(true)}>{latest?'Aggiorna allegato':'Allega prova'}</Button>}{latest&&<Button size="sm" variant="ghost" onClick={async()=>{try{downloadBlob(await api.blob(latest),latest.name);}catch(error){toast.error(messaggioErrore(error));}}}>{latest.name} · v{latest.version}</Button>}</div>{files.length>1&&<details className="mt-2"><summary>Storico allegati ({files.length-1})</summary>{files.slice(1).map(f=><button key={f.id} className="mt-2 block underline" onClick={async()=>{try{downloadBlob(await api.blob(f),f.name);}catch(error){toast.error(String(error));}}}>{f.name} · v{f.version}</button>)}</details>}
 {open&&<EditorDialog title="Allega prova dell’impresa" description={e.title} onClose={()=>setOpen(false)}><ActionForm afterSave={()=>setOpen(false)} onSave={async form=>{const file=form.get('file');if(!(file instanceof File)||!file.size)throw Error('Seleziona una prova');await api.upload(file,{evidence_id:e.id,previous_id:latest?.id||null,version:(latest?.version||0)+1},'evidenceFiles');}}><Field name="file" type="file" label="Documento originale" required/><Notice>Il nuovo allegato riapre le verifiche che usano questa evidenza. Le versioni e i pacchetti precedenti restano conservati.</Notice></ActionForm></EditorDialog>}
 </div>;
}
