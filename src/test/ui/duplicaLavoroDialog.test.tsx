import {cleanup,fireEvent,render,screen,waitFor}from'@testing-library/react';
import{afterEach,beforeEach,describe,it,expect,vi}from'vitest';
const stato=vi.hoisted(()=>({rpc:vi.fn(),done:vi.fn(),open:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:stato.rpc}}));
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
import{DuplicaLavoroDialog}from'@/components/orders/DuplicaLavoroDialog';
const preview={numero:'C-123',materiali:1,voci:4,fasi:2,sottofasi:3,impronta:'v1'};
beforeEach(()=>{vi.clearAllMocks();stato.rpc.mockImplementation(async(_fn:string,p:{p_anteprima:boolean})=>({data:{...preview,...(!p.p_anteprima?{id:'copy1'}:{})},error:null}));});
afterEach(cleanup);
function show(tipo:'commessa'|'rst'='commessa'){return render(<DuplicaLavoroDialog tipo={tipo} sourceId="source1" open onOpenChange={stato.open} onDuplicato={stato.done}/>);}
describe('duplicazione con riepilogo',()=>{
 it('apre solo anteprima e spiega cosa riparte da zero',async()=>{show();await screen.findByText('Da C-123');expect(screen.getByText('2 fasi e 3 sottofasi pianificate')).toBeInTheDocument();expect(screen.getByText(/Avanzamento da zero/)).toBeInTheDocument();expect(stato.rpc.mock.calls.every(c=>c[1].p_anteprima)).toBe(true);});
 it('cliente escluso di partenza, si può mantenere esplicitamente',async()=>{show();await screen.findByText('Da C-123');expect(screen.getByRole('checkbox')).not.toBeChecked();fireEvent.click(screen.getByRole('checkbox'));await waitFor(()=>expect(stato.rpc.mock.calls.at(-1)[1].p_mantieni_cliente).toBe(true));});
 it('conferma invia impronta e chiave di idempotenza, poi apre la copia',async()=>{show();await screen.findByText('Da C-123');fireEvent.click(screen.getByRole('button',{name:'Crea copia e apri'}));await waitFor(()=>expect(stato.done).toHaveBeenCalledWith('copy1'));expect(stato.rpc.mock.calls.at(-1)[1]).toMatchObject({p_anteprima:false,p_impronta:'v1',p_request_id:expect.any(String)});});
 it('retry dopo errore di rete mantiene la stessa richiesta',async()=>{let attempts=0;stato.rpc.mockImplementation(async(_fn:string,p:{p_anteprima:boolean})=>p.p_anteprima?{data:preview,error:null}:++attempts===1?{data:null,error:{message:'Rete non disponibile'}}:{data:{...preview,id:'copy1'},error:null});show();await screen.findByText('Da C-123');fireEvent.click(screen.getByRole('button',{name:'Crea copia e apri'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Crea copia e apri'}));await waitFor(()=>expect(stato.done).toHaveBeenCalled());const calls=stato.rpc.mock.calls.filter(c=>!c[1].p_anteprima);expect(calls[1][1].p_request_id).toBe(calls[0][1].p_request_id);});
 it('origine cambiata richiede aggiornamento senza creare una nuova copia',async()=>{stato.rpc.mockImplementation(async(_fn:string,p:{p_anteprima:boolean})=>p.p_anteprima?{data:preview,error:null}:{data:null,error:{code:'40001',message:'Origine cambiata'}});show();await screen.findByText('Da C-123');fireEvent.click(screen.getByRole('button',{name:'Crea copia e apri'}));await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Crea copia e apri'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Aggiorna riepilogo'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Crea copia e apri'})).toBeEnabled());expect(stato.done).not.toHaveBeenCalled();});
 it('annullamento non conferma nulla',async()=>{show('rst');await screen.findByText('Da C-123');fireEvent.click(screen.getByRole('button',{name:'Annulla'}));expect(stato.done).not.toHaveBeenCalled();});
});
