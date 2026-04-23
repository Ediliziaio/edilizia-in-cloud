// MP02 — whatsapp-identity-router
// Riceve { from_phone, company_id } → ritorna ResolvedIdentity con kind +
// role_grants. Lookup in 3 step: employees → companies.profiles(owner) →
// unknown. Adattato al DB reale di EdiliziaInCloud (no owner_phone diretto
// su companies: owner identificato via profiles.id = companies.created_by
// oppure via user_roles.role='titolare' + profiles.company_id).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";

interface RequestBody {
  from_phone: string;
  company_id: string;
}

export interface ResolvedIdentity {
  matched: boolean;
  kind: "operaio" | "titolare" | "admin" | "unknown";
  user_id: string | null;
  employee_id: string | null;
  display_name: string | null;
  role_grants: string[];
  company_id: string;
  locale: "it" | "en";
}

const ROLE_GRANTS: Record<string, string[]> = {
  operaio: [
    "rapportino.write",
    "rapportino.read_own",
    "ddt.write",
    "foto.write",
    "presenze.write",
    "segnalazione.write",
    "cantieri.list_assigned",
    "cantieri.read_assigned",
  ],
  titolare: [
    "cantieri.read_all",
    "cantieri.list_all",
    "marginalita.read",
    "fatture.read",
    "scadenze.read",
    "costi.read",
    "rapportini.read_all",
    "ddt.read_all",
    "approvazioni.list",
    "approvazioni.write",
  ],
};

function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

function phoneVariants(phone: string): string[] {
  const n = normalizePhone(phone);
  if (!n) return [];
  const variants = new Set<string>([n]);
  if (n.startsWith("39") && n.length >= 12) variants.add(n.substring(2));
  if (n.startsWith("0") && n.length > 1) variants.add("39" + n.substring(1));
  if (n.length === 10) variants.add("39" + n);
  if (n.startsWith("0039")) variants.add(n.substring(2));
  return Array.from(variants);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.from_phone || !body.company_id) {
    return new Response(
      JSON.stringify({ error: "missing_required_fields" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const variants = phoneVariants(body.from_phone);
  if (variants.length === 0) return respUnknown(body.company_id);

  // ── Step 1: employees by phone_whatsapp ────────────────────────────────
  const { data: employees, error: empErr } = await supabase
    .from("employees")
    .select("id, user_id, first_name, last_name, role_type, phone_whatsapp, phone, is_active")
    .eq("company_id", body.company_id)
    .eq("is_active", true);

  if (empErr) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "identity-router",
        msg: "employees query failed",
        error: empErr.message,
      }),
    );
    return new Response(JSON.stringify({ error: "db_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const matchEmployee = (employees ?? []).find((e) => {
    for (const field of [e.phone_whatsapp, e.phone]) {
      const norm = normalizePhone(field ?? "");
      if (norm && variants.includes(norm)) return true;
    }
    return false;
  });

  if (matchEmployee) {
    const ruolo = (matchEmployee.role_type ?? "").toLowerCase();
    const isAdmin = ["titolare", "admin", "proprietario", "amministratore"].includes(
      ruolo,
    );
    const kind: "operaio" | "admin" = isAdmin ? "admin" : "operaio";
    const grants = isAdmin
      ? [...ROLE_GRANTS.titolare, "users.manage", "company.manage"]
      : ROLE_GRANTS.operaio;

    const displayName = `${matchEmployee.first_name ?? ""} ${matchEmployee.last_name ?? ""}`.trim() ||
      "Operaio";

    const result: ResolvedIdentity = {
      matched: true,
      kind,
      user_id: matchEmployee.user_id,
      employee_id: matchEmployee.id,
      display_name: displayName,
      role_grants: grants,
      company_id: body.company_id,
      locale: "it",
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Step 2: titolare via profiles.phone / user_roles.role='titolare' ────
  // Pattern EdiliziaInCloud: profiles contiene company_id + phone. Owner =
  // profile con role 'titolare' o 'admin' in user_roles per la stessa company.
  const { data: titolareProfiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, company_id, phone, first_name, last_name, full_name")
    .eq("company_id", body.company_id);

  if (profErr) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "identity-router",
        msg: "profiles query failed",
        error: profErr.message,
      }),
    );
  }

  if (titolareProfiles && titolareProfiles.length > 0) {
    // Match telefono
    const matchProfile = titolareProfiles.find((p) => {
      const norm = normalizePhone(p.phone ?? "");
      return norm && variants.includes(norm);
    });

    if (matchProfile) {
      // Verifica ruolo titolare/admin
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", matchProfile.id);

      const roles = (rolesData ?? []).map((r) => String(r.role).toLowerCase());
      const isTitolare = roles.some((r) =>
        ["titolare", "admin", "super_admin", "proprietario"].includes(r)
      );

      const kind: "titolare" | "admin" = roles.includes("super_admin") || roles.includes("admin")
        ? "admin"
        : "titolare";

      if (isTitolare) {
        const displayName =
          matchProfile.full_name ||
          `${matchProfile.first_name ?? ""} ${matchProfile.last_name ?? ""}`.trim() ||
          "Titolare";

        const grants = kind === "admin"
          ? [...ROLE_GRANTS.titolare, "users.manage", "company.manage"]
          : ROLE_GRANTS.titolare;

        const result: ResolvedIdentity = {
          matched: true,
          kind,
          user_id: matchProfile.id,
          employee_id: null,
          display_name: displayName,
          role_grants: grants,
          company_id: body.company_id,
          locale: "it",
        };

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  // ── Step 3: unknown ─────────────────────────────────────────────────────
  return respUnknown(body.company_id);
});

function respUnknown(companyId: string): Response {
  const result: ResolvedIdentity = {
    matched: false,
    kind: "unknown",
    user_id: null,
    employee_id: null,
    display_name: null,
    role_grants: [],
    company_id: companyId,
    locale: "it",
  };
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
