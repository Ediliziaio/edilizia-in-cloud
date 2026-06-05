// MP02 — Identity resolution inline (no fetch inter-function, più robusto).
// Stessa logica di whatsapp-identity-router ma eseguita con supabase client
// condiviso. whatsapp-identity-router rimane deployata per usi esterni.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function unknownResult(companyId: string): ResolvedIdentity {
  return {
    matched: false,
    kind: "unknown",
    user_id: null,
    employee_id: null,
    display_name: null,
    role_grants: [],
    company_id: companyId,
    locale: "it",
  };
}

export async function resolveIdentity(
  supabase: SupabaseClient,
  fromPhone: string,
  companyId: string,
): Promise<ResolvedIdentity> {
  const variants = phoneVariants(fromPhone);
  if (variants.length === 0) return unknownResult(companyId);

  // Step 1: employees by phone_whatsapp | phone
  const { data: employees } = await supabase
    .from("employees")
    .select("id, user_id, first_name, last_name, role_type, phone_whatsapp, phone, is_active")
    .eq("company_id", companyId)
    .eq("is_active", true);

  const matchEmp = (employees ?? []).find((e) => {
    for (const f of [e.phone_whatsapp, e.phone]) {
      const norm = normalizePhone(f ?? "");
      if (norm && variants.includes(norm)) return true;
    }
    return false;
  });

  if (matchEmp) {
    const ruolo = (matchEmp.role_type ?? "").toLowerCase();
    const isAdmin = ["titolare", "admin", "proprietario", "amministratore"].includes(ruolo);
    const kind: "operaio" | "admin" = isAdmin ? "admin" : "operaio";
    const grants = isAdmin
      ? [...ROLE_GRANTS.titolare, "users.manage", "company.manage"]
      : ROLE_GRANTS.operaio;
    const displayName = `${matchEmp.first_name ?? ""} ${matchEmp.last_name ?? ""}`.trim() ||
      "Operaio";

    if (isAdmin) {
      console.warn("[whatsapp-identity][SECURITY] poteri ADMIN concessi via match-telefono SENZA verifica OTP (dipendente)",
        JSON.stringify({ company_id: companyId, user_id: matchEmp.user_id, employee_id: matchEmp.id }));
    }

    return {
      matched: true,
      kind,
      user_id: matchEmp.user_id,
      employee_id: matchEmp.id,
      display_name: displayName,
      role_grants: grants,
      company_id: companyId,
      locale: "it",
    };
  }

  // Step 2: profiles (titolare/admin)
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, phone, first_name, last_name, full_name")
    .eq("company_id", companyId);

  if (profiles && profiles.length > 0) {
    const matchProfile = profiles.find((p) => {
      const norm = normalizePhone(p.phone ?? "");
      return norm && variants.includes(norm);
    });

    if (matchProfile) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", matchProfile.id);

      const roleList = (roles ?? []).map((r) => String(r.role).toLowerCase());
      const isTitolare = roleList.some((r) =>
        ["titolare", "admin", "super_admin", "proprietario"].includes(r)
      );

      if (isTitolare) {
        const kind: "titolare" | "admin" = roleList.includes("super_admin") ||
          roleList.includes("admin")
          ? "admin"
          : "titolare";

        const displayName = matchProfile.full_name ||
          `${matchProfile.first_name ?? ""} ${matchProfile.last_name ?? ""}`.trim() ||
          "Titolare";

        const grants = kind === "admin"
          ? [...ROLE_GRANTS.titolare, "users.manage", "company.manage"]
          : ROLE_GRANTS.titolare;

        if (kind === "admin") {
          console.warn("[whatsapp-identity][SECURITY] poteri ADMIN concessi via match-telefono SENZA verifica OTP (profilo)",
            JSON.stringify({ company_id: companyId, user_id: matchProfile.id }));
        }

        return {
          matched: true,
          kind,
          user_id: matchProfile.id,
          employee_id: null,
          display_name: displayName,
          role_grants: grants,
          company_id: companyId,
          locale: "it",
        };
      }
    }
  }

  return unknownResult(companyId);
}
