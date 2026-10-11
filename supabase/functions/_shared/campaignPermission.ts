/** Company membership alone is not permission to read CRM contacts or prepare campaigns. */
export async function campaignPermission(db: any, userId: string, companyId: string, isSuperAdmin: boolean, action: string, headers: Record<string, string>) {
  // isSuperAdmin must come from agentCompanyAccess (role + email allowlist), never the request.
  if (isSuperAdmin) return;
  const permissions = ["can_view_marketing_ai_agent"];
  if (["campaign_contacts", "prepare_campaign", "start_campaign"].includes(action)) permissions.push("can_view_marketing_contacts");
  for (const permission of permissions) {
    const { data, error } = await db.rpc("has_permission_for_company", { _user_id: userId, _company_id: companyId, _permission: permission });
    if (error || data !== true) throw new Response(JSON.stringify({ error: "Permesso non disponibile per la gestione delle campagne o dei contatti CRM" }), { status: 403, headers: { ...headers, "Content-Type": "application/json" } });
  }
}
