import {beforeEach,describe,it,expect,vi}from'vitest';
import type{PersistedClient}from'@tanstack/react-query-persist-client';
const db=vi.hoisted(()=>new Map<string,unknown>());
vi.mock('idb-keyval',()=>({get:vi.fn(async(k:string)=>db.get(k)),set:vi.fn(async(k:string,v:unknown)=>{db.set(k,v)}),del:vi.fn(async(k:string)=>{db.delete(k)})}));
import {bindQueryCacheIdentity,createIdbPersister,removeIdentityQueryCache}from'@/lib/queryPersister';
const snapshot={timestamp:1,buster:'local',clientState:{mutations:[],queries:[]}} as PersistedClient;
beforeEach(()=>{db.clear();bindQueryCacheIdentity(null)});
describe('cache isolata per identità',()=>{
 it('non ripristina lo snapshot di un altro utente dopo un cambio di accesso',async()=>{
  let owner:string|null='admin';const p=createIdbPersister(()=>owner);bindQueryCacheIdentity(owner);await p.persistClient(snapshot);
  owner='magazzino';bindQueryCacheIdentity(owner);expect(await p.restoreClient()).toBeUndefined();
  expect(db.has('rq-cache-v2:admin')).toBe(true);
 });
 it('mantiene la cache offline della stessa identità',async()=>{
  bindQueryCacheIdentity('user');const p=createIdbPersister(()=>'user');await p.persistClient(snapshot);expect(await p.restoreClient()).toEqual(snapshot);
 });
 it('non scrive dati della vecchia sessione mentre la nuova identità è ancora in verifica',async()=>{
  bindQueryCacheIdentity('old');await createIdbPersister(()=>'new').persistClient(snapshot);expect(db.size).toBe(0);
 });
 it('scarta anche uno snapshot che arriva tardi durante il cambio utente',async()=>{
  let owner='old';bindQueryCacheIdentity(owner);const p=createIdbPersister(()=>owner);await p.persistClient(snapshot);
  const pending=p.restoreClient();owner='new';bindQueryCacheIdentity(owner);expect(await pending).toBeUndefined();
 });
 it('il logout rimuove la cache di quell’identità e il vecchio snapshot globale',async()=>{
  db.set('rq-cache-v1',snapshot);db.set('rq-cache-v2:old',{owner:'old',client:snapshot});await removeIdentityQueryCache('old');expect(db.size).toBe(0);
 });
});
