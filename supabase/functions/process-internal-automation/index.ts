import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch pending queue items (up to 50)
    const { data: queueItems, error: qErr } = await supabase
      .from("internal_automation_queue")
      .select("*")
      .eq("status", "pending")
      .lte("execute_at", new Date().toISOString())
      .order("execute_at", { ascending: true })
      .limit(50);

    if (qErr) throw qErr;
    if (!queueItems?.length) {
      return jsonResponse({ processed: 0 });
    }

    let processed = 0;
    let errors = 0;

    for (const job of queueItems) {
      try {
        // Mark as processing
        await supabase
          .from("internal_automation_queue")
          .update({ status: "processing", attempts: job.attempts + 1, updated_at: new Date().toISOString() })
          .eq("id", job.id);

        // Get node config
        const { data: node } = await supabase
          .from("internal_automation_nodes")
          .select("*")
          .eq("id", job.node_id)
          .single();

        if (!node) {
          await markJobFailed(supabase, job, "Node not found");
          errors++;
          continue;
        }

        const config = node.config_json as Record<string, any>;
        const context = (job.context_json || {}) as Record<string, any>;
        let actionResult: Record<string, any> = {};

        // ── Execute action based on node type ──
        if (node.node_type === "delay") {
          const delayMinutes = Number(config.delay_minutes) || 0;
          const delayHours = Number(config.delay_hours) || 0;
          const delayDays = Number(config.delay_days) || 0;
          const totalMs = ((delayDays * 24 + delayHours) * 60 + delayMinutes) * 60 * 1000;

          if (totalMs > 0) {
            const executeAt = new Date(Date.now() + totalMs).toISOString();
            const nextNodeId = await getNextNode(supabase, job.flow_id, node.id);
            if (nextNodeId) {
              await supabase.from("internal_automation_queue").insert({
                enrollment_id: job.enrollment_id,
                flow_id: job.flow_id,
                company_id: job.company_id,
                node_id: nextNodeId,
                entity_id: job.entity_id,
                entity_type: job.entity_type,
                execute_at: executeAt,
                context_json: context,
              });
            }
            await markJobCompleted(supabase, job);
            await logExecution(supabase, job, node, "success", {}, { delayed_until: executeAt });
            processed++;
            continue;
          }
          actionResult = { delay: "none" };
        } else if (node.node_type === "action") {
          const actionType = config.action_type || "";

          switch (actionType) {
            case "create_task": {
              const title = interpolate(config.task_title || "Attività automatica", context);
              const { error } = await supabase.from("tasks").insert({
                company_id: job.company_id,
                title,
                notes: interpolate(config.task_notes || "", context),
                priority: config.task_priority || "medium",
                category: config.task_category || "general",
                created_by: config.assign_to || context.created_by || job.entity_id,
                assigned_to: config.assign_to || null,
                order_id: job.entity_type === "order" ? job.entity_id : null,
                ticket_id: job.entity_type === "ticket" ? job.entity_id : null,
                due_date: config.task_due_days
                  ? new Date(Date.now() + Number(config.task_due_days) * 86400000).toISOString().split("T")[0]
                  : null,
              });
              if (error) throw error;
              actionResult = { created: "task", title };
              break;
            }

            case "update_order_status": {
              if (job.entity_type === "order" && config.new_status) {
                const { error } = await supabase.rpc("change_order_status", {
                  p_order_id: job.entity_id,
                  p_new_status_id: config.new_status,
                  p_changed_by: job.company_id,
                });
                if (error) throw error;
                actionResult = { updated: "order_status", new_status: config.new_status };
              }
              break;
            }

            case "send_notification": {
              const { error } = await supabase.from("lifecycle_notifications").insert({
                company_id: job.company_id,
                type: "automation",
                title: interpolate(config.notification_title || "Automazione", context),
                message: interpolate(config.notification_message || "", context),
                target_user_id: config.notify_user_id || null,
              });
              if (error) throw error;
              actionResult = { sent: "notification" };
              break;
            }

            case "create_ticket": {
              const { error } = await supabase.from("tickets").insert({
                company_id: job.company_id,
                subject: interpolate(config.ticket_subject || "Ticket automatico", context),
                priority: config.ticket_priority || "medium",
                customer_id: context.customer_id || context.created_by || job.entity_id,
                order_id: job.entity_type === "order" ? job.entity_id : null,
              });
              if (error) throw error;
              actionResult = { created: "ticket" };
              break;
            }

            case "create_calendar_event": {
              const { error } = await supabase.from("appointments").insert({
                company_id: job.company_id,
                title: interpolate(config.event_title || "Evento automatico", context),
                description: interpolate(config.event_description || "", context),
                appointment_date: config.event_date || new Date().toISOString().split("T")[0],
                appointment_time: config.event_time || null,
                created_by: context.created_by || job.entity_id,
              });
              if (error) throw error;
              actionResult = { created: "calendar_event" };
              break;
            }

            case "send_email": {
              const { error } = await supabase.from("lifecycle_notifications").insert({
                company_id: job.company_id,
                type: "email",
                title: interpolate(config.email_subject || "Email automatica", context),
                message: interpolate(config.email_body || "", context),
                target_user_id: config.notify_user_id || null,
              });
              if (error) throw error;
              actionResult = { sent: "email", to: config.email_to };
              break;
            }

            case "assign_employee": {
              // Assign employee to the entity (order or ticket)
              if (config.employee_id) {
                if (job.entity_type === "order") {
                  // Orders don't have assigned_to, so create a task instead
                  await supabase.from("tasks").insert({
                    company_id: job.company_id,
                    title: `Assegnazione ordine ${job.entity_id}`,
                    assigned_to: config.employee_id,
                    created_by: config.employee_id,
                    order_id: job.entity_id,
                    priority: "medium",
                    category: "assignment",
                  });
                } else if (job.entity_type === "ticket") {
                  await supabase
                    .from("tickets")
                    .update({ assigned_to: config.employee_id, updated_at: new Date().toISOString() })
                    .eq("id", job.entity_id);
                }
                actionResult = { assigned: config.employee_id, entity_type: job.entity_type };
              }
              break;
            }

            case "add_cost_record": {
              const { error } = await supabase.from("company_costs").insert({
                company_id: job.company_id,
                description: interpolate(config.cost_description || "Costo automatico", context),
                amount: Number(config.cost_amount) || 0,
                category: config.cost_category || "automazione",
                order_id: job.entity_type === "order" ? job.entity_id : null,
              });
              if (error) throw error;
              actionResult = { created: "cost_record" };
              break;
            }

            case "webhook": {
              if (config.webhook_url) {
                const body = JSON.stringify({
                  trigger: job.entity_type,
                  entity_id: job.entity_id,
                  company_id: job.company_id,
                  context,
                  ...(config.webhook_body ? JSON.parse(interpolate(config.webhook_body, context)) : {}),
                });
                const resp = await fetch(config.webhook_url, {
                  method: config.webhook_method || "POST",
                  headers: { "Content-Type": "application/json" },
                  body,
                });
                actionResult = { webhook: resp.status };
              }
              break;
            }

            default:
              actionResult = { skipped: true, reason: `Unknown action: ${actionType}` };
          }
        } else if (node.node_type === "condition") {
          const field = config.condition_field || "";
          const operator = config.condition_operator || "equals";
          const value = config.condition_value || "";
          const entityValue = String(getNestedValue(context, field) ?? "");

          let conditionMet = false;
          switch (operator) {
            case "equals": conditionMet = entityValue === value; break;
            case "not_equals": conditionMet = entityValue !== value; break;
            case "contains": conditionMet = entityValue.includes(value); break;
            case "greater_than": conditionMet = Number(entityValue) > Number(value); break;
            case "less_than": conditionMet = Number(entityValue) < Number(value); break;
            case "is_empty": conditionMet = !entityValue; break;
            case "is_not_empty": conditionMet = !!entityValue; break;
            default: conditionMet = entityValue === value;
          }

          const { data: conns } = await supabase
            .from("internal_automation_connections")
            .select("*")
            .eq("flow_id", job.flow_id)
            .eq("from_node_id", node.id);

          const branch = conditionMet ? "true" : "false";
          const nextConn = (conns || []).find((c: any) => c.label === branch);

          if (nextConn) {
            await supabase.from("internal_automation_queue").insert({
              enrollment_id: job.enrollment_id,
              flow_id: job.flow_id,
              company_id: job.company_id,
              node_id: nextConn.to_node_id,
              entity_id: job.entity_id,
              entity_type: job.entity_type,
              context_json: context,
            });
          }

          await markJobCompleted(supabase, job);
          await logExecution(supabase, job, node, "success", { field, operator, value, entityValue }, { branch });
          processed++;
          continue;
        }

        // Mark completed and advance
        await markJobCompleted(supabase, job);
        await logExecution(supabase, job, node, "success", config, actionResult);

        // Advance to next node
        const nextNodeId = await getNextNode(supabase, job.flow_id, node.id);
        if (nextNodeId) {
          await supabase.from("internal_automation_queue").insert({
            enrollment_id: job.enrollment_id,
            flow_id: job.flow_id,
            company_id: job.company_id,
            node_id: nextNodeId,
            entity_id: job.entity_id,
            entity_type: job.entity_type,
            context_json: context,
          });
        } else {
          // No more nodes — complete enrollment
          await supabase
            .from("internal_automation_enrollments")
            .update({ status: "completed", updated_at: new Date().toISOString() })
            .eq("id", job.enrollment_id);
          await supabase
            .from("internal_automation_flows")
            .update({ successful_runs: (await getFlowRuns(supabase, job.flow_id)).successful_runs + 1 })
            .eq("id", job.flow_id);
        }

        processed++;
      } catch (err: any) {
        errors++;
        await markJobFailed(supabase, job, err.message);
        await logExecution(supabase, job, { id: job.node_id, node_type: "action", config_json: {} } as any, "error", {}, { error: err.message });
      }
    }

    return jsonResponse({ processed, errors });
  } catch (err: any) {
    console.error("process-internal-automation error:", err);
    return errorResponse(err.message, 500);
  }
});

// ── Helpers ──────────────────────────────────────────

async function getNextNode(supabase: any, flowId: string, currentNodeId: string): Promise<string | null> {
  const { data } = await supabase
    .from("internal_automation_connections")
    .select("to_node_id")
    .eq("flow_id", flowId)
    .eq("from_node_id", currentNodeId)
    .limit(1)
    .single();
  return data?.to_node_id || null;
}

async function markJobCompleted(supabase: any, job: any) {
  await supabase
    .from("internal_automation_queue")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", job.id);
}

async function markJobFailed(supabase: any, job: any, error: string) {
  const maxAttempts = job.max_attempts || 3;
  const currentAttempts = (job.attempts || 0) + 1;
  const status = currentAttempts >= maxAttempts ? "failed" : "pending";
  const executeAt = status === "pending"
    ? new Date(Date.now() + Math.pow(2, currentAttempts) * 60000).toISOString()
    : undefined;
  await supabase
    .from("internal_automation_queue")
    .update({
      status,
      last_error: error,
      attempts: currentAttempts,
      updated_at: new Date().toISOString(),
      ...(executeAt ? { execute_at: executeAt } : {}),
    })
    .eq("id", job.id);
}

async function logExecution(supabase: any, job: any, node: any, status: string, input: any, output: any) {
  await supabase.from("internal_automation_execution_log").insert({
    flow_id: job.flow_id,
    enrollment_id: job.enrollment_id,
    company_id: job.company_id,
    node_id: node.id,
    node_type: node.node_type,
    status,
    input_json: input,
    output_json: output,
    error_message: status === "error" ? output?.error : null,
  });
}

async function getFlowRuns(supabase: any, flowId: string) {
  const { data } = await supabase
    .from("internal_automation_flows")
    .select("successful_runs")
    .eq("id", flowId)
    .single();
  return data || { successful_runs: 0 };
}

function interpolate(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    return String(getNestedValue(context, path) ?? "");
  });
}

function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}
