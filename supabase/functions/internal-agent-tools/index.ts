import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { risolviTelnyx, numeroMittenteAzienda } from "../_shared/telnyxApiKey.ts";
import { verificaFirmaElevenLabs, chiaveUrlValida } from "../_shared/elevenlabsWebhook.ts";
import { profiloPerConto } from "../_shared/ediliziaCustomerTools.ts";
// 18/10/2026: stato_consegna con fasi, prossima fase e prossimo appuntamento (fino a tre lavori).
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { sanitizePhoneForQuery } from "../_shared/webhookSecurity.ts";

/**
 * internal-agent-tools — Webhook chiamato da ElevenLabs DURANTE la conversazione
 * per eseguire i tool CRM degli agenti interni.
 *
 * ElevenLabs invia POST con { tool_name, parameters } e si aspetta una risposta JSON.
 * Auth: Service Role Key nell'header (configurato su ElevenLabs), oppure nessun JWT.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  // ── Auth ──
  // ElevenLabs NON firma le chiamate dei tool: pretendere `xi-signature`
  // significava rifiutare ogni tool reale (2026-05-27 → oggi, mai funzionato).
  // Come agent-tools: la credenziale sta nell'URL (?agent=<el_agent_id>&key=),
  // master secret o chiave derivata dell'azienda. Il legacy `xi-signature`
  // resta accettato per i chiamanti interni.
  const rawBody = await req.clone().text();
  const url = new URL(req.url);
  const elAgentFromUrl = url.searchParams.get("agent");
  let companyFromUrl: string | null = null;
  {
    const supabaseUrl0 = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey0 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin0 = createClient(supabaseUrl0, serviceRoleKey0, { auth: { autoRefreshToken: false, persistSession: false } });
    if (elAgentFromUrl) {
      const { data: ag } = await admin0.from("internal_ai_agents").select("company_id").eq("elevenlabs_agent_id", elAgentFromUrl).maybeSingle();
      companyFromUrl = (ag as { company_id?: string } | null)?.company_id ?? null;
    }
    const perUrl = await chiaveUrlValida(req, companyFromUrl);
    const perFirma = perUrl ? { ok: true as const } : await verificaFirmaElevenLabs(req, rawBody);
    if (!perUrl && !perFirma.ok) {
      console.warn("[INTERNAL-AGENT-TOOLS] rifiutata:", (perFirma as { motivo?: string }).motivo ?? "chiave URL non valida");
      return errorResponse("Unauthorized", 401);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = JSON.parse(rawBody);

    // ElevenLabs sends tool calls in different formats depending on config.
    // We normalize to: tool_name + parameters
    const toolName: string = body.tool_name || body.name || body.tool || "";
    const params: Record<string, unknown> = body.parameters || body.params || body.input || body;
    // SECURITY (audit run-1, cross-tenant): se la chiamata e' autenticata con la
    // chiave URL derivata di un'azienda, quell'azienda e' AUTORITATIVA. Forziamo
    // company_id al tenant del canale e ignoriamo qualsiasi company_id passato dal
    // modello: senza questo, chi possiede la chiave di un'azienda potrebbe operare
    // su un'altra scegliendo company_id/contact_id/order_id. Quando companyFromUrl
    // non e' noto (master secret / chiamante interno) resta il valore fornito.
    if (companyFromUrl) params.company_id = companyFromUrl;

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
  // P2-2: sanitize phone via helper condiviso prima di qualsiasi query.
  const safePhone = sanitizePhoneForQuery(String(params.caller_phone || ""));
  if (!safePhone) return { found: false, message: "Numero di telefono non fornito o non valido" };
  const phone = safePhone;

  // Search in marketing_contacts: prima match esatto, poi fallback suffix
  // ilike (safe perché il suffix viene solo da cifre sanificate).
  const exact = await admin
    .from("marketing_contacts")
    .select("id, first_name, last_name, email, phone, company_id, tags, score, assigned_to")
    // Tenancy: senza company_id il tool cercava in TUTTE le aziende.
    .match(typeof params.company_id === "string" ? { company_id: params.company_id } : {})
    .eq("phone", phone)
    .limit(1);

  let contacts = exact.data ?? [];
  if (contacts.length === 0) {
    const suffix = phone.replace(/\+/g, "").slice(-9);
    // SECURITY (audit run-1, HIGH cross-tenant): il fallback fuzzy DEVE restare
    // dentro l'azienda del canale, come il match esatto. Senza filtro, un suffisso
    // telefonico restituiva PII di contatti di altre aziende.
    const fuzzy = await admin
      .from("marketing_contacts")
      .select("id, first_name, last_name, email, phone, company_id, tags, score, assigned_to")
      .match(typeof params.company_id === "string" ? { company_id: params.company_id } : {})
      .ilike("phone", `%${suffix}%`)
      .limit(1);
    contacts = fuzzy.data ?? [];
  }

  if (contacts.length === 0) {
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
    // Tenancy: senza company_id il tool cercava in TUTTE le aziende.
    .match(typeof params.company_id === "string" ? { company_id: params.company_id } : {})
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
  // SECURITY (audit run-1, HIGH cross-tenant): vincola la ricerca al tenant del canale.
  const scoped = typeof params.company_id === "string" && params.company_id ? String(params.company_id) : null;

  let query = admin
    .from("orders")
    .select("id, company_id, current_status_id, order_code, description, total_amount, expected_date, work_start_date, work_end_date, internal_notes, created_at");

  if (orderId) {
    query = query.eq("id", orderId);
  } else if (contactId) {
    query = query.eq("customer_id", contactId).order("created_at", { ascending: false }).limit(1);
  } else {
    return { error: "contact_id o order_id richiesto" };
  }
  if (scoped) query = query.eq("company_id", scoped);

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

  // Pagamenti con la regola della scheda commessa: importi IVA inclusa, il saldo è il residuo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rate } = await (admin as any).rpc("silvio_tool_rate_commessa", {
    p_company_id: (order as any).company_id,
    p_order_id: order.id,
  });
  const pagamenti = rate?.ok
    ? {
        valore_ivato_eur: rate.valore_ivato_eur,
        incassato_eur: rate.incassato_eur,
        da_incassare_eur: rate.residuo_eur,
        scaduto_eur: rate.scaduto_eur,
        tutto_incassato: Number(rate.residuo_eur ?? 0) <= 0,
        prossima_rata: ((rate.rate ?? []) as Array<Record<string, unknown>>)
          .filter((r) => Number(r.da_incassare_eur ?? 0) > 0 && r.attesa_il)
          .map((r) => ({ rata: r.rata, importo_eur: r.da_incassare_eur, attesa_il: r.attesa_il }))[0] ?? null,
      }
    : {};

  return {
    order_id: order.id,
    order_code: order.order_code,
    description: order.description,
    status: statusName,
    total_amount: order.total_amount,
    ...pagamenti,
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
  const scoped = typeof params.company_id === "string" && params.company_id ? String(params.company_id) : null;

  let query = admin
    .from("orders")
    .select("id, order_code, description, total_amount, expected_date, work_start_date, created_at")
    .eq("customer_id", contactId);
  // SECURITY (audit run-1, HIGH cross-tenant): vincola al tenant del canale.
  if (scoped) query = query.eq("company_id", scoped);
  const { data: orders } = await query
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
  const scoped = typeof params.company_id === "string" && params.company_id ? String(params.company_id) : null;

  let query = admin
    .from("appointments")
    .select("id, title, appointment_date, appointment_time, appointment_end_time, appointment_type, status, description")
    .eq("contact_id", contactId)
    .gte("appointment_date", today)
    .eq("is_blocked_slot", false);
  // SECURITY (audit run-1, HIGH cross-tenant): vincola al tenant del canale.
  if (scoped) query = query.eq("company_id", scoped);
  const { data: appointments } = await query
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
  if (fuoriTenant(params, contact)) return { error: "Contatto non trovato" };

  // is_private NON esiste su marketing_contact_notes: con quella colonna
  // PostgREST rifiutava l'intero insert e la nota non veniva mai creata.
  // created_by punta a profiles/auth.users: passargli un id di CONTATTO
  // violava la chiave esterna. Si risolve un utente vero dell'azienda.
  const { data: note, error } = await admin
    .from("marketing_contact_notes")
    .insert({
      contact_id: contactId,
      company_id: contact.company_id,
      content,
      created_by: await profiloPerConto(admin, contact.company_id),
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
  if (fuoriTenant(params, contact)) return { error: "Contatto non trovato" };

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
      // Mai il contact_id: created_by ha la FK su profiles/auth.users.
      created_by: assignedTo || (await profiloPerConto(admin, contact.company_id)),
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

  const scoped = typeof params.company_id === "string" && params.company_id ? String(params.company_id) : null;
  let upd = admin
    .from("orders")
    .update({
      expected_date: newDate,
      internal_notes: params.reason
        ? `[AI Agent] Data aggiornata: ${params.reason}`
        : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  // SECURITY (audit run-1, HIGH cross-tenant write): non scrivere su ordini di
  // un'altra azienda. Vincola l'update al tenant del canale.
  if (scoped) upd = upd.eq("company_id", scoped);
  const { error } = await upd;

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

  // Chiave Telnyx: secret env prima, tabella dopo (in produzione la tabella ha
  // la chiave VUOTA e qui si rispondeva sempre "Telnyx non configurato").
  const telnyx = await risolviTelnyx(admin);
  if (!telnyx) return { error: "Telnyx non configurato per SMS" };

  // Mittente: telnyx_settings.sender_number NON esiste (la select falliva).
  // Il numero si prende dal pool dell'azienda; l'azienda arriva dai parametri
  // o, in mancanza, dal contatto che ha quel telefono.
  let companyId = typeof params.company_id === "string" ? params.company_id : null;
  if (!companyId) {
    const suffisso = phone.replace(/\D/g, "").slice(-9);
    const { data: c } = await admin.from("marketing_contacts").select("company_id")
      .ilike("phone", `%${suffisso}%`).limit(1).maybeSingle();
    companyId = (c as { company_id?: string } | null)?.company_id ?? null;
  }
  const mittente = companyId ? await numeroMittenteAzienda(admin, companyId) : null;
  if (!mittente) return { error: "Nessun numero mittente attivo per l'azienda: collega un numero in Telefonia" };

  try {
    // Apply template vars if provided
    let message = messageTemplate;
    if (params.vars && typeof params.vars === "object") {
      for (const [k, v] of Object.entries(params.vars as Record<string, string>)) {
        message = message.replace(new RegExp(`{{${k}}}`, "g"), String(v));
      }
    }

    const smsBody: Record<string, unknown> = { from: mittente, to: phone, text: message };
    if (telnyx.messagingProfileId) smsBody.messaging_profile_id = telnyx.messagingProfileId;

    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${telnyx.apiKey}`,
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
  if (fuoriTenant(params, contact)) return { error: "Contatto non trovato" };

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
      created_by: contact.assigned_to || (await profiloPerConto(admin, contact.company_id)),
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
  if (fuoriTenant(params, contact)) return { error: "Contatto non trovato" };

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
      // "callback"/"scheduled" non appartengono al vocabolario dell'app: gli
      // appuntamenti usano tipi e stati italiani, e uno stato sconosciuto
      // resta fuori dai filtri dell'agenda.
      appointment_type: "telefonata",
      assigned_to: contact.assigned_to,
      created_by: contact.assigned_to || (await profiloPerConto(admin, contact.company_id)),
      status: "confermato",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  return { success: true, appointment_id: appointment?.id, message: `Richiamo programmato per ${callbackAt}` };
}

// ==================== HELPERS ====================

/**
 * SECURITY (audit run-1): true se il contatto appartiene a un'azienda diversa
 * dal tenant del canale (params.company_id forzato a companyFromUrl quando
 * l'auth e' la chiave URL derivata di un'azienda). Blocca le scritture CRM
 * cross-tenant derivate dal contact_id fornito dal modello.
 */
function fuoriTenant(
  params: Record<string, unknown>,
  contact: { company_id?: string | null } | null,
): boolean {
  const scoped = typeof params.company_id === "string" && params.company_id ? String(params.company_id) : null;
  return !!(scoped && contact && contact.company_id !== scoped);
}

function normalizePhone(phone: string): string {
  // Remove spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s()-]/g, "");
  // Ensure starts with +
  if (!cleaned.startsWith("+") && cleaned.length >= 9) {
    cleaned = "+39" + cleaned;
  }
  return cleaned;
}
