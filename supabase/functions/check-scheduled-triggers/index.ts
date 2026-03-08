import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  };

  try {
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

            // Find contacts with birthday matching month/day
            const { data: contacts } = await supabase
              .from("marketing_contacts")
              .select("id")
              .eq("company_id", flow.company_id)
              .not("date_of_birth", "is", null);

            if (contacts) {
              for (const contact of contacts) {
                // Need to check date_of_birth month/day - fetch individually
                const { data: c } = await supabase
                  .from("marketing_contacts")
                  .select("id, date_of_birth")
                  .eq("id", contact.id)
                  .single();

                if (!c?.date_of_birth) continue;
                const dob = new Date(c.date_of_birth);
                if (dob.getMonth() + 1 === month && dob.getDate() === day) {
                  // Check if already fired today
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
                // Deduplicate: don't fire twice today
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

    // ── Appointment Reminders (24h and 1h before) ──
    // This runs independently of flows - it sends notifications for ALL upcoming appointments
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);

    // Find appointments in the next 24h that haven't been reminded
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
        // Calculate exact appointment datetime
        const aptDate = new Date(apt.appointment_date);
        if (apt.appointment_time) {
          const [hh, mm] = apt.appointment_time.split(":").map(Number);
          aptDate.setHours(hh || 0, mm || 0, 0, 0);
        } else {
          aptDate.setHours(9, 0, 0, 0); // default 9am
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
            // Insert reminder tracking
            await supabase.from("appointment_reminders_sent").insert({
              appointment_id: apt.id,
              reminder_type: "24h",
            });

            // Fire notification to assigned user
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

            // Fire automation trigger if contact is linked
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

    return jsonResponse({ message: "Scheduled triggers checked", results });
  } catch (err: any) {
    console.error("check-scheduled-triggers error:", err);
    return jsonResponse({ error: err.message }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
