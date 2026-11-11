import { fishExtraScenario } from "./fishScenarioExtras.ts";
import { enabledFishTools, fishAgentConfig, fishConfigurationFingerprint, fishToolPayload } from "./fishAgentConfig.ts";
import { buildFishSimulation } from "./fishSimulation.ts";

/** Separate private web agent: client-side fixtures only, never CRM webhooks or phone transfers. */
export async function createFishWebPreview(deps: any, agent: any, binding: any, userId: string, scenario = "appointment") {
  const fingerprint = await fishConfigurationFingerprint(agent, binding);
  if (binding.config_fingerprint !== fingerprint) throw new Error("Salva e sincronizza la bozza prima della prova a voce.");
  const fixture = buildFishSimulation(agent, binding, scenario);
  const save = async (values: Record<string, unknown>) => {
    const result = await deps.db.from("ai_fish_agents").update(values).eq("company_id", binding.company_id).eq("agent_id", agent.id);
    if (result.error) throw new Error("Salvataggio della prova vocale non riuscito.");
  };
  let remoteId = binding.preview_agent_id;
  if (remoteId === "pending") throw new Error("Prova vocale in preparazione o creazione senza esito: la piattaforma deve riconciliare la bozza di prova.");
  if (!remoteId) {
    const claim = await deps.db.from("ai_fish_agents").update({ preview_agent_id: "pending" }).eq("company_id", binding.company_id).eq("agent_id", agent.id).is("preview_agent_id", null).select("agent_id").single();
    if (claim.error || !claim.data) throw new Error("Prova vocale già in preparazione. Attendi e riprova.");
    const remote = await deps.fish.agentRequest("/v1/agent/agents", "POST", { name: `EiC ${agent.id}: WEB DEMO`.slice(0, 120), description: "Prova vocale privata con strumenti dimostrativi, senza linea o dati CRM.", config: { voice: { voice_id: binding.voice_id, speaking_language: agent.lingua || "it" }, tools: { enabled: false, tool_ids: [] } } });
    if (!remote.agent_id) throw new Error("Creazione della prova vocale non confermata. Riconcilia prima di riprovare.");
    remoteId = remote.agent_id;
    await save({ preview_agent_id: remoteId });
  }
  const version = `web-preview-v3:${fingerprint}`;
  if (binding.preview_fingerprint !== version) {
    const toolIds = { ...(binding.preview_tool_ids || {}) };
    const attached: string[] = [];
    for (const name of enabledFishTools(agent)) {
      const source = fishToolPayload(name, remoteId, "https://unused.invalid", "unused");
      const tool = { name, description: source.description, parameters: source.parameters, parameter_mode: "strict", expects_response: true, timeout_seconds: name==="passa_a_operatore"?45:15 };
      if (toolIds[name]) await deps.fish.agentRequest(`/v1/agent/tools/${encodeURIComponent(toolIds[name])}`, "PATCH", tool);
      else {
        const created = await deps.fish.agentRequest("/v1/agent/tools", "POST", { ...tool, tool_type: "client" });
        if (!created.tool_id) throw new Error("Creazione dello strumento dimostrativo non confermata.");
        toolIds[name] = created.tool_id;
        await save({ preview_tool_ids: toolIds });
      }
      attached.push(toolIds[name]);
    }
    const config = fishAgentConfig(agent, binding, "https://unused.invalid", "unused", attached);
    config.prompt.system_prompt += "\n\nMODALITÀ PROVA VOCALE: ogni strumento usa dati dimostrativi. Non effettui telefonate o trasferimenti e non leggi né modifichi dati reali. Dichiara gli esiti come dimostrativi. Segui il flusso aziendale e raccogli i dati necessari prima di confermare un’azione simulata.";
    config.prompt.first_message="{{eic_preview_greeting}}";
    config.conversation.max_duration_seconds = Math.min(300, config.conversation.max_duration_seconds);
    config.conversation.record_audio = false;
    config.conversation.transfer_destinations = [];
    config.webhooks = { conversation_init: null, post_call: [] } as any;
    config.variables = { on_missing: "reject", defaults: { eic_session_authorized: "simulation",eic_lead_name:"",eic_recipient_phone:"",eic_demo_today:"10 novembre 2026, Europe/Rome",eic_preview_greeting:agent.primo_messaggio || "Buongiorno, sono l’assistente virtuale. Come posso aiutarla?" } } as any;
    await deps.fish.agentRequest(`/v1/agent/agents/${encodeURIComponent(remoteId)}/publish`, "POST", { version_title: "Prova web privata · nessun dato reale", config });
    await save({ preview_tool_ids: toolIds, preview_fingerprint: version });
  }
  const session = await deps.fish.agentRequest("/v1/agent/sessions", "POST", {
    agent_id: remoteId, name: "Prova vocale da Edilizia in Cloud", end_user_id: userId, record_audio: false, tool_events: true,
    dynamic_variables: { eic_session_authorized: "simulation",eic_recipient_phone:"+390000000002",eic_demo_today:"10 novembre 2026, Europe/Rome",eic_lead_name:scenario.startsWith("lead_")?"Laura Bianchi":"",eic_preview_greeting:fishExtraScenario(scenario)?.greeting || agent.primo_messaggio || "Buongiorno, sono l’assistente virtuale. Come posso aiutarla?" }, metadata: { eic_preview: true, company_id: binding.company_id, local_agent_id: agent.id },
  });
  return { session_token: session, mock_tools: Object.fromEntries(fixture.simulation.tool_mocks.tools.map((item: any) => [item.tool.name, item.result])), simulation: true };
}
