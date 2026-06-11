/**
 * telnyx-test-invio
 * Invia un SMS di prova dal numero dell'azienda.
 * POST autenticato JWT: { company_id, telefono_destinatario, messaggio_test }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { requireCompanyAccess } from "../_shared/auth.ts";

interface RequestBody {
  company_id: string;
  telefono_destinatario: string;
  messaggio_test: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    const { company_id, telefono_destinatario, messaggio_test } = await req.json() as RequestBody;
    // SEC (P0): l'utente deve appartenere alla company richiesta (no cross-tenant)
    try {
      await requireCompanyAccess(adminClient, user.id, company_id, corsHeaders);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }
    if (!company_id || !telefono_destinatario || !messaggio_test) {
      return json({ error: "Parametri obbligatori mancanti" }, 400);
    }

    // Numero attivo se presente, altrimenti mittente alfanumerico
    // (nome azienda max 11 char — standard SMS Italia, vedi telnyx-invia-sms)
    const { data: numero } = await adminClient
      .from("sms_telnyx_numbers")
      .select("numero_e164")
      .eq("company_id", company_id)
      .eq("stato", "attivo")
      .maybeSingle();

    let mittente: string;
    if (numero) {
      mittente = numero.numero_e164;
    } else {
      const { data: comp } = await adminClient
        .from("companies")
        .select("name, business_name")
        .eq("id", company_id)
        .maybeSingle();
      const rawName = (comp?.business_name || comp?.name || "EdiliziaEiC").trim();
      mittente = rawName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 11) || "EdiliziaEiC";
    }

    // Verifica crediti
    const { data: pricing } = await adminClient
      .from("sms_pricing_config").select("prezzo_per_sms, soglia_crediti_blocco").limit(1).maybeSingle();
    const prezzoPerSms   = Number(pricing?.prezzo_per_sms   ?? 0.06);
    const sogliaBlocco   = Number(pricing?.soglia_crediti_blocco ?? 0);

    const { data: wallet } = await adminClient
      .from("sms_wallet").select("crediti, crediti_riservati").eq("company_id", company_id).maybeSingle();
    const creditiDisponibili = (Number(wallet?.crediti ?? 0)) - (Number(wallet?.crediti_riservati ?? 0));
    if (creditiDisponibili <= sogliaBlocco) {
      return json({ error: "Crediti insufficienti per il test. Ricarica il wallet." }, 400);
    }

    let telnyxMessageId: string | null = null;

    if (masterApiKey) {
      try {
        const res = await fetch("https://api.telnyx.com/v2/messages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${masterApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: mittente,
            to: telefono_destinatario,
            text: messaggio_test,
            ...(Deno.env.get("TELNYX_MESSAGING_PROFILE_ID")
              ? { messaging_profile_id: Deno.env.get("TELNYX_MESSAGING_PROFILE_ID") }
              : {}),
          }),
        });
        if (res.ok) {
          const body = await res.json() as { data: { id: string } };
          telnyxMessageId = body.data.id;
        }
      } catch { /* continua */ }
    } else {
      telnyxMessageId = `mock_test_${Date.now()}`;
    }

    // Scala 1 credito
    await adminClient
      .from("sms_wallet")
      .update({ crediti: (Number(wallet?.crediti ?? 0)) - prezzoPerSms })
      .eq("company_id", company_id);

    await adminClient.from("sms_wallet_transazioni").insert({
      company_id,
      tipo: "addebito_sms",
      importo: -prezzoPerSms,
      saldo_dopo: (Number(wallet?.crediti ?? 0)) - prezzoPerSms,
      descrizione: `SMS di prova a ${telefono_destinatario}`,
    });

    await adminClient.from("sms_log").insert({
      company_id,
      campagna_id: null,
      contatto_id: null,
      telefono: telefono_destinatario,
      messaggio: messaggio_test,
      stato: "inviato",
      telnyx_message_id: telnyxMessageId,
      costo_cliente: prezzoPerSms,
      costo_wholesale: 0.008,
      inviato_at: new Date().toISOString(),
    });

    return json({ success: true, telnyx_message_id: telnyxMessageId, costo_addebitato: prezzoPerSms });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore interno";
    return json({ error: message }, 500);
  }
});
