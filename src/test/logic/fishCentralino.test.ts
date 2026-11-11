import { createHmac, webcrypto } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FishAudioClient } from "../../../supabase/functions/_shared/fishAudio";
import { createFishEventHandler, createFishManagementHandler, createFishToolHandler, initiateFishCall } from "../../../supabase/functions/_shared/fishCentralino";
import { enabledFishTools, fishAgentConfig, fishConfigurationFingerprint, fishDerivedToken, fishLlmModel, fishVoiceOptions, normalizeFishSession } from "../../../supabase/functions/_shared/fishAgentConfig";
import { createFishWebPreview } from "../../../supabase/functions/_shared/fishWebPreview";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());
const secret = "a-long-local-webhook-secret-for-test-only";
const binding = { agent_id: "local-A", company_id: "company-A", fish_agent_id: "fish-A", enabled: true, published: true, voice_id: "voice", real_per_min_eur: 0.06, billed_per_min_eur: 0.12, transfer_destinations: [{ label: "Operatore", phone_number: "+390000000004" }] };
const agent = { id: "local-A", company_id: "company-A", tipo: "vocale", stato: "attivo", system_prompt: "Rispondi alle richieste dei clienti.", tools_config: { voice_provider: "fish_audio", edilizia_tools: { get_lead_info: { enabled: true }, crea_ticket: { enabled: true }, passa_a_operatore: { enabled: true }, assign_to_user: { enabled: true } } } };
function database(resolve: (table: string, steps: any[]) => any) {
  const queries: { table: string; steps: any[] }[] = [];
  return { queries, rpc: vi.fn(async () => ({ data: { id: "call" }, error: null })), from(table: string) {
    const steps: any[] = []; const query: any = new Proxy({}, { get(_, key) {
      if (key === "then") return (ok: any, bad: any) => { queries.push({ table, steps }); return Promise.resolve(resolve(table, steps)).then(ok, bad); };
      return (...args: any[]) => { steps.push([key, ...args]); return query; };
    } }); return query;
  } };
}
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function deps(db: any, send = vi.fn(async () => reply({}))) {
  return { db, secret, fish: new FishAudioClient("test-key", send), backendUrl: "https://backend.example.com/functions/v1", allowInbound: async () => true,
    authorize: async () => ({ companyId: "company-A", userId: "u", isAdmin: true, isSuperAdmin: false }), executeTool: vi.fn(async () => ({ risposta: "Fatto" })), send };
}
async function signed(body: any) {
  const raw = JSON.stringify(body); const t = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return new Request("https://backend.example.com", { method: "POST", headers: { "X-Fish-Webhook-Signature": `t=${t},v1=${signature}` }, body: raw });
}

describe("Fish ingress and post-call", () => {
  it("rejects a forged event before touching the database", async () => {
    const db = database(() => ({ data: binding })); const d = deps(db);
    const result = await createFishEventHandler(d)(new Request("https://local", { method: "POST", body: '{}' }));
    expect(result.status).toBe(401); expect(db.queries).toHaveLength(0); expect(db.rpc).not.toHaveBeenCalled();
  });
  it("uses signed agent identity and ignores metadata that claims another company", async () => {
    const db = database(table => ({ data: table === "ai_fish_agents" ? binding : agent }));
    const body = { event: "call.ended", event_id: "evt_" + "a".repeat(32), session: { id: "session-A", agent_id: "fish-A", source: "phone", status: "completed", duration_seconds: 30, metadata: { company_id: "company-B" } } };
    expect((await createFishEventHandler(deps(db))(await signed(body))).status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith("fish_record_event", expect.objectContaining({ p_agent: "fish-A", p_session: "session-A" }));
    expect(JSON.stringify(db.rpc.mock.calls)).not.toContain("company-B");
  });
  it("returns a retryable error on storage failure rather than acknowledging a lost event", async () => {
    const db = database(table => ({ data: table === "ai_fish_agents" ? binding : agent }));
    db.rpc.mockResolvedValue({ data: null, error: { message: "db unavailable" } });
    const req = await signed({ event: "call.ended", event_id: "evt_" + "b".repeat(32), session: { id: "s", agent_id: "fish-A", source: "phone", status: "completed", duration_seconds: 1 } });
    expect((await createFishEventHandler(deps(db))(req)).status).toBe(503);
  });
  it("withholds the required session variable when a number or tenant is not ready", async () => {
    const db = database(table => ({ data: table === "ai_fish_agents" ? { ...binding, enabled: false } : table === "ai_agents_v2" ? agent : null }));
    const req = await signed({ event: "call.inbound", call: { agent_id: "fish-A", phone_number_id: "foreign", dialed_number: "+390000000001" } });
    const data = await (await createFishEventHandler(deps(db), true)(req)).json();
    expect(data).toEqual({ dynamic_variables: {} });
  });
  it("normalizes no-answer without billing ringing time and preserves missing duration", () => {
    expect(normalizeFishSession({ dial_status: "no_answer" }, "phone_call.dial_finished")).toMatchObject({ state: "no_risposta", duration: 0, terminal: true });
    expect(normalizeFishSession({ dial_status: "no_answer", duration_seconds: 45 }, "phone_call.dial_finished")).toMatchObject({ duration: 0 });
    expect(normalizeFishSession({ status: "completed" }, "call.ended").duration).toBe(null);
  });
});

describe("Fish CRM tools", () => {
  it("identifies an outbound recipient from the dialed number rather than the company caller ID",async()=>{
    const db=database(table=>({data:table==="ai_fish_agents"?binding:agent}));
    const d=deps(db,vi.fn(async()=>reply({agent_id:"fish-A",source:"phone",status:"active",direction:"outbound",caller_number:"+390000000001",dialed_number:"+390000000002"})));
    const token=await fishDerivedToken(secret,"fish-A");
    const result=await createFishToolHandler(d)(new Request("https://local",{method:"POST",headers:{"X-Eic-Fish-Token":token},body:JSON.stringify({agent_id:"fish-A",session_id:"outbound-session",tool:"info_cliente",parameters:{}})}));
    expect(result.status).toBe(200);expect(d.executeTool).toHaveBeenCalledWith("company-A","+390000000002","outbound-session","info_cliente",{});
  });
  it("keeps a callback destination separate from the authenticated caller identity", async () => {
    const db = database(table => ({ data: table === "ai_fish_agents" ? binding : agent }));
    const d = deps(db, vi.fn(async () => reply({ agent_id: "fish-A", source: "phone", status: "active",items:[{type:"message",role:"user",content:"Mi richiami al +390000000003"},{type:"message",role:"assistant",content:"Conferma il richiamo per assistenza a questo numero?"},{type:"message",role:"user",content:"Sì, confermo."}], caller_number: "+390000000002" })));
    const token = await fishDerivedToken(secret, "fish-A");
    const make = (parameters: any) => new Request("https://local", { method: "POST", headers: { "X-Eic-Fish-Token": token }, body: JSON.stringify({ agent_id: "fish-A", session_id: "s", tool: "richiesta_richiamo", parameters }) });
    const handler = createFishToolHandler(d);
    expect(await (await handler(make({ motivo: "Assistenza",conferma_cliente:"Sì, confermo." }))).json()).toMatchObject({ missing: ["recapito"] });
    expect(d.executeTool).not.toHaveBeenCalled();
    await handler(make({ motivo: "Assistenza", nome: "Cliente Demo", recapito: "+39 0000000003",conferma_cliente:"Sì, confermo." }));
    expect(d.executeTool).toHaveBeenCalledWith("company-A", "+390000000002", "s", "richiesta_richiamo", { motivo: "Assistenza", nome: "Cliente Demo", recapito: "+390000000003" });
  });
  it("uses caller and tenant from the verified server-side session, never tool arguments", async () => {
    const db = database(table => ({ data: table === "ai_fish_agents" ? binding : agent }));
    const d = deps(db, vi.fn(async () => reply({ agent_id: "fish-A", source: "phone", status: "active", caller_number: "+390000000002" })));
    const token = await fishDerivedToken(secret, "fish-A");
    const response = await createFishToolHandler(d)(new Request("https://local", { method: "POST", headers: { "X-Eic-Fish-Token": token }, body: JSON.stringify({ agent_id: "fish-A", session_id: "s", tool: "info_cliente", company_id: "company-B", caller_phone: "+390000000099", parameters: { contact_id: "foreign" } }) }));
    expect(response.status).toBe(200);
    expect(d.executeTool).toHaveBeenCalledWith("company-A", "+390000000002", "s", "info_cliente", {});
  });
  it("refuses a session from another agent or a public web session", async () => {
    for (const session of [{ agent_id: "fish-B", source: "phone", status: "active" }, { agent_id: "fish-A", source: "web", status: "active" }]) {
      const db = database(table => ({ data: table === "ai_fish_agents" ? binding : agent })); const d = deps(db, vi.fn(async () => reply(session)));
      const req = new Request("https://local", { method: "POST", headers: { "X-Eic-Fish-Token": await fishDerivedToken(secret, "fish-A") }, body: JSON.stringify({ agent_id: "fish-A", session_id: "s", tool: "info_cliente" }) });
      expect((await createFishToolHandler(d)(req)).status).toBe(403); expect(d.executeTool).not.toHaveBeenCalled();
    }
  });
  it("does not execute a write twice when the provider retries an identical operation", async () => {
    let claimed = false; let saved: any = null;
    const db = database((table, steps) => {
      if (table !== "ai_fish_tool_results") return { data: table === "ai_fish_agents" ? binding : agent };
      if (steps.some(s => s[0] === "insert")) { if (claimed) return { error: { code: "23505" } }; claimed = true; return { error: null }; }
      const write = steps.find(s => s[0] === "update"); if (write) { saved = write[1].result; return { error: null }; }
      return { data: { result: saved }, error: null };
    });
    const d = deps(db, vi.fn(async () => reply({ agent_id: "fish-A", source: "phone", status: "active", caller_number: "+390000000002" })));
    const handler = createFishToolHandler(d); const token = await fishDerivedToken(secret, "fish-A");
    const request = () => new Request("https://local", { method: "POST", headers: { "X-Eic-Fish-Token": token }, body: JSON.stringify({ agent_id: "fish-A", session_id: "s", tool: "crea_ticket", parameters: { descrizione: "Richiesta confermata", nome:"Cliente Demo", indirizzo:"Via Demo 1" } }) });
    expect((await handler(request())).status).toBe(200); expect((await handler(request())).status).toBe(200);
    expect(d.executeTool).toHaveBeenCalledTimes(1);
  });
  it("does not authorize a native transfer to an unregistered operator number", async () => {
    const db = database(table => ({ data: table === "ai_fish_agents" ? binding : table === "ai_agents_v2" ? agent : null, error: null }));
    const d = deps(db, vi.fn(async () => reply({ agent_id: "fish-A", source: "phone", status: "active", caller_number: "+390000000002" })));
    d.executeTool.mockResolvedValue({ trovato: true, numero_operatore: "+390000000099" } as any);
    const req = new Request("https://local", { method: "POST", headers: { "X-Eic-Fish-Token": await fishDerivedToken(secret, "fish-A") }, body: JSON.stringify({ agent_id: "fish-A", session_id: "s", tool: "passa_a_operatore", parameters: { riassunto: "Parlare con una persona" } }) });
    expect(await (await createFishToolHandler(d)(req)).json()).toMatchObject({ trovato: false });
  });
});

describe("Fish management and outbound", () => {
  it("uses the authenticated company for call association, before any Fish provisioning", async () => {
    const db = database(() => ({ data: null }));const d=deps(db);
    const result=await createFishManagementHandler(d)(new Request("https://local",{method:"POST",body:JSON.stringify({action:"associate_call",company_id:"company-B",kind:"human",call_id:"call-a",customer_id:"customer-a"})}));
    expect(result.status).toBe(200);expect(db.rpc).toHaveBeenCalledWith("centralino_associate_call",{p_company:"company-A",p_kind:"human",p_call:"call-a",p_contact:null,p_customer:"customer-a"});expect(d.send).not.toHaveBeenCalled();
  });
  it("does not let a non-administrator relink a call", async () => {
    const db=database(()=>({data:binding}));const d=deps(db);d.authorize=async()=>({companyId:"company-A",userId:"u",isAdmin:false,isSuperAdmin:false});
    const result=await createFishManagementHandler(d)(new Request("https://local",{method:"POST",body:JSON.stringify({action:"associate_call",kind:"ai",call_id:"call-a"})}));
    expect(result.status).toBe(403);expect(db.rpc).not.toHaveBeenCalled();
  });
  it("refuses audio from a call outside the selected company and agent", async () => {
    const db=database(table=>({data:table==="ai_fish_agents"?binding:table==="ai_agents_v2"?agent:null}));const d=deps(db);
    const result=await createFishManagementHandler(d)(new Request("https://local",{method:"POST",body:JSON.stringify({action:"call_recording",agent_id:agent.id,call_id:"foreign-call"})}));
    expect(result.status).toBe(400);expect(d.send).not.toHaveBeenCalled();
  });
  it("uses supported expressive settings and rejects invalid audio options", () => {
    expect(fishVoiceOptions({})).toMatchObject({ expressive: true, speed: 1, effect: "none" });
    expect(fishAgentConfig({ ...agent, tools_config: { ...agent.tools_config, fish: { voice: { expressive: false, speed: 1.15, effect: "phone", background_sound: { preset: "office", volume: 0.08 } } } } }, binding, "https://example.com", secret, []).voice).toMatchObject({ expressive: false, speed: 1.15, effect: "phone", background_sound: { preset: "office", volume: 0.08 } });
    expect(() => fishVoiceOptions({ tools_config: { fish: { voice: { speed: 5 } } } })).toThrow("non valide");
  });
  it("provisions web voice with client fixtures, without CRM hooks, recording or transfer", async () => {
    const db = database(() => ({ data: { agent_id: agent.id }, error: null }));
    const d = deps(db);
    const calls: any[] = [];
    vi.spyOn(d.fish, "agentRequest").mockImplementation(async (path, method, payload) => {
      calls.push({ path, method, payload });
      return path === "/v1/agent/agents" ? { agent_id: "preview-A" } : path === "/v1/agent/tools" ? { tool_id: `preview-tool-${calls.length}` } : path === "/v1/agent/sessions" ? { session_id: "session", token: "ephemeral", transport: "livekit" } : {};
    });
    const b = { ...binding, tool_ids: Object.fromEntries(enabledFishTools(agent).map(name => [name, `tool-${name}`])), config_fingerprint: await fishConfigurationFingerprint(agent, binding) };
    const result = await createFishWebPreview(d, agent, b, "user", "no_operator");
    const published = calls.find(call => call.path.endsWith("/publish")).payload.config;
    expect(published.webhooks).toEqual({ conversation_init: null, post_call: [] });
    expect(published.conversation).toMatchObject({ transfer_destinations: [], record_audio: false });
    expect(calls.filter(call => call.path === "/v1/agent/tools").every(call => call.payload.tool_type === "client" && !call.payload.url && !call.payload.headers)).toBe(true);
    expect(calls.at(-1).payload).toMatchObject({ agent_id: "preview-A", end_user_id: "user", record_audio: false });
    expect(result.mock_tools.passa_a_operatore).toMatchObject({ trovato: false });
    expect(d.executeTool).not.toHaveBeenCalled();
    await expect(createFishWebPreview(d, agent, { ...b, config_fingerprint: "old" }, "user", "no_operator")).rejects.toThrow("sincronizza");
  });
  it("does not expose other companies' private voices to a company administrator", async () => {
    const db = database(table => ({ data: table === "ai_fish_agents" ? binding : agent }));
    const d = deps(db);
    const list = vi.spyOn(d.fish, "listOwnVoices").mockResolvedValue([{ id: "foreign", name: "Private customer voice", languages: [] }]);
    const request = (action: string, input = {}) => new Request("https://local", { method: "POST", body: JSON.stringify({ action, agent_id: "local-A", ...input }) });
    const catalog=await (await createFishManagementHandler(d)(request("available_voices"))).json();
    expect(catalog.voices).toEqual(expect.arrayContaining([expect.objectContaining({id:binding.voice_id}),expect.objectContaining({id:"081b06713d084d4da1724846b52832ac"})]));
    expect(catalog.voices.some((voice:any)=>voice.id==="foreign")).toBe(false);
    expect(list).not.toHaveBeenCalled();
    expect((await createFishManagementHandler(d)(request("configure", { voice_id: "foreign" }))).status).toBe(403);
  });
  it("updates existing Fish tools without re-sending their immutable type", async () => {
    const b = { ...binding, tool_ids: Object.fromEntries(enabledFishTools(agent).map(n => [n, `tool-${n}`])) };
    const db = database(table => ({ data: table === "ai_fish_agents" ? b : agent, error: null }));
    const d = deps(db);
    const response = await createFishManagementHandler(d)(new Request("https://local", { method: "POST", body: JSON.stringify({ action: "configure", agent_id: "local-A", voice_id: "voice" }) }));
    expect(response.status).toBe(200);
    const writes = d.send.mock.calls.filter((c: any) => String(c[0]).includes("/tools/"));
    expect(writes).toHaveLength(enabledFishTools(agent).length);
    for (const call of writes as any[]) {
      expect(call[1].method).toBe("PATCH");
      expect(JSON.parse(call[1].body)).not.toHaveProperty("tool_type");
    }
  });
  it("previews the bound voice without allowing the browser to select a foreign voice", async () => {
    const db = database(table => ({ data: table === "ai_fish_agents" ? binding : agent }));
    const d = deps(db);
    const speech = vi.spyOn(d.fish, "previewSpeech").mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const response = await createFishManagementHandler(d)(new Request("https://local", { method: "POST", body: JSON.stringify({ action: "preview_voice", agent_id: "local-A", text: "Buongiorno", voice_id: "foreign" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mime_type: "audio/mpeg", audio_base64: "AQID" });
    expect(speech).toHaveBeenCalledWith("Buongiorno", binding.voice_id, "drama-3", {speed:1,language:"it"});
  });
  it("honors supported model choices and invalidates the published fingerprint on a change", async () => {
    const changed = { ...agent, llm_model: "anthropic/claude-haiku-4.5" };
    expect(fishLlmModel(changed)).toBe("anthropic/claude-haiku-4.5");
    expect(await fishConfigurationFingerprint(changed, binding)).not.toBe(await fishConfigurationFingerprint(agent, binding));
    expect(() => fishLlmModel({ llm_model: "unavailable-model" })).toThrow("non è supportato");
  });
  it("runs only fully mocked tests even if the browser requests real tools", async () => {
    const b = { ...binding, tool_ids: Object.fromEntries(enabledFishTools(agent).map(n => [n, `tool-${n}`])), test_ids: {}, test_batches: [], config_fingerprint: await fishConfigurationFingerprint(agent, binding) };
    const db = database(table => ({ data: table === "ai_fish_agents" ? b : agent, error: null }));
    const send = vi.fn(async (url: any) => reply(String(url).endsWith("/tests/run") ? { batch_id: "batch-own", completed: false } : { test_id: "test-own" }));
    const response = await createFishManagementHandler(deps(db, send))(new Request("https://local", { method: "POST", body: JSON.stringify({ action: "simulate", agent_id: "local-A", scenario: "outbound", tool_mocks: { strategy: "none" }, real_tools: ["crea_ticket"] }) }));
    expect(response.status).toBe(200);
    const test = JSON.parse((send.mock.calls[0] as any)[1].body);
    expect(test.simulation.tool_mocks).toMatchObject({ strategy: "all", fallback: "error", real_tools: [] });
    expect(test.simulation.tool_mocks.tools).toHaveLength(enabledFishTools(agent).length);
    expect(await response.json()).toMatchObject({ uses_real_tools: false, simulation: true });
  });
  it("never fetches a simulation result belonging to a different agent", async () => {
    const db = database(table => ({ data: table === "ai_fish_agents" ? { ...binding, test_batches: ["batch-own"] } : agent }));
    const d = deps(db);
    const response = await createFishManagementHandler(d)(new Request("https://local", { method: "POST", body: JSON.stringify({ action: "simulation_status", agent_id: "local-A", batch_id: "batch-foreign" }) }));
    expect(response.status).toBe(403); expect(d.send).not.toHaveBeenCalled();
  });
  it("does not let an ordinary company admin grant their own free tariff or assign global numbers", async () => {
    const db = database(table => ({ data: table === "ai_fish_agents" ? binding : agent })); const d = deps(db);
    for (const body of [{ action: "configure", voice_id: "voice", billed_per_min_eur: 0 }, { action: "connect_number", phone_id: "p" }]) {
      const response = await createFishManagementHandler(d)(new Request("https://local", { method: "POST", body: JSON.stringify({ ...body, agent_id: "local-A", company_id: "company-B" }) }));
      expect(response.status).toBe(403);
    }
    expect(d.send).not.toHaveBeenCalled();
  });
  it("uses the same provider idempotency key after an ambiguous network outcome", async () => {
    const db = database(() => ({ data: [{ phone_id: "number" }], error: null }));
    db.rpc.mockResolvedValue({ data: { id: "call-stable", fish_agent_id: "fish-A", fish_phone_id: "number", request_key: "request-stable" }, error: null } as any);
    const send = vi.fn(async () => { throw new Error("network lost after dispatch"); });
    const fish = new FishAudioClient("key", send);
    const input = { companyId: "company-A", agentId: "local-A", targetPhone: "+390000000002", requestKey: "request-stable" };
    expect(await initiateFishCall(db, fish, input)).toMatchObject({ success: false, outcome_unknown: true });
    await initiateFishCall(db, fish, input);
    expect(send.mock.calls.map((c: any) => c[1].headers["Idempotency-Key"])).toEqual(["eic:call-stable", "eic:call-stable"]);
  });
  it("maps existing editor tool switches and requires backend authorization on every inbound session", () => {
    expect(enabledFishTools(agent)).toContain("info_cliente");
    const config = fishAgentConfig(agent, binding, "https://backend.example.com/functions/v1", secret, []);
    expect(config.prompt.system_prompt).toContain("{{eic_session_authorized}}");
    expect(config.variables).toEqual({ on_missing: "reject", defaults: {eic_demo_today:""} });
    expect(config.voice.tts_model).toBe("drama-3");
  });
});

describe('Serramenti lead boundaries',()=>{
 it('records opt-out only for the authenticated phone session, ignoring model identity fields',async()=>{const active={...agent,tools_config:{voice_provider:'fish_audio',edilizia_tools:{non_richiamare:{enabled:true}}}};const db=database(table=>({data:table==='ai_fish_agents'?binding:table==='ai_agents_v2'?active:null,error:null}));const d=deps(db);vi.spyOn(d.fish,'agentRequest').mockResolvedValue({agent_id:'fish-A',source:'phone',status:'active',direction:'outbound',dialed_number:'+390000000002',items:[{type:'message',role:'user',content:'Non mi richiamate più.'}]});db.rpc.mockResolvedValue({data:{registrato:true,bloccato:true},error:null});const token=await fishDerivedToken(secret,'fish-A');const r=await createFishToolHandler(d)(new Request('https://local',{method:'POST',headers:{'X-Eic-Fish-Token':token},body:JSON.stringify({agent_id:'fish-A',session_id:'trusted-session',tool:'non_richiamare',parameters:{motivo:'Non chiamare più',company_id:'foreign',phone:'+399999999999'}})}));expect(r.status).toBe(200);expect(db.rpc).toHaveBeenCalledWith('fish_record_call_optout',{p_company:'company-A',p_agent:'local-A',p_session:'trusted-session',p_reason:'Non chiamare più'});expect(JSON.stringify(db.rpc.mock.calls)).not.toContain('foreign');});
 it('sends a lead name only from the scoped contact whose number matches the actual recipient',async()=>{const db=database(table=>({data:table==='ai_fish_numbers'?[{phone_id:'phone'}]:table==='marketing_contacts'?{first_name:'Laura',last_name:'Bianchi',phone:'030 2345678'}:null,error:null}));db.rpc.mockImplementation(async(name:string)=>({data:name==='fish_prepare_outbound'?{id:'call-a',contact_id:'contact-a',fish_agent_id:'fish-A',fish_phone_id:'phone-a'}:{},error:null}));const fish=new FishAudioClient('test-key');const call=vi.spyOn(fish,'agentRequest').mockResolvedValue({session_id:'session-a'});await initiateFishCall(db,fish,{companyId:'company-A',agentId:'local-A',targetPhone:'+390302345678',contactId:'contact-a',requestKey:'test-attempt',dynamicVars:{eic_lead_name:'Foreign spoof'}});expect(call.mock.calls[0][2].dynamic_variables.eic_lead_name).toBe('Laura Bianchi');expect(db.queries.find(q=>q.table==='marketing_contacts')?.steps).toContainEqual(['eq','company_id','company-A']);});
});

describe('Fish speech model selection',()=>{
 it('applies Drama 3 by default and preserves an explicit S2 choice across session configuration',async()=>{
  const alternate={...agent,tools_config:{...agent.tools_config,fish:{voice:{tts_model:'s2.1-pro'}}}};
  expect(fishAgentConfig(agent,binding,'https://backend.example.com',secret,[]).voice.tts_model).toBe('drama-3');
  expect(fishAgentConfig(alternate,binding,'https://backend.example.com',secret,[]).voice.tts_model).toBe('s2.1-pro');
  expect(await fishConfigurationFingerprint(alternate,binding)).not.toBe(await fishConfigurationFingerprint(agent,binding));
  expect(()=>fishVoiceOptions({...agent,tools_config:{fish:{voice:{tts_model:'unknown'}}}})).toThrow('Modello vocale');
 });
});
