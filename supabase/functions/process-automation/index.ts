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
    .select("id, version")
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

    // Check re-enrollment settings
    const { data: existingEnrollment } = await supabase
      .from("automation_enrollments")
      .select("id")
      .eq("flow_id", flow.id)
      .eq("entity_id", entity_id)
      .eq("status", "active")
      .maybeSingle();

    if (existingEnrollment) continue; // Already enrolled

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
  const rand = Math.random() * 100;
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
      // Log as placeholder — real push/email notification would need additional integration
      console.log(`[Notification] entity=${entityId} message=${cfg.notification_message}`);
      return { success: true, output: { action: "send_notification", placeholder: true } };
    }

    case "send_whatsapp": {
      return await executeSendWhatsApp(supabase, cfg, entityId, companyId);
    }

    case "send_email": {
      return await executeSendEmail(supabase, cfg, entityId, companyId);
    }

    case "send_sms":
    case "send_ai_message": {
      // Placeholder — these need external integrations
      console.log(`[${actionType}] entity=${entityId} config=`, JSON.stringify(cfg));
      return { success: true, output: { action: actionType, placeholder: true, message: "Integration pending" } };
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
}

// ────────────────────────────────────────────────────
// SEND EMAIL (real provider integration)
// ────────────────────────────────────────────────────
async function executeSendEmail(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  try {
    // Get contact info
    const { data: contact } = await supabase
      .from("marketing_contacts")
      .select("id, email, first_name, last_name, email_unsubscribed")
      .eq("id", entityId)
      .single();

    if (!contact?.email) {
      return { success: false, error: "Contact has no email address" };
    }
    if (contact.email_unsubscribed) {
      return { success: false, error: "Contact is unsubscribed" };
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

  // 2. Get contact phone
  const { data: contact } = await supabase
    .from("marketing_contacts")
    .select("phone, first_name, last_name, email")
    .eq("id", entityId)
    .single();

  if (!contact?.phone) {
    return { success: false, error: "Contatto senza numero di telefono" };
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
