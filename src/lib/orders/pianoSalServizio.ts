import {supabase} from "@/integrations/supabase/client";
export async function verificaSupportoPianoSal(){
 const rpc=supabase.rpc.bind(supabase) as unknown as (name:string,args:Record<string,never>)=>Promise<{data:unknown;error:unknown}>;
 const {data,error}=await rpc("contract_sal_plan_capabilities",{});
 if(error||!data||typeof data!=="object"||!("version" in data)||data.version!==1||!("open_sal" in data)||data.open_sal!==true)throw new Error("Il piano a SAL è pronto nel modulo, ma il servizio dati deve essere aggiornato prima del salvataggio. Nessun contratto è stato creato o modificato.");
}
