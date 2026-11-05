/**
 * L'operaio apre il link dell'ufficio e tocca «Entra» (02/11/2026).
 * Il link vale una volta: lo consuma il POST del tocco, non l'anteprima di WhatsApp.
 * Alla prima entrata crea l'account: stessi ruoli e permessi di create-employee-user,
 * con una password casuale che nessuno conosce. Non manda email.
 * Risponde col token_hash che il browser scambia per la sessione (verifyOtp).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { buildStaffPermissionsRecord } from "../_shared/staffPermissionsDefaults.ts";
import { accountDaLinkValido, emailDaLink, generaTokenLink, impronta, tokenValido } from "../_shared/accessoConLink.ts";

interface Dipendente {
  id: string;
  company_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_active: boolean | null;
  user_id: string | null;
}

/** L'email dell'account, se è davvero quello fatto per questo dipendente; altrimenti null. */
async function emailDellAccountDaLink(admin: SupabaseClient, d: Dipendente, userId: string): Promise<string | null> {
  const [{ data: account }, { data: profilo }, { data: ruoli }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("company_id, is_blocked").eq("id", userId).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const email = account?.user?.email ?? null;
  const valido = accountDaLinkValido({
    email, employeeId: d.id, aziendaProfilo: profilo?.company_id, aziendaDipendente: d.company_id,
    ruoli: (ruoli ?? []).map((r: { role: string }) => r.role), bloccato: profilo?.is_blocked,
  });
  return valido ? email : null;
}

async function creaAccount(admin: SupabaseClient, d: Dipendente): Promise<string> {
  const email = emailDaLink(d.id);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: generaTokenLink(),
    email_confirm: true,
    user_metadata: { first_name: d.first_name, last_name: d.last_name, accesso_con_link: true },
  });
  if (error || !data.user) throw error ?? new Error("Utente non creato");
  const id = data.user.id;
  try {
    const passi = [
      admin.from("profiles").insert({ id, email, first_name: d.first_name, last_name: d.last_name, company_id: d.company_id, phone: d.phone }),
      admin.from("user_roles").insert([{ user_id: id, role: "employee" }, { user_id: id, role: "company_staff" }]),
      // Non ha una password da cambiare: entra sempre con il link.
      admin.from("staff_permissions").insert({ ...buildStaffPermissionsRecord(id, d.company_id, undefined), must_change_password: false }),
    ];
    for (const passo of passi) {
      const { error: errore } = await passo;
      if (errore) throw errore;
    }
    // Due tocchi insieme su due telefoni: vince il primo, l'altro non crea un secondo collegamento.
    const { data: collegato, error: linkErr } = await admin.from("employees")
      .update({ user_id: id }).eq("id", d.id).is("user_id", null).select("id").maybeSingle();
    if (linkErr) throw linkErr;
    if (!collegato) throw new Error("Dipendente già collegato");
  } catch (e) {
    await admin.auth.admin.deleteUser(id);
    throw e;
  }
  return email;
}

Deno.serve(async (req) => {
  const cors = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const rispondi = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: cors });
  const nonValido = () => rispondi({ error: "link_non_valido" }, 410);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  let presoId: string | null = null;

  try {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sconosciuto";
    const limite = await checkRateLimit({ functionName: "campo-link-entra", callerId: ip, maxCalls: 30, windowSeconds: 600 });
    if (!limite.allowed) return rispondi({ error: "troppi_tentativi" }, 429);

    const { token } = await req.json() as { token?: unknown };
    if (!tokenValido(token)) return nonValido();

    // Presa atomica: lo stesso link toccato due volte passa una volta sola.
    const { data: preso, error: presaErr } = await admin.from("campo_link_accesso")
      .update({ usato_il: new Date().toISOString() })
      .eq("token_hash", await impronta(token))
      .is("usato_il", null).is("revocato_il", null)
      .gt("scade_il", new Date().toISOString())
      .select("id, employee_id, company_id")
      .maybeSingle();
    if (presaErr) throw presaErr;
    if (!preso) return nonValido();
    presoId = preso.id;

    const { data: d, error: dipErr } = await admin.from("employees")
      .select("id, company_id, first_name, last_name, phone, is_active, user_id")
      .eq("id", preso.employee_id).eq("company_id", preso.company_id).maybeSingle();
    if (dipErr) throw dipErr;
    if (!d || d.is_active === false) { presoId = null; return nonValido(); }

    let email: string;
    if (d.user_id) {
      const verificato = await emailDellAccountDaLink(admin, d as Dipendente, d.user_id);
      // Nel frattempo ha avuto un accesso con email sua, o l'account non è di questo dipendente: il link non deve aprirlo.
      if (!verificato) { presoId = null; return nonValido(); }
      email = verificato;
    } else {
      email = await creaAccount(admin, d as Dipendente);
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkErr || !link.properties?.hashed_token) throw linkErr ?? new Error("Accesso non generato");

    return rispondi({ token_hash: link.properties.hashed_token });
  } catch (e) {
    console.error("[campo-link-entra]", e);
    // Un guasto nostro non deve bruciare il link: l'operaio riprova col tocco successivo.
    if (presoId) await admin.from("campo_link_accesso").update({ usato_il: null }).eq("id", presoId);
    return rispondi({ error: "errore" }, 500);
  }
});
