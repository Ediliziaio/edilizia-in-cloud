import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse } from "../_shared/headers.ts";
import { convertiDwgOnline } from "./motore.ts";
const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const MAX_BYTE = 4 * 1024 * 1024;
let attivo = false;
Deno.serve(async req => {
  const cors = { ...getCorsHeaders(req),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-eic-cad-company, x-eic-cad-order, x-eic-cad-request, x-eic-cad-size",
    "Access-Control-Expose-Headers": "X-Eic-Cad-Company,X-Eic-Cad-Order,X-Eic-Cad-Request,X-Eic-Cad-Input-Size,X-Eic-Cad-Sha256,X-Eic-Cad-Engine,X-Eic-Cad-Warnings" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("Usa POST.", 405, cors);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    const company = req.headers.get("x-eic-cad-company") ?? "", order = req.headers.get("x-eic-cad-order") ?? "", request = req.headers.get("x-eic-cad-request") ?? "";
    const size = Number(req.headers.get("x-eic-cad-size"));
    if (![company, order, request].every(v => UUID.test(v))) return errorResponse("Azienda, commessa o richiesta non valida.", 400, cors);
    if (req.headers.get("content-type") !== "application/octet-stream") return errorResponse("Invia il file DWG.", 415, cors);
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTE) return errorResponse("Il DWG online deve essere compreso fra 1 byte e 4 MB. Per disegni più grandi carica un DXF.", 413, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company, cors);
    const [{ data: ordine, error }, { data: permesso, error: errPermesso }] = await Promise.all([
      supabaseAdmin.from("orders").select("id").eq("company_id", company).eq("id", order).maybeSingle(),
      supabaseAdmin.rpc("has_permission_for_company", { _user_id: userId, _company_id: company, _permission: "can_view_orders" }),
    ]);
    if (error || errPermesso || !ordine || permesso !== true) return errorResponse("Non hai accesso al disegno di questa commessa.", 403, cors);
    if (attivo) return errorResponse("Una conversione è già in corso. Riprova fra poco.", 429, cors);
    attivo = true;
    try {
      const reader = req.body?.getReader(); if (!reader) return errorResponse("File mancante.", 400, cors);
      const chunks: Uint8Array[] = []; let total = 0;
      try { for (;;) { const r = await reader.read(); if (r.done) break; total += r.value.byteLength;
        if (total > MAX_BYTE || total > size) { await reader.cancel(); return errorResponse("File oltre il limite dichiarato.", 413, cors); } chunks.push(r.value); }
      } finally { reader.releaseLock(); }
      if (total !== size) return errorResponse("DWG incompleto.", 422, cors);
      const input = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length; }
      if (!/^AC10\d\d/.test(new TextDecoder().decode(input.subarray(0, 6)))) return errorResponse("Il contenuto non è un DWG.", 422, cors);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", input)), b => b.toString(16).padStart(2, "0")).join("");
      const dxf = await convertiDwgOnline(input);
      if (!/^\s*(?:0\s*[\r\n]+\s*SECTION|999)/.test(new TextDecoder().decode(dxf.subarray(0, 64)))) throw new Error("DXF non valido");
      return new Response(dxf, { headers: { ...cors, "Content-Type": "application/dxf", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        "X-Eic-Cad-Company": company, "X-Eic-Cad-Order": order, "X-Eic-Cad-Request": request,
        "X-Eic-Cad-Input-Size": String(size), "X-Eic-Cad-Sha256": hash, "X-Eic-Cad-Engine": "LibreDWG-WASM-0.9.0",
        // Gli oggetti CAD proprietari richiedono confronto con l'originale anche se il decoder restituisce 0.
        "X-Eic-Cad-Warnings": "1" } });
    } finally { attivo = false; }
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse("DWG non convertito: file non supportato o oltre i limiti del motore online. Puoi caricare un DXF di testo.", 422, cors);
  }
});
