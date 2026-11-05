/**
 * L'ufficio prepara i link d'accesso all'app di cantiere (02/11/2026).
 * Solo chi amministra l'azienda del dipendente. Un link nuovo annulla quelli vecchi.
 * Chi entra già con un'email sua non riceve link: aprirebbe il suo account, magari
 * con ruoli più alti o in un'altra azienda, a chi tiene il link.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { amministraAzienda } from "../_shared/amministraAzienda.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { GIORNI_VALIDITA_LINK, accountDaLinkValido, generaTokenLink, impronta } from "../_shared/accessoConLink.ts";

interface Risultato {
  employee_id: string;
  nome: string;
  telefono: string | null;
  url?: string;
  errore?: string;
}

const MASSIMO_PER_VOLTA = 100;

Deno.serve(async (req) => {
  const cors = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const rispondi = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: cors });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user: chiamante } } = await admin.auth.getUser(jwt);
    if (!chiamante) return rispondi({ error: "Non autorizzato" }, 401);

    const { employee_ids: ids } = await req.json() as { employee_ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MASSIMO_PER_VOLTA || !ids.every((i) => typeof i === "string")) {
      return rispondi({ error: "Elenco delle persone non valido" }, 400);
    }

    const { data: ruoli } = await admin.from("user_roles").select("role").eq("user_id", chiamante.id);
    const superAdmin = (ruoli ?? []).some((r) => r.role === "super_admin");

    const { data: dipendenti, error } = await admin
      .from("employees")
      .select("id, company_id, first_name, last_name, phone, phone_whatsapp, is_active, user_id")
      .in("id", ids as string[]);
    if (error) throw error;

    const permessi = new Map<string, boolean>();
    const siti = new Map<string, string>();
    const risultati: Risultato[] = [];
    const scadeIl = new Date(Date.now() + GIORNI_VALIDITA_LINK * 86_400_000).toISOString();

    for (const d of dipendenti ?? []) {
      const r: Risultato = {
        employee_id: d.id,
        nome: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim(),
        telefono: d.phone_whatsapp || d.phone || null,
      };
      risultati.push(r);

      if (!permessi.has(d.company_id)) {
        permessi.set(d.company_id, superAdmin || await amministraAzienda(admin, chiamante.id, d.company_id));
      }
      if (!permessi.get(d.company_id)) { r.errore = "Non puoi dare l'accesso a questa persona"; continue; }
      if (d.is_active === false) { r.errore = "Non è più attivo"; continue; }

      if (d.user_id) {
        const [{ data: account }, { data: profilo }, { data: ruoli }] = await Promise.all([
          admin.auth.admin.getUserById(d.user_id),
          admin.from("profiles").select("company_id, is_blocked").eq("id", d.user_id).maybeSingle(),
          admin.from("user_roles").select("role").eq("user_id", d.user_id),
        ]);
        const valido = accountDaLinkValido({
          email: account?.user?.email, employeeId: d.id, aziendaProfilo: profilo?.company_id, aziendaDipendente: d.company_id,
          ruoli: (ruoli ?? []).map((x: { role: string }) => x.role), bloccato: profilo?.is_blocked,
        });
        if (!valido) { r.errore = "Entra già con un altro accesso"; continue; }
      }

      if (!siti.has(d.company_id)) {
        const branding = await getBrandingForCompany(admin, d.company_id);
        siti.set(d.company_id, branding.siteUrl.replace(/\/+$/, ""));
      }
      const token = generaTokenLink();
      const adesso = new Date().toISOString();
      const { error: revocaErr } = await admin.from("campo_link_accesso")
        .update({ revocato_il: adesso })
        .eq("employee_id", d.id).is("usato_il", null).is("revocato_il", null);
      if (revocaErr) throw revocaErr;
      const { error: insErr } = await admin.from("campo_link_accesso").insert({
        company_id: d.company_id,
        employee_id: d.id,
        token_hash: await impronta(token),
        created_by: chiamante.id,
        scade_il: scadeIl,
      });
      if (insErr) throw insErr;
      r.url = `${siti.get(d.company_id)}/entra/${token}`;
    }

    return rispondi({ risultati });
  } catch (e) {
    console.error("[campo-link-crea]", e);
    return rispondi({ error: "Non sono riuscito a preparare i link. Riprova." }, 500);
  }
});
