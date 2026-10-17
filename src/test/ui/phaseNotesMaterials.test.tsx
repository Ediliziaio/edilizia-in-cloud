import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NewPhaseMaterial} from '@/components/orders/NewPhaseMaterial';
import {NoteCantiere} from '@/components/manodopera/NoteCantiere';
const m=vi.hoisted(()=>({canEdit:true,insert:vi.fn(),refetch:vi.fn(),error:null as Error|null,toast:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{if(table!=='order_items')throw Error('Tabella inattesa');return {insert:m.insert};}}}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({canEditOrders:m.canEdit})}));
vi.mock('sonner',()=>({toast:{error:m.toast,success:vi.fn()}}));
vi.mock('@/hooks/useOperai',()=>({useNoteCantiere:()=>({data:[] as unknown[],isLoading:false,error:m.error,refetch:m.refetch}),useEliminaNota:()=>({mutate:vi.fn()}),useSalvaNota:()=>({}),useSquadre:()=>({data:[] as unknown[]}),useSquadreCommessa:()=>({data:[] as unknown[]}),messaggioErroreOperai:()=>''}));
afterEach(cleanup);beforeEach(()=>{vi.clearAllMocks();m.canEdit=true;m.error=null;m.insert.mockResolvedValue({error:null});});
function material(){const qc=new QueryClient();return render(<QueryClientProvider client={qc}><NewPhaseMaterial orderId="ordine" phaseId="fase" phaseName="Scavo"/></QueryClientProvider>);}
it('crea un materiale fisico nella fase giusta senza prezzo di acquisto inventato',async()=>{
 material();fireEvent.click(screen.getByRole('button',{name:'Nuovo materiale'}));fireEvent.change(screen.getByLabelText('Nome materiale'),{target:{value:'Tubo'}});fireEvent.change(screen.getByLabelText('Quantità (pezzi)'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Salva materiale'}));
 await waitFor(()=>expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({order_id:'ordine',phase_id:'fase',name:'Tubo',quantity:2,purchase_price:null,unit_price:0,status:'da_ordinare'})));
});
it('non scrive con dati incompleti o senza il permesso di modificare la commessa',()=>{
 const view=material();fireEvent.click(screen.getByRole('button',{name:'Nuovo materiale'}));fireEvent.click(screen.getByRole('button',{name:'Salva materiale'}));expect(m.insert).not.toHaveBeenCalled();view.unmount();m.canEdit=false;material();expect(screen.queryByRole('button',{name:'Nuovo materiale'})).not.toBeInTheDocument();
});
it('un errore delle note è esplicito e permette di ricaricare, senza far sparire la sezione',()=>{
 m.error=new Error('Rete');render(<NoteCantiere orderId="ordine" phaseId="fase" fasi={[]} modificabile compatta/>);
 expect(screen.getByRole('alert')).toHaveTextContent('Le note non sono disponibili');fireEvent.click(screen.getByRole('button',{name:'Ricarica note'}));expect(m.refetch).toHaveBeenCalledOnce();
});
it('una fase senza note mantiene disponibile il comando di inserimento',()=>{
 render(<NoteCantiere orderId="ordine" phaseId="fase" fasi={[]} modificabile compatta/>);expect(screen.getByRole('button',{name:'Nota per gli operai'})).toBeInTheDocument();
});

it('rifiuta frazioni di pezzi prima della scrittura, coerentemente con il database',()=>{material();fireEvent.click(screen.getByRole('button',{name:'Nuovo materiale'}));fireEvent.change(screen.getByLabelText('Nome materiale'),{target:{value:'Tubo'}});fireEvent.change(screen.getByLabelText('Quantità (pezzi)'),{target:{value:'2,5'}});fireEvent.click(screen.getByRole('button',{name:'Salva materiale'}));expect(m.insert).not.toHaveBeenCalled();expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('quantità intera'));});
