import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse, secureHeaders } from "../_shared/headers.ts";
import { decrypt, getEncryptionKey } from "../_shared/encryption.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
import { isLeadArretrato, notaArretrato } from "../_shared/metaLeadArretrato.ts";
const MAX_RETRIES = 10;
const BATCH_SIZE = 20;

/**
 * Errore di auth/permessi da Meta (code 190 = token scaduto/revocato, 10 e 200
 * = permessi mancanti). Gestito a parte dal loop: NON consuma i retry
 * dell'evento e flagga l'integrazione come token_expired (health-check avvisa +
 * UI mostra "Riconnetti").
 */
class MetaAuthError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "MetaAuthError";
    this.code = code;
  }
}

/**
 * 2026-05-27 SECURITY FIX: prima accettava QUALSIASI Bearer senza validare.
 * Ora verifica che il token sia service-role o un JWT utente valido.
 */
async function verifyCronOrAuth(req: Request): Promise<void> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  if (cronSecret && reqSecret === cronSecret) return;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized: missing cron secret or JWT" }), {
      status: 401,
      headers: secureHeaders,
    });
  }
  const token = authHeader.slice(7);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) return;

  const sbUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!sbUrl || !anonKey) {
    throw new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 503,
      headers: secureHeaders,
    });
  }
  const client = createClient(sbUrl, anonKey);
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Unauthorized: invalid JWT" }), {
      status: 401,
      headers: secureHeaders,
    });
  }
}

serveConMetriche("meta-process-leads", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    await verifyCronOrAuth(req);
  } catch {
    console.error("meta-process-leads: accesso non autorizzato");
    return errorResponse("Unauthorized", 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const workerId = crypto.randomUUID().slice(0, 8);
    const lockTimeout = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Unlock stale locks
    await adminClient
      .from("integration_webhook_events")
      .update({ locked_by: null, locked_at: null })
      .eq("status", "pending")
      .lt("locked_at", lockTimeout)
      .not("locked_by", "is", null);

    // Lock a batch of pending events
    const { data: events } = await adminClient
      .from("integration_webhook_events")
      .select("*")
      .eq("status", "pending")
      .lt("fail_count", MAX_RETRIES)
      .is("locked_by", null)
      .order("received_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (!events || events.length === 0) {
      return jsonResponse({ processed: 0 });
    }

    // Lock events
    const eventIds = events.map((e) => e.id);
    await adminClient
      .from("integration_webhook_events")
      .update({ locked_by: workerId, locked_at: new Date().toISOString() })
      .in("id", eventIds);

    let processed = 0;
    let failed = 0;
    const successfulIntegrationIds = new Set<string>();

    for (const event of events) {
      try {
        const result = await processLeadEvent(adminClient, event);
        
        await adminClient
          .from("integration_webhook_events")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
            locked_by: null,
            locked_at: null,
          })
          .eq("id", event.id);

        // Fire automation trigger (non-blocking)
        //
        // Un lead ARRETRATO (modulo compilato giorni fa, recuperato ora dallo
        // storico) entra nel CRM ma non sveglia le automazioni: il 12/09/2026
        // un recupero ha mandato 91 notifiche «Nuovo lead» in un'ora e mezza
        // per richieste vecchie fino a tre settimane. Chi riceve la notifica
        // deve poter presumere che il contatto sia appena arrivato.
        if (result?.contactId) {
          const triggerEvent = result.isNew ? "facebook_lead_received" : "facebook_lead_updated";
          adminClient
            .from("automation_trigger_events")
            .insert({
              company_id: event.company_id,
              trigger_event: triggerEvent,
              entity_id: result.contactId,
              entity_type: "contact",
              payload: {
                form_id: event.payload?.form_id || null,
                page_id: event.payload?.page_id || null,
                leadgen_id: event.payload?.leadgen_id || null,
                campaign_name: result.campaignName || null,
                is_new_contact: result.isNew,
                // Lead recuperato dallo storico, non appena arrivato: il motore
                // automazioni lo mette in pipeline ma non manda notifiche né
                // messaggi. Vedi _shared/metaLeadArretrato.ts.
                arretrato: result.arretrato === true,
                giorni_ritardo: result.giorniRitardo ?? 0,
              },
            })
            .then(
              () => console.log(`Automation trigger fired: ${triggerEvent} for contact ${result.contactId}`),
              (err: any) => console.warn("Failed to fire automation trigger:", err),
            );
        }

        processed++;
        if (event.integration_id) {
          successfulIntegrationIds.add(event.integration_id);
        }
      } catch (error) {
        console.error(`Failed to process event ${event.id}:`, error);
        const message = String((error as Error).message ?? error);

        // Errore di auth/permessi Meta (token scaduto/revocato): NON bruciare i
        // retry. Durante la finestra di token scaduto il lead va rielaborato
        // dopo la riconnessione: flagga l'integrazione come token_expired
        // (health-check avvisa + UI mostra "Riconnetti") e lascia l'evento
        // 'pending' senza incrementare fail_count.
        if (error instanceof MetaAuthError) {
          if (event.integration_id) {
            await adminClient
              .from("integrations")
              .update({
                status: "token_expired",
                health: "critical",
                last_error_message: message.slice(0, 500),
              })
              .eq("id", event.integration_id);
          }
          await adminClient
            .from("integration_webhook_events")
            .update({
              status: "pending",
              locked_by: null,
              locked_at: null,
            })
            .eq("id", event.id);

          failed++;
          continue;
        }

        const newFailCount = (event.fail_count || 0) + 1;
        const newStatus = newFailCount >= MAX_RETRIES ? "failed" : "pending";

        await adminClient
          .from("integration_webhook_events")
          .update({
            fail_count: newFailCount,
            last_fail_reason: message.slice(0, 500),
            status: newStatus,
            locked_by: null,
            locked_at: null,
          })
          .eq("id", event.id);

        failed++;
      }
    }

    // Update last_sync_at ONLY for integrations with successful processing
    for (const integId of successfulIntegrationIds) {
      await adminClient
        .from("integrations")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", integId);
    }

    return jsonResponse({ processed, failed, total: events.length });
  } catch (error) {
    console.error("meta-process-leads error:", error);
    return errorResponse(String((error as Error).message ?? error), 500);
  }
});

async function processLeadEvent(adminClient: any, event: any): Promise<{ contactId: string; isNew: boolean; campaignName?: string; arretrato?: boolean; giorniRitardo?: number } | null> {
  const { company_id, integration_id, payload } = event;
  // Due formati di payload convivono in coda:
  //  - WEBHOOK: { leadgen_id, form_id, page_id } → il lead va fetchato da Graph
  //  - BACKFILL: il lead GREZZO del Graph API ({ id, field_data, ... }) —
  //    è già completo, nessun refetch necessario.
  const isBackfillPayload = !payload.leadgen_id && !!payload.id && Array.isArray(payload.field_data);
  const leadgenId = payload.leadgen_id ?? (isBackfillPayload ? payload.id : undefined);
  const formId = payload.form_id;
  const processedAt = new Date();

  if (!leadgenId || !integration_id) {
    throw new Error("Missing leadgen_id or integration_id");
  }

  // Speed-to-lead: calcola secondi tra ricezione webhook e elaborazione
  const receivedAt = event.received_at ? new Date(event.received_at) : processedAt;
  const speedToLeadSeconds = Math.round((processedAt.getTime() - receivedAt.getTime()) / 1000);

  const { data: creds } = await adminClient
    .from("integration_credentials")
    .select("access_token_encrypted, meta_page_tokens")
    .eq("integration_id", integration_id)
    .single();

  if (!creds) throw new Error("No credentials found for integration");

  const encKey = getEncryptionKey();

  // Gestione lead di test (iniettati da send-test-lead, senza chiamata a Meta)
  let lead: any;
  if (payload.is_test && payload._test_field_data) {
    lead = {
      id: leadgenId,
      form_id: formId,
      created_time: payload.created_time || new Date().toISOString(),
      field_data: payload._test_field_data,
      campaign_name: "TEST",
      ad_name: "TEST",
    };
  } else if (isBackfillPayload) {
    // Evento da backfill: il payload È il lead completo del Graph API.
    // Rifetcharlo fallirebbe pure (i backfill possono includere lead più
    // vecchi di 90 giorni non più leggibili singolarmente).
    lead = payload;
  } else {
    // Usa il Page Access Token della pagina specifica (più permessi, richiesto per BM pages)
    // Fallback al User Access Token se il page token non è disponibile
    const pageId = payload.page_id ? String(payload.page_id) : null;
    const pageTokens = (creds as any).meta_page_tokens as Record<string, string> | null;
    let accessToken: string;
    if (pageId && pageTokens?.[pageId]) {
      accessToken = await decrypt(pageTokens[pageId], encKey);
    } else {
      accessToken = await decrypt(creds.access_token_encrypted, encKey);
    }

    const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";
    const leadRes = await fetch(
      `https://graph.facebook.com/${apiVersion}/${leadgenId}?fields=id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id&access_token=${accessToken}`
    );
    lead = await leadRes.json();

    if (lead.error) {
      const code = lead.error.code;
      if (code === 190 || code === 10 || code === 200) {
        throw new MetaAuthError(code, `Meta API auth error (${code}): ${lead.error.message}`);
      }
      throw new Error(`Meta API error: ${lead.error.message}`);
    }
  }

  const actualFormId = lead.form_id || formId;
  const { data: mapping } = await adminClient
    .from("integration_field_mappings")
    .select("*")
    .eq("company_id", company_id)
    .eq("integration_id", integration_id)
    .eq("form_id", actualFormId)
    .single();

  const fieldData: Record<string, string> = {};
  for (const field of lead.field_data || []) {
    fieldData[field.name] = Array.isArray(field.values) ? field.values[0] : field.values;
  }

  const rules = mapping?.rules || {};
  const fieldMap: Record<string, string> = rules.field_map || {};
  const defaultValues: Record<string, string> = rules.default_values || {};

  const mappedData: Record<string, string> = {};
  // Valori destinati ai campi personalizzati del CRM: la mappatura del wizard
  // usa chiavi "custom_<field_id>" (marketing_custom_fields) → finiscono in
  // marketing_contact_field_values, non su colonne del contatto.
  const customValues: Record<string, string> = {};
  for (const [metaKey, crmKey] of Object.entries(fieldMap)) {
    const v = fieldData[metaKey];
    if (v === undefined) continue;
    if (crmKey.startsWith("custom_")) {
      customValues[crmKey.slice(7)] = v;
    } else {
      mappedData[crmKey] = v;
    }
  }

  {
    // Fallback SEMPRE attivo per i campi standard ancora vuoti: la mappatura
    // esplicita può coprire solo alcuni campi (o puntare a campi custom) —
    // nome/email/telefono non devono andare persi in nessun caso.
    const pick = (...keys: string[]): string | undefined => {
      for (const k of keys) {
        if (fieldData[k] !== undefined && fieldData[k] !== "") return fieldData[k];
      }
      return undefined;
    };
    const fullName = pick("full_name");
    const fName = pick("first_name");
    const lName = pick("last_name");
    const mail = pick("email");
    const tel = pick("phone_number", "phone");
    const cityV = pick("city");
    const addr = pick("street_address", "address");
    const zip = pick("zip_code", "post_code", "postal_code", "zip");
    const prov = pick("province", "state", "region");
    const comp = pick("company_name", "company");
    if (fullName && !mappedData.full_name) mappedData.full_name = fullName;
    if (fName && !mappedData.first_name) mappedData.first_name = fName;
    if (lName && !mappedData.last_name) mappedData.last_name = lName;
    if (mail && !mappedData.email) mappedData.email = mail;
    if (tel && !mappedData.phone) mappedData.phone = tel;
    if (cityV && !mappedData.city) mappedData.city = cityV;
    if (addr && !mappedData.address) mappedData.address = addr;
    if (zip && !mappedData.postal_code) mappedData.postal_code = zip;
    if (prov && !mappedData.province) mappedData.province = prov;
    if (comp && !mappedData.company_name) mappedData.company_name = comp;

    // Secondo passaggio: le domande custom dei form italiani arrivano sluggate
    // da Meta ("nome_e_cognome", "numero_di_telefono", "e-mail", "città") e
    // sfuggono alle chiavi standard qui sopra → match per pattern sulla chiave
    // normalizzata (minuscole, senza accenti né simboli).
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_");
    const pickLike = (test: (k: string) => boolean): string | undefined => {
      for (const [k, v] of Object.entries(fieldData)) {
        if (v !== undefined && v !== "" && test(norm(k))) return v;
      }
      return undefined;
    };
    if (!mappedData.email) {
      const v = pickLike((k) => k.includes("mail"));
      if (v) mappedData.email = v;
    }
    if (!mappedData.phone) {
      const v = pickLike((k) => k.includes("telefono") || k.includes("phone") || k.includes("cellulare") || k.includes("whatsapp"));
      if (v) mappedData.phone = v;
    }
    if (!mappedData.full_name && !mappedData.first_name) {
      const v = pickLike((k) => k.includes("nome_e_cognome") || k.includes("nome_completo") || k.includes("nominativo") || k.includes("full_name"));
      if (v) {
        mappedData.full_name = v;
      } else {
        const cognome = pickLike((k) => k.includes("cognome"));
        const nome = pickLike((k) => k.includes("nome") && !k.includes("cognome"));
        if (nome) mappedData.first_name = nome;
        if (cognome) mappedData.last_name = cognome;
      }
    }
    if (!mappedData.city) {
      const v = pickLike((k) => k === "citta" || k.includes("city") || k === "comune");
      if (v) mappedData.city = v;
    }
    if (!mappedData.address) {
      const v = pickLike((k) => k.includes("indirizzo") || k.includes("address"));
      if (v) mappedData.address = v;
    }
    if (!mappedData.postal_code) {
      const v = pickLike((k) => k === "cap" || k.includes("codice_postale") || k.includes("postal") || k.includes("zip"));
      if (v) mappedData.postal_code = v;
    }
    if (!mappedData.province) {
      const v = pickLike((k) => k.includes("provincia") || k.includes("province"));
      if (v) mappedData.province = v;
    }
  }

  let firstName = mappedData.first_name || defaultValues.first_name || "";
  let lastName = mappedData.last_name || defaultValues.last_name || "";

  if (!firstName && !lastName && mappedData.full_name) {
    const parts = mappedData.full_name.trim().split(/\s+/);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ") || "";
  }

  const email = (mappedData.email || defaultValues.email || "").toLowerCase().trim();
  const phone = normalizePhone(mappedData.phone || defaultValues.phone || "");
  const city = mappedData.city || defaultValues.city || null;
  const address = mappedData.address || defaultValues.address || null;
  const postalCode = mappedData.postal_code || defaultValues.postal_code || null;
  const province = mappedData.province || defaultValues.province || null;
  const companyName = mappedData.company_name || defaultValues.company_name || null;

  // ── Consenso a essere ricontattati ──────────────────────────────────────
  // I moduli Lead Ads italiani mettono quasi sempre una domanda di consenso
  // ("Acconsenti a essere ricontattato?", "Autorizzo il trattamento…"), ma NON
  // e' un campo standard di Meta: arriva in field_data come domanda custom col
  // nome che ha scelto chi ha creato il modulo. Qui la si riconosce dal nome e
  // si legge la risposta.
  //
  // Se il modulo NON chiede nulla si lascia NULL: "non lo so" e' diverso da
  // "ha detto no", e inventare un si' qui significherebbe autorizzare telefonate
  // che nessuno ha autorizzato. Un lead senza consenso resta lavorabile a mano,
  // solo il richiamo vocale automatico lo salta.
  const consensoMeta: boolean | null = (() => {
    const chiaviConsenso = ["consens", "privacy", "marketing", "accett", "autorizz", "ricontatt", "trattamento", "gdpr"];
    for (const [chiave, valore] of Object.entries(fieldData)) {
      const k = chiave.toLowerCase();
      if (!chiaviConsenso.some((c) => k.includes(c))) continue;
      const v = String(valore ?? "").trim().toLowerCase();
      if (!v) continue;
      if (["si", "sì", "yes", "true", "1", "acconsento", "accetto", "autorizzo", "d'accordo"].includes(v)) return true;
      if (["no", "false", "0", "non acconsento", "nego"].includes(v)) return false;
      // Risposta libera: qualsiasi cosa che inizi per "s" (si/sì/sono d'accordo)
      // vale si', il resto resta indeterminato.
      if (v.startsWith("s")) return true;
      if (v.startsWith("n")) return false;
    }
    return null;
  })();

  // Default email_or_phone: i Lead Ads italiani spesso non hanno email (solo
  // telefono) → con "email" puro quei lead non venivano mai deduplicati.
  const dedupePolicy = rules.dedupe_policy || "email_or_phone";
  const updatePolicy = rules.update_policy || "upsert";

  let existingContact = null;
  if (dedupePolicy === "email" && email) {
    const { data } = await adminClient
      .from("marketing_contacts")
      .select("id")
      .eq("company_id", company_id)
      .eq("email", email)
      .limit(1);
    existingContact = data?.[0] || null;
  } else if (dedupePolicy === "phone" && phone) {
    const { data } = await adminClient
      .from("marketing_contacts")
      .select("id")
      .eq("company_id", company_id)
      .eq("phone", phone)
      .limit(1);
    existingContact = data?.[0] || null;
  } else if (dedupePolicy === "email_or_phone") {
    if (email) {
      const { data } = await adminClient
        .from("marketing_contacts")
        .select("id")
        .eq("company_id", company_id)
        .eq("email", email)
        .limit(1);
      existingContact = data?.[0] || null;
    }
    if (!existingContact && phone) {
      const { data } = await adminClient
        .from("marketing_contacts")
        .select("id")
        .eq("company_id", company_id)
        .eq("phone", phone)
        .limit(1);
      existingContact = data?.[0] || null;
    }
  }

  const source = `Meta Lead Ads`;
  const tags = rules.tags_to_apply || [];
  const pipelineSettings = rules.pipeline_settings || {};
  // Se la mappatura punta una domanda al campo Note, il testo mappato precede
  // il riepilogo automatico delle risposte del modulo.
  const notes = [mappedData.notes, buildNotesFromFieldData(fieldData, lead)]
    .filter(Boolean)
    .join("\n\n");

  let contactId: string;

  if (existingContact && updatePolicy !== "create_only") {
    const updateData: Record<string, any> = {};
    if (updatePolicy === "overwrite_non_empty" || updatePolicy === "upsert") {
      if (firstName) updateData.first_name = firstName;
      if (lastName) updateData.last_name = lastName;
      if (phone) updateData.phone = phone;
      if (city) updateData.city = city;
      if (address) updateData.address = address;
      if (postalCode) updateData.postal_code = postalCode;
      if (province) updateData.province = province;
      if (companyName) updateData.company_name = companyName;
      // Always update attribution fields from Meta (most recent lead wins)
      updateData.attr_source = "facebook";
      updateData.attr_medium = "paid_social";
      if (lead.campaign_name) updateData.attr_campaign = lead.campaign_name;
      if (lead.ad_name) updateData.attr_content = lead.ad_name;
      if (lead.campaign_id) updateData.source_campaign_id = lead.campaign_id;
      if (lead.campaign_id) updateData.meta_campaign_id = lead.campaign_id;
      if (lead.adset_id) updateData.meta_adset_id = lead.adset_id;
      if (lead.ad_id) updateData.meta_ad_id = lead.ad_id;
      if (lead.id) updateData.meta_lead_id = lead.id;
      // Solo se il modulo ha davvero chiesto: un modulo senza domanda di
      // consenso non deve cancellare un si' raccolto altrove.
      if (consensoMeta !== null) {
        updateData.marketing_consent = consensoMeta;
        updateData.marketing_consent_at = new Date().toISOString();
        updateData.marketing_consent_source = `Facebook Lead Ads — modulo ${actualFormId}`;
      }
    }
    updateData.updated_at = new Date().toISOString();

    await adminClient
      .from("marketing_contacts")
      .update(updateData)
      .eq("id", existingContact.id);

    contactId = existingContact.id;
  } else if (!existingContact) {
    const { data: newContact, error: contactErr } = await adminClient
      .from("marketing_contacts")
      .insert({
        company_id,
        first_name: firstName || "Lead",
        last_name: lastName || "",
        email: email || null,
        phone: phone || null,
        city: city,
        address: address,
        postal_code: postalCode,
        province: province,
        company_name: companyName,
        source,
        notes,
        tags,
        assigned_to: pipelineSettings.owner_user_id || null,
        source_campaign_id: lead.campaign_id || lead.campaign_name || null,
        // Attribution fields from Meta Ads
        attr_source: "facebook",
        attr_medium: "paid_social",
        attr_campaign: lead.campaign_name || null,
        attr_content: lead.ad_name || null,
        meta_campaign_id: lead.campaign_id || null,
        meta_adset_id: lead.adset_id || null,
        meta_ad_id: lead.ad_id || null,
        meta_lead_id: lead.id || leadgenId,
        marketing_consent: consensoMeta,
        marketing_consent_at: consensoMeta === null ? null : new Date().toISOString(),
        marketing_consent_source: consensoMeta === null ? null : `Facebook Lead Ads — modulo ${actualFormId}`,
      })
      .select("id")
      .single();

    if (contactErr) throw new Error(`Failed to create contact: ${contactErr.message}`);
    contactId = newContact.id;
  } else {
    contactId = existingContact.id;
  }

  // Campi personalizzati mappati (chiavi "custom_<field_id>" nel wizard):
  // vanno in marketing_contact_field_values, la tabella letta dal CRM.
  const customEntries = Object.entries(customValues).filter(([fieldId]) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fieldId),
  );
  if (customEntries.length > 0) {
    const { error: cfvErr } = await adminClient
      .from("marketing_contact_field_values")
      .upsert(
        customEntries.map(([fieldId, value]) => ({
          contact_id: contactId,
          field_id: fieldId,
          value,
        })),
        { onConflict: "contact_id,field_id" },
      );
    if (cfvErr) {
      // Non bloccare il lead per un campo custom: contatto già creato.
      console.warn(`meta-process-leads: campi personalizzati non salvati per ${contactId}:`, cfvErr.message);
    }
  }

  // Il lead è stato compilato giorni fa e recuperato solo ora? Si scrive in
  // chiaro sull'opportunità, cosi' il commerciale non richiama pensando che
  // sia di oggi.
  const arretrato = isLeadArretrato(lead.created_time);

  if (pipelineSettings.pipeline_id && pipelineSettings.stage_id) {
    const { data: existingOpp } = await adminClient
      .from("marketing_opportunities")
      .select("id")
      .eq("company_id", company_id)
      .eq("contact_id", contactId)
      .eq("source", `meta_lead_${leadgenId}`)
      .limit(1);

    if (!existingOpp || existingOpp.length === 0) {
      await adminClient.from("marketing_opportunities").insert({
        company_id,
        contact_id: contactId,
        pipeline_id: pipelineSettings.pipeline_id,
        stage_id: pipelineSettings.stage_id,
        name: `Lead Ads - ${firstName} ${lastName}`.trim(),
        value: 0,
        status: "open",
        source: `meta_lead_${leadgenId}`,
        notes: arretrato ? notaArretrato(lead.created_time) : null,
        tags: arretrato ? ["lead-recuperato"] : [],
        assigned_to: pipelineSettings.owner_user_id || null,
        meta_campaign_id: lead.campaign_id || null,
        meta_adset_id: lead.adset_id || null,
        meta_ad_id: lead.ad_id || null,
        meta_lead_id: lead.id || leadgenId,
      });
    }
  }

  await adminClient.from("integration_audit_log").insert({
    company_id,
    actor_user_id: null,
    action: "lead_imported",
    entity_type: "marketing_contact",
    entity_id: contactId,
    metadata: {
      leadgen_id: leadgenId,
      form_id: actualFormId,
      campaign_id: lead.campaign_id || null,
      campaign_name: lead.campaign_name || null,
      adset_id: lead.adset_id || null,
      adset_name: lead.adset_name || null,
      ad_id: lead.ad_id || null,
      ad_name: lead.ad_name || null,
      dedupe: existingContact ? "updated" : "created",
      speed_to_lead_seconds: speedToLeadSeconds,
      is_test: payload.is_test || false,
    },
  });

  // Notifica in-app all'agente assegnato (solo per nuovi lead non di test)
  const assignedTo = pipelineSettings.owner_user_id || null;
  if (assignedTo && !existingContact && !payload.is_test) {
    const contactName = [
      firstName || "Lead",
      lastName || "",
    ].join(" ").trim();
    const campaignLabel = lead.campaign_name ? ` · ${lead.campaign_name}` : "";
    const siteUrl = Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";

    await adminClient.from("notifications").insert({
      company_id,
      user_id: assignedTo,
      type: "meta_lead_assigned",
      title: `Nuovo lead da Meta${campaignLabel}`,
      body: `${contactName} è stato assegnato a te tramite Lead Ads.`,
      entity_type: "marketing_contact",
      entity_id: contactId,
      action_url: `${siteUrl}/azienda/marketing/contatti/${contactId}`,
    });
  }

  return {
    contactId,
    isNew: !existingContact,
    campaignName: lead.campaign_name || undefined,
    arretrato,
    giorniRitardo: arretrato ? Math.floor((Date.now() - new Date(String(lead.created_time)).getTime()) / 86_400_000) : 0,
  };
}

function normalizePhone(phone: string): string {
  if (!phone) return "";
  let normalized = phone.replace(/[^\d+]/g, "");

  // Converti 00XX → +XX
  if (normalized.startsWith("00")) {
    normalized = "+" + normalized.slice(2);
  }

  // Numero mobile italiano senza prefisso (3xx xxxxxxx/xx)
  if (/^3\d{8,9}$/.test(normalized)) {
    return "+39" + normalized;
  }

  // Numero fisso italiano senza prefisso (0xx xxxxxxx)
  if (/^0\d{6,10}$/.test(normalized)) {
    return "+39" + normalized;
  }

  // Già internazionale con +
  if (normalized.startsWith("+")) {
    return normalized;
  }

  // Numero a 10 cifre italiano (mobile 3xx o fisso 0xx) senza +39
  if (/^\d{10}$/.test(normalized) && /^[03]/.test(normalized)) {
    return "+39" + normalized;
  }

  return normalized;
}

function buildNotesFromFieldData(fieldData: Record<string, string>, lead: any): string {
  const lines: string[] = [];
  lines.push(`--- Lead Ads Import ---`);
  if (lead.campaign_name) lines.push(`Campagna: ${lead.campaign_name}`);
  if (lead.ad_name) lines.push(`Annuncio: ${lead.ad_name}`);
  if (lead.adset_name) lines.push(`Adset: ${lead.adset_name}`);
  lines.push(`Data: ${lead.created_time || new Date().toISOString()}`);
  lines.push("");
  for (const [key, value] of Object.entries(fieldData)) {
    lines.push(`${key}: ${value}`);
  }
  return lines.join("\n");
}
