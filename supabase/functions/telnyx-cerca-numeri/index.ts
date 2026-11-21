/**
 * telnyx-cerca-numeri
 * Cerca numeri +39 disponibili su Telnyx per un'azienda.
 * POST autenticato JWT: { company_id, prefisso_area?, citta? }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { requireCompanyAccess } from "../_shared/auth.ts";

interface RequestBody {
  company_id: string;
  prefisso_area?: string;
  citta?: string;
}

interface TelnyxNumeroDisponibile {
  numero_e164: string;
  numero_display: string;
  prefisso_area: string | null;
  citta: string | null;
  features: string[];
}

interface TelnyxCercaResponse { numeri: TelnyxNumeroDisponibile[] }

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

    const { company_id, prefisso_area } = await req.json() as RequestBody;
    if (!company_id) return json({ error: "company_id obbligatorio" }, 400);

    // SEC (P0): l'utente deve appartenere alla company richiesta (no cross-tenant)
    try {
      await requireCompanyAccess(adminClient, user.id, company_id, corsHeaders);
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }

    // Verifica account Telnyx per questa azienda
    const { data: account, error: accountError } = await adminClient
      .from("sms_telnyx_accounts")
      .select("stato")
      .eq("company_id", company_id)
      .maybeSingle();
    if (accountError) return json({ error: "Impossibile verificare l’account telefonico. Riprova." }, 503);
    if (!masterApiKey || account?.stato !== "attivo") {
      return json({ error: "Completa l’attivazione dell’account telefonico per cercare un numero." }, 503);
    }

    try {
      const params = new URLSearchParams({ country_code: "IT", phone_number_type: "long-code", limit: "10" });
      if (prefisso_area) params.set("national_destination_code", prefisso_area);
      const res = await fetch(`https://api.telnyx.com/v2/available_phone_numbers?${params}`, {
        headers: { Authorization: `Bearer ${masterApiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return json({ error: "La ricerca dei numeri è temporaneamente indisponibile. Riprova." }, 502);
      const body = await res.json() as { data: Array<{ phone_number: string; features?: Array<{ name: string }> }> };
      const numeri = body.data.slice(0, 10).map((n) => ({
        numero_e164: n.phone_number,
        numero_display: formattaNumero(n.phone_number),
        prefisso_area: prefisso_area ?? null,
        citta: null,
        features: (n.features ?? []).map((f) => f.name),
      }));
      return json({ numeri } satisfies TelnyxCercaResponse);
    } catch {
      return json({ error: "La ricerca dei numeri è temporaneamente indisponibile. Riprova." }, 502);
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore interno";
    return json({ error: message }, 500);
  }
});
