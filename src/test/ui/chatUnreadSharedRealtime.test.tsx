import {StrictMode} from 'react';
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({
  company:'company1',user:'user1',owner:{} as object,
  channels:[] as Array<{name:string;event?: (p:{new:{sender_id:string}})=>void;filter?:string;on:ReturnType<typeof vi.fn>;subscribe:ReturnType<typeof vi.fn>}>,
  invalidate:vi.fn(),remove:vi.fn(),
}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:state.company},profile:{id:state.user}})}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:0}),useQueryClient:()=>state.owner}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{
  channel:(name:string)=>{
    let subscribed=false;
    const channel={name,event:undefined as undefined|((p:{new:{sender_id:string}})=>void),filter:undefined as string|undefined,
      on:vi.fn((_kind:string,config:{filter:string},callback:(p:{new:{sender_id:string}})=>void)=>{
        if(subscribed)throw new Error('cannot add postgres_changes after subscribe');
        channel.event=callback;channel.filter=config.filter;return channel;
      }),subscribe:vi.fn(()=>{subscribed=true;return channel;})};
    state.channels.push(channel);return channel;
  },removeChannel:(channel:unknown)=>state.remove(channel),
}}));
import {useInternalChatUnreadTotal} from '@/hooks/useInternalChatUnreadTotal';
beforeEach(()=>{
  state.company='company1';state.user='user1';state.channels=[];
  state.invalidate.mockReset();state.remove.mockReset();
  state.owner={invalidateQueries:state.invalidate};
});
afterEach(async()=>{cleanup();await Promise.resolve();});
describe('badge chat duplicati non duplicano il canale',()=>{
  it('due badge, un canale e una invalidazione; resta vivo fino all’ultimo badge',async()=>{
    const first=renderHook(()=>useInternalChatUnreadTotal());const second=renderHook(()=>useInternalChatUnreadTotal());
    expect(state.channels).toHaveLength(1);expect(state.channels[0].filter).toBe('company_id=eq.company1');
    state.channels[0].event?.({new:{sender_id:'user1'}});expect(state.invalidate).not.toHaveBeenCalled();
    state.channels[0].event?.({new:{sender_id:'other'}});expect(state.invalidate).toHaveBeenCalledTimes(1);
    first.unmount();await act(async()=>{});expect(state.remove).not.toHaveBeenCalled();
    second.unmount();await act(async()=>{});expect(state.remove).toHaveBeenCalledTimes(1);
  });
  it('StrictMode non aggiunge callback a un canale già sottoscritto',async()=>{
    renderHook(()=>useInternalChatUnreadTotal(),{wrapper:StrictMode});
    await act(async()=>{});expect(state.channels).toHaveLength(1);expect(state.channels[0].on).toHaveBeenCalledTimes(1);
  });
  it('un cambio azienda crea un ambito separato e rilascia il vecchio',async()=>{
    const hook=renderHook(()=>useInternalChatUnreadTotal());
    state.company='company2';hook.rerender();await act(async()=>{});
    expect(state.channels).toHaveLength(2);expect(state.channels[1].filter).toBe('company_id=eq.company2');
    expect(state.remove).toHaveBeenCalledWith(state.channels[0]);
  });
});
