import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { corsHeaders, getCorsHeaders } from "../_shared/headers.ts";

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

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { companyId, amountEur, service, paymentMethod, notes: topupNotes } = await req.json();

    if (!service || !TABLE_MAP[service]) {
      return json({ error: "Servizio non valido: " + service }, 400);
    }

    if (!companyId || !amountEur || amountEur < 5) {
      return json({ error: "Importo minimo €5.00" }, 400);
    }

    const creditsTable = TABLE_MAP[service];
    const topupTable   = TOPUP_TABLE_MAP[service];

    // Verify caller is super_admin or belongs to the requested company
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isSuperAdmin = (callerRoles || []).some((r: any) => r.role === "super_admin");

    if (!isSuperAdmin) {
      const { data: callerProfile } = await adminClient
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!callerProfile || callerProfile.company_id !== companyId) {
        return json({ error: "Non autorizzato" }, 403);
      }
    }

    // Get current credits
    const { data: credits } = await adminClient
      .from(creditsTable as never)
      .select("balance_eur, calls_blocked, blocked_reason, total_recharged_eur")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!credits) {
      // Auto-create if missing
      await adminClient.from(creditsTable as never).insert({ company_id: companyId } as never);
    }

    const currentBalance = (credits as any)?.balance_eur || 0;
    const newBalance = Number((currentBalance + amountEur).toFixed(4));

    // Update balance
    const updateData: Record<string, unknown> = {
      balance_eur: newBalance,
      total_recharged_eur: Number(((credits as any)?.total_recharged_eur || 0) + amountEur).toFixed(4),
      updated_at: new Date().toISOString(),
    };

    // Unblock if was blocked for balance_zero (works for all services)
    if ((credits as any)?.calls_blocked && (credits as any)?.blocked_reason === "balance_zero") {
      updateData.calls_blocked = false;
      updateData.blocked_at = null;
      updateData.blocked_reason = null;
    }
    // whatsapp uses sends_blocked
    if ((credits as any)?.sends_blocked) {
      updateData.sends_blocked = false;
    }

    await adminClient
      .from(creditsTable as never)
      .update(updateData as never)
      .eq("company_id" as never, companyId as never);

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
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
