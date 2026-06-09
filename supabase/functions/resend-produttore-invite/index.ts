import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * resend-produttore-invite — il SUPER ADMIN genera un LINK D'ACCESSO (recovery) per
 * l'admin di un produttore, da copiare/condividere. Speculare a resend-reseller-invite
 * ma scoped al super admin.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const body = await req.json();
    const produttoreId = String(body?.produttore_id ?? "");
    if (!produttoreId) return errorResponse("produttore_id richiesto", 400, corsH);

    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "super_admin")) {
      return errorResponse("Non autorizzato: richiesto super admin", 403, corsH);
    }

    // Email dell'admin del produttore: preferisci un produttore_admin, poi qualunque
    // profilo dell'azienda, poi l'email della company.
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("id, email").eq("company_id", produttoreId);
    let email = "";
    const profList = (profs ?? []) as { id: string; email: string | null }[];
    if (profList.length > 0) {
      const ids = profList.map((p) => p.id);
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles").select("user_id").eq("role", "produttore_admin").in("user_id", ids);
      const adminId = ((adminRoles ?? [])[0] as { user_id?: string } | undefined)?.user_id;
      const adminProf = profList.find((p) => p.id === adminId) ?? profList[0];
      email = adminProf?.email ?? "";
    }
    if (!email) {
      const { data: comp } = await supabaseAdmin.from("companies").select("email").eq("id", produttoreId).maybeSingle();
      email = (comp?.email as string | undefined) ?? "";
    }
    if (!email) return errorResponse("Email dell'admin del produttore non trovata", 404, corsH);

    const origin = new URL(req.url).origin;
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${origin}/cambia-password` },
    });
    const actionLink = link?.properties?.action_link ?? null;
    if (error || !actionLink) {
      return errorResponse(`Impossibile generare il link d'accesso: ${error?.message ?? "sconosciuto"}`, 502, corsH);
    }

    return jsonResponse({ success: true, email, action_link: actionLink }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("resend-produttore-invite error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
