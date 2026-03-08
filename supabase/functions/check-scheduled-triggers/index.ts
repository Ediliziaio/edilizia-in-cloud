import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

/** Verify that the caller is either a cron job (with x-cron-secret) or an authenticated user. */
function verifyCronOrAuth(req: Request): void {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  if (cronSecret && reqSecret === cronSecret) return;

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) return;

  throw new Response(JSON.stringify({ error: "Unauthorized: missing cron secret or JWT" }), {
    status: 401,
    headers: secureHeaders,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: Record<string, number> = {
    birthday: 0,
    custom_date: 0,
    opportunity_stale: 0,
    appointment_reminder_24h: 0,
    appointment_reminder_1h: 0,
    appointment_reminder_custom: 0,
    cash_flow_alert: 0,
    recurring_costs: 0,
  };

  try {
    verifyCronOrAuth(req);

    // Get all published flows
    const { data: flows } = await supabase
      .from("automation_flows")
      .select("id, company_id")
      .eq("status", "published");

    if (!flows || flows.length === 0) {
      return jsonResponse({ message: "No published flows", results });
    }

    // For each flow, get trigger nodes
    for (const flow of flows) {
      const { data: triggerNodes } = await supabase
        .from("automation_nodes")
        .select("id, config_json")
        .eq("flow_id", flow.id)
        .eq("node_type", "trigger");

      if (!triggerNodes) continue;

      for (const node of triggerNodes) {
        const cfg = node.config_json || {};
        const triggerEvent = cfg.trigger_event;

        switch (triggerEvent) {
          case "birthday_reminder": {
            const daysBefore = parseInt(cfg.days_before) || 0;
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + daysBefore);
            const month = targetDate.getMonth() + 1;
            const day = targetDate.getDate();

            const { data: contacts } = await supabase
              .from("marketing_contacts")
              .select("id")
              .eq("company_id", flow.company_id)
              .not("date_of_birth", "is", null);

            if (contacts) {
              for (const contact of contacts) {
                const { data: c } = await supabase
                  .from("marketing_contacts")
                  .select("id, date_of_birth")
                  .eq("id", contact.id)
                  .single();

                if (!c?.date_of_birth) continue;
                const dob = new Date(c.date_of_birth);
                if (dob.getMonth() + 1 === month && dob.getDate() === day) {
                  const today = new Date().toISOString().split("T")[0];
                  const { data: existing } = await supabase
                    .from("automation_trigger_events")
                    .select("id")
                    .eq("company_id", flow.company_id)
                    .eq("trigger_event", "birthday_reminder")
                    .eq("entity_id", c.id)
                    .gte("created_at", today)
                    .maybeSingle();

                  if (!existing) {
                    await supabase.from("automation_trigger_events").insert({
                      company_id: flow.company_id,
                      trigger_event: "birthday_reminder",
                      entity_id: c.id,
                      entity_type: "contact",
                      payload: { date_of_birth: c.date_of_birth, days_before: daysBefore },
                    });
                    results.birthday++;
                  }
                }
              }
            }
            break;
          }

          case "opportunity_stale": {
            const staleDays = parseInt(cfg.stale_days) || 30;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - staleDays);

            const { data: staleOpps } = await supabase
              .from("marketing_opportunities")
              .select("id, contact_id")
              .eq("company_id", flow.company_id)
              .eq("status", "open")
              .lt("updated_at", cutoff.toISOString());

            if (staleOpps) {
              const today = new Date().toISOString().split("T")[0];
              for (const opp of staleOpps) {
                if (!opp.contact_id) continue;
                const { data: existing } = await supabase
                  .from("automation_trigger_events")
                  .select("id")
                  .eq("company_id", flow.company_id)
                  .eq("trigger_event", "opportunity_stale")
                  .eq("entity_id", opp.contact_id)
                  .gte("created_at", today)
                  .maybeSingle();

                if (!existing) {
                  await supabase.from("automation_trigger_events").insert({
                    company_id: flow.company_id,
                    trigger_event: "opportunity_stale",
                    entity_id: opp.contact_id,
                    entity_type: "contact",
                    payload: { opportunity_id: opp.id, stale_days: staleDays },
                  });
                  results.opportunity_stale++;
                }
              }
            }
            break;
          }

          case "custom_date": {
            const dateField = cfg.date_field;
            const daysOffset = parseInt(cfg.days_offset) || 0;
            if (!dateField) break;

            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + daysOffset);
            const targetStr = targetDate.toISOString().split("T")[0];

            const { data: contacts } = await supabase
              .from("marketing_contacts")
              .select("id")
              .eq("company_id", flow.company_id)
              .eq(dateField, targetStr);

            if (contacts) {
              const today = new Date().toISOString().split("T")[0];
              for (const contact of contacts) {
                const { data: existing } = await supabase
                  .from("automation_trigger_events")
                  .select("id")
                  .eq("company_id", flow.company_id)
                  .eq("trigger_event", "custom_date")
                  .eq("entity_id", contact.id)
                  .gte("created_at", today)
                  .maybeSingle();

                if (!existing) {
                  await supabase.from("automation_trigger_events").insert({
                    company_id: flow.company_id,
                    trigger_event: "custom_date",
                    entity_id: contact.id,
                    entity_type: "contact",
                    payload: { date_field: dateField, days_offset: daysOffset, target_date: targetStr },
                  });
                  results.custom_date++;
                }
              }
            }
            break;
          }
        }
      }
    }

    // ── Custom Reminder Minutes (from appointments.reminder_minutes) ──
    const now = new Date();
    const { data: reminderApts } = await supabase
      .from("appointments")
      .select("id, title, appointment_date, appointment_time, assigned_to, company_id, contact_id, reminder_minutes")
      .eq("is_blocked_slot", false)
      .eq("reminder_sent", false)
      .neq("status", "annullato")
      .neq("status", "cancelled")
      .not("reminder_minutes", "is", null);

    if (reminderApts && reminderApts.length > 0) {
      for (const apt of reminderApts) {
        const aptDate = new Date(apt.appointment_date);
        if (apt.appointment_time) {
          const [hh, mm] = apt.appointment_time.split(":").map(Number);
          aptDate.setHours(hh || 0, mm || 0, 0, 0);
        } else {
          aptDate.setHours(9, 0, 0, 0);
        }

        const triggerAt = new Date(aptDate.getTime() - (apt.reminder_minutes || 0) * 60 * 1000);
        if (now >= triggerAt && now < aptDate) {
          // Mark as sent
          await supabase
            .from("appointments")
            .update({ reminder_sent: true })
            .eq("id", apt.id);

          // Send notification
          if (apt.assigned_to) {
            const label = apt.reminder_minutes === 1440 ? "24h" : apt.reminder_minutes === 60 ? "1h" : `${apt.reminder_minutes}min`;
            await supabase.from("lifecycle_notifications").insert({
              company_id: apt.company_id,
              user_id: apt.assigned_to,
              type: "appointment_reminder",
              title: `Promemoria appuntamento (${label})`,
              message: `Appuntamento "${apt.title}" il ${apt.appointment_date}${apt.appointment_time ? " alle " + apt.appointment_time : ""}.`,
              metadata: { appointment_id: apt.id, reminder_type: label },
            });
          }

          results.appointment_reminder_custom = (results.appointment_reminder_custom || 0) + 1;
        }
      }
    }

    // ── Appointment Reminders (24h and 1h before) ──
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: upcomingAppointments } = await supabase
      .from("appointments")
      .select("id, title, appointment_date, appointment_time, contact_id, company_id, assigned_to, calendar_id")
      .eq("is_blocked_slot", false)
      .neq("status", "annullato")
      .neq("status", "cancelled")
      .neq("status", "canceled")
      .gte("appointment_date", now.toISOString().split("T")[0])
      .lte("appointment_date", in24h.toISOString().split("T")[0]);

    if (upcomingAppointments && upcomingAppointments.length > 0) {
      for (const apt of upcomingAppointments) {
        const aptDate = new Date(apt.appointment_date);
        if (apt.appointment_time) {
          const [hh, mm] = apt.appointment_time.split(":").map(Number);
          aptDate.setHours(hh || 0, mm || 0, 0, 0);
        } else {
          aptDate.setHours(9, 0, 0, 0);
        }

        const diffMs = aptDate.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        // 24h reminder: between 23-25 hours away
        if (diffHours > 23 && diffHours <= 25) {
          const { data: alreadySent } = await supabase
            .from("appointment_reminders_sent")
            .select("id")
            .eq("appointment_id", apt.id)
            .eq("reminder_type", "24h")
            .maybeSingle();

          if (!alreadySent) {
            await supabase.from("appointment_reminders_sent").insert({
              appointment_id: apt.id,
              reminder_type: "24h",
            });

            if (apt.assigned_to) {
              await supabase.from("lifecycle_notifications").insert({
                company_id: apt.company_id,
                user_id: apt.assigned_to,
                type: "appointment_reminder",
                title: "Promemoria appuntamento (24h)",
                message: `Appuntamento "${apt.title}" domani${apt.appointment_time ? " alle " + apt.appointment_time : ""}.`,
                metadata: { appointment_id: apt.id, reminder_type: "24h" },
              });
            }

            if (apt.contact_id) {
              await supabase.from("automation_trigger_events").insert({
                company_id: apt.company_id,
                trigger_event: "appointment_reminder_24h",
                entity_id: apt.contact_id,
                entity_type: "contact",
                payload: { appointment_id: apt.id, title: apt.title, date: apt.appointment_date, time: apt.appointment_time },
              });
            }

            results.appointment_reminder_24h++;
          }
        }

        // 1h reminder: between 0.5-1.5 hours away
        if (diffHours > 0.5 && diffHours <= 1.5) {
          const { data: alreadySent } = await supabase
            .from("appointment_reminders_sent")
            .select("id")
            .eq("appointment_id", apt.id)
            .eq("reminder_type", "1h")
            .maybeSingle();

          if (!alreadySent) {
            await supabase.from("appointment_reminders_sent").insert({
              appointment_id: apt.id,
              reminder_type: "1h",
            });

            if (apt.assigned_to) {
              await supabase.from("lifecycle_notifications").insert({
                company_id: apt.company_id,
                user_id: apt.assigned_to,
                type: "appointment_reminder",
                title: "Promemoria appuntamento (1h)",
                message: `Appuntamento "${apt.title}" tra 1 ora${apt.appointment_time ? " alle " + apt.appointment_time : ""}.`,
                metadata: { appointment_id: apt.id, reminder_type: "1h" },
              });
            }

            if (apt.contact_id) {
              await supabase.from("automation_trigger_events").insert({
                company_id: apt.company_id,
                trigger_event: "appointment_reminder_1h",
                entity_id: apt.contact_id,
                entity_type: "contact",
                payload: { appointment_id: apt.id, title: apt.title, date: apt.appointment_date, time: apt.appointment_time },
              });
            }

            results.appointment_reminder_1h++;
          }
        }
      }
    }

    // ── Cash Flow Alert (daily check for negative next-month forecast) ──
    const today = new Date();
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const todayStr = today.toISOString().split("T")[0];

    // Get all companies
    const { data: allCompanies } = await supabase.from("companies").select("id").eq("status", "active");

    if (allCompanies) {
      for (const company of allCompanies) {
        // Check if already sent today
        const { data: alreadySent } = await supabase
          .from("lifecycle_notifications")
          .select("id")
          .eq("company_id", company.id)
          .eq("type", "cash_flow_alert")
          .gte("created_at", todayStr)
          .maybeSingle();

        if (alreadySent) continue;

        // Sum expected income (order_installments)
        const { data: incomeData } = await supabase
          .from("order_installments")
          .select("amount, order_id")
          .eq("is_paid", false)
          .gte("expected_date", nextMonthStart.toISOString().split("T")[0])
          .lte("expected_date", nextMonthEnd.toISOString().split("T")[0]);

        // Filter by company via orders
        let totalIncome = 0;
        if (incomeData && incomeData.length > 0) {
          const orderIds = [...new Set(incomeData.map(i => i.order_id))];
          const { data: companyOrders } = await supabase
            .from("orders")
            .select("id")
            .eq("company_id", company.id)
            .in("id", orderIds);

          const validOrderIds = new Set((companyOrders || []).map(o => o.id));
          totalIncome = incomeData.filter(i => validOrderIds.has(i.order_id)).reduce((s, i) => s + (i.amount || 0), 0);
        }

        // Sum expected costs
        const { data: costsData } = await supabase
          .from("company_costs")
          .select("amount")
          .eq("company_id", company.id)
          .eq("is_paid", false)
          .gte("due_date", nextMonthStart.toISOString().split("T")[0])
          .lte("due_date", nextMonthEnd.toISOString().split("T")[0]);

        const totalExpenses = (costsData || []).reduce((s, c) => s + (c.amount || 0), 0);
        const netForecast = totalIncome - totalExpenses;

        if (netForecast < 0) {
          // Get company admin user
          const { data: adminProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("company_id", company.id)
            .limit(1)
            .maybeSingle();

          if (adminProfile) {
            await supabase.from("lifecycle_notifications").insert({
              company_id: company.id,
              user_id: adminProfile.id,
              type: "cash_flow_alert",
              title: "⚠️ Cash flow negativo previsto",
              message: `Il saldo previsto per il prossimo mese è di €${netForecast.toFixed(2)}. Verifica le uscite programmate.`,
              metadata: { net_forecast: netForecast, month: nextMonthStart.toISOString().split("T")[0] },
            });
            results.cash_flow_alert++;
          }
        }
      }
    }

    return jsonResponse({ message: "Scheduled triggers checked", results });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("check-scheduled-triggers error:", err);
    return errorResponse(err.message || String(err), 500);
  }
});
