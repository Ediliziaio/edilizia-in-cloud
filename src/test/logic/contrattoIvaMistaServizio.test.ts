import {beforeEach, expect, it, vi} from "vitest";
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc}}));
import {verificaSupportoIvaMista} from "@/lib/orders/ivaMistaServizio";
beforeEach(()=>rpc.mockReset());
it.each([{data:null,error:{message:"missing RPC"}},{data:{version:1},error:null},{data:{version:2,split_10_22:true},error:null}])("blocca il salvataggio se il servizio non supporta tutte le quote",async response=>{
 rpc.mockResolvedValue(response);await expect(verificaSupportoIvaMista()).rejects.toThrow("Nessun contratto è stato creato o modificato");expect(rpc).toHaveBeenCalledOnce();expect(rpc).toHaveBeenCalledWith("contract_vat_split_capabilities",{});
});
it("accetta il servizio compatibile senza scritture",async()=>{
 rpc.mockResolvedValue({data:{version:1,split_10_22:true},error:null});await expect(verificaSupportoIvaMista()).resolves.toBeUndefined();expect(rpc).toHaveBeenCalledOnce();
});
