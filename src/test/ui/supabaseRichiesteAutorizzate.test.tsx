import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { retryAuthorizedRead } from '@/lib/retryAuthorizedRead';
const state=vi.hoisted(()=>({user:null as null|{id:string},loading:false,permitted:false,permissionsLoading:false,rpc:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:state.user,isLoading:state.loading})}));
vi.mock('@/hooks/useSuperAdminPermissions',()=>({useSuperAdminPermissions:()=>({permissions:{can_view_platform_stats:state.permitted},isLoading:state.permissionsLoading})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.rpc}}));
import AdminDashboard from '@/pages/admin/AdminDashboard';
import { BriefingOperativo } from '@/components/admin/dashboard/BriefingOperativo';
afterEach(()=>{cleanup();vi.clearAllMocks();state.user=null;state.loading=false;state.permitted=false;state.permissionsLoading=false;});
const wrap=(children:React.ReactNode)=> <QueryClientProvider client={new QueryClient()}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
describe('nessuna RPC prima di sessione e permesso',()=>{
  it.each([AdminDashboard,BriefingOperativo])('componente: anon e attesa permessi non fanno richieste',async Component=>{
    state.permitted=true;state.rpc.mockImplementation(()=>new Promise(()=>{}));
    const view=render(wrap(<Component/>));
    expect(state.rpc).not.toHaveBeenCalled();
    state.user={id:'u'};state.loading=true;view.rerender(wrap(<Component/>));expect(state.rpc).not.toHaveBeenCalled();
    state.loading=false;state.permitted=false;view.rerender(wrap(<Component/>));expect(state.rpc).not.toHaveBeenCalled();
    state.permitted=true;view.rerender(wrap(<Component/>));await waitFor(()=>expect(state.rpc).toHaveBeenCalled());
  });
  it.each([{code:'42501'},{code:'PGRST301'},{status:401},{status:403},{message:'permission denied'}])('non ripete errori autorizzazione %j',error=>{
    expect(retryAuthorizedRead(0,error)).toBe(false);
  });
  it('errore rete ha al massimo un retry',()=>{
    expect(retryAuthorizedRead(0,Error('network'))).toBe(true);expect(retryAuthorizedRead(1,Error('network'))).toBe(false);
  });
});
