import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OrdersTrashDialog } from '@/components/orders/OrdersTrashDialog';
import { queryKeys } from '@/lib/queryKeys';

const database = vi.hoisted(() => ({ rows: [] as Array<{id:string;order_code:string;description:string;deleted_at:string}> }));
vi.mock('@/integrations/supabase/client', () => ({supabase:{from:()=>({select:()=>({eq:()=>({not:()=>({order:()=>({limit:async()=>({data:database.rows,error:null})})})})})})}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
afterEach(cleanup);

it('aggiorna il cestino dopo una cancellazione da un’altra schermata e alla riapertura', async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
  const row=(id:string)=>({id,order_code:id,description:'Prova tecnica',deleted_at:'2026-10-16T10:00:00Z'});
  database.rows=[row('PROVA-1')];
  const view=(open:boolean)=><QueryClientProvider client={client}><OrdersTrashDialog open={open} onOpenChange={()=>{}} companyId="azienda-prova" onChanged={()=>{}} /></QueryClientProvider>;
  const ui=render(view(true));
  await screen.findByText('PROVA-1');
  database.rows=[row('PROVA-1'),row('PROVA-2')];
  await client.invalidateQueries({queryKey:queryKeys.orders.all});
  await screen.findByText('PROVA-2');
  ui.rerender(view(false));
  database.rows=[row('PROVA-3')];
  ui.rerender(view(true));
  await screen.findByText('PROVA-3');
  await waitFor(()=>expect(screen.queryByText('PROVA-1')).toBeNull());
  client.clear();
});
