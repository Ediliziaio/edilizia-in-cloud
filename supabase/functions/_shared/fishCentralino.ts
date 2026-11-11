import { fishActionConsent,fishHasOptoutRequest,fishCallbackNumberAllowed } from "./fishActionConsent.ts";
import { fishLeadBusiness,fishMunicipalityKey } from "./fishLeadBusiness.ts";
import { FISH_PUBLIC_VOICES, isFishPublicVoice } from "./fishVoiceCatalog.ts";
import { FishAudioClient, buildFishOutboundRequest, fishPhone, verifyFishWebhook } from "./fishAudio.ts";
import { FISH_TOOLS, constantToken, enabledFishTools, fishAgentConfig, fishBackendUrl, fishConfigurationFingerprint, fishDerivedToken, fishLlmModel, fishToolPayload, fishVoiceOptions, normalizeFishSession } from "./fishAgentConfig.ts";
import { buildFishSimulation, auditFishSimulationBatch } from "./fishSimulation.ts";
import { createFishWebPreview } from "./fishWebPreview.ts";
import { fishCrmTrialAction, canonicalCustomerPhone } from "./fishCrmTrial.ts";
import { fishConnectionRequestAction } from "./fishConnectionRequests.ts";
import { fishOperatorDestinations,fishReserveOperator,fishOperatorChoices } from "./fishOperatorRouting.ts";
import { fishOpportunityOutcome } from "./fishSalesTools.ts";
import { fishCaseMemoryTool } from "./fishCaseMemory.ts";

type Context = { companyId: string; userId: string; isAdmin: boolean; isSuperAdmin: boolean };
export interface FishRuntimeDeps {
  db: any; fish: FishAudioClient; secret: string; backendUrl?: string;
  keyConfigured?: boolean;
  allowCostlyAction?: (company: string) => Promise<boolean>;
  authorize?: (req: Request, company: unknown) => Promise<Context>;
  allowInbound?: (company: string, binding?: any, agent?: any) => Promise<boolean>;
  executeTool?: (company: string, phone: string, session: string, name: string, params: Record<string, unknown>, config?: {calendarId: string}) => Promise<any>;
  cors?: (req: Request) => Record<string, string>;
}
const checked = (response: any, message = "Salvataggio Fish non riuscito") => {
  if (response.error) throw new Error(message); return response.data;
};
async function bindingFor(db: any, company: string, agent: string) {
  return checked(await db.from("ai_fish_agents").select("*").eq("company_id", company).eq("agent_id", agent).maybeSingle(), "Associazione Fish non leggibile: applica la migrazione locale");
}
async function localAgent(db: any, company: string, id: string) {
  const agent = checked(await db.from("ai_agents_v2").select("*").eq("company_id", company).eq("id", id).maybeSingle());
  if (!agent || !["vocale", "campagna"].includes(agent.tipo)) throw new Error("Agente vocale non disponibile per questa azienda.");
  return agent;
}
export function createFishManagementHandler(deps: FishRuntimeDeps) {
  return async (req: Request): Promise<Response> => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...deps.cors?.(req), "Content-Type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { headers: deps.cors?.(req) });
    if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
    try {
      const body = await req.json();
      const access = await deps.authorize!(req, body.company_id);
      if (["associate_call", "search_call_parties"].includes(body.action)) {
        if (!access.isAdmin && !access.isSuperAdmin) return json({ error: "Solo l’amministratore può associare le chiamate." }, 403);
        if (body.action === "search_call_parties") return json({ parties: checked(await deps.db.rpc("centralino_search_parties", { p_company: access.companyId, p_search: String(body.query || "").slice(0, 80) })) || [] });
        checked(await deps.db.rpc("centralino_associate_call", { p_company: access.companyId, p_kind: body.kind, p_call: body.call_id, p_contact: body.contact_id || null, p_customer: body.customer_id || null }));
        return json({ success: true });
      }
      const agent = await localAgent(deps.db, access.companyId, body.agent_id);
      let binding = await bindingFor(deps.db, access.companyId, agent.id);
      const action = body.action;
      if (["crm_trial_customers","crm_trial_start","crm_trial_status","crm_trial_session","crm_trial_tool","crm_trial_transcript"].includes(action)) {
        if(!access.isAdmin && !access.isSuperAdmin)return json({error:"Collaudo riservato all’amministratore."},403);
        if(action==="crm_trial_session" && deps.allowCostlyAction && !(await deps.allowCostlyAction(access.companyId)))return json({error:"Attendi prima di avviare un’altra prova."},429);
        return json(await fishCrmTrialAction(deps,access,agent,binding,body));
      }
      if (action === "status") return json({ binding, keyConfigured: deps.keyConfigured !== false, requires_public_backend: true,
        synchronized: !!binding?.config_fingerprint && binding.config_fingerprint === await fishConfigurationFingerprint(agent,binding) });
      if (["number_connection_status","request_number_connection","review_number_connection","provide_number_information"].includes(action)) {
        if(!access.isAdmin && !access.isSuperAdmin)return json({error:"Solo l’amministratore può gestire la richiesta."},403);
        if(action==="review_number_connection" && !access.isSuperAdmin)return json({error:"Verifica riservata alla piattaforma."},403);
        return json(await fishConnectionRequestAction(deps,access,agent,binding,body));
      }
      if (deps.keyConfigured === false) throw new Error("Imposta FISH_API_KEY nei segreti del backend locale.");
      if (!access.isAdmin && !access.isSuperAdmin) return json({ error: "Solo l'amministratore può configurare Fish" }, 403);
      if (["configure", "publish", "simulate", "preview_voice", "preview_session"].includes(action) && deps.allowCostlyAction && !(await deps.allowCostlyAction(access.companyId))) return json({ error: "Troppe operazioni Fish: attendi prima di riprovare." }, 429);
      if (action === "available_voices") {
        const voices=new Map<string,any>(FISH_PUBLIC_VOICES.map(voice=>[voice.id,voice]));
        if(access.isSuperAdmin)for(const voice of await deps.fish.listOwnVoices())if(!voices.has(voice.id))voices.set(voice.id,voice);
        if(binding?.voice_id && !voices.has(binding.voice_id))voices.set(binding.voice_id,{id:binding.voice_id,name:"Voce dell’azienda",languages:[agent.lingua || "it"]});
        return json({voices:[...voices.values()]});
      }
      if(action==="operator_choices")return json({operators:await fishOperatorChoices(deps.db,access.companyId)});
      if (action === "available_numbers") {
        if (!access.isSuperAdmin) return json({ error: "L'assegnazione dei numeri è riservata alla piattaforma" }, 403);
        const numbers = await deps.fish.listPhoneNumbers();
        return json({ numbers: numbers.map(n => ({ id: n.phone_number_id, number: n.phone_number, agentId: n.agent_id, outbound: n.supports_outbound === true, status: n.status })) });
      }
      if (action === "configure") {
        const voice = String(body.voice_id || binding?.voice_id || "").trim();
        if (!voice || voice.length > 256) throw new Error("Indica l'ID di una voce Fish.");
        if (!access.isSuperAdmin && voice !== binding?.voice_id && !isFishPublicVoice(voice)) return json({ error: "La piattaforma deve prima abilitare questa voce per la tua azienda." }, 403);
        if (!agent.system_prompt || agent.system_prompt.trim().length < 20) throw new Error("Salva prima un prompt di almeno 20 caratteri.");
        if (agent.tools_config?.fish?.calendar_id) {
          const calendar=checked(await deps.db.from("marketing_calendars").select("id").eq("id",agent.tools_config.fish.calendar_id).eq("company_id",access.companyId).eq("is_active",true).maybeSingle());
          if(!calendar)throw new Error("Il calendario scelto non è attivo o non appartiene all’azienda.");
        }
        const prices: Record<string, number> = {};
        for (const key of ["real_per_min_eur", "billed_per_min_eur"]) if (body[key] !== undefined) {
          if (!access.isSuperAdmin) return json({ error: "Solo la piattaforma può impostare le tariffe" }, 403);
          if (typeof body[key] !== "number" || !Number.isFinite(body[key]) || body[key] < 0 || body[key] >= 1000) throw new Error("Tariffa al minuto non valida.");
          prices[key] = body[key];
        }
        const baseUrl = fishBackendUrl(deps.backendUrl || "");
        fishLlmModel(agent); // Reject unsupported choices before provisioning a remote draft.
        await fishDerivedToken(deps.secret, agent.id); // Validate the secret before remote writes.
        if (!binding) {
          // Claim before provisioning. An ambiguous create cannot cause a second remote agent.
          const claim = await deps.db.from("ai_fish_agents").insert({ company_id: access.companyId, agent_id: agent.id, voice_id: voice, ...prices }).select("*").single();
          if (claim.error) throw new Error("Collegamento già in preparazione. Ricarica la configurazione.");
          binding = claim.data;
          const remote = await deps.fish.agentRequest("/v1/agent/agents", "POST", { name: `EiC ${agent.id}: ${agent.nome}`.slice(0, 120), description: "Centralino Edilizia in Cloud", config: { voice: { voice_id: voice, speaking_language: agent.lingua || "it" } } });
          if (!remote.agent_id) throw new Error("Creazione Fish non confermata: riconcilia la bozza prima di riprovare.");
          binding.fish_agent_id = remote.agent_id;
          checked(await deps.db.from("ai_fish_agents").update({ fish_agent_id: remote.agent_id }).eq("company_id", access.companyId).eq("agent_id", agent.id));
        }
        if (!binding.fish_agent_id) throw new Error("Provisioning precedente senza esito: usa Riconcilia bozza con l'ID remoto.");
        const nextBinding = { ...binding, voice_id: voice, ...prices };
        // Never leave a previously enabled, published binding pointing at newly unsaved settings.
        checked(await deps.db.from("ai_fish_agents").update({ published: false, enabled: false, voice_id: voice, ...prices }).eq("agent_id", agent.id).eq("company_id", access.companyId));
        if (agent.tools_config?.voice_provider === "fish_audio") checked(await deps.db.from("ai_agents_v2").update({ stato: "pausa" }).eq("id", agent.id).eq("company_id", access.companyId));
        const ids = { ...(binding.tool_ids || {}) };
        const token = await fishDerivedToken(deps.secret, binding.fish_agent_id);
        const attached: string[] = [];
        for (const name of enabledFishTools(agent)) {
          const payload = fishToolPayload(name, binding.fish_agent_id, baseUrl, token);
          if (ids[name]) {
            const { tool_type: _immutableType, ...update } = payload;
            await deps.fish.agentRequest(`/v1/agent/tools/${encodeURIComponent(ids[name])}`, "PATCH", update);
          }
          else {
            const tool = await deps.fish.agentRequest("/v1/agent/tools", "POST", payload);
            if (!tool.tool_id) throw new Error("Creazione dello strumento Fish non confermata.");
            ids[name] = tool.tool_id;
            checked(await deps.db.from("ai_fish_agents").update({ tool_ids: ids }).eq("agent_id", agent.id).eq("company_id", access.companyId));
          }
          attached.push(ids[name]);
        }
        if(agent.tools_config?.fish?.routing==="first_available")nextBinding.transfer_destinations=await fishOperatorDestinations(deps.db,access.companyId,agent);
        const config = fishAgentConfig(agent, nextBinding, baseUrl, deps.secret, attached);
        await deps.fish.agentRequest(`/v1/agent/agents/${encodeURIComponent(binding.fish_agent_id)}/config`, "PATCH", config);
        checked(await deps.db.from("ai_fish_agents").update({ tool_ids: ids, transfer_destinations: config.conversation.transfer_destinations, config_fingerprint: await fishConfigurationFingerprint(agent, nextBinding) }).eq("agent_id", agent.id).eq("company_id", access.companyId));
        return json({ success: true, message: "Bozza Fish sincronizzata. Pubblicala e collega una linea prima di attivarla." });
      }
      if (action === "recover_agent") {
        if (!access.isSuperAdmin || !binding || binding.fish_agent_id) return json({ error: "Riconciliazione riservata alla piattaforma per una bozza senza ID" }, 403);
        const remote = await deps.fish.agentRequest(`/v1/agent/agents/${encodeURIComponent(String(body.remote_agent_id || ""))}`);
        if (!String(remote.name || "").startsWith(`EiC ${agent.id}:`)) throw new Error("L'agente remoto non corrisponde a questa bozza.");
        checked(await deps.db.from("ai_fish_agents").update({ fish_agent_id: remote.agent_id }).eq("company_id", access.companyId).eq("agent_id", agent.id));
        return json({ success: true });
      }
      if (!binding?.fish_agent_id) throw new Error("Completa prima il collegamento a Fish.");
      if(action==="publish" && agent.tools_config?.system_tools?.transfer_number===true && agent.tools_config?.fish?.routing==="first_available" && !binding.transfer_destinations?.length)throw new Error("Prima configura i numeri degli operatori nel centralino e salva di nuovo la bozza.");
      if (action === "call_recording") {
        const call = checked(await deps.db.from("ai_fish_calls").select("remote_session_id").eq("company_id", access.companyId).eq("agent_id", agent.id).eq("id", body.call_id).maybeSingle());
        if (!call?.remote_session_id) throw new Error("Registrazione non associata a questa chiamata.");
        const recording = await deps.fish.agentRequest(`/v1/agent/sessions/${encodeURIComponent(call.remote_session_id)}/recording`);
        return json({ status: recording.status, tracks: (recording.tracks || []).map((track: any) => ({ role: track.role, status: track.status, url: track.url, expires_at: track.expires_at })) });
      }
      if (action === "preview_session") return json(await createFishWebPreview(deps, agent, binding, access.userId, body.scenario || "appointment"));
      if (action === "preview_voice") {
        if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 500) throw new Error("Inserisci da 1 a 500 caratteri per la prova voce.");
        const bytes = new Uint8Array(await deps.fish.previewSpeech(body.text, binding.voice_id, fishVoiceOptions(agent).tts_model, {speed:fishVoiceOptions(agent).speed,language:agent.lingua || "it"}));
        const chunks: string[] = [];
        for (let i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
        return json({ mime_type: "audio/mpeg", audio_base64: btoa(chunks.join("")) });
      }
      if (action === "simulate") {
        if (binding.config_fingerprint !== await fishConfigurationFingerprint(agent, binding)) throw new Error("Salva e sincronizza la bozza prima della simulazione.");
        const payload = buildFishSimulation(agent, binding, body.scenario, body.scenario_note || "");
        const tests = { ...(binding.test_ids || {}) };
        if (tests[body.scenario]) {
          const { agent_ids: _ignored, ...update } = payload;
          await deps.fish.agentRequest(`/v1/agent/tests/${encodeURIComponent(tests[body.scenario])}`, "PATCH", update);
        } else {
          const test = await deps.fish.agentRequest("/v1/agent/tests", "POST", payload);
          if (!test.test_id) throw new Error("Creazione del test Fish non confermata.");
          tests[body.scenario] = test.test_id;
          checked(await deps.db.from("ai_fish_agents").update({ test_ids: tests }).eq("company_id", access.companyId).eq("agent_id", agent.id));
        }
        const batch = await deps.fish.agentRequest(`/v1/agent/agents/${encodeURIComponent(binding.fish_agent_id)}/tests/run`, "POST", { test_ids: [tests[body.scenario]], repeat_count: 1 });
        if (!batch.batch_id) throw new Error("Avvio della simulazione non confermato. Verifica la cronologia sul pannello Fish prima di ripetere.");
        checked(await deps.db.from("ai_fish_agents").update({ test_batches: [...(binding.test_batches || []), batch.batch_id].slice(-20) }).eq("company_id", access.companyId).eq("agent_id", agent.id));
        return json({ ...batch, simulation: true, uses_real_tools: false });
      }
      if (action === "simulation_status") {
        if (!binding.test_batches?.includes(body.batch_id)) return json({ error: "Simulazione non appartenente a questo agente" }, 403);
        const batch = await deps.fish.agentRequest(`/v1/agent/agents/${encodeURIComponent(binding.fish_agent_id)}/test-batches/${encodeURIComponent(body.batch_id)}`);
        return json(auditFishSimulationBatch(batch,binding));
      }
      if (action === "publish") {
        if (enabledFishTools(agent).some(n=>["disponibilita","fissa_appuntamento"].includes(n)) && !agent.tools_config?.fish?.calendar_id) throw new Error("Scegli il calendario dell’agente prima di pubblicare le prenotazioni reali.");
        if (binding.real_per_min_eur == null || binding.billed_per_min_eur == null) throw new Error("La piattaforma deve impostare le tariffe prima della pubblicazione.");
        if (binding.config_fingerprint !== await fishConfigurationFingerprint(agent, binding)) throw new Error("La configurazione è cambiata: sincronizza nuovamente la bozza Fish.");
        const names = enabledFishTools(agent);
        if (names.some(name => !binding.tool_ids?.[name])) throw new Error("Sincronizza gli strumenti mancanti prima di pubblicare.");
        const config = fishAgentConfig(agent, binding, fishBackendUrl(deps.backendUrl || ""), deps.secret, names.map(name => binding.tool_ids[name]));
        await deps.fish.agentRequest(`/v1/agent/agents/${encodeURIComponent(binding.fish_agent_id)}/publish`, "POST", { version_title: "Centralino Edilizia in Cloud", config });
        checked(await deps.db.from("ai_fish_agents").update({ published: true }).eq("company_id", access.companyId).eq("agent_id", agent.id));
        return json({ success: true });
      }
      if (action === "connect_number") {
        if (!access.isSuperAdmin) return json({ error: "Solo la piattaforma può assegnare una linea" }, 403);
        const number = checked(await deps.db.from("ai_phone_numbers_v2").select("*").eq("company_id", access.companyId).eq("id", body.phone_id).maybeSingle());
        if (!number || (number.agent_id && number.agent_id !== agent.id)) throw new Error("Numero assente o assegnato a un altro agente.");
        const remote = (await deps.fish.listPhoneNumbers()).find(n => n.phone_number_id === body.fish_phone_id);
        if (!remote || fishPhone(remote.phone_number) !== fishPhone(number.numero) || remote.status !== "active") throw new Error("Il numero Fish non corrisponde alla linea aziendale attiva.");
        if (remote.agent_id && remote.agent_id !== binding.fish_agent_id) throw new Error("La linea Fish è già assegnata: disassociala e verifica prima di spostarla.");
        await deps.fish.agentRequest(`/v1/agent/phone-numbers/${encodeURIComponent(remote.phone_number_id)}`, "PATCH", { agent_id: binding.fish_agent_id });
        checked(await deps.db.from("ai_fish_numbers").upsert({ company_id: access.companyId, agent_id: agent.id, phone_id: number.id, fish_phone_id: remote.phone_number_id, supports_outbound: remote.supports_outbound === true }, { onConflict: "phone_id" }));
        checked(await deps.db.from("ai_phone_numbers_v2").update({ agent_id: agent.id }).eq("company_id", access.companyId).eq("id", number.id));
        return json({ success: true, inbound: true, outbound: remote.supports_outbound === true });
      }
      if (action === "activate" || action === "pause") {
        if (action === "activate" && binding.config_fingerprint !== await fishConfigurationFingerprint(agent, binding)) throw new Error("Sincronizza e pubblica le modifiche prima di attivare Fish.");
        checked(await deps.db.rpc("fish_select_provider", { p_company: access.companyId, p_agent: agent.id, p_enabled: action === "activate" }));
        return json({ success: true });
      }
      if (action === "disconnect_number") {
        if (!access.isSuperAdmin || binding.enabled) return json({ error: "La piattaforma deve prima mettere in pausa Fish" }, 403);
        const number = checked(await deps.db.from("ai_fish_numbers").select("*").eq("company_id", access.companyId).eq("agent_id", agent.id).eq("phone_id", body.phone_id).maybeSingle());
        if (!number) throw new Error("Linea non associata all'azienda.");
        await deps.fish.agentRequest(`/v1/agent/phone-numbers/${encodeURIComponent(number.fish_phone_id)}`, "PATCH", { agent_id: null });
        checked(await deps.db.from("ai_fish_numbers").delete().eq("company_id", access.companyId).eq("phone_id", number.phone_id));
        return json({ success: true });
      }
      if (action === "delete") {
        if (binding.enabled) throw new Error("Disattiva Fish prima di eliminare il collegamento.");
        const linked = checked(await deps.db.from("ai_fish_numbers").select("phone_id").eq("company_id", access.companyId).eq("agent_id", agent.id));
        if (linked?.length) throw new Error("Scollega le linee prima di eliminare l'agente.");
        await deps.fish.agentRequest(`/v1/agent/agents/${encodeURIComponent(binding.fish_agent_id)}`, "DELETE");
        checked(await deps.db.from("ai_fish_agents").delete().eq("company_id", access.companyId).eq("agent_id", agent.id));
        return json({ success: true });
      }
      if (action === "reconcile") {
        const calls = checked(await deps.db.from("ai_fish_calls").select("remote_session_id").eq("company_id", access.companyId).eq("agent_id", agent.id).or("terminal.eq.false,billed.eq.false").not("remote_session_id", "is", null).limit(20));
        let count = 0;
        for (const c of calls || []) {
          const session = await deps.fish.agentRequest(`/v1/agent/sessions/${encodeURIComponent(c.remote_session_id)}`);
          if (session.agent_id !== binding.fish_agent_id) throw new Error("Sessione Fish non appartenente all'agente.");
          const terminal = ["completed", "failed"].includes(session.status) || ["no_answer", "busy", "failed"].includes(session.dial_status);
          if (!terminal) continue;
          checked(await deps.db.rpc("fish_record_event", { p_agent: binding.fish_agent_id, p_session: c.remote_session_id,
            p_event: `reconcile:${c.remote_session_id}:${session.duration_seconds ?? "pending"}`, p_snapshot: normalizeFishSession(session, "call.analyzed", session) }));
          count++;
        }
        return json({ success: true, reconciled: count });
      }
      return json({ error: "Azione Fish non disponibile" }, 400);
    } catch (error) {
      if (error instanceof Response) return error;
      return json({ error: error instanceof Error ? error.message : "Operazione Fish non riuscita" }, 400);
    }
  };
}

export function createFishEventHandler(deps: FishRuntimeDeps, inbound = false) {
  return async (req: Request): Promise<Response> => {
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > 2_000_000) return json({ error: "Payload troppo grande" }, 413);
    if (!(await verifyFishWebhook(bytes, req.headers.get("X-Fish-Webhook-Signature"), deps.secret))) return json({ error: "Firma Fish non valida" }, 401);
    try {
      const body = JSON.parse(new TextDecoder().decode(bytes));
      const remoteAgent = inbound ? body.call?.agent_id : body.session?.agent_id;
      if (typeof remoteAgent !== "string") return json({ error: "Agente assente" }, 400);
      const binding = checked(await deps.db.from("ai_fish_agents").select("*").eq("fish_agent_id", remoteAgent).maybeSingle());
      if (!binding) return json({ error: "Agente non associato" }, 404);
      if (inbound) {
        if (body.event !== "call.inbound") return json({ error: "Evento non valido" }, 400);
        const agent = await localAgent(deps.db, binding.company_id, binding.agent_id);
        const number = checked(await deps.db.from("ai_fish_numbers").select("phone_id").eq("company_id", binding.company_id).eq("agent_id", binding.agent_id).eq("fish_phone_id", body.call.phone_number_id).maybeSingle());
        const local = number && checked(await deps.db.from("ai_phone_numbers_v2").select("attivo,agent_id,numero").eq("company_id", binding.company_id).eq("id", number.phone_id).maybeSingle());
        if (!binding.enabled || !binding.published || binding.billed_per_min_eur == null || agent.stato !== "attivo" || agent.tools_config?.voice_provider !== "fish_audio" || !local?.attivo || local.agent_id !== agent.id || fishPhone(local.numero) !== fishPhone(body.call.dialed_number) || !(await deps.allowInbound?.(binding.company_id, binding, agent))) {
          // The mandatory prompt variable has no default: Fish on_missing=reject denies the session.
          return json({ dynamic_variables: {} });
        }
        return json({ dynamic_variables: { eic_session_authorized: "true" } });
      }
      if (!["call.ended", "call.analyzed", "phone_call.dial_finished"].includes(body.event)) return json({ ignored: true });
      if (!/^evt_[a-f0-9]{32}$/.test(body.event_id || "") || !body.session?.id) return json({ error: "Evento Fish non valido" }, 400);
      if (body.session.source !== "phone") return json({ ignored: true });
      const snapshot = normalizeFishSession(body.session, body.event, body);
      const agent = await localAgent(deps.db, binding.company_id, binding.agent_id);
      if (agent.trascrivi_chiamate === false) delete snapshot.transcript;
      const data = checked(await deps.db.rpc("fish_record_event", { p_agent: remoteAgent, p_session: body.session.id,
        p_event: body.event_id, p_snapshot: snapshot }));
      if(body.event==="call.analyzed" && body.session.direction==="outbound" && enabledFishTools(agent).includes("non_richiamare") && (body.items || []).some((item:any)=>item.type==="message" && item.role==="user" && fishHasOptoutRequest(String(item.content || ""))))checked(await deps.db.rpc("fish_record_call_optout",{p_company:binding.company_id,p_agent:agent.id,p_session:body.session.id,p_reason:"Opposizione esplicita nella conversazione verificata"}));
      return json({ ok: true, ...data });
    } catch { return json({ error: "Evento Fish non registrato: ritentare la consegna" }, 503); }
  };
}

export function createFishToolHandler(deps: FishRuntimeDeps) {
  return async (req: Request): Promise<Response> => {
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
    try {
      const raw = await req.text(); if (raw.length > 32_000) return json({ error: "Payload troppo grande" }, 413);
      const body = JSON.parse(raw);
      if (typeof body.agent_id !== "string" || typeof body.session_id !== "string" || body.session_id.length > 256) return json({ error: "Sessione non valida" }, 400);
      const expected = await fishDerivedToken(deps.secret, body.agent_id);
      if (!constantToken(req.headers.get("X-Eic-Fish-Token") || "", expected)) return json({ error: "Unauthorized" }, 401);
      const binding = checked(await deps.db.from("ai_fish_agents").select("*").eq("fish_agent_id", body.agent_id).maybeSingle());
      if (!binding?.enabled) return json({ error: "Collegamento Fish non attivo" }, 403);
      const agent = await localAgent(deps.db, binding.company_id, binding.agent_id);
      if (agent.stato !== "attivo" || agent.tools_config?.voice_provider !== "fish_audio" || !enabledFishTools(agent).includes(body.tool)) return json({ error: "Strumento non abilitato" }, 403);
      const session = await deps.fish.agentRequest(`/v1/agent/sessions/${encodeURIComponent(body.session_id)}`);
      if (session.agent_id !== binding.fish_agent_id || session.source !== "phone" || session.status !== "active") return json({ error: "Sessione telefonica non autorizzata" }, 403);
      // Never trust model-supplied company_id, contact_id or caller_phone.
      const partyNumber=session.direction==="outbound"?session.dialed_number:session.caller_number;
      const phone = partyNumber ? fishPhone(partyNumber) : "";
      if (!phone && ["stato_consegna", "stato_preventivo", "info_cliente"].includes(body.tool)) return json({ risposta: "Non posso identificare il chiamante. Posso raccogliere una richiesta di richiamo senza consultare dati personali." });
      const def = FISH_TOOLS[body.tool]; const supplied = body.parameters || {};
      const params: Record<string, string> = {};
      for (const key of def.fields) if (typeof supplied[key] === "string" && supplied[key].trim()) params[key] = supplied[key].trim().slice(0, 2000);
      if (def.required.some(key => !params[key])) return json({ risposta: "Prima di procedere devo raccogliere tutti i dati richiesti.", missing: def.required.filter(k => !params[k]) });
      if (body.tool === "richiesta_richiamo") {
        try { params.recapito = fishPhone(params.recapito); }
        catch { return json({ risposta: "Confermi il recapito completo per il richiamo, con prefisso internazionale?", missing: ["recapito"] }); }
      }
      if(body.tool==="fissa_appuntamento" && agent.tools_config?.fish?.flow_id==="lead_qualification"){const business=fishLeadBusiness(agent);if(business.areas.length && !business.areas.some(area=>fishMunicipalityKey(area)===fishMunicipalityKey(params.comune)))return json({creato:false,risposta:"Il comune non è ancora verificato nella zona operativa configurata. Chiedi il comune o proponi una verifica dell’ufficio, senza prenotare."});if(business.appointment_mode==="onsite" && !params.indirizzo)return json({creato:false,risposta:"Per il sopralluogo a domicilio manca l’indirizzo dichiarato e confermato. Raccoglilo oppure registra soltanto una richiesta da verificare."});}
      if(["fissa_appuntamento","richiesta_richiamo","aggiorna_opportunita"].includes(body.tool)){const consent=fishActionConsent(Array.isArray(session.items)?session.items:[],body.tool,params);if(!consent.ok)return json({creato:false,aggiornata:false,...consent});}
      if(body.tool==="non_richiamare"){const last=(session.items || []).filter((m:any)=>m.type==="message" && m.role==="user").at(-1);if(!fishHasOptoutRequest(String(last?.content || "")))return json({registrato:false,risposta:"Non risulta una richiesta esplicita di non ricevere più telefonate. Non registrare un’opposizione sulla base di un semplice non interesse."});}
      if(body.tool==="richiesta_richiamo" && !fishCallbackNumberAllowed(session.items || [],phone,params.recapito))return json({creato:false,risposta:"Il recapito non è quello della chiamata e non è stato dichiarato dal cliente. Chiedi di dettarlo per intero, senza usare numeri da esempi."});
      let operationKey = "";
      const calendarId=agent.tools_config?.fish?.calendar_id;
      if(["disponibilita","fissa_appuntamento"].includes(body.tool) && !calendarId) return json({creato:false,risposta:"Il calendario dell’azienda non è ancora configurato per questa linea. Posso raccogliere una richiesta di richiamo."});
      if (def.writes) {
        operationKey = await fishDerivedToken(deps.secret, JSON.stringify([body.session_id, body.tool, params]), "operation");
        const claim = await deps.db.from("ai_fish_tool_results").insert({ operation_key: operationKey, company_id: binding.company_id, session_id: body.session_id });
        if (claim.error) {
          if (claim.error.code !== "23505") throw new Error("Presa in carico non riuscita");
          const saved = checked(await deps.db.from("ai_fish_tool_results").select("result").eq("company_id", binding.company_id).eq("operation_key", operationKey).single());
          return json(saved?.result || { risposta: "Questa richiesta è già presa in carico. Non posso ripeterla finché l'esito non è verificato.", outcome_unknown: true });
        }
      }
      let result:any;
      if(body.tool==="non_richiamare")result=checked(await deps.db.rpc("fish_record_call_optout",{p_company:binding.company_id,p_agent:agent.id,p_session:body.session_id,p_reason:params.motivo || null}));
      else if(["memoria_pratica","aggiorna_ticket"].includes(body.tool))result=await fishCaseMemoryTool(deps.db,binding.company_id,agent.id,body.session_id,phone,body.tool,params);
      else if(body.tool==="aggiorna_opportunita")result=await fishOpportunityOutcome(deps.db,binding.company_id,agent.id,body.session_id,params);
      else if(body.tool==="passa_a_operatore" && agent.tools_config?.fish?.routing==="first_available")result=await fishReserveOperator(deps.db,binding.company_id,agent.id,body.session_id,phone,params);
      else if(calendarId && ["disponibilita","fissa_appuntamento"].includes(body.tool))result=await deps.executeTool!(binding.company_id,phone,body.session_id,body.tool,params,{calendarId});
      else result=await deps.executeTool!(binding.company_id,phone,body.session_id,body.tool,params);
      if(body.tool==="crea_ticket" && result.creato && result.ticket_id){
        const linked=await deps.db.rpc("fish_link_ticket_conversation",{p_company:binding.company_id,p_agent:agent.id,p_session:body.session_id,p_ticket:result.ticket_id});
        if(linked.error)result={...result,conversation_linked:false,risposta:result.risposta+" Il ticket è salvato; la conversazione deve essere recuperata dall’ufficio."};
        else result={...result,conversation_linked:true};
      }
      if (body.tool === "passa_a_operatore" && result.trovato) {
        const destination = (binding.transfer_destinations || []).find((d: any) => d.phone_number === result.numero_operatore);
        result = destination ? { ...result, destinazione: destination.label } : { trovato: false, risposta: "L'operatore disponibile non ha una destinazione telefonica abilitata. Proponi un richiamo, senza tentare il trasferimento." };
      }
      if (operationKey) checked(await deps.db.from("ai_fish_tool_results").update({ result }).eq("operation_key", operationKey).eq("company_id", binding.company_id));
      return json(result);
    } catch { return json({ error: "Strumento non completato. Verificare l'esito prima di ripetere una modifica.", outcome_unknown: true }, 503); }
  };
}

export async function initiateFishCall(db: any, fish: FishAudioClient, input: any) {
  if (input.campaignRecipientId) throw new Error("Le campagne automatiche Fish richiedono l'abilitazione della coda dedicata; usa una chiamata singola.");
  const numbers = checked(await db.from("ai_fish_numbers").select("phone_id").eq("company_id", input.companyId).eq("agent_id", input.agentId).eq("supports_outbound", true).order("created_at").limit(1));
  if (!numbers?.[0]) throw new Error("Collega un numero Fish abilitato alle chiamate in uscita.");
  const call = checked(await db.rpc("fish_prepare_outbound", { p_company: input.companyId, p_agent: input.agentId, p_phone: numbers[0].phone_id,
    p_to: input.targetPhone, p_key: input.requestKey || crypto.randomUUID(), p_contact: input.contactId || null }));
  const recordDispatch = async (sessionId: string) => checked(await db.rpc("fish_record_event", {
    p_agent: call.fish_agent_id, p_session: sessionId, p_event: `dispatch:${call.id}`,
    p_snapshot: { attempt_id: call.id, terminal: false, state: "in_corso", duration: null, direction: "outbound", caller: call.from_number || null, called: input.targetPhone },
  }));
  if (call.remote_session_id) {
    await recordDispatch(call.remote_session_id);
    return { success: true, conversation_id: call.remote_session_id, provider: "fish_audio", existing_attempt: true };
  }
  let leadName="";if(call.contact_id){const lead=checked(await db.from("marketing_contacts").select("first_name,last_name,phone").eq("company_id",input.companyId).eq("id",call.contact_id).maybeSingle());if(lead && canonicalCustomerPhone(lead.phone,"IT")===input.targetPhone)leadName=[lead.first_name,lead.last_name].filter(Boolean).join(" ").slice(0,200);}
  const request = buildFishOutboundRequest({ agentId: call.fish_agent_id, phoneNumberId: call.fish_phone_id, toNumber: input.targetPhone,
    companyId: input.companyId, idempotencyKey: `eic:${call.id}`, variables: { ...(input.dynamicVars || {}), eic_session_authorized: "true",eic_lead_name:leadName,eic_recipient_phone:input.targetPhone } });
  try {
    const data = await fish.agentRequest("/v1/agent/phone-calls", "POST", { ...request.body, metadata: { eic_attempt_id: call.id } }, request.headers);
    if (!data.session_id) throw new Error("Avvio Fish non confermato");
    checked(await db.from("ai_fish_calls").update({ remote_session_id: data.session_id, state: "submitted" }).eq("company_id", input.companyId).eq("id", call.id).eq("terminal", false));
    await recordDispatch(data.session_id);
    return { success: true, conversation_id: data.session_id, provider: "fish_audio", message: "Richiesta di chiamata Fish inviata" };
  } catch {
    // A network failure may have happened after dispatch. The same attempt must keep its key.
    return { success: false, outcome_unknown: true, request_key: call.request_key, error: "Esito Fish non verificabile. Riprova la stessa richiesta o riconcilia lo storico; non creare un nuovo tentativo." };
  }
}
