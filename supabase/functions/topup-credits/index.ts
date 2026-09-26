import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, secureHeaders } from "../_shared/headers.ts";

const TABLE_MAP: Record<string, string> = {
  email:     "email_credits",
  ai_agents: "ai_credits",
  whatsapp:  "whatsapp_credits",
};

const TOPUP_TABLE_MAP: Record<string, string> = {
  email:     "email_credit_topups",
  ai_agents: "ai_credit_topups",
  whatsapp:  "whatsapp_credit_topups",
};

const SERVICE_LABELS: Record<string, string> = {
  email:     "Crediti Email Marketing",
  whatsapp:  "Crediti WhatsApp Business",
  ai_agents: "Crediti Agenti AI",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Auth check using standard requireAuth() helper (replaces insecure anonClient.auth.getUser() pattern)
    const { userId } = await requireAuth(req, getCorsHeaders(req));
    const user = { id: userId };

    const { companyId, amountEur, service, paymentMethod, notes: topupNotes } = await req.json();

    if (!service || !TABLE_MAP[service]) {
      return json({ error: "Servizio non valido: " + service }, 400);
    }

    if (!companyId || !amountEur || amountEur < 5) {
      return json({ error: "Importo minimo €5.00" }, 400);
    }

    const creditsTable = TABLE_MAP[service];
    const topupTable   = TOPUP_TABLE_MAP[service];

    // La ricarica manuale, senza pagamento, è del super admin: le aziende
    // ricaricano da Impostazioni → Crediti, con Stripe. Fino al 26/09/2026
    // passava anche chiunque fosse dell'azienda, e si ricaricava gratis.
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isSuperAdmin = (callerRoles || []).some((r: any) => r.role === "super_admin");

    if (!isSuperAdmin) {
      return json({ error: "Non autorizzato: la ricarica manuale è riservata allo staff di piattaforma" }, 403);
    }

    // Ricarica atomica via RPC (rimpiazza il pattern SELECT+UPDATE race-prone).
    // La RPC fa UPSERT della row + UPDATE in-place + unblock condizionale.
    const { data: rpcRows, error: rpcErr } = await adminClient.rpc(
      "topup_service_credits" as never,
      {
        p_service: service,
        p_company_id: companyId,
        p_amount: amountEur,
      } as never,
    );

    if (rpcErr) {
      console.error("[topup-credits] RPC error:", rpcErr);
      return json({ error: "Errore ricarica: " + rpcErr.message }, 500);
    }

    const firstRow = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    const newBalance = Number((firstRow as any)?.new_balance ?? 0);

    // Generate invoice number
    const invoiceNum = `EIO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    // Create topup record
    await adminClient.from(topupTable as never).insert({
      company_id: companyId,
      amount_eur: amountEur,
      type: "manual",
      status: "completed",
      payment_method: paymentMethod || "manual_admin",
      invoice_number: invoiceNum,
      notes: topupNotes || null,
      triggered_by: user.id,
      processed_at: new Date().toISOString(),
    } as never);

    // Audit log (best effort, only exists for ai_agents)
    if (service === "ai_agents") {
      await adminClient.from("ai_agent_audit_log").insert({
        company_id: companyId,
        agent_id: null,
        user_id: user.id,
        action: "credit_topup",
        details: {
          amount_eur: amountEur,
          new_balance: newBalance,
          invoice: invoiceNum,
          payment_method: paymentMethod,
          service,
        },
      });
    }

    // Auto-generate invoice via SDI if configured
    const { data: anagrafica } = await adminClient
      .from("anagrafica_azienda" as never)
      .select("sdi_provider")
      .eq("company_id", companyId)
      .maybeSingle();

    if ((anagrafica as any)?.sdi_provider && (anagrafica as any).sdi_provider !== "manuale") {
      adminClient.functions.invoke("invia-sdi", {
        body: {
          company_id: companyId,
          tipo: "TD01",
          auto_generated: true,
          invoice_data: {
            number: invoiceNum,
            description: `${SERVICE_LABELS[service] || "Crediti servizi"} — ${invoiceNum}`,
            amount_net: amountEur,
            vat_rate: 22,
            vat_amount: Number((amountEur * 0.22).toFixed(2)),
            total: Number((amountEur * 1.22).toFixed(2)),
          },
        },
      }).catch((e: unknown) => console.error("[topup] fattura auto-gen failed:", e));
    }

    return json({
      success: true,
      new_balance_eur: newBalance,
      invoice_number: invoiceNum,
      service,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("topup-credits error:", message);
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...secureHeaders, "Content-Type": "application/json" },
  });
}
