const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CHAT_HISTORY_ACTIONS = ["chat_sessions", "chat_messages"];
/** Authenticated company access and AI-agent permission must be checked by the caller. */
export async function agentChatHistory(db: any, companyId: string, action: string, payload: Record<string, unknown> = {}) {
  const page = Number(payload.page ?? 0);
  if (!Number.isInteger(page) || page < 0 || page > 10000) throw new Error("Pagina non valida");
  if (action === "chat_sessions") {
    const status = payload.status ?? "tutti";
    const source = payload.source ?? "tutti";
    if (!["tutti", "attiva", "chiusa"].includes(status as string) || !["tutti", "agente", "sito"].includes(source as string)) throw new Error("Filtro chat non valido");
    const { data, error } = await db.rpc("agent_chat_history", { p_company_id: companyId, p_page: page,
      p_status: status, p_source: source, p_search: typeof payload.search === "string" ? payload.search.trim().slice(0, 120) : "" });
    if (error) throw new Error("Impossibile caricare la cronologia chat");
    return data;
  }
  if (action !== "chat_messages" || typeof payload.session_id !== "string" || !UUID.test(payload.session_id) || !["agente", "sito"].includes(payload.source as string)) throw new Error("Sessione non valida");
  const site = payload.source === "sito";
  const { data: session, error: sessionError } = await db.from(site ? "public_chat_sessions" : "ai_chat_sessions")
    .select("id").eq("id", payload.session_id).eq("company_id", companyId).maybeSingle();
  if (sessionError || !session) throw new Error("Sessione non disponibile nell'azienda");
  const { data, error } = await db.from(site ? "public_chat_messages" : "ai_chat_messages")
    .select(site ? "id,role,content,created_at" : "id,ruolo,contenuto,creato_il").eq("session_id", session.id)
    .in(site ? "role" : "ruolo", ["user", "assistant", "agent"]).order(site ? "created_at" : "creato_il")
    .order("id").range(page * 200, page * 200 + 200);
  if (error) throw new Error("Impossibile caricare i messaggi");
  const rows = data || [];
  return { messages: rows.slice(0, 200).map((m: any) => site ? { id: m.id, ruolo: m.role, contenuto: m.content, creato_il: m.created_at } : m), has_more: rows.length > 200 };
}
