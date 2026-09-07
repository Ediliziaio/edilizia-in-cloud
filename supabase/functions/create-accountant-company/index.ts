import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * create-accountant-company — il COMMERCIALISTA (owner/admin di uno studio attivo)
 * crea una nuova azienda cliente che viene AUTO-ASSOCIATA al suo studio (delega
 * operativa attiva, senza bisogno di invito). Speculare a create-reseller per i
 * produttori, ma sul modello accountant_company_access.
 *
 * Flusso:
 *  1. Risolve lo studio del chiamante (owner della firm, o member attivo owner/admin).
 *  2. Crea la company (piano full di default, trial) — così il gestionale ha i moduli.
 *  3. Inserisce accountant_company_access: status 'active', access_mode 'operational',
 *     permessi pieni → lo studio vede e opera subito sull'azienda.
 *  4. (Opzionale) invita l'admin cliente se fornita un'email.
 *  5. Audit su accountant_audit_log.
 */
const FULL_PERMISSIONS = {
  finance: true, documents: true, management_control: true,
  jobs: true, requests: true, exports: true, write_actions: true,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);

    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const vat = body?.vat_number ? String(body.vat_number).trim() : null;
    const fiscal = body?.fiscal_code ? String(body.fiscal_code).trim() : null;
    const adminEmail = body?.admin_email ? String(body.admin_email).trim().toLowerCase() : "";
    if (!name) return errorResponse("Il nome dell'azienda è obbligatorio", 400, corsH);
    if (name.length > 120) return errorResponse("Nome troppo lungo (max 120)", 400, corsH);
    if (adminEmail && !/^\S+@\S+\.\S+$/.test(adminEmail)) return errorResponse("Email admin non valida", 400, corsH);

    // 1. Studio del chiamante: owner della firm oppure member attivo (owner/admin).
    let firmId: string | null = null;
    const { data: ownedFirm } = await admin
      .from("accountant_firms").select("id").eq("owner_user_id", userId).neq("status", "archived").limit(1).maybeSingle();
    if (ownedFirm) firmId = ownedFirm.id as string;
    if (!firmId) {
      const { data: mem } = await admin
        .from("accountant_firm_members").select("firm_id")
        .eq("user_id", userId).eq("status", "active").in("role", ["owner", "admin"]).limit(1).maybeSingle();
      if (mem) firmId = mem.firm_id as string;
    }
    if (!firmId) return errorResponse("Nessuno studio attivo per questo utente (serve ruolo owner/admin).", 403, corsH);

    // 2. Piano di default: primo full plan globale attivo (così i moduli funzionano).
    const { data: defPlan } = await admin
      .from("subscription_plans").select("id, trial_days")
      .eq("is_active", true).eq("is_full_plan", true).is("produttore_id", null)
      .order("position", { ascending: true }).limit(1).maybeSingle();
    const planId = (defPlan?.id as string | undefined) ?? null;
    const trialDays = Number(defPlan?.trial_days ?? 31);
    const trialEndsAt = new Date(Date.now() + trialDays * 86400 * 1000).toISOString();

    // 3. Crea la company (trial, piano di default, nessun metodo di pagamento).
    const { data: company, error: cErr } = await admin
      .from("companies")
      .insert({
        name,
        email: adminEmail || null,
        vat_number: vat,
        fiscal_code: fiscal,
        sector: "serramenti",
        status: "trial",
        trial_ends_at: trialEndsAt,
        subscription_plan_id: planId,
        payment_method: "none",
      })
      .select("id")
      .single();
    if (cErr || !company) return errorResponse(`Errore creazione azienda: ${cErr?.message ?? "sconosciuto"}`, 500, corsH);
    const companyId = company.id as string;

    // 4. Associa lo studio: delega operativa attiva (no invito: l'ha creata lui).
    const nowIso = new Date().toISOString();
    const { error: aErr } = await admin.from("accountant_company_access").insert({
      firm_id: firmId,
      company_id: companyId,
      status: "active",
      access_mode: "operational",
      permissions: FULL_PERMISSIONS,
      granted_by: userId,
      accepted_at: nowIso,
      accepted_by: userId,
    });
    if (aErr) return errorResponse(`Azienda creata ma associazione allo studio fallita: ${aErr.message}`, 500, corsH);

    // 5. (Opzionale) invita l'admin cliente.
    let invited = false;
    if (adminEmail) {
      const origin = Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
      const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(adminEmail, {
        // /reset-password e non /cambia-password: chi riceve l'invito non ha
        // ancora una password, e /cambia-password gli chiederebbe quella attuale.
        redirectTo: `${origin}/reset-password`,
        data: { company_id: companyId, full_name: name },
      });
      let adminUserId = inv?.user?.id ?? null;
      if (invErr) {
        const { data: prof } = await admin.from("profiles").select("id, company_id").eq("email", adminEmail).limit(1).maybeSingle();
        // Anti-takeover: non strappare un utente già legato ad un'altra azienda.
        if (prof?.id && (!prof.company_id || prof.company_id === companyId)) adminUserId = prof.id as string;
      }
      if (adminUserId) {
        await admin.from("profiles").upsert({ id: adminUserId, company_id: companyId, email: adminEmail, first_name: name }, { onConflict: "id" });
        const { data: hasRole } = await admin
          .from("user_roles").select("id").eq("user_id", adminUserId).eq("role", "company_admin").maybeSingle();
        if (!hasRole) await admin.from("user_roles").insert({ user_id: adminUserId, role: "company_admin" });
        invited = !invErr;
      }
    }

    // 6. Audit best-effort.
    await admin.from("accountant_audit_log").insert({
      firm_id: firmId,
      company_id: companyId,
      actor_user_id: userId,
      action: "company_created",
      entity_type: "company",
      entity_id: companyId,
      metadata: { name, via: "accountant_portal", invited },
    });

    return jsonResponse({ success: true, company_id: companyId, invited }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("create-accountant-company error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
