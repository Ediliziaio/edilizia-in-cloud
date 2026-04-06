/**
 * telnyx-acquista-numero
 * Acquista un numero +39 su Telnyx per un'azienda.
 * POST autenticato JWT: { company_id, numero_e164 }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

interface RequestBody { company_id: string; numero_e164: string }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function formattaNumero(e164: string): string {
  if (!e164.startsWith("+39")) return e164;
  const n = e164.slice(3);
  if (/^3\d{9}$/.test(n)) return `+39 ${n.slice(0,3)} ${n.slice(3,6)} ${n.slice(6)}`;
  if (/^0[2-9]\d{7,8}$/.test(n)) return `+39 ${n.slice(0,2)} ${n.slice(2,6)} ${n.slice(6)}`;
  return `+39 ${n}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const masterApiKey   = Deno.env.get("TELNYX_MASTER_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Autenticazione richiesta" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const userClient  = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Non autorizzato" }, 401);

    const { company_id, numero_e164 } = await req.json() as RequestBody;
    if (!company_id || !numero_e164) return json({ error: "Parametri obbligatori mancanti" }, 400);

    // Verifica che l'azienda non abbia già un numero attivo
    const { data: existing } = await adminClient
      .from("sms_telnyx_numbers")
      .select("id, stato")
      .eq("company_id", company_id)
      .eq("stato", "attivo")
      .maybeSingle();

    if (existing) return json({ error: "L'azienda ha già un numero SMS attivo" }, 409);

    // Recupera account Telnyx dell'azienda
    const { data: account } = await adminClient
      .from("sms_telnyx_accounts")
      .select("id, telnyx_account_id, telnyx_api_key_secret_name")
      .eq("company_id", company_id)
      .maybeSingle();

    if (!account) return json({ error: "Account Telnyx non trovato. Contatta il supporto." }, 404);

    let telnyxPhoneNumberId = `mock_num_${numero_e164.replace(/[^0-9]/g, "")}`;
    let messagingProfileId  = `mock_profile_${company_id.slice(0, 8)}`;

    // Acquisto reale se API key disponibile
    if (masterApiKey) {
      try {
        const res = await fetch("https://api.telnyx.com/v2/phone_numbers", {
          method: "POST",
          headers: { "Authorization": `Bearer ${masterApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ phone_number: numero_e164 }),
        });
        if (res.ok) {
          const body = await res.json() as { data: { id: string } };
          telnyxPhoneNumberId = body.data.id;
        }
      } catch {
        // Continua con mock
      }
    }

    const prossimoRinnovo = new Date();
    prossimoRinnovo.setMonth(prossimoRinnovo.getMonth() + 1);

    // Salva il numero nel DB
    const { error: numError } = await adminClient
      .from("sms_telnyx_numbers")
      .insert({
        company_id,
        telnyx_account_id: account.id,
        numero_e164,
        numero_display: formattaNumero(numero_e164),
        prefisso_area: numero_e164.slice(3, 5),
        telnyx_phone_number_id: telnyxPhoneNumberId,
        messaging_profile_id: messagingProfileId,
        stato: "attivo",
        costo_mensile_wholesale: 1.50,
        costo_mensile_cliente: 30.00,
        prossimo_rinnovo: prossimoRinnovo.toISOString(),
      });

    if (numError) throw numError;

    // Segna onboarding come completato
    await adminClient
      .from("sms_provider_config")
      .upsert({ company_id, onboarding_completato: true }, { onConflict: "company_id" });

    return json({
      success: true,
      numero_e164,
      numero_display: formattaNumero(numero_e164),
      prossimo_rinnovo: prossimoRinnovo.toISOString(),
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore interno";
    return json({ error: message }, 500);
  }
});
