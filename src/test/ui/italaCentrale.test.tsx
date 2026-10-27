import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ItalaPlatformConnection } from '@/components/billing/ItalaPlatformConnection';
const { invoke } = vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke}}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
const view = (hasDirect=false) => render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ItalaPlatformConnection companyId="company-A" connected={false} hasDirect={hasDirect}/></QueryClientProvider>);
afterEach(cleanup);
beforeEach(()=>{invoke.mockReset();invoke.mockImplementation(async(_name,options)=>({data: options.body.action==='itala_platform_status'?{configured:true,vat_number:'02010390439'}:{success:true},error:null}));});
describe('ITALA centrale',()=>{
  it('prende la partita IVA dal server e non chiede segreti ai clienti',async()=>{
    view();
    expect(await screen.findByText('02010390439')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('billing-connect',{body:{action:'itala_platform_status',company_id:'company-A'}});
  });
  it('collega solo dopo la conferma dell’anagrafica e indica il collegamento diretto',async()=>{
    view(true);
    const button=await screen.findByRole('button',{name:'Collega il recupero fatture'});
    await waitFor(()=>expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(invoke.mock.calls.every(([,o])=>o.body.action==='itala_platform_status')).toBe(true);
    expect(screen.getByText(/Il programma già collegato resta la fonte principale/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Conferma collegamento'}));
    await waitFor(()=>expect(invoke).toHaveBeenCalledWith('billing-connect',{body:{action:'connect_platform_itala',company_id:'company-A',consent_provider:true}}));
  });
  it('senza partita IVA o servizio pronto non presenta un collegamento funzionante',async()=>{
    invoke.mockResolvedValue({data:{configured:false,vat_number:null},error:null});
    view();
    expect(await screen.findByText(/Il servizio è in preparazione/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Collega il recupero fatture'})).toBeDisabled();
  });
});
