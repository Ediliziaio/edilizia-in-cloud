import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

const PLATFORM_ADMIN_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

// Destinatario notifica admin per ogni nuovo lead dal sito pubblico.
// Hardcoded per affidabilità (in passato era un platform_setting → settori
// dimenticati di configurarlo facevano perdere lead).
const ADMIN_LEAD_NOTIFY_EMAIL = "flo.andriciuc@gmail.com";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === '"' ? "&quot;" : "&#39;"
  );
}

/**
 * Nome leggibile del sito da cui arriva il lead, per l'oggetto dell'email admin.
 * Così, a colpo d'occhio, si capisce se la richiesta viene da Edilizia in Cloud,
 * Marketing Edile o un altro brand, senza aprire il messaggio.
 * Origine: header Origin/Referer della richiesta (o body.site_origin se il sito
 * lo passa). Se il dominio non è nella mappa, si usa il dominio stesso ripulito.
 */
const SITE_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /marketingedile\./i, label: "Marketing Edile" },
  { match: /(^|\.)edilizia\.io$/i, label: "Edilizia.io" },
  { match: /ediliziaincloud\./i, label: "Edilizia in Cloud" },
  { match: /clientiedili\./i, label: "Clienti Edili" },
  { match: /venditaedile\./i, label: "Vendita Edile" },
  { match: /numeriinedilizia\.|numeri-in-edilizia\./i, label: "Numeri in Edilizia" },
  { match: /cantiereincloud\./i, label: "Cantiere in Cloud" },
  { match: /praticarapida\./i, label: "Pratica Rapida" },
  { match: /tutelai\./i, label: "TutelAI" },
  { match: /aedix\./i, label: "AEDIX" },
];

function siteLabelFromOrigin(rawOrigin: string | null | undefined): string | null {
  const raw = cleanText(rawOrigin ?? "", 200);
  if (!raw) return null;
  let host = raw;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    host = raw.replace(/^https?:\/\//i, "").split("/")[0];
  }
  host = host.replace(/^www\./i, "").replace(/^app\./i, "").toLowerCase();
  if (!host) return null;
  const known = SITE_LABELS.find((s) => s.match.test(host));
  if (known) return known.label;
  // Sconosciuto: usa il dominio così com'è (comunque un riferimento chiaro),
  // ma scarta localhost e i domini interni di Supabase/Cloudflare.
  if (/localhost|127\.0\.0\.1|supabase\.co|pages\.dev|workers\.dev$/i.test(host)) return null;
  return host;
}

type LeadPayload = {
  nome?: string;
  email?: string;
  telefono?: string;
  azienda?: string;
  messaggio?: string | null;
  source?: string;
  marketing_consent?: boolean;
  tags?: string[];
  render_slug?: string | null;
  page_path?: string | null;
  context_label?: string | null;
  referral_code?: string | null;
  /** Dominio del sito che ospita il form (opzionale: se assente si usa Origin/Referer). */
  site_origin?: string | null;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function splitName(fullName: string): { first_name: string; last_name: string | null } {
  const parts = fullName.split(" ").filter(Boolean);
  if (parts.length <= 1) return { first_name: fullName || "Nuovo lead", last_name: null };
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts.at(-1) || null };
}

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as LeadPayload;
    const nome = cleanText(body.nome, 180);
    const email = cleanText(body.email, 254).toLowerCase();
    const telefono = cleanText(body.telefono, 80);
    const azienda = cleanText(body.azienda, 180);
    const source = cleanText(body.source || "site_public_form", 80);
    // Sito di provenienza per l'oggetto dell'email admin.
    const siteLabel =
      siteLabelFromOrigin(body.site_origin) ??
      siteLabelFromOrigin(req.headers.get("origin")) ??
      siteLabelFromOrigin(req.headers.get("referer"));
    const messaggio = cleanText(body.messaggio, 2000);
    const marketingConsent = Boolean(body.marketing_consent);
    const renderSlug = cleanText(body.render_slug, 80).toLowerCase().replace(/[^a-z0-9-]/g, "");
    const pagePath = cleanText(body.page_path, 180);
    const contextLabel = cleanText(body.context_label, 180);
    const sessionId = cleanText(body.session_id, 64);
    // Codice referral del partner (catturato da ReferralLanding → localStorage).
    // Normalizzato come gli altri codici referral: maiuscolo, solo alfanumerico/-/_.
    const referralCode = cleanText(body.referral_code, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    // Tag CRM puliti: prima ogni richiesta accumulava 4-6 tag con varianti
    // slug-specifiche (richiesta-render-infissi, landing-render, modulo-render-
    // in-page, ecc.) → su contatto con 5 richieste 25+ tag identici. Ora teniamo
    // SOLO tag "tipologici" stabili. Il dettaglio (slug, pagina, modulo) resta
    // tracciato in marketing_contact_activities.metadata.
    const STABLE_TAG_WHITELIST = new Set([
      "lead-sito",
      "richiesta-demo",
      "richiesta-render",
      "richiesta-preventivo",
      "richiesta-info",
      "richiesta-contatto",
    ]);
    const requestedTags = Array.isArray(body.tags)
      ? body.tags
          .map((tag) => cleanText(tag, 80).toLowerCase())
          .filter((tag) => tag && STABLE_TAG_WHITELIST.has(tag))
      : [];
    const renderTags = renderSlug.startsWith("render-")
      ? ["richiesta-render"]  // unico tag tipologico, slug specifica resta in metadata
      : [];

    if (!nome || !email || !telefono || !azienda) {
      return jsonResponse(req, { error: "Campi obbligatori mancanti" }, 400);
    }
    if (!emailRegex.test(email)) {
      return jsonResponse(req, { error: "Email non valida" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    let requestId: string | null = null;
    const requestPayload = {
      nome,
      email,
      telefono,
      azienda,
      messaggio: messaggio || null,
      marketing_consent: marketingConsent,
      source,
      status: "pending",
    };

    const demoRequest = await supabase
      .from("demo_requests")
      .insert(requestPayload)
      .select("id")
      .maybeSingle();

    if (!demoRequest.error && demoRequest.data?.id) {
      requestId = demoRequest.data.id as string;
    } else if (demoRequest.error && demoRequest.error.code !== "42P01") {
      console.warn("[public-lead-submit] demo_requests insert skipped:", demoRequest.error.message);
    }

    // ── Risoluzione partner referral ─────────────────────────────────────────
    // Se il lead arriva da un link referral, risolviamo il partner dal codice
    // così l'admin sa subito a chi attribuire la conversione (il valore prima
    // era perso). Fail-soft: codice sconosciuto → nessun blocco, solo niente
    // attribuzione.
    let referrerInfo: { id: string; name: string; code: string } | null = null;
    if (referralCode) {
      try {
        const { data: ref } = await supabase
          .from("referrers")
          .select("id, name, referral_code, is_active")
          .eq("referral_code", referralCode)
          .maybeSingle();
        // Solo partner attivi: un partner disattivato non deve generare
        // attribuzioni (la commissione sarebbe contestabile).
        if (ref?.id && ref.is_active !== false) {
          referrerInfo = {
            id: ref.id as string,
            name: (ref.name as string) || referralCode,
            code: (ref.referral_code as string) || referralCode,
          };
        }
      } catch (refErr) {
        console.warn("[public-lead-submit] referrer lookup failed:", refErr);
      }
    }

    const { first_name, last_name } = splitName(nome);
    const now = new Date().toISOString();
    const notes = [
      contextLabel ? `Modulo richiesto: ${contextLabel}` : null,
      messaggio || null,
      `Richiesta da sito: ${source}`,
      renderSlug ? `Render page: ${renderSlug}` : null,
      pagePath ? `Pagina: ${pagePath}` : null,
      referrerInfo
        ? `🤝 Referral partner: ${referrerInfo.name} (codice ${referrerInfo.code})`
        : referralCode
          ? `🤝 Referral codice: ${referralCode} (partner non trovato)`
          : null,
      `Consenso marketing: ${marketingConsent ? "si" : "no"}`,
    ].filter(Boolean).join("\n");

    const { data: existing, error: existingError } = await supabase
      .from("marketing_contacts")
      .select("id, tags, notes")
      .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
      .eq("email", email)
      .maybeSingle();

    if (existingError) {
      console.error("[public-lead-submit] contact lookup error:", existingError);
      return jsonResponse(req, { error: "CRM non disponibile" }, 500);
    }

    let contactId: string | null = null;
    const tags = Array.from(
      new Set([
        ...(existing?.tags ?? []),
        "lead-sito",
        "richiesta-demo",
        ...requestedTags,
        ...renderTags,
        ...(referrerInfo ? ["referral-partner"] : []),
      ]),
    );

    if (existing?.id) {
      contactId = existing.id as string;
      const mergedNotes = [existing.notes, notes].filter(Boolean).join("\n\n---\n");
      const { error: updateError } = await supabase
        .from("marketing_contacts")
        .update({
          first_name,
          last_name,
          phone: telefono,
          company_name: azienda,
          source,
          contact_type: "lead",
          tags,
          notes: mergedNotes,
          last_activity_at: now,
          // Il consenso va scritto SUL CONTATTO, non solo in demo_requests e
          // nelle note: e' il campo che il richiamo vocale legge per decidere
          // se puo' chiamare. Senza questa riga la spunta del form si perdeva e
          // marketing_consent restava NULL su TUTTI i contatti (0 su 26.052).
          // Vale l'ultima volonta' espressa: chi ri-invia il form senza spunta
          // sta revocando, e va registrato come tale.
          marketing_consent: marketingConsent,
          marketing_consent_at: now,
          marketing_consent_source: `form sito — ${source}`,
        })
        .eq("id", contactId);

      if (updateError) {
        console.error("[public-lead-submit] contact update error:", updateError);
        return jsonResponse(req, { error: "Aggiornamento CRM non riuscito" }, 500);
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("marketing_contacts")
        .insert({
          company_id: PLATFORM_ADMIN_COMPANY_ID,
          first_name,
          last_name,
          email,
          phone: telefono,
          company_name: azienda,
          source,
          contact_type: "lead",
          tags,
          notes,
          last_activity_at: now,
          // Vedi il commento nel ramo di aggiornamento: e' il campo che abilita
          // il richiamo vocale, e prima veniva dimenticato proprio qui.
          marketing_consent: marketingConsent,
          marketing_consent_at: now,
          marketing_consent_source: `form sito — ${source}`,
        })
        .select("id")
        .single();

      if (insertError || !inserted?.id) {
        console.error("[public-lead-submit] contact insert error:", insertError);
        return jsonResponse(req, { error: "Creazione CRM non riuscita" }, 500);
      }
      contactId = inserted.id as string;
    }

    // Trigger automazioni "Form compilato" (form_submitted): PRIMA questo
    // evento non veniva mai emesso da nessuno → il trigger a catalogo era
    // morto. Best-effort: un errore qui non blocca la submit del lead.
    try {
      await supabase.from("automation_trigger_events").insert({
        company_id: PLATFORM_ADMIN_COMPANY_ID,
        trigger_event: "form_submitted",
        entity_id: contactId,
        entity_type: "contact",
        payload: { source, page_path: pagePath || null, context_label: contextLabel || null },
      });
    } catch (e) {
      console.warn("[public-lead-submit] form_submitted event skipped:", e);
    }

    // Lega la visita alla persona: senza questo il percorso resta anonimo e
    // non si può rispondere a "cosa aveva guardato prima di scrivere?".
    if (sessionId) {
      try {
        await supabase
          .from("attribution_sessions")
          .update({ contact_id: contactId, converted_at: new Date().toISOString() })
          .eq("session_id", sessionId)
          .is("contact_id", null);
      } catch (e) {
        console.warn("[public-lead-submit] sessione non collegata:", e);
      }
    }

    await supabase.from("marketing_contact_activities").insert({
      company_id: PLATFORM_ADMIN_COMPANY_ID,
      contact_id: contactId,
      activity_type: "site_lead_submitted",
      description: `Richiesta ricevuta dal sito (${source})`,
      metadata: {
        request_id: requestId,
        source,
        azienda,
        telefono,
        marketing_consent: marketingConsent,
        render_slug: renderSlug || null,
        page_path: pagePath || null,
        context_label: contextLabel || null,
        session_id: sessionId || null,
        referral_code: referralCode || null,
        referrer_id: referrerInfo?.id ?? null,
        referrer_name: referrerInfo?.name ?? null,
        tags,
      },
    });

    // ── Auto-create opportunity nel pipeline marketing ───────────────────────
    // Prima i lead arrivavano in CRM ma NON entravano nel kanban marketing →
    // l'admin doveva creare manualmente l'opportunità. Risultato: lead caldi
    // dimenticati nella lista contatti senza tracking commerciale.
    // Ora: se NON esiste già opportunity OPEN per questo contact, creiamo una
    // entry nel primo stage della pipeline default di platform-admin.
    // Fail-soft: se non c'è pipeline configurata, skip senza errore.
    let opportunityId: string | null = null;
    try {
      const { data: existingOpp } = await supabase
        .from("marketing_opportunities")
        .select("id")
        .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
        .eq("contact_id", contactId)
        .eq("status", "open")
        .maybeSingle();

      if (existingOpp?.id) {
        opportunityId = existingOpp.id as string;
        // Lead ricorrente con opp aperta → solo aggiorna last touch + nota
        await supabase
          .from("marketing_opportunities")
          .update({
            updated_at: now,
            notes: [`Nuova richiesta ${contextLabel || source} il ${now.slice(0, 10)}`].join("\n"),
          })
          .eq("id", opportunityId);
      } else {
        // Trova pipeline default + primo stage
        const { data: pipeline } = await supabase
          .from("marketing_pipelines")
          .select("id")
          .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
          .order("position", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (pipeline?.id) {
          const { data: firstStage } = await supabase
            .from("marketing_pipeline_stages")
            .select("id")
            .eq("pipeline_id", pipeline.id)
            .order("position", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (firstStage?.id) {
            const oppName = contextLabel
              ? `${nome} — ${contextLabel}`
              : renderSlug
                ? `${nome} — Render ${renderSlug}`
                : `${nome} — Lead sito`;
            const { data: created } = await supabase
              .from("marketing_opportunities")
              .insert({
                company_id: PLATFORM_ADMIN_COMPANY_ID,
                contact_id: contactId,
                pipeline_id: pipeline.id,
                stage_id: firstStage.id,
                name: oppName,
                value: 0,
                status: "open",
                source,
                company_name: azienda,
                notes: messaggio || null,
              })
              .select("id")
              .single();
            opportunityId = created?.id ?? null;
            if (opportunityId) {
              await supabase.from("marketing_contact_activities").insert({
                company_id: PLATFORM_ADMIN_COMPANY_ID,
                contact_id: contactId,
                activity_type: "opportunity_auto_created",
                description: `Opportunità creata in automatico dal lead sito`,
                metadata: { opportunity_id: opportunityId, source, render_slug: renderSlug || null },
              });
            }
          }
        }
      }
    } catch (oppErr) {
      console.warn("[public-lead-submit] auto-create opportunity failed:", oppErr);
    }

    // ── Contatore richieste totali del contatto (per email + tag overview) ──
    let totalRequests = 1;
    try {
      const { count } = await supabase
        .from("marketing_contact_activities")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contactId)
        .eq("activity_type", "site_lead_submitted");
      if (typeof count === "number" && count > 0) totalRequests = count;
    } catch (err) {
      console.warn("[public-lead-submit] count requests failed:", err);
    }

    // ── Notifica admin (fire-and-forget) ────────────────────────────────────
    // Email a flo.andriciuc@gmail.com per ogni nuova richiesta dal sito.
    // Fail-soft: se l'invio fallisce loggiamo ma NON facciamo fallire il submit.
    try {
      // Prefisso col sito di provenienza (Edilizia in Cloud, Marketing Edile, …)
      // così l'oggetto dice subito da dove arriva il lead.
      const sitePrefix = siteLabel ? `[${siteLabel}] ` : "";
      const subjectLine = totalRequests > 1
        ? `${sitePrefix}Lead ricorrente (${totalRequests}ª richiesta): ${nome}`
        : `${sitePrefix}Nuovo lead sito: ${nome}`;
      const ctxLabelEsc = contextLabel ? escapeHtml(contextLabel) : "";
      const html = `
        <div style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;max-width:560px;margin:auto">
          <h2 style="margin:0 0 16px;font-size:18px">${escapeHtml(subjectLine)}</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#64748b">Nome</td><td style="padding:6px 0"><strong>${escapeHtml(nome)}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Telefono</td><td style="padding:6px 0"><a href="tel:${escapeHtml(telefono)}">${escapeHtml(telefono)}</a></td></tr>
            ${siteLabel ? `<tr><td style="padding:6px 0;color:#64748b">Sito</td><td style="padding:6px 0"><strong>${escapeHtml(siteLabel)}</strong></td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#64748b">Azienda</td><td style="padding:6px 0">${escapeHtml(azienda)}</td></tr>
            ${contextLabel ? `<tr><td style="padding:6px 0;color:#64748b">Modulo</td><td style="padding:6px 0">${ctxLabelEsc}</td></tr>` : ""}
            ${pagePath ? `<tr><td style="padding:6px 0;color:#64748b">Pagina</td><td style="padding:6px 0">${escapeHtml(pagePath)}</td></tr>` : ""}
            ${renderSlug ? `<tr><td style="padding:6px 0;color:#64748b">Render</td><td style="padding:6px 0">${escapeHtml(renderSlug)}</td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#64748b">Richieste totali</td><td style="padding:6px 0"><strong>${totalRequests}</strong></td></tr>
            ${referrerInfo ? `<tr><td style="padding:6px 0;color:#64748b">🤝 Referral partner</td><td style="padding:6px 0"><strong>${escapeHtml(referrerInfo.name)}</strong> (${escapeHtml(referrerInfo.code)})</td></tr>` : referralCode ? `<tr><td style="padding:6px 0;color:#64748b">🤝 Referral codice</td><td style="padding:6px 0">${escapeHtml(referralCode)} (partner non trovato)</td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#64748b">Source</td><td style="padding:6px 0">${escapeHtml(source)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Marketing consent</td><td style="padding:6px 0">${marketingConsent ? "sì" : "no"}</td></tr>
          </table>
          ${messaggio ? `<div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:6px"><div style="color:#64748b;font-size:12px;margin-bottom:4px">Messaggio</div>${escapeHtml(messaggio)}</div>` : ""}
        </div>
      `;
      await sendEmailUnified({
        companyId: null,
        stream: "transactional",
        to: ADMIN_LEAD_NOTIFY_EMAIL,
        subject: subjectLine,
        html,
        text: `${subjectLine}\n\nEmail: ${email}\nTel: ${telefono}\nAzienda: ${azienda}\nRichieste totali: ${totalRequests}`,
        templateName: "admin_new_lead_notification",
        replyTo: email,
        metadata: { contact_id: contactId, request_id: requestId, opportunity_id: opportunityId, source, total_requests: totalRequests },
      });
    } catch (notifyErr) {
      console.warn("[public-lead-submit] admin notify failed:", notifyErr);
    }

    return jsonResponse(req, { ok: true, contact_id: contactId, request_id: requestId, opportunity_id: opportunityId });
  } catch (error) {
    console.error("[public-lead-submit] unexpected error:", error);
    return jsonResponse(req, { error: "Errore interno" }, 500);
  }
});
