import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { firstEmailStep, nonEmailStepCount, computeStepSchedule, type SeqStep } from "../_shared/outreach-sequence.ts";

/**
 * outreach-enroll — il SUPER_ADMIN iscrive contatti a una sequenza cold.
 *
 * Per ogni contatto idoneo crea un'iscrizione (outreach_enrollments) e mette in
 * coda il PRIMO step email (outreach_send_queue): da lì il dispatcher invia e fa
 * avanzare la cadenza step-by-step. Filtra a monte chi non va contattato:
 *   • niente email · opt-out email · in blocklist (email_suppressions) · già iscritto.
 *
 * Selettori (almeno uno): contact_ids[] | tag | source | scope:'all'.
 * La finestra d'invio (Lun-Ven, orari) la applica il dispatcher: qui le date di
 * schedulazione sono grezze.
 */

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";
const MAX_CONTACTS = 5000;

interface ContactRow {
  id: string;
  email: string | null;
  optout_email: boolean | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const sequenceId = typeof body?.sequence_id === "string" ? body.sequence_id : "";
    if (!sequenceId) return errorResponse("sequence_id mancante", 400, corsH);

    const contactIds: string[] = Array.isArray(body?.contact_ids)
      ? body.contact_ids.map((x: unknown) => String(x)).filter(Boolean)
      : [];
    const tag = typeof body?.tag === "string" && body.tag.trim() ? body.tag.trim() : "";
    const source = typeof body?.source === "string" && body.source.trim() ? body.source.trim() : "";
    const all = body?.scope === "all" || body?.all === true;
    if (!contactIds.length && !tag && !source && !all) {
      return errorResponse("Specifica chi iscrivere: contact_ids, tag, source oppure scope:'all'.", 400, corsH);
    }

    // 1. sequenza + step
    const { data: seq, error: seqErr } = await admin
      .from("outreach_sequences").select("id,status,brand_id").eq("id", sequenceId).maybeSingle();
    if (seqErr) throw seqErr;
    if (!seq) return errorResponse("Sequenza non trovata", 404, corsH);
    if (seq.status === "archived") return errorResponse("La sequenza è archiviata: ripristinala prima di iscrivere contatti.", 409, corsH);

    const { data: stepsRaw, error: stepErr } = await admin
      .from("outreach_sequence_steps")
      .select("step_order,channel,delay_days,delay_hours,subject,body")
      .eq("sequence_id", sequenceId).order("step_order", { ascending: true });
    if (stepErr) throw stepErr;
    const steps = (stepsRaw ?? []) as SeqStep[];
    const first = firstEmailStep(steps);
    if (!first) return errorResponse("La sequenza non ha step email: aggiungi almeno uno step email prima di iscrivere.", 400, corsH);

    // 2. contatti candidati (platform company)
    let q = admin
      .from("marketing_contacts")
      .select("id,email,optout_email")
      .eq("company_id", PLATFORM_COMPANY)
      .limit(MAX_CONTACTS);
    if (contactIds.length) q = q.in("id", contactIds);
    if (tag) q = q.contains("tags", [tag]);
    if (source) q = q.eq("source", source);
    const { data: contactsRaw, error: cErr } = await q;
    if (cErr) throw cErr;
    const contacts = (contactsRaw ?? []) as ContactRow[];

    const stats = {
      candidates: contacts.length,
      enrolled: 0,
      skipped_no_email: 0,
      skipped_optout: 0,
      skipped_suppressed: 0,
      skipped_already: 0,
      non_email_steps_skipped: nonEmailStepCount(steps),
    };
    if (contacts.length === 0) {
      return jsonResponse({ ...stats, note: "Nessun contatto corrisponde ai criteri." }, 200, corsH);
    }

    // 3. blocklist + iscrizioni già esistenti
    const norm = (e: string) => e.toLowerCase().trim();
    const emails = contacts.map((c) => c.email).filter((e): e is string => !!e).map(norm);
    const suppressed = new Set<string>();
    if (emails.length) {
      const { data: sup } = await admin
        .from("email_suppressions").select("email_normalized")
        .eq("company_id", PLATFORM_COMPANY).in("email_normalized", emails);
      for (const s of sup ?? []) suppressed.add(String((s as { email_normalized: string }).email_normalized));
    }
    const { data: existing } = await admin
      .from("outreach_enrollments").select("contact_id").eq("sequence_id", sequenceId);
    const already = new Set((existing ?? []).map((e: { contact_id: string }) => String(e.contact_id)));

    // 4. filtro
    const eligible: ContactRow[] = [];
    for (const c of contacts) {
      if (already.has(c.id)) { stats.skipped_already++; continue; }
      if (!c.email) { stats.skipped_no_email++; continue; }
      if (c.optout_email) { stats.skipped_optout++; continue; }
      if (suppressed.has(norm(c.email))) { stats.skipped_suppressed++; continue; }
      eligible.push(c);
    }
    if (eligible.length === 0) {
      return jsonResponse({ ...stats, note: "Nessun contatto idoneo (già iscritti / opt-out / in blocklist / senza email)." }, 200, corsH);
    }

    // 5. iscrivi + accoda il primo step (a blocchi)
    const now = new Date();
    const schedule = computeStepSchedule(now, first.delay_days, first.delay_hours).toISOString();
    const CHUNK = 200;
    for (let i = 0; i < eligible.length; i += CHUNK) {
      const slice = eligible.slice(i, i + CHUNK);
      const enrRows = slice.map((c) => ({
        company_id: PLATFORM_COMPANY,
        sequence_id: sequenceId,
        contact_id: c.id,
        status: "active",
        current_step: first.step_order,
        next_action_at: schedule,
      }));
      const { data: enr, error: enrErr } = await admin
        .from("outreach_enrollments").insert(enrRows).select("id,contact_id");
      if (enrErr) throw enrErr;
      const emailByContact = new Map(slice.map((c) => [c.id, c.email]));
      const queueRows = (enr ?? []).map((row: { id: string; contact_id: string }) => {
        return {
          company_id: PLATFORM_COMPANY,
          enrollment_id: row.id,
          contact_id: row.contact_id,
          brand_id: seq.brand_id ?? null,
          channel: "email",
          to_email: emailByContact.get(row.contact_id) ?? null,
          subject: first.subject ?? "",
          body: first.body ?? "",
          status: "queued",
          scheduled_for: schedule,
        };
      });
      if (queueRows.length) {
        const { error: qErr } = await admin.from("outreach_send_queue").insert(queueRows);
        if (qErr) throw qErr;
      }
      stats.enrolled += enr?.length ?? 0;
    }

    // 6. se la sequenza era in bozza, attivala (sta per partire davvero)
    if (seq.status === "draft" && stats.enrolled > 0) {
      await admin.from("outreach_sequences").update({ status: "active" }).eq("id", sequenceId);
    }

    return jsonResponse({ ...stats, scheduled_for: schedule }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-enroll error:", e);
    return errorResponse("Errore durante l'iscrizione alla sequenza", 500, corsH);
  }
});
