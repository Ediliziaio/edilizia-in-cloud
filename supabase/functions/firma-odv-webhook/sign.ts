type SignArgs = { p_token: string; p_firma_base64: string; p_firmato_da: string };
type Rpc = (args: SignArgs) => PromiseLike<{ data: unknown; error: unknown }>;
type Result = { success: true } | { success: false; status: number; message: string };

/** Base contract + approved variations is the canonical total. Signing must
 * NEVER increment orders.total_amount as well. The RPC locks the pending row. */
export async function signVariation(body: unknown, rpc: Rpc): Promise<Result> {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const token = typeof input.token === "string" ? input.token.trim() : "";
  const name = typeof input.firmato_da === "string" ? input.firmato_da.trim() : "";
  const signature = typeof input.firma_data_base64 === "string" ? input.firma_data_base64 : "";
  if (!/^[A-Za-z0-9-]{8,80}$/.test(token) || name.length < 2 || name.length > 200 ||
      signature.length > 1_000_000 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(signature)) {
    return { success: false, status: 400, message: "Indica nome e cognome e acquisisci una firma PNG valida." };
  }
  const { data, error } = await rpc({ p_token: token, p_firma_base64: signature, p_firmato_da: name });
  if (error) return { success: false, status: 500, message: "Firma non registrata. Riprova." };
  if (!(data as { success?: boolean } | null)?.success) {
    return { success: false, status: 409, message: "Variante non più firmabile. Ricarica la pagina per verificarne lo stato." };
  }
  return { success: true };
}
