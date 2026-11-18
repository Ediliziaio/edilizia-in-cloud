import { fireEvent,render,screen,waitFor,cleanup } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { setupRadixMenus } from '@/test/helpers/radixMenus';
setupRadixMenus();
const m=vi.hoisted(()=>({rpc:vi.fn(),close:vi.fn(),readOnly:false}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({canViewBilling:true,solaLettura:m.readOnly})}));
vi.mock('@/hooks/useEffectiveCompanyId',()=>({useEffectiveCompanyId:()=> 'c1'}));
vi.mock('@/hooks/billing/useFatturaOrdineLink',()=>({useFattureByOrdine:()=>({data:[{id:'f1',numero:'FT-UNICA',tipo:'fattura',stato:'emessa',totale_documento:1000,totale_da_pagare:900,importo_pagato:360}],isPending:false,isError:false})}));
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...a:unknown[])=>m.rpc(...a),from:()=>{const q:Record<string,unknown>={then:(ok:(v:unknown)=>unknown)=>Promise.resolve({data:[300,400,300].map((amount,i)=>({id:`r${i}`,position:i,label:['Acconto','SAL','Saldo'][i],amount,is_paid:false,type:'deposit'})),error:null}).then(ok)};for(const k of ['select','eq','order'])q[k]=()=>q;return q;}}}));
import FatturaRateDialog from '@/components/orders/FatturaRateDialog';
function show(){return render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><FatturaRateDialog orderId="o1" invoiceId="f1" onClose={m.close}/></QueryClientProvider></MemoryRouter>);}
beforeEach(()=>{m.rpc.mockReset();m.close.mockReset();m.rpc.mockResolvedValue({error:null});m.readOnly=false;});afterEach(cleanup);
it('seleziona una fattura e più rate, mostra trattenute e ripartizione, salva un unico collegamento',async()=>{
 show();

 await screen.findByRole('group',{name:'Rate da collegare alla fattura'});
 expect(screen.getByRole('button',{name:'Conferma ripartizione'})).toBeDisabled();
 for(const b of screen.getAllByRole('checkbox'))fireEvent.click(b);
 expect(screen.getByText(/Esigibile 270,00.*incassato 270,00.*non esigibile ora 30,00/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Conferma ripartizione'}));
 await waitFor(()=>expect(m.rpc).toHaveBeenCalledWith('collega_fattura_rate',{p_order_id:'o1',p_documento_id:'f1',p_rate:['r0','r1','r2']}));
 expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.close).toHaveBeenCalledTimes(1);
});
it('l’errore del servizio conserva le scelte e non dichiara successo',async()=>{
 m.rpc.mockResolvedValue({error:{message:'Il piano è stato modificato da un altro utente'}});show();

 for(const b of await screen.findAllByRole('checkbox'))fireEvent.click(b);
 fireEvent.click(screen.getByRole('button',{name:'Conferma ripartizione'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('altro utente');expect(screen.getAllByRole('checkbox').every(b=>(b as HTMLInputElement).checked)).toBe(true);expect(m.close).not.toHaveBeenCalled();
});
