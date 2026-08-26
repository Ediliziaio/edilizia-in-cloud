import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { format, subDays } from "https://esm.sh/date-fns@3";

import { getCorsHeaders, errorResponse } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Sicurezza: accetta cron secret (SEC-003) oppure JWT utente valido.
    // 2026-08-05: aggiunto cronSecretValido — leggere solo INTERNAL_CRON_SECRET
    // era fail-closed su una variabile non valorizzata in produzione, e il job
    // mensile non e' mai riuscito ad autenticarsi.
    const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
    const requestCronSecret = req.headers.get("x-cron-secret");
    const isCronCall = (cronSecret && requestCronSecret === cronSecret) || cronSecretValido(req);

    if (!isCronCall) {
      if (!authHeader) {
        console.error("generate-recurring-costs: accesso non autorizzato (nessun auth)");
        return errorResponse("Non autorizzato", 401);
      }
      const token = authHeader.replace("Bearer ", "");
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
      if (authError || !user) {
        return errorResponse("Non autorizzato", 401);
      }
    }

    const body = await req.json().catch(() => ({}));
    const companyId = body.company_id;

    if (!companyId) {
      return new Response(JSON.stringify({ error: "company_id richiesto" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Find recurring costs with auto-generation enabled
    const { data: recurringCosts, error: fetchError } = await supabase
      .from("company_costs")
      .select("*")
      .eq("company_id", companyId)
      .eq("recurrence_auto", true)
      .neq("recurrence", "once");

    if (fetchError) throw fetchError;

    const now = new Date();
    const toInsert: any[] = [];

    for (const cost of (recurringCosts || [])) {
      // Check end date
      if (cost.recurrence_end_date && new Date(cost.recurrence_end_date) < now) {
        continue;
      }

      const baseDate = new Date(cost.due_date);
      const recurrence = cost.recurrence;
      const maxLookahead = 3;
      const horizon = new Date(now.getFullYear(), now.getMonth() + maxLookahead, 0);

      // Giorno ANCORA dal costo base, clampato all'ultimo giorno di ogni mese:
      // prima "31 gennaio + 1 mese" rollava al 3 marzo e da lì in poi tutte le
      // occorrenze cadevano il 3 — un'utenza di fine mese si sfasava per sempre.
      const anchorDay = baseDate.getDate();
      const stepMonths = recurrence === "monthly" ? 1 : recurrence === "quarterly" ? 3 : recurrence === "yearly" ? 12 : 0;
      if (stepMonths === 0) continue;

      for (let k = stepMonths; ; k += stepMonths) {
        const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + k + 1, 0).getDate();
        const nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + k, Math.min(anchorDay, lastDay));
        if (nextDate > horizon) break;
        if (cost.recurrence_end_date && nextDate > new Date(cost.recurrence_end_date)) break;
        if (nextDate < new Date(now.getFullYear(), now.getMonth(), 1)) continue;

        const dueDateStr = nextDate.toISOString().split("T")[0];

        toInsert.push({
          company_id: companyId,
          name: cost.name,
          cost_type: cost.cost_type,
          amount: cost.amount,
          category: cost.category,
          // L'occorrenza è la materializzazione di UN mese: nasce "once".
          // Se ereditasse "monthly", il run-rate dei fissi la conterebbe come
          // un costo mensile pieno in più a ogni giro del cron (madre + N
          // occorrenze = N+1 volte la stessa voce — il ×6 trovato nelle demo).
          recurrence: "once",
          due_date: dueDateStr,
          notes: cost.notes,
          supplier_id: cost.supplier_id,
          vat_rate: cost.vat_rate,
          // L'occorrenza porta con sé TUTTO il contesto del costo base:
          // prima perdeva commessa, riparto, sede e categoria di tesoreria —
          // ogni mese generato si staccava dal cantiere.
          order_id: cost.order_id ?? null,
          allocations: cost.allocations ?? null,
          sede_id: cost.sede_id ?? null,
          treasury_category_id: cost.treasury_category_id ?? null,
          payment_method: cost.payment_method ?? null,
          recurrence_auto: false,
        });
      }
    }

    let createdCount = 0;

    if (toInsert.length > 0) {
      // Bulk upsert — ignoreDuplicates skips rows that conflict on (company_id, name, due_date)
      const { data: inserted, error: insertError } = await supabase
        .from("company_costs")
        .upsert(toInsert, { onConflict: "company_id,name,due_date", ignoreDuplicates: true })
        .select("id");

      if (insertError) throw insertError;
      createdCount = inserted?.length ?? 0;
    }

    // Alert: check for overdue recurring costs (>7 days late, unpaid).
    // Scoped all'azienda chiamante: prima leggeva TUTTE le aziende col
    // service-role, per un console.log.
    const { data: overdueWarnings } = await supabase
      .from("company_costs")
      .select("id, name, amount, due_date, company_id")
      .eq("company_id", companyId)
      .eq("is_paid", false)
      .lt("due_date", format(subDays(new Date(), 7), "yyyy-MM-dd"))
      .eq("recurrence", "monthly");
    const companiesWithOverdue = [...new Set((overdueWarnings || []).map((c: any) => c.company_id))];
    console.log(`[ALERT] ${companiesWithOverdue.length} aziende con costi ricorrenti in ritardo`);

    return new Response(JSON.stringify({ success: true, created: createdCount }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore imprevisto";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
