import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import {
  getCorsHeaders,
  jsonResponse,
  errorResponse,
} from "../_shared/headers.ts";
import { processaDocumento } from "./worker.ts";
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return errorResponse("POST only", 405, cors);
  try {
    let db;
    let id: string | undefined;
    const body = await req.json().catch(() => ({}));
    const interno = cronSecretValido(req);
    if (interno) {
      db = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { persistSession: false } },
      );
    } else {
      const auth = await requireAuth(req, cors);
      db = auth.supabaseAdmin;
      id = body.id;
      if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
        return errorResponse("Documento mancante", 400, cors);
      const { data: j, error } = await db
        .from("ddt_document_jobs")
        .select("id,company_id,created_by")
        .eq("id", id)
        .maybeSingle();
      if (error || !j)
        return errorResponse("Documento non disponibile", 404, cors);
      const access = await requireCompanyAccess(
        db,
        auth.userId,
        j.company_id,
        cors,
      );
      if (j.created_by !== auth.userId && !access.isSuperAdmin) {
        const perm = await db.rpc("has_permission_for_company", {
          _user_id: auth.userId,
          _permission: "can_edit_orders",
          _company_id: j.company_id,
        });
        const acquisti = await db.rpc("has_permission_for_company", {
          _user_id: auth.userId,
          _permission: "can_manage_purchasing",
          _company_id: j.company_id,
        });
        if (!perm.data && !acquisti.data)
          return errorResponse("Documento non disponibile", 403, cors);
      }
    }
    const lavoro = (async () => {
      for (let n = 0; n < (interno ? 3 : 1); n++) {
        const esito = await processaDocumento(db, id);
        if (esito.stato === "nessun_lavoro") break;
      }
    })().catch(() =>
      console.error(
        "[ddt-documenti-processa] Elaborazione interrotta; lease recuperabile",
      ),
    );
    EdgeRuntime.waitUntil(lavoro);
    return jsonResponse({ success: true, accepted: true }, 202, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    return errorResponse("Impossibile avviare la lettura", 500, cors);
  }
});
