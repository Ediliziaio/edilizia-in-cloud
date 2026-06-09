import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * create-reseller — il PRODUTTORE crea un suo RIVENDITORE (white-label).
 *
 * Flusso:
 *  1. Auth: chiamante produttore_admin / super_admin, admin di un'azienda PRODUTTORE
 *     (company_branding.whitelabel_tier = 'agency'). Il produttore è derivato dal
 *     PROFILO del chiamante (mai da input) → niente IDOR cross-produttore.
 *  2. Crea la company figlia (parent_company_id = produttore, billing_comped dal
 *     reseller_billing_mode del produttore, settore ereditato).
 *  3. Eredita SOLO il branding visivo del produttore (logo/colori/attivo). ESCLUDE
 *     dominio/sottodominio/verifica (UNIQUE → violerebbero il vincolo) e declassa il
 *     tier a 'basic' (il rivenditore NON è un produttore: niente sub-rivenditori).
 *  4. Crea/invita l'admin del rivenditore (company_admin sulla company figlia), con
 *     guardia anti-takeover su email già legate ad altra azienda.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json();
    const nome = String(body?.nome ?? "").trim();
    const emailNorm = String(body?.email_admin ?? "").trim().toLowerCase();
    if (!nome) return errorResponse("Il nome del rivenditore è obbligatorio", 400, corsH);
    if (!emailNorm || !emailNorm.includes("@")) return errorResponse("Email admin non valida", 400, corsH);

    // 1. Azienda del chiamante = il produttore (dal profilo, mai da input).
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("company_id").eq("id", userId).single();
    const produttoreId = profile?.company_id as string | undefined;
    if (!produttoreId) return errorResponse("Profilo senza azienda", 403, corsH);

    // 1b. Ruolo del chiamante (produttore_admin o super_admin). Più ruoli → no .single().
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    const callerRoles = new Set((roleRows ?? []).map((r: { role: string }) => r.role));
    if (!callerRoles.has("produttore_admin") && !callerRoles.has("super_admin")) {
      return errorResponse("Non autorizzato: ruolo produttore richiesto", 403, corsH);
    }

    // 1c. Azienda abilitata come produttore (tier agency).
    const { data: prodBranding } = await supabaseAdmin
      .from("company_branding").select("*").eq("company_id", produttoreId).maybeSingle();
    if (!prodBranding || prodBranding.whitelabel_tier !== "agency") {
      return errorResponse("La tua azienda non è abilitata come produttore (serve tier 'agency')", 403, corsH);
    }

    // 2. Chi paga QUESTO rivenditore: override esplicito dal dialog
    //    (billing_comped: true = paga il produttore, false = paga il rivenditore)
    //    oppure default dal modello del produttore ('fabbrica_paga' → comped).
    const { data: produttore } = await supabaseAdmin
      .from("companies").select("reseller_billing_mode, sector").eq("id", produttoreId).single();
    const comped = typeof body?.billing_comped === "boolean"
      ? body.billing_comped
      : produttore?.reseller_billing_mode === "fabbrica_paga";

    // 2b. Idempotenza: evita rivenditori duplicati se si ri-prova dopo un fallimento parziale.
    const { data: dup } = await supabaseAdmin
      .from("companies").select("id")
      .eq("parent_company_id", produttoreId).eq("email", emailNorm).limit(1).maybeSingle();
    if (dup) return errorResponse("Esiste già un rivenditore con questa email.", 409, corsH);

    // 3. Crea la company figlia.
    const { data: child, error: cErr } = await supabaseAdmin
      .from("companies")
      .insert({
        name: nome,
        email: emailNorm,
        parent_company_id: produttoreId,
        billing_comped: comped,
        status: "active",
        sector: produttore?.sector ?? "serramenti",
        payment_method: comped ? "manual" : "stripe",
      })
      .select("id")
      .single();
    if (cErr || !child) {
      return errorResponse(`Errore creazione rivenditore: ${cErr?.message ?? "sconosciuto"}`, 500, corsH);
    }
    const childId = child.id as string;

    // 3b. Eredita SOLO il branding visivo: escludi chiavi tecniche, dominio/sottodominio
    //     (UNIQUE) e tier. Il rivenditore parte da 'basic'.
    const {
      id: _bid, company_id: _bcid, created_at: _bca, updated_at: _bua,
      custom_domain: _cd, custom_domain_cname: _cdc,
      custom_domain_verified: _cdv, custom_domain_verified_at: _cdva,
      subdomain: _sub, whitelabel_tier: _tier,
      ...brandFields
    } = prodBranding as Record<string, unknown>;
    const { error: bErr } = await supabaseAdmin.from("company_branding").upsert(
      { ...brandFields, company_id: childId, whitelabel_tier: "basic" },
      { onConflict: "company_id" },
    );
    if (bErr) {
      return errorResponse(`Rivenditore creato ma branding non ereditato: ${bErr.message}`, 500, corsH);
    }

    // 4. Admin del rivenditore: invita (nuovo) o riusa l'utente esistente.
    const origin = new URL(req.url).origin;
    let adminUserId: string | null = null;
    const { data: invited, error: invErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(emailNorm, {
        redirectTo: `${origin}/cambia-password`,
        data: { company_id: childId, full_name: nome },
      });
    if (invErr) {
      // Utente già esistente → id dal profilo (lookup per email, non paginato).
      const { data: existingProf } = await supabaseAdmin
        .from("profiles").select("id, company_id").eq("email", emailNorm).limit(1).maybeSingle();
      if (!existingProf?.id) {
        return errorResponse("Email già registrata ma profilo non trovato: usa un'altra email.", 409, corsH);
      }
      // Anti-takeover: non strappare un utente già legato ad un'ALTRA azienda.
      if (existingProf.company_id && existingProf.company_id !== childId) {
        return errorResponse("Questa email è già associata a un'altra azienda. Usa un'email diversa.", 409, corsH);
      }
      adminUserId = existingProf.id as string;
    } else {
      adminUserId = invited?.user?.id ?? null;
    }
    if (!adminUserId) {
      return errorResponse("Rivenditore creato ma impossibile creare/invitare l'utente admin", 500, corsH);
    }

    await supabaseAdmin.from("profiles").upsert(
      { id: adminUserId, company_id: childId, email: emailNorm, first_name: nome },
      { onConflict: "id" },
    );

    // user_roles NON ha company_id → check-then-insert (no onConflict ambiguo).
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", adminUserId).eq("role", "company_admin").maybeSingle();
    if (!existingRole) {
      const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: adminUserId, role: "company_admin" });
      if (rErr) return errorResponse(`Rivenditore creato ma ruolo non assegnato: ${rErr.message}`, 500, corsH);
    }

    return jsonResponse({ success: true, reseller_id: childId, admin_user_id: adminUserId, invited: !invErr }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("create-reseller error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
