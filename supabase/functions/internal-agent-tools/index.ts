import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

/**
 * internal-agent-tools — Webhook chiamato da ElevenLabs DURANTE la conversazione
 * per eseguire i tool CRM degli agenti interni.
 *
 * ElevenLabs invia POST con { tool_name, parameters } e si aspetta una risposta JSON.
 * Auth: Service Role Key nell'header (configurato su ElevenLabs), oppure nessun JWT.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json();

    // ElevenLabs sends tool calls in different formats depending on config.
    // We normalize to: tool_name + parameters
    const toolName: string = body.tool_name || body.name || body.tool || "";
    const params: Record<string, unknown> = body.parameters || body.params || body.input || body;

    if (!toolName) {
      return errorResponse("tool_name is required", 400);
    }

    let result: unknown;

    switch (toolName) {
      case "identify_caller":
        result = await identifyCaller(admin, params);
        break;
      case "get_client_info":
        result = await getClientInfo(admin, params);
        break;
      case "get_order_status":
        result = await getOrderStatus(admin, params);
        break;
      case "get_orders_list":
        result = await getOrdersList(admin, params);
        break;
      case "get_appointment_info":
        result = await getAppointmentInfo(admin, params);
        break;
      case "create_note":
        result = await createNote(admin, params);
        break;
      case "create_activity":
        result = await createActivity(admin, params);
        break;
      case "update_order_date":
        result = await updateOrderDate(admin, params);
        break;
      case "send_sms_confirmation":
        result = await sendSmsConfirmation(admin, params);
        break;
      case "create_support_ticket":
        result = await createSupportTicket(admin, params);
        break;
      case "schedule_callback":
        result = await scheduleCallback(admin, params);
        break;
      default:
        return errorResponse(`Tool sconosciuto: ${toolName}`, 400);
    }

    return jsonResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore interno";
    console.error(`internal-agent-tools error [${new Date().toISOString()}]:`, message);
    return errorResponse(message, 500);
  }
});

// ==================== TOOL IMPLEMENTATIONS ====================

type AdminClient = ReturnType<typeof createClient>;

/**
 * identify_caller — Identifica il chiamante per numero di telefono.
 * Ritorna nome, contact_id, ultimo ordine.
 */
async function identifyCaller(admin: AdminClient, params: Record<string, unknown>) {
  const phone = normalizePhone(String(params.caller_phone || ""));
  if (!phone) return { found: false, message: "Numero di telefono non fornito" };

  // Search in marketing_contacts by phone
  const { data: contacts } = await admin
    .from("marketing_contacts")
    .select("id, first_name, last_name, email, phone, company_id, tags, score, assigned_to")
    .or(`phone.eq.${phone},phone.ilike.%${phone.slice(-9)}%`)
    .limit(1);

  if (!contacts || contacts.length === 0) {
    return { found: false, message: "Chiamante non trovato nel CRM" };
  }

  const contact = contacts[0];

  // Get latest order
  const { data: orders } = await admin
    .from("orders")
    .select("id, description, total_amount, expected_date, current_status_id")
    .eq("customer_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const lastOrder = orders?.[0] || null;

  return {
    found: true,
    contact_id: contact.id,
    contact_name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
    email: contact.email,
    phone: contact.phone,
    company_id: contact.company_id,
    tags: contact.tags,
    score: contact.score,
    last_order: lastOrder
      ? {
          id: lastOrder.id,
          description: lastOrder.description,
          total_amount: lastOrder.total_amount,
          expected_date: lastOrder.expected_date,
        }
      : null,
  };
}

/**
 * get_client_info — Profilo completo del cliente.
 */
async function getClientInfo(admin: AdminClient, params: Record<string, unknown>) {
  const contactId = String(params.contact_id || "");
  if (!contactId) return { error: "contact_id richiesto" };

  const { data: contact } = await admin
    .from("marketing_contacts")
    .select("id, first_name, last_name, email, phone, company_id, contact_type, source, tags, score, assigned_to, created_at")
    .eq("id", contactId)
    .single();

  if (!contact) return { error: "Contatto non trovato" };

  // Get recent notes
  const { data: notes } = await admin
    .from("marketing_contact_notes")
    .select("id, content, created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(5);

  // Get recent activities
  const { data: activities } = await admin
    .from("marketing_contact_activities")
    .select("id, activity_type, description, created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(5);

  return {
    contact,
    recent_notes: notes || [],
    recent_activities: activities || [],
  };
}

/**
 * get_order_status — Stato ordine specifico o ultimo ordine del contatto.
 */
async function getOrderStatus(admin: AdminClient, params: Record<string, unknown>) {
  const contactId = String(params.contact_id || "");
  const orderId = params.order_id ? String(params.order_id) : null;

  let query = admin
    .from("orders")
    .select("id, order_code, description, total_amount, expected_date, work_start_date, work_end_date, internal_notes, created_at, balance_amount, balance_paid, deposit_amount, deposit_paid");

  if (orderId) {
    query = query.eq("id", orderId);
  } else if (contactId) {
    query = query.eq("customer_id", contactId).order("created_at", { ascending: false }).limit(1);
  } else {
    return { error: "contact_id o order_id richiesto" };
  }

  const { data: orders } = await query;
  const order = orders?.[0];

  if (!order) return { error: "Ordine non trovato" };

  // Get current status name
  let statusName = "Sconosciuto";
  if ((order as any).current_status_id) {
    const { data: status } = await admin
      .from("order_statuses")
      .select("name")
      .eq("id", (order as any).current_status_id)
      .single();
    if (status) statusName = status.name;
  }

  return {
    order_id: order.id,
    order_code: order.order_code,
    description: order.description,
    status: statusName,
    total_amount: order.total_amount,
    deposit_amount: order.deposit_amount,
    deposit_paid: order.deposit_paid,
    balance_amount: order.balance_amount,
    balance_paid: order.balance_paid,
    expected_date: order.expected_date,
    work_start_date: order.work_start_date,
    work_end_date: order.work_end_date,
  };
}

/**
 * get_orders_list — Lista ordini attivi del cliente.
 */
async function getOrdersList(admin: AdminClient, params: Record<string, unknown>) {
  const contactId = String(params.contact_id || "");
  if (!contactId) return { error: "contact_id richiesto" };

  const { data: orders } = await admin
    .from("orders")
    .select("id, order_code, description, total_amount, expected_date, work_start_date, created_at")
    .eq("customer_id", contactId)
    .order("created_at", { ascending: false })
    .limit(10);

  return { orders: orders || [], count: orders?.length || 0 };
}

/**
 * get_appointment_info — Prossimi appuntamenti del cliente.
 */
async function getAppointmentInfo(admin: AdminClient, params: Record<string, unknown>) {
  const contactId = String(params.contact_id || "");
  if (!contactId) return { error: "contact_id richiesto" };

  const today = new Date().toISOString().split("T")[0];

  const { data: appointments } = await admin
    .from("appointments")
    .select("id, title, appointment_date, appointment_time, appointment_end_time, appointment_type, status, description")
    .eq("contact_id", contactId)
    .gte("appointment_date", today)
    .eq("is_blocked_slot", false)
    .order("appointment_date", { ascending: true })
    .limit(5);

  return { appointments: appointments || [], count: appointments?.length || 0 };
}

/**
 * create_note — Crea nota su contatto CRM.
 */
async function createNote(admin: AdminClient, params: Record<string, unknown>) {
  const contactId = String(params.contact_id || "");
  const content = String(params.content || "");
  if (!contactId || !content) return { error: "contact_id e content richiesti" };

  // Get company_id from contact
  const { data: contact } = await admin
    .from("marketing_contacts")
    .select("company_id")
    .eq("id", contactId)
    .single();

  if (!contact) return { error: "Contatto non trovato" };

  const { data: note, error } = await admin
    .from("marketing_contact_notes")
    .insert({
      contact_id: contactId,
      company_id: contact.company_id,
      content,
      is_private: params.is_private === true,
      created_by: contactId, // placeholder — will be overridden by webhook with actual user
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  return { success: true, note_id: note?.id, message: "Nota creata con successo" };
}

/**
 * create_activity — Crea attività/task.
 */
async function createActivity(admin: AdminClient, params: Record<string, unknown>) {
  const contactId = String(params.contact_id || "");
  const title = String(params.title || "");
  if (!contactId || !title) return { error: "contact_id e title richiesti" };

  const { data: contact } = await admin
    .from("marketing_contacts")
    .select("company_id, assigned_to")
    .eq("id", contactId)
    .single();

  if (!contact) return { error: "Contatto non trovato" };

  const assignedTo = params.assigned_to ? String(params.assigned_to) : contact.assigned_to;

  const { data: activity, error } = await admin
    .from("marketing_contact_activities")
    .insert({
      contact_id: contactId,
      company_id: contact.company_id,
      activity_type: "task",
      description: title,
      metadata: {
        due_date: params.due_date || null,
        priority: params.priority || "normale",
        source: "ai_agent_internal",
      },
      created_by: assignedTo || contactId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  return { success: true, activity_id: activity?.id, message: "Attività creata con successo" };
}

/**
 * update_order_date — Aggiorna expected_date su un ordine.
 */
async function updateOrderDate(admin: AdminClient, params: Record<string, unknown>) {
  const orderId = String(params.order_id || "");
  const newDate = String(params.new_date || "");
  if (!orderId || !newDate) return { error: "order_id e new_date richiesti" };

  const { error } = await admin
    .from("orders")
    .update({
      expected_date: newDate,
      internal_notes: params.reason
        ? `[AI Agent] Data aggiornata: ${params.reason}`
        : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (error) return { error: error.message };

  return { success: true, message: `Data lavori aggiornata a ${newDate}` };
}

/**
 * send_sms_confirmation — Invia SMS via Telnyx.
 */
async function sendSmsConfirmation(admin: AdminClient, params: Record<string, unknown>) {
  const phone = String(params.phone || "");
  const messageTemplate = String(params.message_template || params.message || "");
  if (!phone || !messageTemplate) return { error: "phone e message_template richiesti" };

  // Get Telnyx settings
  const { data: telnyxSettings } = await admin
    .from("telnyx_settings")
    .select("api_key_encrypted, messaging_profile_id, sender_number")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!telnyxSettings?.api_key_encrypted) {
    return { error: "Telnyx non configurato per SMS" };
  }

  try {
    const { decrypt, getEncryptionKey } = await import("../_shared/encryption.ts");
    const telnyxApiKey = await decrypt(telnyxSettings.api_key_encrypted, getEncryptionKey());

    // Apply template vars if provided
    let message = messageTemplate;
    if (params.vars && typeof params.vars === "object") {
      for (const [k, v] of Object.entries(params.vars as Record<string, string>)) {
        message = message.replace(new RegExp(`{{${k}}}`, "g"), String(v));
      }
    }

    const smsBody: Record<string, unknown> = {
      from: telnyxSettings.sender_number || "+39000000000",
      to: phone,
      text: message,
    };
    if (telnyxSettings.messaging_profile_id) {
      smsBody.messaging_profile_id = telnyxSettings.messaging_profile_id;
    }

    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${telnyxApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(smsBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { error: `Telnyx SMS error: ${errText}` };
    }

    return { success: true, message: "SMS inviato con successo" };
  } catch (e) {
    return { error: `SMS error: ${e instanceof Error ? e.message : "unknown"}` };
  }
}

/**
 * create_support_ticket — Crea segnalazione/reclamo.
 */
async function createSupportTicket(admin: AdminClient, params: Record<string, unknown>) {
  const contactId = String(params.contact_id || "");
  const title = String(params.title || "");
  const description = String(params.description || "");
  if (!contactId || !title) return { error: "contact_id e title richiesti" };

  const { data: contact } = await admin
    .from("marketing_contacts")
    .select("company_id, assigned_to")
    .eq("id", contactId)
    .single();

  if (!contact) return { error: "Contatto non trovato" };

  // Create as activity with type "ticket"
  const { data: ticket, error } = await admin
    .from("marketing_contact_activities")
    .insert({
      contact_id: contactId,
      company_id: contact.company_id,
      activity_type: "ticket",
      description: `[Segnalazione] ${title}: ${description}`,
      metadata: {
        priority: params.priority || "media",
        source: "ai_agent_internal",
        ticket_title: title,
        ticket_description: description,
      },
      created_by: contact.assigned_to || contactId,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  return { success: true, ticket_id: ticket?.id, message: "Segnalazione creata con successo" };
}

/**
 * schedule_callback — Programma richiamo.
 */
async function scheduleCallback(admin: AdminClient, params: Record<string, unknown>) {
  const contactId = String(params.contact_id || "");
  const callbackAt = String(params.callback_at || "");
  if (!contactId || !callbackAt) return { error: "contact_id e callback_at richiesti" };

  const { data: contact } = await admin
    .from("marketing_contacts")
    .select("company_id, assigned_to, first_name, last_name")
    .eq("id", contactId)
    .single();

  if (!contact) return { error: "Contatto non trovato" };

  const contactName = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
  const reason = params.reason ? String(params.reason) : "Richiamo programmato dall'agente AI";

  // Create appointment for callback
  const { data: appointment, error } = await admin
    .from("appointments")
    .insert({
      company_id: contact.company_id,
      contact_id: contactId,
      title: `Richiamo: ${contactName}`,
      description: reason,
      appointment_date: callbackAt.split("T")[0],
      appointment_time: callbackAt.includes("T") ? callbackAt.split("T")[1]?.substring(0, 5) : "09:00",
      appointment_type: "callback",
      assigned_to: contact.assigned_to,
      created_by: contact.assigned_to || contactId,
      status: "scheduled",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  return { success: true, appointment_id: appointment?.id, message: `Richiamo programmato per ${callbackAt}` };
}

// ==================== HELPERS ====================

function normalizePhone(phone: string): string {
  // Remove spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  // Ensure starts with +
  if (!cleaned.startsWith("+") && cleaned.length >= 9) {
    cleaned = "+39" + cleaned;
  }
  return cleaned;
}
