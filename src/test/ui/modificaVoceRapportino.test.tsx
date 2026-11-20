import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),error:vi.fn(),sale:true}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:m.from,rpc:m.rpc}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'c'}})}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({canViewOrderAmounts:m.sale})}));
vi.mock('@/lib/orders/refreshWorkQueries',()=>({refreshWorkQueries:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:m.error}}));
import { ModificaVoceRapportino } from '@/components/orders/ModificaVoceRapportino';
beforeEach(()=>{m.sale=true;m.error.mockReset();m.rpc.mockReset().mockResolvedValue({error:null as null});m.from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:{descrizione:'Trasporto SIM',quantita:2,unita:'viaggio',costo_unitario:10,vendita_unitaria:30,updated_at:'v1',order_id:'o',viaggio:{carico:'Deposito',km:40}},error:null as null})};return q;});});afterEach(cleanup);
function open(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ModificaVoceRapportino id="v" rapportinoId="r" nome="Trasporto SIM"/></QueryClientProvider>);fireEvent.click(screen.getByRole('button',{name:'Modifica Trasporto SIM'}));}
it('modifica una voce esistente, conservando i dettagli del viaggio e la versione letta',async()=>{
 open();const campo=await screen.findByLabelText('Descrizione');fireEvent.change(campo,{target:{value:'Trasporto corretto'}});fireEvent.change(screen.getByLabelText('Quantità'),{target:{value:'3'}});fireEvent.click(screen.getByRole('button',{name:'Salva modifiche'}));
 await waitFor(()=>expect(m.rpc).toHaveBeenCalledWith('rapportino_voce_correggi',expect.objectContaining({p_id:'v',p_updated_at:'v1',p_campi:expect.objectContaining({descrizione:'Trasporto corretto',quantita:3,costo_unitario:10,vendita_unitaria:30,viaggio:expect.objectContaining({carico:'Deposito',km:40})})})));
});
it('senza accesso agli importi di vendita non mostra né invia il prezzo',async()=>{
 m.sale=false;open();await screen.findByLabelText('Descrizione');expect(screen.queryByLabelText('Vendita unitaria')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Salva modifiche'}));await waitFor(()=>expect(m.rpc).toHaveBeenCalled());expect(m.rpc.mock.calls[0][1].p_campi).not.toHaveProperty('vendita_unitaria');
});
it('un importo non numerico non arriva al database',async()=>{
 open();await screen.findByLabelText('Costo unitario');fireEvent.change(screen.getByLabelText('Costo unitario'),{target:{value:'abc'}});fireEvent.click(screen.getByRole('button',{name:'Salva modifiche'}));await waitFor(()=>expect(m.error).toHaveBeenCalled());expect(m.rpc).not.toHaveBeenCalled();
});
