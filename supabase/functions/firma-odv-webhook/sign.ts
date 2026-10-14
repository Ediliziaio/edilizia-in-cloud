type SignArgs = { p_token: string; p_firma_base64: string; p_firmato_da: string; p_document_hash: string; p_accepted: boolean };
type Rpc = (args: SignArgs) => PromiseLike<{ data: unknown; error: unknown }>;
type Result = { success: true } | { success: false; status: number; message: string };

/** Base contract + approved variations is the canonical total. Signing must
 * NEVER increment orders.total_amount as well. The RPC locks the pending row. */
export async function signVariation(body: unknown, rpc: Rpc): Promise<Result> {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const token = typeof input.token === "string" ? input.token.trim() : "";
  const name = typeof input.firmato_da === "string" ? input.firmato_da.trim() : "";
  const signature = typeof input.firma_data_base64 === "string" ? input.firma_data_base64 : "";
  const hash = typeof input.document_hash === "string" ? input.document_hash : "";
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(token) || input.accepted !== true || !/^[a-f0-9]{64}$/.test(hash) || name.length < 2 || name.length > 200 ||
      signature.length > 1_000_000 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(signature)) {
    return { success: false, status: 400, message: "Indica nome e cognome e acquisisci una firma PNG valida." };
  }
  try {
    const bytes = Uint8Array.from(atob(signature.split(",")[1]), value => value.charCodeAt(0));
    if(bytes.length < 67 || bytes.length > 750000) throw new Error("PNG non valido");
    const view = new DataView(bytes.buffer);
    if(view.getUint32(16) < 1 || view.getUint32(20) < 1 || view.getUint32(16) > 4096 || view.getUint32(20) > 4096) throw new Error("Dimensioni PNG non valide");
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create(); await doc.embedPng(bytes);
  } catch { return {success:false,status:400,message:"La firma non contiene un'immagine PNG valida."}; }
  const { data, error } = await rpc({ p_token: token, p_firma_base64: signature, p_firmato_da: name, p_document_hash: hash, p_accepted: true });
  if (error) return { success: false, status: 500, message: "Firma non registrata. Riprova." };
  if (!(data as { success?: boolean } | null)?.success) {
    return { success: false, status: 409, message: "Variante non più firmabile. Ricarica la pagina per verificarne lo stato." };
  }
  return { success: true };
}
