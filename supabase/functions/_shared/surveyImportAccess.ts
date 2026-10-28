// This client MUST carry the verified caller JWT, never a service-role key.
interface ImportAccessClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}
export async function canImportSurvey(
  client: ImportAccessClient,
  userId: string,
  companyId: string,
): Promise<boolean> {
  if (!userId || !companyId) return false;
  const permissions = await Promise.all(
    ["can_view_sopralluoghi", "can_edit_preventivi"].map((permission) =>
      client.rpc("has_permission_for_company", {
        _user_id: userId,
        _permission: permission,
        _company_id: companyId,
      }),
    ),
  );
  const readonly = await client.rpc("utente_sola_lettura", {
    p_company_id: companyId,
  });
  return (
    permissions.every((result) => !result.error && result.data === true) &&
    !readonly.error &&
    readonly.data === false
  );
}
