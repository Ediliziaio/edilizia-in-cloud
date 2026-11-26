import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bookmark,BookmarkCheck,EyeOff,Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '../WorkspaceContext';
import { ActionForm,EditorDialog,Field,TextField,value } from '../components';
export function SavedSearches(){const{data,api}=useWorkspace();const[params,setParams]=useSearchParams();const[open,setOpen]=useState(false);return <><details className="ga-saved-searches group min-w-0 max-w-full"><summary className="cursor-pointer rounded-md border bg-white px-3 py-2 text-xs text-secondary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ricerche salvate</summary><div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3"><select aria-label="Carica ricerca salvata" value="" className="h-9 min-w-0 max-w-full rounded-md border bg-white px-3 text-xs" onChange={e=>{const search=data.savedSearches.find(s=>s.id===e.target.value);if(search)setParams({...search.filters,sezione:'opportunita'});}}><option value="">Le mie ricerche salvate</option>{data.savedSearches.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><Button size="sm" variant="outline" onClick={()=>setOpen(true)}><Save/>Salva ricerca</Button><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={params.get('salvate')==='1'} onChange={e=>{const p=new URLSearchParams(params);if(e.target.checked)p.set('salvate','1');else p.delete('salvate');setParams(p);}}/>Solo opportunità salvate</label><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={params.get('escluse')==='1'} onChange={e=>{const p=new URLSearchParams(params);if(e.target.checked)p.set('escluse','1');else p.delete('escluse');setParams(p);}}/>Mostra anche non pertinenti</label></div></details>{open&&<EditorDialog title="Salva ricerca" description="Salva i filtri visibili per ritrovare le opportunità di tuo interesse." onClose={()=>setOpen(false)}><ActionForm afterSave={()=>setOpen(false)} onSave={f=>api.insert('savedSearches',{name:value(f,'name'),filters:Object.fromEntries([...params].filter(([key])=>key!=='sezione'))})}><Field name="name" label="Nome della ricerca" required/></ActionForm></EditorDialog>}</>;}
export function PreferenceActions({tenderId}:{tenderId:string}){const{api,data,refresh}=useWorkspace();const[open,setOpen]=useState(false);const[busy,setBusy]=useState(false);const pref=data.preferences.find(p=>p.tender_id===tenderId);async function save(state:'saved'|'not_relevant'|'neutral',reason=''){setBusy(true);try{const{error}=await api.client.from('gare_tender_preferences').upsert({company_id:api.companyId,tender_id:tenderId,state,reason},{onConflict:'user_id,tender_id'});if(error)throw error;await refresh();}catch(e){toast.error(e instanceof Error?e.message:typeof e==='object'&&e&&'message'in e?String(e.message):String(e));}finally{setBusy(false);}}
 const isSaved=pref?.state==='saved';
 const excluded=pref?.state==='not_relevant';
 return <><div className="ga-opportunity-preferences">
  <Button type="button" variant="ghost" size="icon" title={isSaved?'Rimuovi dai salvati':'Salva gara'}
   aria-label="Salva gara" aria-pressed={isSaved} disabled={busy} onClick={()=>save(isSaved?'neutral':'saved')}>
   {isSaved?<BookmarkCheck aria-hidden="true"/>:<Bookmark aria-hidden="true"/>}
  </Button>
  <Button type="button" variant="ghost" size="icon" title={excluded?'Ripristina gara':'Non pertinente'}
   aria-label={excluded?'Ripristina gara':'Non pertinente'} disabled={busy} onClick={()=>excluded?save('neutral'):setOpen(true)}>
   <EyeOff aria-hidden="true"/>
  </Button>
 </div>{open&&<EditorDialog title="Opportunità non pertinente" description="La motivazione rimane nella tua selezione personale. La gara e lo storico sono conservati." onClose={()=>setOpen(false)}><ActionForm afterSave={()=>setOpen(false)} onSave={f=>save('not_relevant',value(f,'reason'))}><TextField name="reason" label="Motivo" required/></ActionForm></EditorDialog>}</>;
}
