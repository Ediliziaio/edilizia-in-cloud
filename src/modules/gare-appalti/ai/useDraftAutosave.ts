import { useCallback,useEffect,useRef,useState } from 'react';
import { registerLocalLeaveGuard } from './navigation-guard';
import type { AiDraft } from '../types';
import type { GareApi } from '../api';

export function useDraftAutosave(draft:AiDraft,api:GareApi,canEdit:boolean){
 const[body,setBodyState]=useState(draft.body),[title,setTitleState]=useState(draft.title),[revision,setRevision]=useState(draft.revision),[saveState,setSaveState]=useState('Salvato'),[error,setError]=useState('');
 const current=useRef({body:draft.body,title:draft.title});const saved=useRef({...current.current});const revisionRef=useRef(draft.revision);const failure=useRef('');const inFlight=useRef<Promise<boolean>|null>(null);
 const persist=useCallback(function flush():Promise<boolean>{
  if(!canEdit)return Promise.resolve(true);
  if(inFlight.current)return inFlight.current.then(success=>success?flush():false);
  if(failure.current)return Promise.resolve(false);
  if(current.current.body===saved.current.body&&current.current.title===saved.current.title)return Promise.resolve(true);
  const snapshot={...current.current};
  if(snapshot.title.trim().length<3||snapshot.body.trim().length<10){failure.current='Completa titolo e testo della bozza prima di salvarla.';setError(failure.current);setSaveState('Dati da completare');return Promise.resolve(false);}
  setSaveState('Salvataggio…');
  const task=(async()=>{try{const updated=await api.update('drafts',draft.id,snapshot,revisionRef.current);saved.current=snapshot;revisionRef.current=updated.revision;setRevision(updated.revision);setSaveState('Salvato');return true;}catch(e){failure.current=e instanceof Error?e.message:typeof e==='object'&&e&&'message'in e?String(e.message):String(e);setError(failure.current);setSaveState('Salvataggio non riuscito');return false;}finally{inFlight.current=null;}})();
  inFlight.current=task;return task.then(success=>success?flush():false);
 },[api,draft.id,canEdit]);
 useEffect(()=>{if(!canEdit||failure.current||(body===saved.current.body&&title===saved.current.title))return;setSaveState('Modifiche da salvare');const timer=setTimeout(()=>{void persist();},1200);return()=>clearTimeout(timer);},[body,title,canEdit,persist]);
 useEffect(()=>{const unregister=registerLocalLeaveGuard(persist);return()=>{unregister();void persist();};},[persist]);
 useEffect(()=>{const beforeUnload=(e:BeforeUnloadEvent)=>{if(current.current.body!==saved.current.body||current.current.title!==saved.current.title){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);return()=>window.removeEventListener('beforeunload',beforeUnload);},[]);
 const setBody=(text:string)=>{current.current={...current.current,body:text};setBodyState(text);};const setTitle=(text:string)=>{current.current={...current.current,title:text};setTitleState(text);};
 const retry=()=>{failure.current='';setError('');return persist();};
 return{body,title,revision,saveState,error,setBody,setTitle,persist,retry,dirty:body!==saved.current.body||title!==saved.current.title};
}
