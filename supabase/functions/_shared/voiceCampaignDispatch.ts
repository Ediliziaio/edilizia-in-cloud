/** One claim per invocation. Unknown provider outcomes are never retried automatically. */
export async function dispatchVoiceCampaign(db: any, baseUrl: string, serviceKey: string, send: typeof fetch = fetch) {
  const { data: claim, error } = await db.rpc("claim_voice_campaign_contact");
  if (error) throw new Error("Presa in carico campagna non riuscita");
  if (!claim) return { processed: 0 };
  const finish = async (state: string, conversation: string | null, note: string | null) => {
    const { error: finishError } = await db.rpc("finish_voice_campaign_attempt", {
      p_recipient_id: claim.id, p_token: claim.claim_token, p_state: state, p_conversation_id: conversation, p_note: note,
    });
    if (finishError) throw new Error("Esito non salvato: la coda resta bloccata per impedire una doppia chiamata");
  };
  if (!claim.contact_id) { await finish("escluso", null, "Contatto non più disponibile"); return { processed: 1, skipped: true }; }
  let response: Response;
  try {
    response = await send(baseUrl + "/functions/v1/initiate-outbound-call", {
      method: "POST", headers: { Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({ company_id: claim.company_id, agent_id: claim.agent_id, contact_id: claim.contact_id,
        campaign_recipient_id: claim.id, campaign_claim_token: claim.claim_token }),
    });
  } catch {
    await finish("esito_incerto", null, "Esito non verificabile: controlla lo storico prima di riprendere.");
    return { processed: 1, uncertain: true };
  }
  const body = await response.json().catch(() => ({}));
  if (response.ok && body.success === true && typeof body.conversation_id === "string" && body.conversation_id) {
    await finish("in_chiamata", body.conversation_id, null);
    return { processed: 1, started: true };
  }
  const note = typeof body.error === "string" ? body.error.slice(0, 500) : "Chiamata non avviata";
  if (body.outcome_unknown || response.status >= 500 || response.ok) {
    await finish("esito_incerto", null, note); return { processed: 1, uncertain: true };
  }
  if ([400,402,409,429,401].includes(response.status) || (response.status === 403 && !body.contact_excluded)) {
    await finish("in_coda", null, note); return { processed: 1, paused: true };
  }
  await finish(response.status === 403 ? "escluso" : "fallita", null, note);
  return { processed: 1, skipped: true };
}
