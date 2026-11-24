import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GareApi } from './api';
import type { Member, Workspace } from './types';

interface WorkspaceValue { member:Member; api:GareApi; data:Workspace; canEdit:boolean; canApprove:boolean; refresh:()=>Promise<void> }
const Context=createContext<WorkspaceValue|null>(null);
export function WorkspaceProvider({member,client,children}:{member:Member;client:SupabaseClient;children:ReactNode}) {
 const cache=useQueryClient();
 const api=useMemo(()=>new GareApi(client,member.company_id),[client,member.company_id]);
 const query=useQuery({queryKey:['gare',member.company_id,'workspace',member.user_id],queryFn:()=>api.workspace(),staleTime:10_000});
 const refresh=async()=>{await cache.invalidateQueries({queryKey:['gare',member.company_id]});};
 if(query.isPending) return <div className="p-12 text-center text-muted-foreground" role="status">Caricamento del fascicolo aziendale…</div>;
 if(query.isError) return <div className="m-8 rounded-lg border border-destructive/30 bg-destructive/5 p-6" role="alert"><h2 className="font-semibold">Dati non disponibili</h2><p className="my-3 text-sm">{query.error.message}</p><button className="underline" onClick={()=>query.refetch()}>Riprova</button></div>;
 return <Context.Provider value={{member,api,data:query.data,canEdit:['admin','editor'].includes(member.role),canApprove:false,refresh}}>{children}</Context.Provider>;
}
export function useWorkspace(){const ctx=useContext(Context);if(!ctx)throw new Error('Workspace gare mancante');return ctx;}
