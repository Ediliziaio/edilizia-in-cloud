/**
 * telnyx-send-sms
 * Invia un singolo SMS transazionale via Telnyx (non campagna).
 * Verifica crediti wallet → registra in sms_messages → chiama Telnyx → addebita.
 * La logica sta in _shared/smsSingolo.ts (vedi lì cosa non funzionava prima).
 * POST autenticato JWT: { to_number, body, company_id, trigger_type?, trigger_entity?, trigger_ref? }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { inviaSmsSingolo } from "../_shared/smsSingolo.ts";

interface RequestBody {
  to_number: string;
  body: string;
  company_id: string;
  trigger_type?: string;
  trigger_entity?: string | null;
  trigger_ref?: string | null;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!req.headers.get("Authorization")) return json({ error: "Autenticazione richiesta" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { to_number, body: msgBody, company_id, trigger_type, trigger_entity, trigger_ref } = await req.json() as RequestBody;
    if (!to_number || !msgBody || !company_id) {
      return json({ error: "Parametri obbligatori: to_number, body, company_id" }, 400);
    }

    // SEC (P0): l'utente deve appartenere alla company richiesta (no cross-tenant)
    let userId: string;
    try {
      ({ userId } = await requireAuth(req, corsHeaders));
      await requireCompanyAccess(admin, userId, company_id, corsHeaders);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }

    const esito = await inviaSmsSingolo(admin, {
      companyId: company_id, userId, to: String(to_number).trim(), body: String(msgBody),
      trigger_type, trigger_entity, trigger_ref,
    });
    if (!esito.ok) return json({ ok: false, error: esito.error }, esito.status);
    return json({ ok: true, message_id: esito.message_id, telnyx_id: esito.telnyx_id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error("telnyx-send-sms: errore non gestito", message);
    return json({ ok: false, error: message }, 500);
  }
});
