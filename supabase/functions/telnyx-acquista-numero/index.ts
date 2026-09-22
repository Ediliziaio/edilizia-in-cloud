/**
 * telnyx-acquista-numero
 * Acquista un numero +39 su Telnyx per un'azienda.
 * POST autenticato JWT: { company_id, numero_e164 }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { requireCompanyAccess } from "../_shared/auth.ts";

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

    // SEC (P0): l'utente deve appartenere alla company (acquisto numero = soldi reali).
    // 21/09/2026 — non bastava: mancava anche il ruolo. Solo l'amministratore
    // può acquistare, come per i numeri voce (telnyx-proxy, stesso giorno).
    try {
      await requireCompanyAccess(adminClient, user.id, company_id, corsHeaders, {
        allowedRoles: ["company_admin"],
      });
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }

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
    const messagingProfileId  = `mock_profile_${company_id.slice(0, 8)}`;

    // Canone: quello che il superadmin imposta in Prezzi SMS, non un numero
    // scritto nel codice (30 € fissi, qualunque cosa dicesse la pagina). Il
    // costo all'ingrosso viene da voice_pricing_config, che lo conserva.
    const [{ data: prezziSms }, { data: prezziVoce }] = await Promise.all([
      adminClient.from("sms_pricing_config").select("prezzo_numero_mensile").eq("attivo", true).limit(1).maybeSingle(),
      adminClient.from("voice_pricing_config").select("costo_numero_wholesale").eq("attivo", true).limit(1).maybeSingle(),
    ]);
    const canoneCliente = Number(prezziSms?.prezzo_numero_mensile ?? 30);
    const canoneWholesale = Number(prezziVoce?.costo_numero_wholesale ?? 1.5);

    // Primo mese addebitato SUBITO sul wallet SMS, prima dell'acquisto su
    // Telnyx: prima il numero veniva comprato (e pagato da noi) senza scalare
    // nulla al cliente, ne' all'acquisto ne' ai rinnovi.
    const { data: addebito, error: addErr } = await adminClient.rpc("addebita_sms_wallet", {
      p_company_id: company_id,
      p_importo: canoneCliente,
      p_tipo: "canone_numero",
      p_descrizione: `Attivazione numero ${numero_e164} — primo mese`,
      p_riferimento_id: null,
    });
    const esitoAddebito = (Array.isArray(addebito) ? addebito[0] : addebito) as { ok?: boolean; saldo_dopo?: number; motivo?: string } | null;
    if (addErr || !esitoAddebito?.ok) {
      return json({
        error: `Credito SMS insufficiente per attivare il numero: servono ${canoneCliente.toFixed(2)} € (saldo ${(esitoAddebito?.saldo_dopo ?? 0).toFixed(2)} €). Ricarica il wallet SMS.`,
      }, 402);
    }

    // Acquisto reale se API key disponibile.
    // 2026-06-11 (fix bug + endpoint): prima un fallimento Telnyx veniva
    // INGHIOTTITO e il numero risultava "attivo" nel DB senza esistere
    // (soldi veri, dato falso). Ora: errore Telnyx → errore all'utente,
    // niente insert. Il mock resta SOLO quando la chiave non è configurata
    // (ambiente dev). Endpoint corretto: /v2/number_orders (l'acquisto
    // numeri Telnyx passa da un ordine, non da POST /v2/phone_numbers).
    if (masterApiKey) {
      const res = await fetch("https://api.telnyx.com/v2/number_orders", {
        method: "POST",
        headers: { "Authorization": `Bearer ${masterApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_numbers: [{ phone_number: numero_e164 }],
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error("[telnyx-acquista-numero] Telnyx order failed", res.status, errBody.slice(0, 500));
        // I numeri +39 richiedono i requisiti regolatori AGCOM (dati
        // dell'utilizzatore finale) configurati sull'account Telnyx.
        const hint = errBody.includes("requirement")
          ? " Il numero italiano richiede i dati di registrazione dell'azienda (normativa AGCOM): completa i requirement nel portale Telnyx o contatta il supporto."
          : "";
        return json({ error: `Acquisto numero non riuscito (Telnyx ${res.status}).${hint}` }, 502);
      }
      const body = await res.json() as {
        data: { id: string; phone_numbers?: Array<{ id?: string; phone_number?: string }> };
      };
      telnyxPhoneNumberId = body.data.phone_numbers?.[0]?.id ?? body.data.id;
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
        costo_mensile_wholesale: canoneWholesale,
        costo_mensile_cliente: canoneCliente,
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
