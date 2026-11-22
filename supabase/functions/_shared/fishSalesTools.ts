import { canonicalCustomerPhone } from "./fishCrmTrial.ts";

export async function fishOpportunityOutcome(db:any,company:string,agent:string,session:string,params:Record<string,string>){
 const confirmed=["si","sì","true"].includes((params.confermato || "").toLowerCase());
 const {data,error}=await db.rpc("fish_save_opportunity_outcome",{p_company:company,p_agent:agent,p_session:session,p_outcome:params.esito,p_note:params.nota,p_next_action:params.prossimo_passo || "",p_confirmed:confirmed});
 if(error)throw new Error("Esito commerciale non confermato. Verifica la pratica prima di ripetere.");
 return data;
}

export type FishLeadBooking = {
  contactId: string;
  opportunityId: string | null;
  requestKey: string;
};

export type FishLeadContact = { id: string; first_name: string | null; last_name: string | null };

export async function fishLeadContact(
  db: any,
  companyId: string,
  agentId: string,
  sessionId: string,
  phone: string,
): Promise<FishLeadContact | null> {
  const call = await db.from("ai_fish_calls").select("contact_id,to_number")
    .eq("company_id", companyId).eq("agent_id", agentId)
    .eq("remote_session_id", sessionId).eq("direction", "outbound").maybeSingle();
  if (call.error) throw new Error("Collegamento alla chiamata non verificabile");
  if (!call.data?.contact_id || !phone || call.data.to_number !== phone) return null;

  const contact = await db.from("marketing_contacts").select("id,phone,country,first_name,last_name")
    .eq("company_id", companyId).eq("id", call.data.contact_id)
    .is("deleted_at", null).maybeSingle();
  if (contact.error) throw new Error("Scheda commerciale non verificabile");
  if (!contact.data || canonicalCustomerPhone(contact.data.phone, contact.data.country) !== phone) return null;
  return contact.data;
}

export async function fishLeadBooking(
  db: any,
  companyId: string,
  agentId: string,
  sessionId: string,
  phone: string,
): Promise<FishLeadBooking | null> {
  const contact = await fishLeadContact(db, companyId, agentId, sessionId, phone);
  if (!contact) return null;

  const opportunities = await db.from("marketing_opportunities").select("id")
    .eq("company_id", companyId).eq("contact_id", contact.id)
    .eq("status", "open").is("deleted_at", null).limit(2);
  if (opportunities.error) throw new Error("Opportunità non verificabile");

  const rows = opportunities.data || [];
  return {
    contactId: contact.id,
    opportunityId: rows.length === 1 ? rows[0].id : null,
    requestKey: `fish-lead-booking:${sessionId}`,
  };
}
