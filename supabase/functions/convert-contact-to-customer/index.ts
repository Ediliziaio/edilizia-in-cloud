import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { generateSecurePassword } from "../_shared/securePassword.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: getCorsHeaders(req) });

  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin", "company_admin"], corsH);

    // 2026-05-27: import completo dati contatto→cliente.
    // PRIMA il dialog passava solo first_name/last_name/email/phone/
    // address/fiscal_code/notes — i nuovi campi (is_business,
    // business_name, city, postal_code, province, country, site_*)
    // venivano PERSI nella conversione e l'utente doveva ri-digitarli.
    // ORA accettiamo tutti i campi profile-compatibili. Il contatto
    // resta intatto, il cliente nasce con copia 1:1.
    const {
      contact_id,
      first_name,
      last_name,
      email,
      phone,
      address,
      fiscal_code,
      site_address,
      notes,
      company_id,
      // Nuovi campi (opzionali, retrocompatibili)
      is_business,
      business_name,
      city,
      postal_code,
      province,
      country,
      site_city,
      site_postal_code,
      site_province,
    } = await req.json();

    if (!contact_id || !first_name || !last_name || !email || !company_id)
      return errorResponse("Campi obbligatori: contact_id, first_name, last_name, email, company_id");

    const trimEmail = String(email).trim().toLowerCase();
    const trimFirst = String(first_name).trim();
    const trimLast = String(last_name).trim();

    // Verifica che il contatto esista e appartenga all'azienda
    const { data: contact, error: cErr } = await supabaseAdmin
      .from("marketing_contacts")
      .select("id, company_id, customer_profile_id")
      .eq("id", contact_id)
      .single();

    if (cErr || !contact) return errorResponse("Contatto non trovato", 404);
    if (contact.company_id !== company_id) return errorResponse("Non autorizzato", 403);

    // Controllo idempotenza: già convertito?
    if (contact.customer_profile_id)
      return errorResponse("Questo contatto è stato già convertito in cliente.", 409);

    // Controllo email duplicata
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", trimEmail)
      .eq("company_id", company_id)
      .maybeSingle();

    if (existing)
      return errorResponse(`Esiste già un cliente con email ${trimEmail}.`, 409);

    // Step A — Crea auth user
    const password = generateSecurePassword(12);
    const { data: authUser, error: authErr } = await supabaseAdmin
      .auth.admin.createUser({
        email: trimEmail,
        password,
        email_confirm: true,
        user_metadata: { first_name: trimFirst, last_name: trimLast },
      });

    if (authErr) {
      const isdup =
        authErr.message?.includes("already been registered") ||
        (authErr as { code?: string }).code === "email_exists";
      return errorResponse(
        isdup
          ? `Email ${trimEmail} già registrata nel sistema.`
          : authErr.message,
      );
    }

    const newUserId = authUser.user.id;

    // Step B — Crea profile con marketing_contact_id
    // Insert con TUTTI i campi profili compatibili. Quelli non passati
    // restano null (default). Il link marketing_contact_id permette di
    // risalire al contatto originale in futuro (vedi "Origine Marketing").
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: newUserId,
        first_name: trimFirst,
        last_name: trimLast,
        email: trimEmail,
        phone: phone || null,
        address: address || null,
        fiscal_code: fiscal_code ? String(fiscal_code).toUpperCase() : null,
        site_address: site_address || null,
        notes: notes || null,
        company_id,
        marketing_contact_id: contact_id,
        // Campi estesi (passati dal dialog aggiornato)
        is_business: typeof is_business === "boolean" ? is_business : null,
        business_name: business_name || null,
        city: city || null,
        postal_code: postal_code || null,
        province: province ? String(province).toUpperCase().slice(0, 2) : null,
        country: country || null,
        site_city: site_city || null,
        site_postal_code: site_postal_code || null,
        site_province: site_province ? String(site_province).toUpperCase().slice(0, 2) : null,
      });

    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return errorResponse("Errore creazione profilo: " + profileErr.message, 500);
    }

    // Step C — Ruolo customer
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, role: "customer" });

    if (roleErr) {
      await supabaseAdmin.from("profiles").delete().eq("id", newUserId);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return errorResponse("Errore ruolo: " + roleErr.message, 500);
    }

    // Step D — Aggiorna il contatto marketing (link bidirezionale)
    const { error: updateErr } = await supabaseAdmin
      .from("marketing_contacts")
      .update({
        contact_type: "cliente",
        customer_profile_id: newUserId,
      })
      .eq("id", contact_id);

    if (updateErr) {
      // Non bloccare — il cliente è creato, logga solo
      console.error("Avviso: update contatto fallito:", updateErr.message);
    }

    // Step E — Email di benvenuto
    try {
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("name")
        .eq("id", company_id)
        .single();

      await sendEmailUnified({
        companyId:    company_id,
        stream:       "transactional",
        to:           [trimEmail],
        subject:      `Benvenuto su ${company?.name || "la piattaforma"}`,
        html: `<html><body>
            <p>Ciao ${trimFirst},</p>
            <p>Il tuo account è stato attivato.</p>
            <p><strong>Email:</strong> ${trimEmail}</p>
            <p><strong>Password:</strong> ${password}</p>
            <p>Cambia la password al primo accesso.</p>
          </body></html>`,
        templateName: "contact_converted",
        skipCredits:  false,
        adminClient:  supabaseAdmin,
        metadata:     { contact_id, customer_id: newUserId },
      });
    } catch (e) {
      console.error("Email benvenuto fallita:", e);
    }

    return jsonResponse({
      success: true,
      customer_id: newUserId,
      password,
      contact_updated: !updateErr,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("convert-contact-to-customer error:", err);
    return errorResponse("Errore interno", 500);
  }
});
