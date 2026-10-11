/** Copy configuration only, never identity, activity totals or provider bindings. */
export function duplicateAgentConfiguration(source: Record<string, unknown>) {
  const fields = ["nome", "tipo", "descrizione", "system_prompt", "primo_messaggio", "lingua", "llm_model", "temperatura",
    "elevenlabs_voice_id", "voice_nome", "avatar_url", "enabled_tools", "tools_config", "risposta_automatica",
    "registra_chiamate", "trascrivi_chiamate", "rileva_segreteria", "squillo_max", "durata_max_secondi",
    "widget_titolo", "widget_colore", "widget_posizione", "business_hours"];
  const result: Record<string, unknown> = {};
  for (const key of fields) if (source[key] !== undefined) result[key] = structuredClone(source[key]);
  if (result.tools_config && typeof result.tools_config === "object") delete (result.tools_config as Record<string, unknown>).elevenlabs_tool_ids;
  result.nome = `${source.nome} (copia)`;
  result.stato = "bozza";
  return result;
}
