import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({company:'azienda-a',billing:true,error:false,read:vi.fn()}));
vi.mock('@/hooks/useEffectiveCompanyId',()=>({useEffectiveCompanyId:()=>m.company}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({canViewBilling:m.billing})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:(_key:string,company:string)=>({maybeSingle:async()=>{
  m.read(company);
  return m.error ? {data:null as {motivo:string;messaggio:string;bloccata_il:string}|null,error:new Error('temporaneo')} : {data:{motivo:'credito_azienda',messaggio:`Credito in attesa per ${company}`,bloccata_il:'2026-11-22T09:00:00Z'},error:null as Error|null};
}})})})}}));
import { StatoCodaAllegati } from '@/components/email-ai/StatoCodaAllegati';
const mount=()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  const ui=()=> <QueryClientProvider client={client}><MemoryRouter><StatoCodaAllegati/></MemoryRouter></QueryClientProvider>;
  return {view:render(ui()),ui};
};
beforeEach(()=>{m.company='azienda-a';m.billing=true;m.error=false;m.read.mockClear();});
afterEach(cleanup);
it('porta chi può gestire la fatturazione alla scheda crediti esistente',async()=>{
  mount();expect(await screen.findByText('Credito in attesa per azienda-a')).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Verifica crediti AI'})).toHaveAttribute('href','/azienda/impostazioni/crediti');
  expect(screen.getByRole('status')).toHaveTextContent('I documenti restano disponibili');
});
it('spiega all’operatore a chi chiedere lo sblocco, senza un collegamento vietato',async()=>{
  m.billing=false;mount();
  expect(await screen.findByText('Chiedi all’amministratore di verificare fatturazione e crediti AI.')).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
it('cambiando azienda non riusa il messaggio della precedente',async()=>{
  const x=mount();await screen.findByText('Credito in attesa per azienda-a');
  m.company='azienda-b';x.view.rerender(x.ui());
  expect(await screen.findByText('Credito in attesa per azienda-b')).toBeInTheDocument();
  expect(screen.queryByText('Credito in attesa per azienda-a')).not.toBeInTheDocument();
  expect(m.read).toHaveBeenCalledWith('azienda-b');
});
it('un errore di lettura dello stato non impedisce il lavoro manuale',async()=>{
  m.error=true;mount();
  expect(await screen.findByRole('status')).toHaveTextContent('Puoi continuare a gestire i documenti');
});
