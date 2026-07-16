/**
 * system-emails-tick — cron robusto per le email di sistema RITARDATE.
 *
 * Pattern identico a process-dunning: query deterministiche (via RPC) + invio
 * template registry + tabella anti-doppione (system_email_sends). Idempotente:
 * ogni (email_key, ref_id) parte una sola volta; se l'invio fallisce, il guard
 * viene rimosso così il run successivo ritenta.
 *
 * Job:
 *   - setup_incomplete (1.2): aziende create ~48h fa senza primo cantiere.
 *   - invite_reminder (3.2): inviti admin pendenti da ~48h, non accettati.
 *
 * Auth: x-cron-secret == INTERNAL_CRON_SECRET (scheduler) OPPURE JWT super_admin
 * (trigger manuale dalla dashboard). Schedulare ogni ora.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { renderEmailTemplate } from "../_shared/renderTemplate.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // ── Auth: cron secret oppure super_admin ───────────────────────────────────
  let authorized = false;
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) {
    authorized = true;
  } else {
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      if (user) {
        const { data: r } = await admin.from("user_roles")
          .select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
        if (r) authorized = true;
      }
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const siteUrl = ((await getPlatformSetting("site_url", "SITE_URL")) || Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
  const result = { setup_incomplete: 0, invite_reminder: 0, purchase_confirmed: 0, invite_expired: 0, renewal_upcoming: 0, task_assigned: 0, errors: [] as string[] };
  const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

  // dedup-then-send: inserisce il guard PRIMA dell'invio (no doppioni in caso di
  // run concorrenti); se l'invio fallisce rimuove il guard (così si ritenta).
  async function guardedSend(
    emailKey: string,
    refId: string,
    companyId: string | null,
    recipient: string,
    render: () => Promise<{ subject: string; html: string; text: string }>,
  ): Promise<boolean> {
    if (!recipient) return false;
    const { data: ins, error: insErr } = await admin
      .from("system_email_sends")
      .insert({ email_key: emailKey, ref_id: refId, company_id: companyId, recipient })
      .select("id")
      .maybeSingle();
    if (insErr || !ins) return false; // conflitto (già inviato) o errore → skip
    try {
      const r = await render();
      const res = await sendEmailUnified({
        companyId, stream: "transactional", to: recipient,
        subject: r.subject, html: r.html, text: r.text,
        templateName: emailKey, skipCredits: true, adminClient: admin,
      });
      if (!res?.ok) throw new Error(`send status ${res?.status ?? "?"}`);
      return true;
    } catch (e) {
      await admin.from("system_email_sends").delete()
        .eq("email_key", emailKey).eq("ref_id", refId);
      result.errors.push(`${emailKey}:${refId}: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  // ── Job A — Setup non completato +48h ───────────────────────────────────────
  try {
    const { data: cands, error } = await admin.rpc("system_emails_setup_incomplete_candidates", { p_min_hours: 48, p_max_hours: 96 });
    if (error) throw error;
    for (const c of (cands ?? []) as Array<{ company_id: string; company_name: string; admin_email: string; admin_name: string }>) {
      const ok = await guardedSend("setup_incomplete", c.company_id, c.company_id, c.admin_email, () =>
        renderEmailTemplate({
          templateName: "setup_incomplete",
          companyId: c.company_id,
          adminClient: admin,
          props: { recipientName: c.admin_name || "Admin", setupUrl: siteUrl ? `${siteUrl}/azienda` : "" },
        }),
      );
      if (ok) result.setup_incomplete++;
    }
  } catch (e) {
    result.errors.push(`setup_incomplete job: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Job B — Promemoria invito +48h ──────────────────────────────────────────
  try {
    const { data: cands, error } = await admin.rpc("system_emails_invite_reminder_candidates", { p_min_hours: 48, p_max_hours: 96 });
    if (error) throw error;
    for (const iv of (cands ?? []) as Array<{ invite_id: string; recipient_email: string; inviter_name: string; token: string }>) {
      const inviteUrl = siteUrl ? `${siteUrl}/admin/accept-invite?token=${iv.token}` : "";
      const recipientName = String(iv.recipient_email).split("@")[0] || "";
      const ok = await guardedSend("invite_reminder", iv.invite_id, null, iv.recipient_email, () =>
        renderEmailTemplate({
          templateName: "invite_reminder",
          companyId: null,
          adminClient: admin,
          props: { recipientName, inviterName: iv.inviter_name || "EdiliziaInCloud", inviteUrl },
        }),
      );
      if (ok) result.invite_reminder++;
    }
  } catch (e) {
    result.errors.push(`invite_reminder job: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Job C — Conferma acquisto (prima attivazione a pagamento) ───────────────
  try {
    const { data: cands, error } = await admin.rpc("system_emails_purchase_confirmed_candidates", { p_hours: 25 });
    if (error) throw error;
    for (const c of (cands ?? []) as Array<{ company_id: string; company_name: string; admin_email: string; admin_name: string; plan_name: string | null; price_monthly: number | null; price_yearly: number | null }>) {
      const monthly = Number(c.price_monthly ?? 0);
      const yearly = Number(c.price_yearly ?? 0);
      // Fallback "—": un placeholder non risolto resterebbe {{...}} in chiaro nell'email
      const amountFormatted = monthly > 0 ? eur(monthly) : yearly > 0 ? eur(yearly) : "—";
      const periodicity = monthly > 0 ? "mensile" : yearly > 0 ? "annuale" : "—";
      const ok = await guardedSend("purchase_confirmed", c.company_id, c.company_id, c.admin_email, () =>
        renderEmailTemplate({
          templateName: "purchase_confirmed",
          companyId: c.company_id,
          adminClient: admin,
          props: {
            recipientName: c.admin_name || "Admin",
            planName: c.plan_name || "il tuo piano",
            amountFormatted,
            periodicity,
            appUrl: siteUrl ? `${siteUrl}/azienda` : "",
          },
        }),
      );
      if (ok) result.purchase_confirmed++;
    }
  } catch (e) {
    result.errors.push(`purchase_confirmed job: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Job D — Invito scaduto (finestra ultime 25h) ────────────────────────────
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const { data: expired, error } = await admin
      .from("admin_invites")
      .select("id, email, invited_by, expires_at")
      .is("accepted_at", null)
      .gte("expires_at", from)
      .lt("expires_at", now.toISOString());
    if (error) throw error;
    for (const iv of (expired ?? []) as Array<{ id: string; email: string; invited_by: string | null }>) {
      let inviterName = "EdiliziaInCloud";
      if (iv.invited_by) {
        const { data: p } = await admin.from("profiles").select("first_name, last_name").eq("id", iv.invited_by).maybeSingle();
        const full = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
        if (full) inviterName = full;
      }
      const ok = await guardedSend("invite_expired", iv.id, null, iv.email, () =>
        renderEmailTemplate({
          templateName: "invite_expired",
          companyId: null,
          adminClient: admin,
          props: { recipientName: String(iv.email).split("@")[0] || "", inviterName },
        }),
      );
      if (ok) result.invite_expired++;
    }
  } catch (e) {
    result.errors.push(`invite_expired job: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Job E — Rinnovo in arrivo (D-3, finestra 2-4 giorni) ────────────────────
  try {
    const in2d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const in4d = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
    const { data: subs, error } = await admin
      .from("company_subscriptions")
      .select("company_id, plan_id, billing_period, current_period_end")
      .eq("status", "active")
      .gte("current_period_end", in2d)
      .lte("current_period_end", in4d);
    if (error) throw error;
    for (const s of (subs ?? []) as Array<{ company_id: string; plan_id: string | null; billing_period: string | null; current_period_end: string }>) {
      // ref_id = company+scadenza → una sola email per periodo di rinnovo
      const refId = `${s.company_id}:${String(s.current_period_end).slice(0, 10)}`;
      let amount = "—";
      if (s.plan_id) {
        const { data: plan } = await admin.from("subscription_plans").select("price_monthly, price_yearly").eq("id", s.plan_id).maybeSingle();
        const n = s.billing_period === "yearly" ? Number(plan?.price_yearly ?? 0) : Number(plan?.price_monthly ?? 0);
        if (n > 0) amount = eur(n);
      }
      const { data: prof } = await admin.from("profiles").select("id, first_name").eq("company_id", s.company_id).order("id", { ascending: true }).limit(1).maybeSingle();
      if (!prof) continue;
      const { data: ud } = await admin.auth.admin.getUserById(prof.id);
      const adminEmail = ud?.user?.email;
      if (!adminEmail) continue;
      const renewalDate = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(s.current_period_end));
      const ok = await guardedSend("renewal_upcoming", refId, s.company_id, adminEmail, () =>
        renderEmailTemplate({
          templateName: "renewal_upcoming",
          companyId: s.company_id,
          adminClient: admin,
          props: {
            recipientName: prof.first_name || "Admin",
            renewalDate,
            amountFormatted: amount,
            ctaUrl: siteUrl ? `${siteUrl}/azienda/impostazioni/abbonamento` : "",
          },
        }),
      );
      if (ok) result.renewal_upcoming++;
    }
  } catch (e) {
    result.errors.push(`renewal_upcoming job: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Job F — Attività assegnata (sweep ultime 25h, dedup per task+assegnatario) ──
  // Le task nascono da insert frontend (nessuna edge fn sul percorso di scrittura):
  // sweep orario su updated_at. Il guard (task_assigned, taskId:assignee) garantisce
  // UNA email per coppia anche se la task viene modificata più volte.
  try {
    const from = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { data: tasks, error } = await admin
      .from("tasks")
      .select("id, title, due_date, company_id, created_by, assigned_to, status")
      .not("assigned_to", "is", null)
      .in("status", ["da_fare", "in_corso"])
      .gte("updated_at", from);
    if (error) throw error;
    for (const t of (tasks ?? []) as Array<{ id: string; title: string; due_date: string | null; company_id: string; created_by: string; assigned_to: string }>) {
      if (!t.assigned_to || t.assigned_to === t.created_by) continue; // niente auto-notifica
      const { data: prof } = await admin.from("profiles").select("id, first_name").eq("id", t.assigned_to).maybeSingle();
      if (!prof) continue;
      const { data: ud } = await admin.auth.admin.getUserById(t.assigned_to);
      const toEmail = ud?.user?.email;
      if (!toEmail) continue;
      const { data: sender } = await admin.from("profiles").select("first_name, last_name").eq("id", t.created_by).maybeSingle();
      const senderName = [sender?.first_name, sender?.last_name].filter(Boolean).join(" ").trim() || "Un collega";
      const dueDate = t.due_date
        ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(t.due_date))
        : "—";
      const ok = await guardedSend("task_assigned", `${t.id}:${t.assigned_to}`, t.company_id, toEmail, () =>
        renderEmailTemplate({
          templateName: "task_assigned",
          companyId: t.company_id,
          adminClient: admin,
          props: {
            recipientName: prof.first_name || toEmail.split("@")[0],
            senderName,
            taskName: t.title,
            dueDate,
            ctaUrl: siteUrl ? `${siteUrl}/azienda/attivita` : "",
          },
        }),
      );
      if (ok) result.task_assigned++;
    }
  } catch (e) {
    result.errors.push(`task_assigned job: ${e instanceof Error ? e.message : String(e)}`);
  }

  return new Response(JSON.stringify({ ok: true, ...result }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

// redeploy 2026-06-25: propaga _shared email/branding (.it→.com + builder 58 email) — trigger CI HEAD~1 diff
