import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManualTransactionsSheet } from '@/components/tesoreria/ManualTransactionsSheet';
const salva = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useManualTreasury', () => ({ useManualTreasury: () => ({ upsertTx: {mutateAsync:salva,isPending:false},deleteTx:{} }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({useConfirm:()=>vi.fn()}));
vi.mock('@/components/tesoreria/BankStatementImportDialog', () => ({BankStatementImportDialog:():null=>null}));
vi.mock('@/integrations/supabase/client', () => ({supabase:{from:()=>{const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({data:[] as never[],error:null as null})};return q;}}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('mantiene il movimento e mostra l’errore nel modulo quando il server rifiuta il salvataggio',async()=>{
 salva.mockRejectedValue({code:'42501',message:'permission denied for table bank_transactions'});
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ManualTransactionsSheet account={{id:'demo',display_name:'Cassa demo',account_name:null,iban:null,currency:'EUR',opening_balance:0,current_balance:0,is_active:true}} open onOpenChange={()=>{}} /></QueryClientProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Movimento'}));
 fireEvent.change(screen.getByPlaceholderText('0,00'),{target:{value:'1'}});
 fireEvent.click(screen.getByRole('button',{name:'Salva'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Movimento non salvato: Non hai i permessi per questa operazione. Contatta l\'amministratore.');
 expect(screen.getByPlaceholderText('0,00')).toHaveValue('1');
});
