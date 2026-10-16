import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
const mocks=vi.hoisted(()=>({start:vi.fn<()=>Promise<string|null>>(),redirect:vi.fn(),tokens:{accessToken:'access-test' as string|null,refreshToken:'refresh-test' as string|null}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({impersonateCompany:mocks.start,profile:null,role:'super_admin',company:null}),getCachedTokens:()=>mocks.tokens}));
vi.mock('@/hooks/useSuperAdminPermissions',()=>({useSuperAdminPermissions:()=>({permissions:{impersonation:true,can_manage_companies:true,allowed_company_ids:null}})}));
vi.mock('@/utils/safeRedirect',()=>({safeRedirect:mocks.redirect}));
vi.mock('@/utils/subdomainNav',()=>({getSubdomainUrl:(path:string)=>path}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:()=>({order:()=>({limit:()=>Promise.resolve({data:[{id:'demo',name:'Azienda Demo',sector:'edilizia',logo_url:null}],error:null})})})})})}}));
import { CompanyQuickEnterPopover } from '@/components/admin/CompanyQuickEnterPopover';
afterEach(cleanup);
beforeEach(()=>{mocks.start.mockReset();mocks.redirect.mockReset();mocks.tokens.accessToken='access-test';});
async function open(){
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><CompanyQuickEnterPopover/></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button',{name:"Entra in un'azienda"}));
  return screen.findByRole('button',{name:/Azienda Demo/});
}
describe('Ingresso azienda reale dal selettore',()=>{
  it('rifiuto/429: resta nel selettore e non naviga',async()=>{
    mocks.start.mockResolvedValue(null);
    fireEvent.click(await open());
    await waitFor(()=>expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Cerca azienda...')).toBeInTheDocument();
  });
  it('token valido: apre azienda con relay',async()=>{
    mocks.start.mockResolvedValue('imp-test');
    fireEvent.click(await open());
    await waitFor(()=>expect(mocks.redirect).toHaveBeenCalledTimes(1));
    expect(mocks.redirect.mock.calls[0][0]).toContain('_it=imp-test');
  });
  it('token valido ma sessione mancante: niente navigazione incompleta',async()=>{
    mocks.start.mockResolvedValue('imp-test');mocks.tokens.accessToken=null;
    fireEvent.click(await open());
    await waitFor(()=>expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
