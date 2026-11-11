export async function fishOpportunityOutcome(db:any,company:string,agent:string,session:string,params:Record<string,string>){
 const confirmed=["si","sì","true"].includes((params.confermato || "").toLowerCase());
 const {data,error}=await db.rpc("fish_save_opportunity_outcome",{p_company:company,p_agent:agent,p_session:session,p_outcome:params.esito,p_note:params.nota,p_next_action:params.prossimo_passo || "",p_confirmed:confirmed});
 if(error)throw new Error("Esito commerciale non confermato. Verifica la pratica prima di ripetere.");
 return data;
}
