import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * create-produttore — il SUPER ADMIN crea un PRODUTTORE white-label (fabbrica
 * serramenti) che potrà a sua volta creare i propri rivenditori.
 *
 * Flusso:
 *  1. Auth: chiamante super_admin.
 *  2. Crea la company "produttore" (nessun parent; tier agency; modello billing
 *     scelto: fabbrica_paga | reseller_paga).
 *  3. Crea company_branding con whitelabel_tier='agency' (abilita il portale
 *     produttore + dominio custom + create-reseller).
 *  4. Invita l'admin del produttore (ruolo produttore_admin sulla sua company).
 *
 * NB: user_roles NON ha company_id (l'azienda si lega via profiles.company_id) →
 * check-then-insert sul ruolo (stesso pattern di create-reseller).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json();
    const nome = String(body?.nome ?? "").trim();
    const emailNorm = String(body?.email_admin ?? "").trim().toLowerCase();
    const billingMode = body?.billing_mode === "reseller_paga" ? "reseller_paga" : "fabbrica_paga";
    const settore = String(body?.sector ?? "serramenti").trim() || "serramenti";

    if (!nome) return errorResponse("Il nome del produttore è obbligatorio", 400, corsH);
    if (!emailNorm || !emailNorm.includes("@")) return errorResponse("Email admin non valida", 400, corsH);

    // 1. Solo super_admin.
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    const isSuperAdmin = (roles ?? []).some((r: { role: string }) => r.role === "super_admin");
    if (!isSuperAdmin) return errorResponse("Non autorizzato: richiesto super admin", 403, corsH);

    // 1b. Idempotenza: niente produttori duplicati con la stessa email (retry-safe).
    const { data: sameEmail } = await supabaseAdmin.from("companies").select("id").eq("email", emailNorm);
    if (sameEmail && sameEmail.length > 0) {
      const { data: agencyDup } = await supabaseAdmin
        .from("company_branding").select("company_id")
        .eq("whitelabel_tier", "agency")
        .in("company_id", sameEmail.map((c: { id: string }) => c.id)).limit(1).maybeSingle();
      if (agencyDup) return errorResponse("Esiste già un produttore con questa email.", 409, corsH);
    }

    // 2. Crea la company produttore.
    const { data: produttore, error: cErr } = await supabaseAdmin
      .from("companies")
      .insert({
        name: nome,
        email: emailNorm,
        status: "active",
        sector: settore,
        reseller_billing_mode: billingMode,
        payment_method: "comped",
      })
      .select("id")
      .single();
    if (cErr || !produttore) {
      return errorResponse(`Errore creazione produttore: ${cErr?.message ?? "sconosciuto"}`, 500, corsH);
    }
    const produttoreId = produttore.id as string;

    // 3. Branding agency (abilita portale produttore + dominio + create-reseller).
    const { error: bErr } = await supabaseAdmin.from("company_branding").upsert(
      { company_id: produttoreId, whitelabel_tier: "agency", is_active: true },
      { onConflict: "company_id" },
    );
    if (bErr) {
      return errorResponse(`Produttore creato ma branding non impostato: ${bErr.message}`, 500, corsH);
    }

    // 4. Admin del produttore: invita o riusa l'utente esistente.
    const origin = new URL(req.url).origin;
    let adminUserId: string | null = null;
    const { data: invited, error: invErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(emailNorm, {
        redirectTo: `${origin}/cambia-password`,
        data: { company_id: produttoreId, full_name: nome },
      });
    if (invErr) {
      // Utente già esistente → id dal profilo (lookup per email, non paginato).
      const { data: existingProf } = await supabaseAdmin
        .from("profiles").select("id, company_id").eq("email", emailNorm).limit(1).maybeSingle();
      if (!existingProf?.id) {
        return errorResponse("Email già registrata ma profilo non trovato: usa un'altra email.", 409, corsH);
      }
      // Anti-takeover: non strappare un utente già legato ad un'ALTRA azienda.
      if (existingProf.company_id && existingProf.company_id !== produttoreId) {
        return errorResponse("Questa email è già associata a un'altra azienda. Usa un'email diversa.", 409, corsH);
      }
      adminUserId = existingProf.id as string;
    } else {
      adminUserId = invited?.user?.id ?? null;
    }

    if (!adminUserId) {
      return errorResponse("Produttore creato ma impossibile creare/invitare l'utente admin", 500, corsH);
    }

    await supabaseAdmin.from("profiles").upsert(
      { id: adminUserId, company_id: produttoreId, email: emailNorm, first_name: nome },
      { onConflict: "id" },
    );

    // user_roles non ha company_id → check-then-insert (no onConflict ambiguo).
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", adminUserId).eq("role", "produttore_admin").maybeSingle();
    if (!existingRole) {
      await supabaseAdmin.from("user_roles").insert({ user_id: adminUserId, role: "produttore_admin" });
    }

    return jsonResponse(
      { success: true, produttore_id: produttoreId, admin_user_id: adminUserId, invited: !invErr },
      200,
      corsH,
    );
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("create-produttore error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
