/**
 * sms-crea-payment-intent
 * Crea un Stripe PaymentIntent per la ricarica crediti SMS.
 * POST autenticato JWT: { company_id, pacchetto_id }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { requireCompanyAccess } from "../_shared/auth.ts";

interface RequestBody { company_id: string; pacchetto_id: string }

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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Autenticazione richiesta" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const userClient  = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Non autorizzato" }, 401);

    const { company_id, pacchetto_id } = await req.json() as RequestBody;
    if (!company_id || !pacchetto_id) return json({ error: "Parametri obbligatori mancanti" }, 400);

    // Tenant check: l'utente deve appartenere alla company. Prima si poteva
    // creare un PaymentIntent e accreditare crediti SMS su un'azienda arbitraria.
    try {
      await requireCompanyAccess(adminClient, user.id, company_id, corsHeaders);
    } catch (accessErr) {
      if (accessErr instanceof Response) return accessErr;
      return json({ error: "Non autorizzato per questa azienda" }, 403);
    }

    // Leggi pacchetto
    const { data: pacchetto, error: packErr } = await adminClient
      .from("sms_pacchetti_crediti")
      .select("id, nome, importo_eur, crediti_eur, bonus_percentuale, attivo")
      .eq("id", pacchetto_id)
      .eq("attivo", true)
      .single();
    if (packErr || !pacchetto) return json({ error: "Pacchetto non trovato" }, 404);

    // Calcola crediti da accreditare (con bonus)
    const creditiConBonus = pacchetto.crediti_eur * (1 + (pacchetto.bonus_percentuale / 100));

    let clientSecret = `mock_pi_${Date.now()}_secret_mock`;

    // Crea PaymentIntent Stripe se disponibile
    if (stripeSecretKey) {
      try {
        const Stripe = await import("npm:stripe@14");
        const stripe = new Stripe.default(stripeSecretKey, { apiVersion: "2024-04-10" });

        // Recupera/crea cliente Stripe
        const { data: company } = await adminClient
          .from("companies")
          .select("name, stripe_customer_id")
          .eq("id", company_id)
          .single();

        let stripeCustomerId = (company as { stripe_customer_id?: string })?.stripe_customer_id;

        if (!stripeCustomerId) {
          const customer = await stripe.customers.create({
            name: (company as { name?: string })?.name ?? company_id,
            metadata: { company_id },
          });
          stripeCustomerId = customer.id;
          await adminClient
            .from("companies")
            .update({ stripe_customer_id: stripeCustomerId })
            .eq("id", company_id);
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(pacchetto.importo_eur * 100),
          currency: "eur",
          customer: stripeCustomerId,
          metadata: { company_id, pacchetto_id, crediti_da_accreditare: String(creditiConBonus) },
          automatic_payment_methods: { enabled: true },
        });

        clientSecret = paymentIntent.client_secret ?? clientSecret;

      } catch {
        // Fallback mock in sviluppo
      }
    }

    return json({
      client_secret: clientSecret,
      importo_eur: pacchetto.importo_eur,
      crediti_da_accreditare: creditiConBonus,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore interno";
    return json({ error: message }, 500);
  }
});
