import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateSecurePassword } from "../_shared/securePassword.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { emailCredenziali } from "../_shared/emailCredenziali.ts";
import { buildStaffPermissionsRecord } from "../_shared/staffPermissionsDefaults.ts";
import { messaggioErroreAuth } from "../_shared/authErrorMessage.ts";

// Esegue un task in background DOPO la risposta, senza bloccarla. Evita che un
// invio email lento/bloccato faccia terminare la funzione per wall-clock PRIMA
// del return → causa di "Failed to send a request to the Edge Function" lato
// client anche se l'utente era già stato creato.
function runInBackground(p: Promise<unknown>): void {
  try {
    // deno-lint-ignore no-explicit-any
    const er = (globalThis as any).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") er.waitUntil(p);
    else void p.catch(() => {});
  } catch {
    void p.catch(() => {});
  }
}

type ValidRoleType = "company_admin" | "company_staff" | "salesperson" | "call_center" | "employee" | "subcontractor";

// Messaggio azionabile quando l'email appartiene già a un utente reale (di
// un'altra azienda): "Nuovo Utente" crea un account NUOVO, quindi qui fallisce.
// Per dare a un utente ESISTENTE l'accesso a questa azienda (multi-azienda) si
// usa la sezione "Accessi azienda", non "Nuovo Utente".
const EXISTS_MSG =
  "Questo utente esiste già (è registrato in un'altra azienda). Per dargli accesso a QUESTA azienda usa «Accessi azienda» (Impostazioni → Persone & Accessi → Accessi azienda), non «Nuovo Utente».";

// Trova l'id auth di un'email scorrendo le pagine (supabase-js non espone una
// getUserByEmail). Serve a recuperare gli ORFANI: auth user creati da un
// tentativo precedente fallito a metà (profilo/ruolo mancanti) che lasciano
// l'email "occupata" e impediscono di ricrearla.
// deno-lint-ignore no-explicit-any
async function findAuthUserIdByEmail(admin: any, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 30; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const found = data.users.find((u: { email?: string }) => (u.email ?? "").toLowerCase() === target);
    if (found) return found.id;
    if (data.users.length < 200) return null; // ultima pagina
  }
  return null;
}

function resolveRoles(roleType: ValidRoleType): string[] {
  switch (roleType) {
    case "company_admin":
      return ["company_admin"];
    case "salesperson":
      return ["salesperson", "company_staff"];
    case "call_center":
      return ["call_center", "company_staff"];
    case "employee":
      return ["employee", "company_staff"];
    case "subcontractor":
      return ["subcontractor", "company_staff"];
    case "company_staff":
    default:
      return ["company_staff"];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Chiamante interno fidato: la chiave di servizio, che può già scrivere
    // ovunque. Serve per creare gli accessi di un'azienda senza un utente in
    // sessione (es. il team di Il Bagno Group, 15/09/2026) mandando la STESSA
    // email di benvenuto dell'app. Vale come super admin; company_id obbligatorio.
    const bearer = authHeader.slice("Bearer ".length).trim();
    const isInternal = bearer.length > 0 && bearer === supabaseServiceKey;

    let callerId: string | null = null;
    if (!isInternal) {
      const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: callerUser }, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !callerUser) {
        return errorResponse("Unauthorized", 401);
      }
      callerId = callerUser.id;
    }

    const { data: callerProfile } = callerId
      ? await supabaseAdmin.from("profiles").select("company_id").eq("id", callerId).single()
      : { data: null };

    const { first_name, last_name, email, company_id, role_type, password, phone, permissions } = await req.json();

    const { data: callerRoles } = callerId
      ? await supabaseAdmin.from("user_roles").select("role").eq("user_id", callerId)
      : { data: [] as { role: string }[] };

    const requestedCompanyId = typeof company_id === "string" && company_id.trim()
      ? company_id.trim()
      : null;
    const targetCompanyId = requestedCompanyId ?? callerProfile?.company_id;

    if (!targetCompanyId) {
      return errorResponse("Company ID is required");
    }

    const isSuperAdmin = isInternal || (callerRoles?.some((r) => r.role === "super_admin") ?? false);
    const isOwnCompanyAdmin = (callerRoles?.some((r) => r.role === "company_admin") ?? false)
      && callerProfile?.company_id === targetCompanyId;

    const { data: selectedCompanyAccess } = callerId
      ? await supabaseAdmin
        .from("multi_company_access")
        .select("access_role")
        .eq("user_id", callerId)
        .eq("company_id", targetCompanyId)
        // Un accesso multi-azienda sospeso/invitato non conferisce autorità: solo
        // 'active' abilita la creazione utenti (coerente con le guardie RLS).
        .eq("status", "active")
        .maybeSingle()
      : { data: null };

    const isGrantedCompanyAdmin = selectedCompanyAccess?.access_role === "company_admin";

    if (!isSuperAdmin && !isOwnCompanyAdmin && !isGrantedCompanyAdmin) {
      return errorResponse("Only company admins can create staff users", 403);
    }

    if (!first_name || !last_name || !email) {
      return errorResponse("Nome, cognome e email sono obbligatori");
    }

    // Validate and resolve roles
    const validRoleTypes: ValidRoleType[] = ["company_admin", "company_staff", "salesperson", "call_center", "employee", "subcontractor"];
    const effectiveRoleType: ValidRoleType = validRoleTypes.includes(role_type) ? role_type : "company_staff";
    const rolesToAssign = resolveRoles(effectiveRoleType);

    // Secure password generation (use provided password if valid, otherwise generate one)
    const temporaryPassword = (password && password.trim().length >= 8)
      ? password.trim()
      : generateSecurePassword(12);

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
    });

    let userId: string;
    if (createError) {
      const msg = createError.message?.toLowerCase() ?? "";
      const alreadyExists = msg.includes("already") || msg.includes("exists") || msg.includes("registered");
      if (!alreadyExists) {
        console.error("Error creating user:", createError);
        return errorResponse(messaggioErroreAuth(createError, "Errore durante la creazione dell'utente"), 500);
      }
      // RECUPERO ORFANO: l'email è "occupata". Se l'auth user esiste ma NON ha
      // un profilo collegato, è il residuo di una creazione fallita a metà →
      // lo eliminiamo e ricreiamo. Se invece ha già un profilo, è un utente
      // reale → errore legittimo.
      const existingId = await findAuthUserIdByEmail(supabaseAdmin, email);
      if (!existingId) {
        return errorResponse(EXISTS_MSG);
      }
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles").select("id").eq("id", existingId).maybeSingle();
      if (existingProfile) {
        return errorResponse(EXISTS_MSG);
      }
      // Orfano confermato: pulizia + retry
      await supabaseAdmin.from("user_roles").delete().eq("user_id", existingId);
      const { error: delOrphanErr } = await supabaseAdmin.auth.admin.deleteUser(existingId);
      if (delOrphanErr) {
        console.error("Cleanup orfano fallito:", delOrphanErr);
        return errorResponse(EXISTS_MSG);
      }
      const retry = await supabaseAdmin.auth.admin.createUser({
        email, password: temporaryPassword, email_confirm: true,
      });
      if (retry.error || !retry.data?.user) {
        console.error("Retry createUser dopo recupero orfano fallito:", retry.error);
        return errorResponse(EXISTS_MSG);
      }
      userId = retry.data.user.id;
    } else if (!newUser?.user) {
      return errorResponse("Errore durante la creazione dell'utente", 500);
    } else {
      userId = newUser.user.id;
    }

    // Rollback robusto: se il deleteUser fallisce, l'auth user resta ORFANO
    // (email "occupata"). Logghiamo l'errore così è diagnosticabile; il nuovo
    // recupero-orfano a inizio funzione lo risolverà al tentativo successivo.
    const cleanup = async () => {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (delErr) console.error("[ORFANO] deleteUser fallito nel cleanup per", userId, delErr);
    };

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      first_name,
      last_name,
      email,
      company_id: targetCompanyId,
    });

    if (profileError) {
      console.error("Error creating profile:", profileError);
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (delErr) console.error("[ORFANO] deleteUser fallito dopo profileError per", userId, delErr);
      return errorResponse("Errore durante la creazione del profilo", 500);
    }

    const roleInserts = rolesToAssign.map((role) => ({ user_id: userId, role }));
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert(roleInserts);

    if (roleError) {
      console.error("Error creating user roles:", roleError);
      await cleanup();
      return errorResponse("Errore durante l'assegnazione del ruolo", 500);
    }

    if (rolesToAssign.includes("company_staff")) {
      // Record COMPLETO: se il wizard passa `permissions`, l'insert è già
      // definitivo e non dipende dal follow-up update client (che resta come
      // rete di sicurezza); senza payload i valori coincidono coi default DB.
      const { error: permError } = await supabaseAdmin
        .from("staff_permissions")
        .insert(buildStaffPermissionsRecord(userId, targetCompanyId, permissions));

      if (permError) {
        console.error("Error creating permissions:", permError);
        await cleanup();
        return errorResponse("Errore durante la creazione dei permessi", 500);
      }
    }

    if (effectiveRoleType === "salesperson") {
      const { error: spError } = await supabaseAdmin.from("salespeople").insert({
        company_id: targetCompanyId,
        first_name,
        last_name,
        email,
        user_id: userId,
        is_active: true,
      });

      if (spError) {
        console.error("Error creating salesperson record:", spError);
        await cleanup();
        return errorResponse("Errore durante la creazione del profilo venditore", 500);
      }
    }

    if (effectiveRoleType === "employee" && userId && targetCompanyId) {
      const { error: empError } = await supabaseAdmin.from("employees").insert({
        company_id: targetCompanyId,
        user_id: userId,
        first_name,
        last_name,
        email,
        phone: phone || null,
        role_type: "operaio",
        is_active: true,
      });

      if (empError) {
        console.error("Error creating employee record:", empError);
        await cleanup();
        return errorResponse("Errore durante la creazione del profilo dipendente", 500);
      }
    }

    if (effectiveRoleType === "subcontractor" && userId && targetCompanyId) {
      const { data: existingSub, error: findSubError } = await supabaseAdmin
        .from("subappaltatori")
        .select("id")
        .eq("company_id", targetCompanyId)
        .or(`user_email.eq.${email},email.eq.${email}`)
        .maybeSingle();

      if (findSubError) {
        console.error("Error finding subcontractor record:", findSubError);
        await cleanup();
        return errorResponse("Errore durante la creazione del profilo subappaltatore", 500);
      }

      if (existingSub?.id) {
        const { error: subUpdateError } = await supabaseAdmin
          .from("subappaltatori")
          .update({
            user_id: userId,
            user_email: email,
            email,
            responsabile: `${first_name} ${last_name}`,
            is_active: true,
          })
          .eq("id", existingSub.id);
        if (subUpdateError) {
          console.error("Error linking subcontractor record:", subUpdateError);
          await cleanup();
          return errorResponse("Errore durante il collegamento del profilo subappaltatore", 500);
        }
      } else {
        const { error: subError } = await supabaseAdmin.from("subappaltatori").insert({
          company_id: targetCompanyId,
          ragione_sociale: `${first_name} ${last_name}`,
          responsabile: `${first_name} ${last_name}`,
          email,
          user_id: userId,
          user_email: email,
        });

        if (subError) {
          console.error("Error creating subcontractor record:", subError);
          await cleanup();
          return errorResponse("Errore durante la creazione del profilo subappaltatore", 500);
        }
      }
    }

    // Item 9: Welcome email con credenziali — NON BLOCCANTE (background).
    // Eseguita dopo la risposta: se il provider email è lento/non configurato
    // non deve più far fallire (per wall-clock) la creazione utente già avvenuta.
    //
    // Account creati con un indirizzo SEGNAPOSTO (…@no-email.ediliziaincloud.local,
    // la stessa convenzione dei clienti senza email) non ricevono niente: si
    // creano quando la persona esiste ma la sua email non si conosce ancora, e
    // si sostituisce dopo. Spedire le credenziali a un dominio .local vuol dire
    // un rimbalzo certo registrato sul nostro dominio di invio — 13 per l'import
    // BeMade dell'11/09/2026 — senza che nessuno le legga.
    const indirizzoSegnaposto = /@no-email\.ediliziaincloud\.local$/i.test(String(email).trim());
    if (!indirizzoSegnaposto) runInBackground((async () => {
    try {
      const branding = await getBrandingForCompany(supabaseAdmin, targetCompanyId);

      const platformName = branding.platformName;

      const { html: emailHtml, text: emailText } = emailCredenziali({
        branding,
        titolo: `Benvenuto in ${platformName}!`,
        intro: "Il tuo account è stato creato. Di seguito trovi le credenziali per accedere alla piattaforma.",
        email,
        password: temporaryPassword,
        avviso: "Ti verrà chiesto di cambiare la password al primo accesso.",
      });

      await sendEmailUnified({
        companyId:    targetCompanyId,
        stream:       "transactional",
        to:           [email],
        subject:      `Benvenuto in ${platformName} — Le tue credenziali di accesso`,
        html:         emailHtml,
        text:         emailText,
        templateName: "staff_invite",
        skipCredits:  true,
        adminClient:  supabaseAdmin,
        metadata:     { user_id: userId, role_type: effectiveRoleType },
      });
    } catch (emailErr) {
      // Email failure is non-blocking — user was already created successfully
      console.error("Failed to send welcome email:", emailErr);
    }
    })());

    return jsonResponse({
      success: true,
      user_id: userId,
      temporary_password: temporaryPassword,
      role: effectiveRoleType,
    });
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Unexpected error:", error);
    return errorResponse("Errore interno del server", 500);
  }
});

// redeploy 2026-06-25: propaga _shared email/branding (.it→.com + builder 58 email) — trigger CI HEAD~1 diff
