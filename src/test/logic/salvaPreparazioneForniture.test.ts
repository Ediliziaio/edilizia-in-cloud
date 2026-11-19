import { beforeEach, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:mock.rpc}}));
import { salvaPreparazioneForniture } from "@/lib/orders/salvaPreparazioneForniture";
import type { OrderItem } from "@/components/orders/OrderItemsList";
const rows:OrderItem[]=[{name:"Finestra",quantity:2,status:"da_ordinare",position:0}];
beforeEach(()=>mock.rpc.mockReset());
it("chiama soltanto il servizio atomico con l'identità del tentativo",async()=>{
 mock.rpc.mockResolvedValue({data:{ids:['10000000-0000-4000-a000-000000000001'],voci_inserite:1},error:null});
 await salvaPreparazioneForniture('commessa',rows,'richiesta');expect(mock.rpc).toHaveBeenCalledWith('commessa_prepara_forniture',{p_commessa:'commessa',p_voci:rows,p_richiesta:'richiesta'});
});
it("servizio assente: errore chiaro e nessun fallback parziale",async()=>{
 mock.rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'missing'}});await expect(salvaPreparazioneForniture('commessa',rows,'id')).rejects.toThrow(/deve essere aggiornato/);expect(mock.rpc).toHaveBeenCalledTimes(1);
});
it("una risposta incompleta non diventa un successo",async()=>{
 mock.rpc.mockResolvedValue({data:{ids:[],voci_inserite:1},error:null});await expect(salvaPreparazioneForniture('commessa',rows,'id')).rejects.toThrow(/non confermato/);
});
