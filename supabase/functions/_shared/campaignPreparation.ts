import { prepareVoiceRecipients, voiceContactExclusion, type VoiceContact } from "./contactVoice.ts";

export const CAMPAIGN_ACTIONS = ["list_campaigns", "campaign_agents", "create_campaign", "delete_campaign", "campaign_contacts", "prepare_campaign", "start_campaign", "pause_campaign"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class CampaignError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function id(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new CampaignError("Identificativo non valido");
  return value.toLowerCase();
}
function checked(result: { data: any; error: any }, message: string) {
  if (result.error) throw new CampaignError(message, 500);
  return result.data;
}

/** Only called AFTER agentCompanyAccess. No provider call and no status activation. */
export async function campaignPreparation(db: any, companyId: string, action: string, payload: Record<string, unknown> = {}) {
  if (action === "list_campaigns") {
    const campaigns = checked(await db.from("ai_campaigns_v2").select("*").eq("company_id", companyId)
      .order("creato_il", { ascending: false }).limit(500), "Impossibile caricare le campagne");
    const readiness = await db.rpc("voice_campaign_runtime_ready");
    return { campaigns: campaigns || [], dispatch_enabled: !readiness.error && readiness.data === true };
  }
  if (action === "campaign_agents") {
    const agents = checked(await db.from("ai_agents_v2").select("id,nome,tipo,stato,elevenlabs_agent_id")
      .eq("company_id", companyId).in("tipo", ["vocale", "campagna"]).order("nome"), "Impossibile caricare gli agenti");
    return { agents: agents || [] };
  }
  if (action === "campaign_contacts") {
    const term = typeof payload.search === "string" ? payload.search.trim().slice(0, 80) : "";
    const page = Number(payload.page ?? 0);
    if (!Number.isInteger(page) || page < 0 || page > 2000) throw new CampaignError("Pagina non valida");
    let query = db.from("marketing_contacts")
      .select("id,first_name,last_name,phone,optout_call,opt_out,deleted_at,marketing_consent,ricontatta_dopo")
      .eq("company_id", companyId).is("deleted_at", null);
    // Do not interpolate PostgREST filter syntax supplied by the user.
    const safe = term.replace(/[,()\[\]".%_\\]/g, " ").replace(/\s+/g, " ").trim();
    if (term && !safe) return { contacts: [], has_more: false };
    if (safe) query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
    const rows: VoiceContact[] = checked(await query.order("last_name").order("id").range(page * 50, page * 50 + 50), "Impossibile caricare i contatti") || [];
    return { contacts: rows.slice(0, 50).map(c => ({ id: c.id, nome: [c.first_name, c.last_name].filter(Boolean).join(" ").trim(),
      telefono: c.phone, exclusion: voiceContactExclusion(c, true) })), has_more: rows.length > 50 };
  }
  if (action === "create_campaign") {
    const campaignId = id(payload.id);
    const existing = checked(await db.from("ai_campaigns_v2").select("id").eq("id", campaignId).eq("company_id", companyId).maybeSingle(), "Impossibile verificare la bozza");
    if (existing) return { campaign: existing }; // Stable client UUID makes a retry recover the saved draft.
    const name = typeof payload.nome === "string" ? payload.nome.trim() : "";
    if (!name || name.length > 160) throw new CampaignError("Inserisci un nome campagna (massimo 160 caratteri)");
    const agent = checked(await db.from("ai_agents_v2").select("id,tipo").eq("id", id(payload.agent_id)).eq("company_id", companyId).maybeSingle(), "Impossibile verificare l'agente");
    if (!agent || !["vocale", "campagna"].includes(agent.tipo)) throw new CampaignError("Seleziona un agente vocale dell'azienda");
    const description = typeof payload.descrizione === "string" ? payload.descrizione.trim() : "";
    if (description.length > 2000) throw new CampaignError("Descrizione troppo lunga (massimo 2000 caratteri)");
    const campaign = checked(await db.from("ai_campaigns_v2").insert({ id: campaignId, company_id: companyId, agent_id: agent.id,
      nome: name, descrizione: description || null, tipo: "chiamata", stato: "bozza" }).select("id").single(), "Impossibile salvare la campagna; riprova senza creare una nuova bozza");
    if (!campaign) throw new CampaignError("Campagna non salvata", 500);
    return { campaign };
  }

  const campaignId = id(payload.campaign_id);
  if (["start_campaign", "pause_campaign"].includes(action)) {
    if (typeof payload.updated_at !== "string" || !Number.isFinite(Date.parse(payload.updated_at))) throw new CampaignError("Ricarica la campagna prima di procedere");
    const result = await db.rpc("control_voice_campaign", { p_company_id: companyId, p_campaign_id: campaignId,
      p_updated_at: payload.updated_at, p_action: action === "start_campaign" ? "start" : "pause" });
    if (result.error) throw new CampaignError(result.error.message || "Campagna non avviata", 409);
    return result.data;
  }
  const campaign = checked(await db.from("ai_campaigns_v2").select("*").eq("id", campaignId).eq("company_id", companyId).maybeSingle(), "Impossibile verificare la campagna");
  if (!campaign) throw new CampaignError("Campagna non trovata", 404);
  if (campaign.stato !== "bozza" || Number(campaign.chiamate_effettuate) > 0) throw new CampaignError("Puoi modificare o eliminare solo bozze mai avviate", 409);
  if (!campaign.aggiornato_il || payload.updated_at !== campaign.aggiornato_il) throw new CampaignError("La campagna è cambiata. Ricaricala prima di salvare", 409);

  if (action === "delete_campaign") {
    const attempted = checked(await db.from("ai_campaign_contacts").select("id").eq("campaign_id", campaignId).gt("tentativo_corrente", 0).limit(1), "Impossibile verificare lo storico");
    if (attempted?.length) throw new CampaignError("La campagna ha uno storico chiamate: non può essere eliminata", 409);
    const deleted = checked(await db.from("ai_campaigns_v2").delete().eq("company_id", companyId).eq("id", campaignId)
      .eq("stato", "bozza").eq("aggiornato_il", campaign.aggiornato_il).select("id").maybeSingle(), "Impossibile eliminare la bozza");
    if (!deleted) throw new CampaignError("La bozza è cambiata: ricarica la lista", 409);
    return { deleted: true };
  }
  if (action !== "prepare_campaign") throw new CampaignError("Azione campagna non supportata");
  if (!Array.isArray(payload.contact_ids) || payload.contact_ids.length > 500) throw new CampaignError("Seleziona al massimo 500 contatti");
  const ids = [...new Set(payload.contact_ids.map(id))];
  const contacts: VoiceContact[] = ids.length ? checked(await db.from("marketing_contacts")
    .select("id,first_name,last_name,phone,optout_call,opt_out,deleted_at,marketing_consent,ricontatta_dopo")
    .eq("company_id", companyId).in("id", ids), "Impossibile verificare i destinatari") || [] : [];
  if (contacts.length !== ids.length) throw new CampaignError("Alcuni contatti non sono più disponibili nell'azienda", 409);
  const preparation = prepareVoiceRecipients(contacts);
  if (ids.length && !preparation.recipients.length) throw new CampaignError("Nessun contatto idoneo. Controlla numeri, esclusioni e consenso registrato");
  const metadata = campaign.metadata && typeof campaign.metadata === "object" && !Array.isArray(campaign.metadata) ? campaign.metadata : {};
  // One compare-and-swap write: no partially imported queue, no duplicate append.
  // These snapshots are NOT ai_campaign_contacts and MUST be revalidated by a future dispatcher.
  const saved = checked(await db.from("ai_campaigns_v2").update({ metadata: { ...metadata, preparazione_destinatari: {
    versione: 1, verificata_il: new Date().toISOString(), ...preparation,
  } } }).eq("company_id", companyId).eq("id", campaignId).eq("stato", "bozza")
    .eq("aggiornato_il", campaign.aggiornato_il).select("id,aggiornato_il").maybeSingle(), "Impossibile salvare i destinatari");
  if (!saved) throw new CampaignError("La campagna è stata modificata: ricaricala prima di riprovare", 409);
  return { campaign: saved, prepared: preparation.recipients.length, excluded: preparation.excluded };
}
