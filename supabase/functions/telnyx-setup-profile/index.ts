/**
 * telnyx-setup-profile — setup una tantum del Messaging Profile di piattaforma.
 *
 * Crea (o riusa) il Messaging Profile "Edilizia in Cloud" su Telnyx con il
 * webhook già puntato a telnyx-webhook. Il profile id va poi salvato come
 * secret TELNYX_MESSAGING_PROFILE_ID: serve per inviare SMS con mittente
 * alfanumerico (Telnyx lo richiede quando "from" non è un numero).
 *
 * POST autenticato, solo super_admin. Idempotente: se un profilo con lo
 * stesso nome esiste già, lo aggiorna e ne restituisce l'id.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { leggiImpostazionePiattaforma } from "../_shared/getPlatformSetting.ts";

const PROFILE_NAME = "Edilizia in Cloud";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const apiKey = Deno.env.get("TELNYX_API_KEY");
    if (!apiKey) return json({ error: "TELNYX_API_KEY non configurata" }, 503);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Auth: super_admin OPPURE token one-time da platform_settings
    // (telnyx_setup_token) per il setup automatizzato — stesso pattern
    // di meta-warmup-api-calls.
    const setupToken = req.headers.get("x-setup-token");
    let authed = false;
    if (setupToken) {
      // Il token dal 19/09/2026 sta nel Vault.
      const tokenSalvato = await leggiImpostazionePiattaforma("telnyx_setup_token");
      authed = Boolean(tokenSalvato && setupToken === tokenSalvato);
    }
    if (!authed) {
      const { userId } = await requireAuth(req, corsHeaders);
      await requireRole(adminClient, userId, ["super_admin"], corsHeaders);
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/telnyx-webhook`;

    // Cerca un profilo esistente con lo stesso nome (idempotenza)
    const listRes = await fetch(
      "https://api.telnyx.com/v2/messaging_profiles?page[size]=50",
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!listRes.ok) {
      const t = await listRes.text();
      return json({ error: `Telnyx list profiles ${listRes.status}: ${t.slice(0, 300)}` }, 502);
    }
    const listBody = await listRes.json() as { data?: Array<{ id: string; name: string }> };
    const existing = listBody.data?.find((p) => p.name === PROFILE_NAME);

    const profilePayload = {
      name: PROFILE_NAME,
      enabled: true,
      webhook_url: webhookUrl,
      webhook_api_version: "2",
      // Destinazioni autorizzate (richiesto da Telnyx, error 40331):
      // solo Italia — il mercato della piattaforma.
      whitelisted_destinations: ["IT"],
    };

    let profileId: string;
    if (existing) {
      const upd = await fetch(`https://api.telnyx.com/v2/messaging_profiles/${existing.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(profilePayload),
      });
      if (!upd.ok) {
        const t = await upd.text();
        return json({ error: `Telnyx update profile ${upd.status}: ${t.slice(0, 300)}` }, 502);
      }
      profileId = existing.id;
    } else {
      const crt = await fetch("https://api.telnyx.com/v2/messaging_profiles", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(profilePayload),
      });
      if (!crt.ok) {
        const t = await crt.text();
        return json({ error: `Telnyx create profile ${crt.status}: ${t.slice(0, 300)}` }, 502);
      }
      const crtBody = await crt.json() as { data: { id: string } };
      profileId = crtBody.data.id;
    }

    return json({
      success: true,
      messaging_profile_id: profileId,
      webhook_url: webhookUrl,
      reused: Boolean(existing),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Errore interno";
    return json({ error: message }, 500);
  }
});
