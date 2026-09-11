import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { requireAuth, isSuperAdminEmailAllowed, resolveUserEmail, aziendaAccessibile } from "../_shared/auth.ts";
import { generateSecurePassword } from "../_shared/securePassword.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { sanitizeCustomerInput } from "../_shared/customerDataSanitizer.ts";
import { messaggioErroreAuth } from "../_shared/authErrorMessage.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTERNAL_NO_EMAIL_DOMAIN = "no-email.ediliziaincloud.local";

/**
 * Chi può creare un cliente per questa azienda.
 *
 * Prima serviva il ruolo `company_admin` e l'azienda veniva confrontata con
 * quella scritta nel profilo del chiamante. Due conseguenze, entrambe reali:
 *
 *  - Il dipendente che crea le commesse trovava il bottone «+» accanto al menu
 *    del cliente — la pagina di creazione commessa è protetta da
 *    `can_edit_orders`, non dal ruolo — riempiva il modulo e si prendeva un
 *    403. In produzione erano quindici persone, dieci delle quali con
 *    `can_edit_customers` esplicitamente acceso.
 *  - L'amministratore entrato in una seconda azienda con l'accesso
 *    multi-azienda prendeva lo stesso 403, perché il suo profilo continua a
 *    puntare all'azienda di partenza.
 *
 * I permessi si leggono sulla riga di QUESTA azienda: `staff_permissions` è
 * unica per (utente, azienda) e un utente può averne due.
 */
async function autorizzaCreazioneCliente(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  userId: string,
  companyId: string,
): Promise<{ ok: true; ruolo: string } | { ok: false; motivo: string; stato: number }> {
  const { data: righeRuoli } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  const ruoli: string[] = (righeRuoli ?? []).map((r: { role: string }) => r.role);

  // Il ruolo super_admin vale solo se l'email è in allowlist: stessa
  // difesa-in-profondità di requireRole.
  if (ruoli.includes("super_admin")) {
    const email = await resolveUserEmail(supabaseAdmin, userId);
    if (isSuperAdminEmailAllowed(email)) return { ok: true, ruolo: "super_admin" };
  }

  // Per tutti gli altri l'azienda dev'essere la propria, o una a cui hanno un
  // accesso multi-azienda ancora valido.
  if (!(await aziendaAccessibile(supabaseAdmin, userId, companyId))) {
    return { ok: false, motivo: "Non autorizzato a creare clienti per questa azienda", stato: 403 };
  }

  if (ruoli.includes("company_admin")) return { ok: true, ruolo: "company_admin" };

  // Un permesso vale solo per chi ha un ruolo interno: una riga di
  // staff_permissions finita per sbaglio su un utente-cliente non deve aprire
  // niente. Oggi non ce ne sono — le 19 righe con questi permessi hanno tutte
  // un ruolo interno — ma la regola qui non dipende da quel dato.
  const RUOLI_INTERNI = ["company_staff", "company_admin", "super_admin", "salesperson"];
  if (!ruoli.some((r) => RUOLI_INTERNI.includes(r))) {
    return { ok: false, motivo: "Non autorizzato a creare clienti", stato: 403 };
  }

  const { data: permessi } = await supabaseAdmin
    .from("staff_permissions")
    .select("can_edit_customers, can_edit_orders")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (permessi?.can_edit_customers === true || permessi?.can_edit_orders === true) {
    return { ok: true, ruolo: "company_staff" };
  }

  return {
    ok: false,
    motivo: "Non hai il permesso di creare clienti. Chiedi a un amministratore "
      + "dell'azienda di attivarti «modifica clienti» o «modifica commesse».",
    stato: 403,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    // --- Authentication & Authorization ---
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json();
    const {
      company_id,
      create_portal_account,       // boolean opt-in, client può forzare OFF
      send_welcome_email,           // boolean, default: true se portal abilitato
      is_business,                  // boolean
      business_name,
      customer_type,                // 'privato' | 'appaltatore' (modulo Appaltatori)
      city,
      postal_code,
      province,
      country,
      site_city,
      site_postal_code,
      site_province,
    } = body as Record<string, unknown>;

    if (!company_id) {
      return errorResponse("Missing company_id");
    }

    // Autorizzazione prima di ogni altra cosa: chi non può, non arriva
    // nemmeno a sapere se l'azienda esiste.
    const permesso = await autorizzaCreazioneCliente(supabaseAdmin, userId, company_id as string);
    if (!permesso.ok) {
      return errorResponse(permesso.motivo, permesso.stato);
    }

    const cleanTxt = (v: unknown, max: number) => {
      if (v === null || v === undefined) return null;
      const s = String(v).replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
      return s || null;
    };

    const isBusiness = Boolean(is_business);
    const businessName = cleanTxt(business_name, 200);
    if (isBusiness && !businessName) {
      return errorResponse("La ragione sociale è obbligatoria per i clienti Azienda");
    }

    // Modulo Appaltatori: il client può specificare customer_type='appaltatore'.
    // L'attivazione UI è gated dal feature flag, ma il server è permissivo
    // (whitelist su valori validi) per evitare rotture in caso di feature flag
    // disabilitato post-creazione. Default 'privato' per retrocompatibilità.
    const rawCustomerType =
      typeof customer_type === "string" ? customer_type.trim().toLowerCase() : null;
    const customerType: "privato" | "appaltatore" =
      rawCustomerType === "appaltatore" ? "appaltatore" : "privato";
    if (customerType === "appaltatore" && !isBusiness) {
      return errorResponse(
        "Un cliente di tipo Appaltatore deve essere un'Azienda (ragione sociale + P.IVA).",
      );
    }

    // --- Sanitizzazione + auto-correzione input ---
    // Il sanitizer corregge i casi più comuni di import errato:
    //  - numero di telefono finito in first_name / last_name
    //  - CF/P.IVA finito in first_name / last_name
    //  - split automatico "NOME COGNOME" quando uno dei due è vuoto
    //  - rimozione caratteri invisibili
    // I fix applicati vengono loggati e ritornati al client (trasparenza).
    const sanitized = sanitizeCustomerInput(body as Record<string, unknown>);

    const trimmedFirstName = sanitized.first_name;
    const trimmedLastName = sanitized.last_name;
    const rawEmail = (sanitized.email || "").slice(0, 255);
    const trimmedPhone = sanitized.phone;
    // Dopo il sanitize, se mancano ancora sia nome che cognome E non è
    // un'azienda → rifiutiamo: nessuna identità ricostruibile.
    if (!isBusiness && !trimmedFirstName && !trimmedLastName) {
      return errorResponse(
        "Nome o cognome sono obbligatori per i clienti persona. Se il documento non contiene un'identità chiara, correggi manualmente prima di importare."
      );
    }
    // Per clienti Azienda: first/last opzionali (referente). Per clienti
    // persona: forziamo placeholder "—" se uno dei due è vuoto.
    const safeFirstName = trimmedFirstName || (isBusiness ? "" : "—");
    const safeLastName = trimmedLastName || (isBusiness ? (businessName ?? "—") : "—");

    // --- Azienda esistente + lettura setting portale ---
    // (il controllo di accesso è già stato fatto sopra, prima di tutto il resto)
    const { data: companyRow } = await supabaseAdmin
      .from("companies")
      .select("id, name, customer_portal_enabled")
      .eq("id", company_id)
      .maybeSingle();

    if (!companyRow) {
      return errorResponse("Azienda non trovata", 404);
    }

    // Determina se creare il portal account:
    // - Il portale e' SPENTO di partenza per ogni azienda (20280915100000): si
    //   crea l'account solo se l'azienda l'ha acceso esplicitamente. Un valore
    //   mancante vale "spento", mai "acceso".
    // - Se l'azienda l'ha acceso, rispetta la scelta del client per il singolo cliente.
    const companyPortalEnabled = companyRow.customer_portal_enabled === true;
    const clientWantsPortal = create_portal_account !== false; // default true
    const shouldCreatePortal = companyPortalEnabled && clientWantsPortal;
    const shouldSendWelcomeEmail = shouldCreatePortal && send_welcome_email !== false;

    // Validation (post-sanitize)
    // L'email resta obbligatoria solo quando il cliente deve accedere al portale.
    // Per anagrafiche operative senza portale generiamo una mail tecnica interna:
    // serve solo per rispettare il vincolo auth/profiles, resta bloccata e non va
    // mostrata come contatto reale nell'interfaccia.
    if (shouldCreatePortal && !rawEmail) {
      return errorResponse("Email è obbligatoria per creare l'accesso al portale");
    }
    if (rawEmail && !EMAIL_REGEX.test(rawEmail)) {
      return errorResponse("Indirizzo email non valido");
    }
    const trimmedEmail = rawEmail || `cliente-${crypto.randomUUID()}@${INTERNAL_NO_EMAIL_DOMAIN}`;

    // --- Password generation ---
    // Anche quando il portale è disabilitato creiamo un account auth shadow
    // (profiles.id ha FK a auth.users). La password è random non recuperabile
    // e l'account sarà immediatamente bloccato.
    const password = generateSecurePassword(shouldCreatePortal ? 12 : 32);

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true,
      user_metadata: { first_name: safeFirstName, last_name: safeLastName },
    });

    if (authError) {
      const isEmailExists = authError.message?.includes("already been registered") ||
                            (authError as { code?: string }).code === "email_exists";
      const errorMessage = isEmailExists
        ? "Esiste già un utente con questo indirizzo email. Usa un'email diversa."
        : messaggioErroreAuth(authError);
      return errorResponse(errorMessage);
    }

    const newUserId = authUser.user.id;

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: newUserId,
      first_name: safeFirstName,
      last_name: safeLastName,
      email: trimmedEmail,
      phone: trimmedPhone,
      address: sanitized.address,
      company_id: company_id as string,
      fiscal_code: sanitized.fiscal_code,
      vat_number: sanitized.vat_number,
      site_address: sanitized.site_address,
      notes: sanitized.notes,
      // Nuovi campi: business + address strutturato
      is_business: isBusiness,
      business_name: businessName,
      customer_type: customerType,
      city: cleanTxt(city, 100),
      postal_code: cleanTxt(postal_code, 10),
      province: cleanTxt(province, 10)?.toUpperCase() ?? null,
      country: cleanTxt(country, 2)?.toUpperCase() ?? "IT",
      site_city: cleanTxt(site_city, 100),
      site_postal_code: cleanTxt(site_postal_code, 10),
      site_province: cleanTxt(site_province, 10)?.toUpperCase() ?? null,
      // Flag anagrafica-only: cliente creato senza accesso al portale
      portal_disabled: !shouldCreatePortal,
      // Se portal disabilitato, blocchiamo subito l'account auth per chiarezza
      is_blocked: !shouldCreatePortal,
    } as never);

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return errorResponse(`Creazione profilo fallita: ${profileError.message}`, 500);
    }

    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: newUserId,
      role: "customer",
    });

    if (roleError) {
      await supabaseAdmin.from("profiles").delete().eq("id", newUserId);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return errorResponse("Failed to assign role", 500);
    }

    // Send welcome email via unified pipeline — solo se portale attivo e non esplicitamente disabilitato
    if (shouldSendWelcomeEmail) {
      try {
        // Niente password in chiaro nell'email e niente token one-shot (scadrebbe
        // dal momento dell'invio): il link apre il login con «Password dimenticata»
        // già precompilato, e il cliente si fa mandare il link di impostazione.
        const branding = await getBrandingForCompany(supabaseAdmin, company_id as string);
        const linkImpostaPassword = `${branding.siteUrl}/login?reset=1&email=${encodeURIComponent(trimmedEmail)}`;
        await sendEmailUnified({
          companyId:    company_id as string,
          stream:       "transactional",
          to:           [trimmedEmail],
          subject:      `Benvenuto su ${companyRow.name || "la piattaforma"}`,
          html: `<html><body>
              <p>Ciao ${isBusiness ? businessName : safeFirstName},</p>
              <p>Il tuo account è stato creato su <strong>${companyRow.name || "la piattaforma"}</strong>.</p>
              <p>Il tuo nome utente è <strong>${trimmedEmail}</strong>.</p>
              <p>Per scegliere la tua password apri questo link: riceverai subito un'email con il collegamento per impostarla.</p>
              <p><a href="${linkImpostaPassword}">Imposta la password</a></p>
              <p style="color:#6b7280;font-size:13px">Se il pulsante non funziona copia questo indirizzo nel browser:<br>${linkImpostaPassword}</p>
            </body></html>`,
          templateName: "customer_welcome",
          skipCredits:  false,
          adminClient:  supabaseAdmin,
          metadata:     { customer_id: newUserId },
        });
      } catch (emailErr) {
        console.error("Failed to send welcome email:", emailErr);
      }
    }

    return jsonResponse({
      success: true,
      customer: {
        id: newUserId,
        first_name: safeFirstName,
        last_name: safeLastName,
        email: trimmedEmail,
        phone: trimmedPhone,
        address: sanitized.address,
        portal_disabled: !shouldCreatePortal,
      },
      // Password restituita solo se l'account portale è attivo e richiesto.
      // Per account "solo anagrafica" non esponiamo mai la password random.
      password: shouldCreatePortal ? password : null,
      portal_account_created: shouldCreatePortal,
      welcome_email_sent: shouldSendWelcomeEmail,
      // Lista dei fix auto-applicati (trasparenza per debugging + UI)
      fixes_applied: sanitized.fixes_applied,
    });
  } catch (error) {
    // requireAuth/requireRole throw Response objects
    if (error instanceof Response) return error;

    console.error("Unexpected error:", error);
    return errorResponse("Internal server error", 500);
  }
});
