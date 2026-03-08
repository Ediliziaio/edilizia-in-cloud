import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";
import { sendViaProvider, loadProviderSettings } from "../_shared/emailProvider.ts";
import { deductEmailCredits } from "../_shared/emailCredits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AutomationNode {
  id: string;
  flow_id: string;
  company_id: string;
  node_type: string;
  config_json: Record<string, any>;
  label: string | null;
}

interface AutomationConnection {
  id: string;
  flow_id: string;
  from_node_id: string;
  to_node_id: string;
  label: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { action } = body;

    // ── 1. Trigger: fire a new automation ──
    if (action === "trigger") {
      return await handleTrigger(supabase, body);
    }

    // ── 2. Process queue: poll pending trigger events, then execute queue items ──
    if (action === "process_queue") {
      // First process any pending trigger events from DB triggers
      await processTriggerEvents(supabase);
      return await processQueue(supabase);
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("process-automation error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ────────────────────────────────────────────────────
// TRIGGER: Find matching published flows and enroll
// ────────────────────────────────────────────────────
async function handleTrigger(supabase: any, body: any) {
  const { trigger_event, company_id, entity_id, entity_type, payload } = body;

  if (!trigger_event || !company_id || !entity_id) {
    return jsonResponse({ error: "Missing trigger_event, company_id, or entity_id" }, 400);
  }

  // Find published flows for this company that have a trigger node matching this event
  const { data: flows, error: flowErr } = await supabase
    .from("automation_flows")
    .select("id, version, config_json")
    .eq("company_id", company_id)
    .eq("status", "published");

  if (flowErr) throw flowErr;
  if (!flows || flows.length === 0) {
    return jsonResponse({ message: "No published flows", enrolled: 0 });
  }

  let enrolled = 0;

  for (const flow of flows) {
    // Get trigger nodes
    const { data: nodes } = await supabase
      .from("automation_nodes")
      .select("*")
      .eq("flow_id", flow.id)
      .eq("node_type", "trigger");

    const matchingTrigger = nodes?.find(
      (n: AutomationNode) => n.config_json?.trigger_event === trigger_event
    );

    if (!matchingTrigger) continue;

    // Enrich payload with contact data for filter evaluation
    let enrichedPayload = payload || {};
    if (entity_id && (entity_type === "contact" || !entity_type)) {
      const { data: contactData } = await supabase
        .from("marketing_contacts")
        .select("*")
        .eq("id", entity_id)
        .maybeSingle();
      if (contactData) {
        enrichedPayload = { ...contactData, ...enrichedPayload };
      }
    }

    // Check if trigger filters match (basic evaluation)
    const filters = matchingTrigger.config_json?.filters;
    if (filters && filters.conditions?.length > 0) {
      if (!evaluateFilters(filters, enrichedPayload)) continue;
    }

    // Check re-enrollment settings (from flow config or trigger config)
    const flowSettings = flow.config_json?.settings || {};
    const allowReEnrollment = flowSettings.enable_reenrollment === true || matchingTrigger.config_json?.allow_re_enrollment === true;
    const { data: existingEnrollment } = await supabase
      .from("automation_enrollments")
      .select("id, status")
      .eq("flow_id", flow.id)
      .eq("entity_id", entity_id)
      .in("status", allowReEnrollment ? ["active"] : ["active", "completed"])
      .maybeSingle();

    if (existingEnrollment) continue; // Already enrolled or completed (no re-enrollment)

    // Create enrollment
    const { data: enrollment, error: enrollErr } = await supabase
      .from("automation_enrollments")
      .insert({
        flow_id: flow.id,
        company_id,
        entity_id,
        entity_type: entity_type || "contact",
        flow_version: flow.version,
        status: "active",
      })
      .select("id")
      .single();

    if (enrollErr) {
      console.error("Enrollment error:", enrollErr);
      continue;
    }

    // Find the first node after the trigger
    const { data: connections } = await supabase
      .from("automation_connections")
      .select("*")
      .eq("flow_id", flow.id)
      .eq("from_node_id", matchingTrigger.id);

    if (connections && connections.length > 0) {
      for (const conn of connections) {
        await supabase.from("automation_queue").insert({
          enrollment_id: enrollment.id,
          flow_id: flow.id,
          company_id,
          current_node_id: conn.to_node_id,
          entity_id,
          entity_type: entity_type || "contact",
          status: "pending",
          execute_at: new Date().toISOString(),
          context_json: { payload: payload || {}, branch: conn.label },
        });
      }
    }

    // Log trigger execution
    await supabase.from("automation_execution_log").insert({
      flow_id: flow.id,
      company_id,
      enrollment_id: enrollment.id,
      node_id: matchingTrigger.id,
      node_type: "trigger",
      status: "success",
      input_json: { trigger_event, entity_id, payload },
      output_json: { enrolled: true },
    });

    enrolled++;
  }

  return jsonResponse({ message: `Triggered`, enrolled });
}

// ────────────────────────────────────────────────────
// PROCESS QUEUE: Execute pending queue items
// ────────────────────────────────────────────────────
async function processQueue(supabase: any) {
  const now = new Date().toISOString();

  // Fetch up to 50 pending items ready to execute
  const { data: items, error } = await supabase
    .from("automation_queue")
    .select("*")
    .eq("status", "pending")
    .lte("execute_at", now)
    .order("execute_at", { ascending: true })
    .limit(50);

  if (error) throw error;
  if (!items || items.length === 0) {
    return jsonResponse({ processed: 0 });
  }

  let processed = 0;

  for (const item of items) {
    try {
      // Mark as processing
      await supabase
        .from("automation_queue")
        .update({ status: "processing", updated_at: now })
        .eq("id", item.id);

      // Get the node
      const { data: node } = await supabase
        .from("automation_nodes")
        .select("*")
        .eq("id", item.current_node_id)
        .single();

      if (!node) {
        await markQueueItem(supabase, item.id, "failed", "Node not found");
        continue;
      }

      // Execute the node
      const result = await executeNode(supabase, node, item);

      // Log execution
      await supabase.from("automation_execution_log").insert({
        flow_id: item.flow_id,
        company_id: item.company_id,
        enrollment_id: item.enrollment_id,
        node_id: node.id,
        node_type: node.node_type,
        status: result.success ? "success" : "error",
        input_json: { entity_id: item.entity_id, config: node.config_json },
        output_json: result.output || {},
        error_message: result.error || null,
      });

      if (!result.success) {
        // Retry logic
        const attempts = item.attempts + 1;
        if (attempts < item.max_attempts) {
          const retryAt = new Date(Date.now() + attempts * 60000).toISOString();
          await supabase
            .from("automation_queue")
            .update({ status: "pending", attempts, execute_at: retryAt, last_error: result.error, updated_at: now })
            .eq("id", item.id);
        } else {
          await markQueueItem(supabase, item.id, "failed", result.error);
        }
        continue;
      }

      // Mark current item as done
      await markQueueItem(supabase, item.id, "completed");

      // If node type is "goal" or "end_automation", complete enrollment
      if (node.node_type === "goal" || node.config_json?.action_type === "end_automation") {
        await supabase
          .from("automation_enrollments")
          .update({ status: "completed", updated_at: now })
          .eq("id", item.enrollment_id);
        continue;
      }

      // Queue next nodes
      await queueNextNodes(supabase, item, node, result);

      processed++;
    } catch (err: any) {
      console.error(`Queue item ${item.id} error:`, err);
      await markQueueItem(supabase, item.id, "failed", err.message);
    }
  }

  return jsonResponse({ processed });
}

// ────────────────────────────────────────────────────
// EXECUTE NODE
// ────────────────────────────────────────────────────
async function executeNode(supabase: any, node: AutomationNode, queueItem: any) {
  const cfg = node.config_json || {};
  const entityId = queueItem.entity_id;
  const companyId = queueItem.company_id;

  switch (node.node_type) {
    case "delay":
      return executeDelay(cfg);

    case "condition":
      return await executeCondition(supabase, cfg, entityId, companyId);

    case "split":
      return executeSplit(cfg);

    case "action":
      return await executeAction(supabase, cfg, entityId, companyId);

    case "goal":
      return { success: true, output: { reached: true } };

    default:
      return { success: true, output: { skipped: true, reason: `Unknown node_type: ${node.node_type}` } };
  }
}

// ── Delay ──
function executeDelay(cfg: Record<string, any>) {
  const value = parseInt(cfg.delay_value) || 1;
  const unit = cfg.delay_unit || "hours";
  const delayMs = unit === "days" ? value * 86400000 : value * 3600000;

  return {
    success: true,
    output: { delay_ms: delayMs, execute_at: new Date(Date.now() + delayMs).toISOString() },
    isDelay: true,
    delayMs,
  };
}

// ── Condition (If/Else) ──
async function executeCondition(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  // Get contact data
  const { data: contact } = await supabase
    .from("marketing_contacts")
    .select("*")
    .eq("id", entityId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!contact) {
    return { success: true, output: { branch: "no", reason: "Contact not found" }, branch: "no" };
  }

  const field = cfg.condition_field;
  const operator = cfg.condition_operator;
  const value = cfg.condition_value;

  const contactValue = contact[field];
  let result = false;

  switch (operator) {
    case "equals": result = String(contactValue) === String(value); break;
    case "not_equals": result = String(contactValue) !== String(value); break;
    case "contains": result = String(contactValue || "").includes(String(value)); break;
    case "is_empty": result = !contactValue; break;
    case "is_not_empty": result = !!contactValue; break;
    case "gt": result = Number(contactValue) > Number(value); break;
    case "lt": result = Number(contactValue) < Number(value); break;
    default: result = false;
  }

  return { success: true, output: { branch: result ? "yes" : "no", field, operator, value }, branch: result ? "yes" : "no" };
}

// ── Split ──
function executeSplit(cfg: Record<string, any>) {
  const splitA = parseInt(cfg.split_a) || 50;
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const rand = (arr[0] / 0xFFFFFFFF) * 100;
  const branch = rand < splitA ? "a" : "b";

  return { success: true, output: { branch, random: rand, split_a: splitA }, branch };
}

// ── Action ──
async function executeAction(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  const actionType = cfg.action_type;

  switch (actionType) {
    case "add_tag": {
      const tag = cfg.tag_name;
      if (!tag) return { success: false, error: "No tag_name configured" };
      const { data: contact } = await supabase
        .from("marketing_contacts")
        .select("tags")
        .eq("id", entityId)
        .single();
      const currentTags: string[] = contact?.tags || [];
      if (!currentTags.includes(tag)) {
        await supabase
          .from("marketing_contacts")
          .update({ tags: [...currentTags, tag] })
          .eq("id", entityId);
      }
      return { success: true, output: { action: "add_tag", tag } };
    }

    case "remove_tag": {
      const tag = cfg.tag_name;
      if (!tag) return { success: false, error: "No tag_name configured" };
      const { data: contact } = await supabase
        .from("marketing_contacts")
        .select("tags")
        .eq("id", entityId)
        .single();
      const currentTags: string[] = contact?.tags || [];
      await supabase
        .from("marketing_contacts")
        .update({ tags: currentTags.filter((t: string) => t !== tag) })
        .eq("id", entityId);
      return { success: true, output: { action: "remove_tag", tag } };
    }

    case "update_field": {
      const field = cfg.field_name;
      const value = cfg.field_value;
      if (!field) return { success: false, error: "No field_name configured" };
      await supabase
        .from("marketing_contacts")
        .update({ [field]: value })
        .eq("id", entityId);
      return { success: true, output: { action: "update_field", field, value } };
    }

    case "assign_user": {
      const userId = cfg.assign_to_user_id;
      if (!userId) return { success: false, error: "No assign_to_user_id configured" };
      await supabase
        .from("marketing_contacts")
        .update({ assigned_to: userId })
        .eq("id", entityId);
      return { success: true, output: { action: "assign_user", userId } };
    }

    case "create_opportunity": {
      const name = cfg.opportunity_name || "Nuova Opportunità";
      const value = cfg.opportunity_value || 0;
      const pipelineId = cfg.pipeline_id;
      const stageId = cfg.stage_id;

      const insertData: any = {
        name,
        value,
        contact_id: entityId,
        company_id: companyId,
        status: "open",
      };
      if (pipelineId) insertData.pipeline_id = pipelineId;
      if (stageId) insertData.stage_id = stageId;

      const { error } = await supabase
        .from("marketing_opportunities")
        .insert(insertData);
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "create_opportunity", name } };
    }

    case "move_opportunity": {
      const stageId = cfg.target_stage_id;
      if (!stageId) return { success: false, error: "No target_stage_id configured" };
      await supabase
        .from("marketing_opportunities")
        .update({ stage_id: stageId })
        .eq("contact_id", entityId)
        .eq("company_id", companyId)
        .eq("status", "open");
      return { success: true, output: { action: "move_opportunity", stageId } };
    }

    case "create_task": {
      const { error } = await supabase.from("tasks").insert({
        company_id: companyId,
        title: cfg.task_title || "Attività automatica",
        notes: cfg.task_notes || null,
        priority: cfg.task_priority || "normale",
        category: cfg.task_category || "generale",
        assigned_to: cfg.task_assigned_to || null,
        status: "da_fare",
        created_by: "00000000-0000-0000-0000-000000000000",
      });
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "create_task", title: cfg.task_title } };
    }

    case "send_notification": {
      // Insert real notification into lifecycle_notifications
      const title = cfg.notification_title || "Notifica automazione";
      const message = cfg.notification_message || "";
      const recipient = cfg.notification_recipient || "assigned";

      // Determine which company users should receive the notification
      let targetUserIds: string[] = [];
      if (recipient === "assigned") {
        const { data: contact } = await supabase
          .from("marketing_contacts")
          .select("assigned_to")
          .eq("id", entityId)
          .maybeSingle();
        if (contact?.assigned_to) targetUserIds = [contact.assigned_to];
      } else if (recipient === "all_admins") {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id")
          .eq("company_id", companyId);
        if (profiles) {
          const { data: adminRoles } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "company_admin")
            .in("user_id", profiles.map((p: any) => p.id));
          if (adminRoles) targetUserIds = adminRoles.map((r: any) => r.user_id);
        }
      } else {
        // Specific user ID
        targetUserIds = [recipient];
      }

      // Insert notification
      const { error: notifErr } = await supabase.from("lifecycle_notifications").insert({
        company_id: companyId,
        notification_type: "automation",
        title,
        message,
        metadata: { entity_id: entityId, automation: true, recipient_type: cfg.notification_recipient },
      });
      if (notifErr) return { success: false, error: notifErr.message };
      return { success: true, output: { action: "send_notification", title, recipients: targetUserIds.length } };
    }

    case "update_contact_score": {
      const mode = cfg.score_mode || "add";
      const value = parseInt(cfg.score_value) || 0;
      if (mode === "set") {
        await supabase.from("marketing_contacts").update({ score: value }).eq("id", entityId);
      } else if (mode === "subtract") {
        const { data: c } = await supabase.from("marketing_contacts").select("score").eq("id", entityId).single();
        const newScore = Math.max(0, (c?.score || 0) - value);
        await supabase.from("marketing_contacts").update({ score: newScore }).eq("id", entityId);
      } else {
        // add
        const { data: c } = await supabase.from("marketing_contacts").select("score").eq("id", entityId).single();
        const newScore = (c?.score || 0) + value;
        await supabase.from("marketing_contacts").update({ score: newScore }).eq("id", entityId);
      }
      return { success: true, output: { action: "update_contact_score", mode, value } };
    }

    case "send_whatsapp": {
      return await executeSendWhatsApp(supabase, cfg, entityId, companyId);
    }

    case "send_email": {
      return await executeSendEmail(supabase, cfg, entityId, companyId);
    }

    case "send_sms": {
      // Get contact phone
      const { data: smsContact } = await supabase
        .from("marketing_contacts")
        .select("phone")
        .eq("id", entityId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!smsContact?.phone) {
        return { success: false, error: "Contatto senza numero di telefono" };
      }

      const smsBody = cfg.sms_body || cfg.message || "Messaggio automatico";
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      try {
        const smsRes = await fetch(`${supabaseUrl}/functions/v1/telnyx-proxy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            action: "send_sms",
            company_id: companyId,
            payload: {
              to: smsContact.phone,
              body: smsBody,
              contact_id: entityId,
            },
          }),
        });
        const smsResult = await smsRes.json();
        if (!smsRes.ok || smsResult?.error) {
          return { success: false, error: smsResult?.error || `HTTP ${smsRes.status}` };
        }
        return { success: true, output: { action: "send_sms", message_id: smsResult?.message_id } };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    case "send_ai_message": {
      console.log(`[send_ai_message] entity=${entityId} config=`, JSON.stringify(cfg));
      return { success: true, output: { action: "send_ai_message", placeholder: true, message: "Integration pending" } };
    }

    case "remove_from_automation": {
      const targetFlowId = cfg.target_flow_id;
      if (!targetFlowId) return { success: false, error: "No target_flow_id configured" };
      // Remove active enrollments for this entity in the target flow
      const { data: removed, error: removeErr } = await supabase
        .from("automation_enrollments")
        .update({ status: "removed", updated_at: new Date().toISOString() })
        .eq("flow_id", targetFlowId)
        .eq("entity_id", entityId)
        .eq("status", "active")
        .select("id");
      if (removeErr) return { success: false, error: removeErr.message };
      // Also cancel any pending queue items for these enrollments
      if (removed && removed.length > 0) {
        for (const enrollment of removed) {
          await supabase
            .from("automation_queue")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("enrollment_id", enrollment.id)
            .eq("status", "pending");
        }
      }
      return { success: true, output: { action: "remove_from_automation", target_flow_id: targetFlowId, removed_count: removed?.length || 0 } };
    }

    case "wait_for_event": {
      // This action puts the enrollment in a "waiting" state
      // The actual waiting is handled by setting a delayed queue item
      // When the awaited event fires, processTriggerEvents will check for waiting enrollments
      return {
        success: true,
        output: { action: "wait_for_event", waiting: true, await_event: cfg.await_event, timeout_days: cfg.timeout_days || 7 },
        isWaiting: true,
        awaitEvent: cfg.await_event,
        timeoutDays: parseInt(cfg.timeout_days) || 7,
      };
    }

    case "webhook_out": {
      const url = cfg.webhook_url;
      if (!url) return { success: false, error: "No webhook_url configured" };
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_id: entityId, company_id: companyId, config: cfg }),
        });
        const text = await resp.text();
        return { success: resp.ok, output: { action: "webhook_out", status: resp.status, body: text.slice(0, 500) }, error: resp.ok ? undefined : `HTTP ${resp.status}` };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    case "end_automation":
      return { success: true, output: { action: "end_automation" } };

    case "sync_google":
      return await executeSyncGoogle(supabase, cfg, entityId, companyId);

    case "sync_meta_lead":
      return await executeSyncMetaLead(supabase, cfg, entityId, companyId);

    case "call_with_ai_agent": {
      const aiAgentId = cfg.ai_agent_id;
      if (!aiAgentId) return { success: false, error: "No ai_agent_id configured" };
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const resp = await fetch(`${supabaseUrl}/functions/v1/initiate-outbound-call`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ agent_id: aiAgentId, contact_id: entityId }),
        });
        const result = await resp.json();
        if (!resp.ok) return { success: false, error: result?.error || `HTTP ${resp.status}` };
        return { success: true, output: { action: "call_with_ai_agent", agent_id: aiAgentId, ...result } };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    default:
      return { success: true, output: { action: actionType, skipped: true, reason: "Not implemented yet" } };
  }
}

// ────────────────────────────────────────────────────
// QUEUE NEXT NODES
// ────────────────────────────────────────────────────
async function queueNextNodes(supabase: any, queueItem: any, node: AutomationNode, result: any) {
  // Get all connections from this node
  const { data: connections } = await supabase
    .from("automation_connections")
    .select("*")
    .eq("flow_id", queueItem.flow_id)
    .eq("from_node_id", node.id);

  if (!connections || connections.length === 0) {
    // No next node — complete enrollment
    await supabase
      .from("automation_enrollments")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", queueItem.enrollment_id);
    return;
  }

  // For branching nodes, filter connections by branch label
  let nextConns = connections;
  if (result.branch && (node.node_type === "condition" || node.node_type === "split")) {
    nextConns = connections.filter((c: AutomationConnection) => c.label === result.branch);
    // If no labeled connections found, fall back to all connections
    if (nextConns.length === 0) nextConns = connections;
  }

  // Handle wait_for_event: create a "waiting" queue item with timeout
  if (result.isWaiting) {
    const timeoutMs = (result.timeoutDays || 7) * 86400000;
    const timeoutAt = new Date(Date.now() + timeoutMs).toISOString();

    // Update enrollment status to "waiting"
    await supabase
      .from("automation_enrollments")
      .update({ status: "waiting", updated_at: new Date().toISOString() })
      .eq("id", queueItem.enrollment_id);

    // Create a timeout queue item that will fire on the "timeout" branch
    for (const conn of nextConns) {
      if (conn.label === "timeout") {
        await supabase.from("automation_queue").insert({
          enrollment_id: queueItem.enrollment_id,
          flow_id: queueItem.flow_id,
          company_id: queueItem.company_id,
          current_node_id: conn.to_node_id,
          entity_id: queueItem.entity_id,
          entity_type: queueItem.entity_type,
          status: "waiting",
          execute_at: timeoutAt,
          context_json: { ...queueItem.context_json, branch: "timeout", await_event: result.awaitEvent, waiting_for: result.awaitEvent, wait_node_id: node.id },
        });
      }
    }
    return;
  }

  for (const conn of nextConns) {
    const executeAt = result.isDelay
      ? new Date(Date.now() + (result.delayMs || 0)).toISOString()
      : new Date().toISOString();

    await supabase.from("automation_queue").insert({
      enrollment_id: queueItem.enrollment_id,
      flow_id: queueItem.flow_id,
      company_id: queueItem.company_id,
      current_node_id: conn.to_node_id,
      entity_id: queueItem.entity_id,
      entity_type: queueItem.entity_type,
      status: "pending",
      execute_at: executeAt,
      context_json: { ...queueItem.context_json, branch: conn.label, prev_result: result.output },
    });
  }
}

// ────────────────────────────────────────────────────
// FILTER EVALUATION (basic)
// ────────────────────────────────────────────────────
function evaluateFilters(filters: any, payload: Record<string, any>): boolean {
  if (!filters || !filters.conditions) return true;
  const logic = filters.logic || "AND";
  const results = filters.conditions.map((c: any) => {
    if (c.logic) return evaluateFilters(c, payload); // Nested group
    const actual = payload[c.field];
    let match = false;
    switch (c.operator) {
      case "equals": match = String(actual) === String(c.value); break;
      case "not_equals": match = String(actual) !== String(c.value); break;
      case "contains": match = String(actual || "").includes(String(c.value)); break;
      case "is_empty": match = !actual; break;
      case "is_not_empty": match = !!actual; break;
      default: match = true;
    }
    return c.negate ? !match : match;
  });
  return logic === "AND" ? results.every(Boolean) : results.some(Boolean);
}

// ────────────────────────────────────────────────────
// PROCESS TRIGGER EVENTS (from DB triggers)
// ────────────────────────────────────────────────────
async function processTriggerEvents(supabase: any) {
  const { data: events } = await supabase
    .from("automation_trigger_events")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(100);

  if (!events || events.length === 0) return;

  for (const evt of events) {
    try {
      // Check if any enrollments are waiting for this event
      await resolveWaitingEnrollments(supabase, evt);

      await handleTrigger(supabase, {
        trigger_event: evt.trigger_event,
        company_id: evt.company_id,
        entity_id: evt.entity_id,
        entity_type: evt.entity_type,
        payload: evt.payload,
      });
    } catch (err: any) {
      console.error(`Trigger event ${evt.id} error:`, err);
    }
    // Mark as processed regardless
    await supabase
      .from("automation_trigger_events")
      .update({ processed: true })
      .eq("id", evt.id);
  }

  // Process waiting queue items that have timed out
  await processWaitingTimeouts(supabase);
}

// ────────────────────────────────────────────────────
// RESOLVE WAITING ENROLLMENTS (wait_for_event)
// ────────────────────────────────────────────────────
async function resolveWaitingEnrollments(supabase: any, evt: any) {
  // Find waiting queue items for this entity and event
  const { data: waitingItems } = await supabase
    .from("automation_queue")
    .select("*")
    .eq("entity_id", evt.entity_id)
    .eq("status", "waiting")
    .limit(50);

  if (!waitingItems || waitingItems.length === 0) return;

  for (const item of waitingItems) {
    const awaitEvent = item.context_json?.waiting_for || item.context_json?.await_event;
    if (awaitEvent !== evt.trigger_event) continue;

    // Event matched! Get the connections from the wait_for_event node's "event" branch
    const { data: connections } = await supabase
      .from("automation_connections")
      .select("*")
      .eq("flow_id", item.flow_id);

    // Find the node that produced this waiting item - look for connections with label "event" or default
    // Cancel the timeout queue item
    await supabase
      .from("automation_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("enrollment_id", item.enrollment_id)
      .eq("status", "waiting");

    // Reactivate enrollment
    await supabase
      .from("automation_enrollments")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", item.enrollment_id);

    // Find the "event" branch connections
    if (connections) {
      // Get the action node that created this wait - we need the parent node
      const parentNodeId = item.context_json?.wait_node_id;
      if (parentNodeId) {
        const eventConns = connections.filter((c: any) => c.from_node_id === parentNodeId && c.label === "event");
        for (const conn of eventConns) {
          await supabase.from("automation_queue").insert({
            enrollment_id: item.enrollment_id,
            flow_id: item.flow_id,
            company_id: item.company_id,
            current_node_id: conn.to_node_id,
            entity_id: item.entity_id,
            entity_type: item.entity_type,
            status: "pending",
            execute_at: new Date().toISOString(),
            context_json: { ...item.context_json, branch: "event", resolved_event: evt.trigger_event },
          });
        }
      }
    }
  }
}

// ────────────────────────────────────────────────────
// PROCESS WAITING TIMEOUTS
// ────────────────────────────────────────────────────
async function processWaitingTimeouts(supabase: any) {
  const now = new Date().toISOString();

  // Find waiting items whose execute_at has passed (timeout)
  const { data: timedOut } = await supabase
    .from("automation_queue")
    .select("*")
    .eq("status", "waiting")
    .lte("execute_at", now)
    .limit(50);

  if (!timedOut || timedOut.length === 0) return;

  for (const item of timedOut) {
    // Mark as completed (timeout fired)
    await supabase
      .from("automation_queue")
      .update({ status: "completed", updated_at: now })
      .eq("id", item.id);

    // Reactivate enrollment
    await supabase
      .from("automation_enrollments")
      .update({ status: "active", updated_at: now })
      .eq("id", item.enrollment_id);

    // The timeout branch node is already set as current_node_id, so execute it
    // Re-insert as pending for immediate processing
    await supabase.from("automation_queue").insert({
      enrollment_id: item.enrollment_id,
      flow_id: item.flow_id,
      company_id: item.company_id,
      current_node_id: item.current_node_id,
      entity_id: item.entity_id,
      entity_type: item.entity_type,
      status: "pending",
      execute_at: now,
      context_json: { ...item.context_json, timeout_fired: true },
    });
  }
}

// ────────────────────────────────────────────────────
// SEND EMAIL (real provider integration)
// ────────────────────────────────────────────────────
async function executeSendEmail(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  try {
    // Get contact info
    const { data: contact } = await supabase
      .from("marketing_contacts")
      .select("id, email, first_name, last_name, unsubscribed, optout_email")
      .eq("id", entityId)
      .single();

    if (!contact?.email) {
      return { success: false, error: "Contact has no email address" };
    }
    if (contact.unsubscribed || contact.optout_email) {
      return { success: false, error: "Contact has opted out of email" };
    }

    // Determine stream (default: marketing)
    const stream = cfg.stream || "marketing";
    const settings = await loadProviderSettings(stream);

    if (!settings.apiKey) {
      return { success: false, error: `No API key configured for ${stream} email provider` };
    }

    // Build email content
    let html = cfg.email_body || cfg.html || "<p>No content</p>";
    const subject = cfg.email_subject || cfg.subject || "Messaggio";

    // Personalization
    html = html
      .replace(/\{\{first_name\}\}/g, contact.first_name || "")
      .replace(/\{\{last_name\}\}/g, contact.last_name || "")
      .replace(/\{\{email\}\}/g, contact.email || "");

    // Inject tracking pixel and unsubscribe link for marketing emails
    if (stream === "marketing") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const trackingPixel = `<img src="${supabaseUrl}/functions/v1/track-email?type=open&contact=${contact.id}&company=${companyId}" width="1" height="1" style="display:none" alt="" />`;
      const unsubLink = `${supabaseUrl}/functions/v1/track-email?type=unsubscribe&contact=${contact.id}&company=${companyId}`;

      // Inject pixel before </body> or at end
      if (html.includes("</body>")) {
        html = html.replace("</body>", `${trackingPixel}</body>`);
      } else {
        html += trackingPixel;
      }

      // Inject unsubscribe link if placeholder exists
      html = html.replace(/\{\{unsubscribe_url\}\}/g, unsubLink);
    }

    const fromAddress = cfg.from_email
      ? cfg.from_name ? `${cfg.from_name} <${cfg.from_email}>` : cfg.from_email
      : settings.fromDefault;

    // Deduct 1 credit for marketing emails (1 credit = cost per email from platform_settings)
    if (stream === "marketing") {
      try {
        // Get price per email from platform_settings
        const { data: priceSetting } = await supabase
          .from("platform_settings")
          .select("value")
          .eq("key", "credits_email_price_per_email")
          .maybeSingle();
        const costPerEmail = parseFloat(priceSetting?.value || "0.003");

        await deductEmailCredits(companyId, costPerEmail, {
          description: `Automazione email: ${subject}`,
          metadata: { contact_id: contact.id, stream, automation: true },
        });
      } catch (creditErr: any) {
        console.warn(`Credit deduction failed for company ${companyId}:`, creditErr.message);
        // Continue sending — don't block automation on credit failure
      }
    }

    const result = await sendViaProvider(settings.provider, settings.apiKey, {
      from: fromAddress,
      to: [contact.email],
      subject,
      html,
    }, { domain: settings.domain });

    // Log the send
    await supabase.from("email_logs").insert({
      contact_id: contact.id,
      company_id: companyId,
      status: result.ok ? "delivered" : "failed",
      provider: settings.provider,
      provider_message_id: result.providerMessageId || null,
      stream,
      event_timestamp: new Date().toISOString(),
      error_message: result.ok ? null : JSON.stringify(result.body),
    });

    // Fire-and-forget auto-topup check after marketing send
    if (stream === "marketing") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        fetch(`${supabaseUrl}/functions/v1/auto-topup-check`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ company_id: companyId }),
        }).catch(() => {});
      } catch {}
    }

    return {
      success: result.ok,
      output: { action: "send_email", provider: settings.provider, status: result.status },
      error: result.ok ? undefined : `Provider returned ${result.status}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ────────────────────────────────────────────────────
// SEND WHATSAPP (real Meta API integration)
// ────────────────────────────────────────────────────
async function executeSendWhatsApp(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  // 1. Get WhatsApp config for the company
  const { data: waConfig } = await supabase
    .from("messaging_whatsapp_config")
    .select("phone_number_id, access_token_encrypted")
    .eq("company_id", companyId)
    .eq("is_connected", true)
    .maybeSingle();

  if (!waConfig?.phone_number_id || !waConfig?.access_token_encrypted) {
    return { success: false, error: "WhatsApp non configurato o non attivo per questa azienda" };
  }

  // 2. Get contact phone + DND check
  const { data: contact } = await supabase
    .from("marketing_contacts")
    .select("phone, first_name, last_name, email, optout_whatsapp")
    .eq("id", entityId)
    .single();

  if (!contact?.phone) {
    return { success: false, error: "Contatto senza numero di telefono" };
  }
  if (contact.optout_whatsapp) {
    return { success: false, error: "Contact has opted out of WhatsApp" };
  }

  // 3. Decrypt token
  const encKey = getEncryptionKey();
  const accessToken = await decrypt(waConfig.access_token_encrypted, encKey);

  const cleanPhone = contact.phone.replace(/[^0-9]/g, "");

  // 4. Build message payload
  let messagePayload: Record<string, unknown>;

  if (cfg.whatsapp_template) {
    // Template message (Meta-approved)
    const components: any[] = [];
    if (cfg.whatsapp_text) {
      const resolvedText = resolveVariables(cfg.whatsapp_text, contact);
      components.push({
        type: "body",
        parameters: [{ type: "text", text: resolvedText }],
      });
    }
    messagePayload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "template",
      template: {
        name: cfg.whatsapp_template,
        language: { code: cfg.whatsapp_language || "it" },
        components: components.length > 0 ? components : undefined,
      },
    };
  } else {
    // Free-text message (only for open 24h conversations)
    const resolvedText = resolveVariables(cfg.whatsapp_text || "", contact);
    if (!resolvedText) {
      return { success: false, error: "Nessun testo configurato per il messaggio WhatsApp" };
    }
    messagePayload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "text",
      text: { body: resolvedText },
    };
  }

  // 5. Call Meta API
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messagePayload),
    }
  );

  const result = await res.json();

  if (!res.ok) {
    console.error("[send_whatsapp] Meta API error:", result);
    return { success: false, error: result.error?.message || "Errore Meta API" };
  }

  // 6. Log in contact_messages
  await supabase.from("contact_messages").insert({
    contact_id: entityId,
    company_id: companyId,
    channel: "whatsapp",
    content: cfg.whatsapp_text || cfg.whatsapp_template || "",
    status: "sent",
  });

  // 7. Log activity
  await supabase.from("marketing_contact_activities").insert({
    contact_id: entityId,
    company_id: companyId,
    activity_type: "message_sent",
    description: `Messaggio WhatsApp automatico inviato`,
    metadata: { channel: "whatsapp", status: "sent", meta_message_id: result.messages?.[0]?.id },
  });

  return { success: true, output: { whatsapp_message_id: result.messages?.[0]?.id } };
}

function resolveVariables(text: string, contact: any): string {
  return text
    .replace(/\{\{contact\.name\}\}/g, `${contact.first_name || ""} ${contact.last_name || ""}`.trim())
    .replace(/\{\{contact\.first_name\}\}/g, contact.first_name || "")
    .replace(/\{\{contact\.last_name\}\}/g, contact.last_name || "")
    .replace(/\{\{contact\.email\}\}/g, contact.email || "")
    .replace(/\{\{contact\.phone\}\}/g, contact.phone || "");
}

// ────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────
async function markQueueItem(supabase: any, id: string, status: string, error?: string) {
  await supabase
    .from("automation_queue")
    .update({ status, last_error: error || null, updated_at: new Date().toISOString() })
    .eq("id", id);
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ────────────────────────────────────────────────────
// SYNC GOOGLE CALENDAR
// ────────────────────────────────────────────────────
async function executeSyncGoogle(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  const syncAction = cfg.sync_action || "sync_event";

  if (syncAction === "sync_contact") {
    // Google Calendar doesn't have a contact sync concept — log and succeed
    console.log(`[sync_google] sync_contact for entity=${entityId} — logged (no GCal contact API)`);
    return { success: true, output: { action: "sync_google", sync_action: "sync_contact", logged: true } };
  }

  // sync_event: find the most recent appointment for this contact, then push to Google Calendar
  const { data: appointment } = await supabase
    .from("appointments")
    .select("*")
    .eq("contact_id", entityId)
    .eq("company_id", companyId)
    .order("appointment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!appointment) {
    return { success: true, output: { action: "sync_google", sync_action: "sync_event", skipped: true, reason: "No appointment found for contact" } };
  }

  // Find a Google Calendar connection for this company
  const { data: gcalConn } = await supabase
    .from("google_calendar_connections")
    .select("id, user_id, calendar_id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!gcalConn) {
    return { success: false, error: "No active Google Calendar connection for this company" };
  }

  // Call the existing google-calendar-sync edge function
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        action: "push-event",
        connectionId: gcalConn.id,
        appointmentId: appointment.id,
        companyId,
      }),
    });

    const text = await resp.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }

    if (!resp.ok) {
      return { success: false, error: `Google Calendar sync failed: HTTP ${resp.status}`, output: body };
    }

    return { success: true, output: { action: "sync_google", sync_action: "sync_event", appointment_id: appointment.id, gcal_response: body } };
  } catch (e: any) {
    return { success: false, error: `Google Calendar sync error: ${e.message}` };
  }
}

// ────────────────────────────────────────────────────
// SYNC META LEAD
// ────────────────────────────────────────────────────
async function executeSyncMetaLead(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  const syncAction = cfg.sync_action || "resync_lead";

  if (syncAction === "sync_contact") {
    console.log(`[sync_meta_lead] sync_contact for entity=${entityId} — logged`);
    return { success: true, output: { action: "sync_meta_lead", sync_action: "sync_contact", logged: true } };
  }

  // resync_lead: call meta-process-leads to re-process leads for this company
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Get the Meta config for this company
  const { data: metaConfig } = await supabase
    .from("meta_ad_accounts")
    .select("id, ad_account_id")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();

  if (!metaConfig) {
    return { success: true, output: { action: "sync_meta_lead", sync_action: "resync_lead", skipped: true, reason: "No Meta ad account configured" } };
  }

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/meta-process-leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        action: "process",
        companyId,
        adAccountId: metaConfig.ad_account_id,
      }),
    });

    const text = await resp.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }

    if (!resp.ok) {
      return { success: false, error: `Meta lead sync failed: HTTP ${resp.status}`, output: body };
    }

    return { success: true, output: { action: "sync_meta_lead", sync_action: "resync_lead", meta_response: body } };
  } catch (e: any) {
    return { success: false, error: `Meta lead sync error: ${e.message}` };
  }
}
