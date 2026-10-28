/** Called only after authentication and tenant membership checks. All reads use the caller's RLS. */
export async function authorizeAutomationTrigger(
  admin: any,
  userDb: any,
  userId: string,
  body: any,
  corsHeaders: Record<string, string> = {},
) {
  const deny = () => {
    throw new Response(
      JSON.stringify({
        error:
          "Avvio non autorizzato: controlla permessi, modalità sola lettura e flusso selezionato.",
      }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  };
  const { data: blocked, error: blockedError } = await userDb.rpc(
    "utente_bloccato",
  );
  const { data: readonly, error: readonlyError } = await userDb.rpc(
    "utente_sola_lettura",
    { p_company_id: body.company_id },
  );
  if (
    blockedError || readonlyError || blocked !== false || readonly !== false
  ) return deny();
  let permitted = false;
  for (
    const permission of [
      "can_view_automazioni",
      "can_view_marketing_automations",
    ]
  ) {
    const { data, error } = await admin.rpc("has_permission_for_company", {
      _user_id: userId,
      _company_id: body.company_id,
      _permission: permission,
    });
    if (!error && data === true) permitted = true;
  }
  if (
    !permitted || !/^[a-f0-9-]{36}$/i.test(body.flow_id ?? "") ||
    body.entity_type !== "contact"
  ) return deny();
  const allowed = new Set([
    "contatto_creato",
    "contact_created",
    "contatto_aggiornato",
    "contact_updated",
    "manuale",
    "manual_trigger",
    "manual_run",
  ]);
  if (!allowed.has(body.trigger_event)) return deny();
  const { data: flow, error: flowError } = await userDb.from("automation_flows")
    .select("id").eq("id", body.flow_id).eq("company_id", body.company_id).eq(
      "status",
      "published",
    ).is("deleted_at", null).maybeSingle();
  const { data: contact, error: contactError } = await userDb.from(
    "marketing_contacts",
  ).select("id,first_name,last_name,email,phone").eq("id", body.entity_id).eq(
    "company_id",
    body.company_id,
  ).is("deleted_at", null).maybeSingle();
  if (flowError || contactError || !flow || !contact) return deny();
  // Never let a browser supply business event data, aliases, arretrato or test flags.
  return {
    ...body,
    manual_flow_id: flow.id,
    payload: {
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email,
      phone: contact.phone,
    },
  };
}
