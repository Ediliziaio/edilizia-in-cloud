/**
 * Il team di piattaforma: menu, rotte, permessi e database dicono la stessa cosa.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPER_ADMIN_EMAIL_ALLOWLIST as ALLOWLIST_CLIENT } from "@/config/superAdmin";
import { SUPER_ADMIN_EMAIL_ALLOWLIST as ALLOWLIST_SERVER, ruoloPerNuovoAdmin } from "../../../supabase/functions/_shared/superAdminAllowlist";
import {
  CALLCENTER_PIATTAFORMA_PERMESSI,
  MARKETING_PIATTAFORMA_PERMESSI,
  PERMESSI_VIETATI_AL_CALLCENTER,
  permessiCrmPiattaforma,
} from "../../../supabase/functions/_shared/callcenterPiattaforma";
import { STAFF_PERMISSION_DEFAULTS } from "../../../supabase/functions/_shared/staffPermissionsDefaults";
import { PLATFORM_ROLES, PLATFORM_ROLE_PRESETS } from "@/types/auth";

const leggi = (percorso: string) => readFileSync(join(process.cwd(), percorso), "utf8");

describe("lista dei super admin", () => {
  it("è la stessa nel browser e sul server", () => {
    expect([...ALLOWLIST_SERVER]).toEqual([...ALLOWLIST_CLIENT]);
  });

  it("un invitato fuori lista non diventa super admin: riceve il ruolo di team", () => {
    expect(ruoloPerNuovoAdmin("flo.andriciuc@gmail.com")).toBe("super_admin");
    expect(ruoloPerNuovoAdmin("  FLO.Andriciuc@gmail.com ")).toBe("super_admin");
    expect(ruoloPerNuovoAdmin("altro@esempio.it")).toBe("platform_manager");
    expect(ruoloPerNuovoAdmin("")).toBe("platform_manager");
    expect(ruoloPerNuovoAdmin(null)).toBe("platform_manager");
  });

  it("gli inviti non assegnano più il ruolo super_admin a chiunque", () => {
    expect(leggi("supabase/functions/accept-admin-invite/index.ts")).not.toContain('role: "super_admin" }');
    const crea = leggi("supabase/functions/manage-super-admins/index.ts");
    expect(crea).toContain("ruoloPerNuovoAdmin(email)");
  });
});

describe("accesso al CRM della piattaforma per ruolo", () => {
  const preset = (r: (typeof PLATFORM_ROLES)[number]) => PLATFORM_ROLE_PRESETS[r];

  it("marketing e gestore hanno il CRM completo con le campagne", () => {
    expect(permessiCrmPiattaforma(preset("platform_marketing"))).toBe(MARKETING_PIATTAFORMA_PERMESSI);
    expect(permessiCrmPiattaforma(preset("platform_manager"))).toBe(MARKETING_PIATTAFORMA_PERMESSI);
  });

  it("commerciale e call center hanno solo il CRM, senza campagne", () => {
    expect(permessiCrmPiattaforma(preset("platform_sales"))).toBe(CALLCENTER_PIATTAFORMA_PERMESSI);
    expect(permessiCrmPiattaforma(preset("platform_callcenter"))).toBe(CALLCENTER_PIATTAFORMA_PERMESSI);
  });

  it("supporto e implementazione non hanno accesso al CRM", () => {
    expect(permessiCrmPiattaforma(preset("platform_support"))).toBeNull();
    expect(permessiCrmPiattaforma(preset("platform_implementation"))).toBeNull();
  });

  it("ogni permesso del CRM esiste in staff_permissions", () => {
    for (const chiave of Object.keys(MARKETING_PIATTAFORMA_PERMESSI)) {
      expect(Object.keys(STAFF_PERMISSION_DEFAULTS), chiave).toContain(chiave);
    }
  });

  it("il call center non riceve mai i permessi delle campagne", () => {
    for (const vietato of PERMESSI_VIETATI_AL_CALLCENTER) {
      expect(CALLCENTER_PIATTAFORMA_PERMESSI[vietato] ?? false, vietato).toBe(false);
    }
  });

  it("nessun preset del team ha il permesso «solo super admin»", () => {
    for (const r of PLATFORM_ROLES) expect(Object.keys(preset(r))).not.toContain("super_admin");
  });
});

describe("menu e rotte dicono la stessa cosa", () => {
  const rotte = leggi("src/routes/adminRoutes.tsx");
  const guardia: Record<string, string | null> = {};
  for (const riga of rotte.split("\n")) {
    const m = /<Route\s+path="([^"]*)"/.exec(riga);
    if (!m) continue;
    const perm = /<RequireAdminPermission permission="([a-z_]+)"/.exec(riga);
    guardia[m[1]] = perm ? perm[1] : riga.includes("RequireSuperAdmin") ? "super_admin" : null;
  }

  for (const file of ["src/components/layouts/AdminLayout.tsx", "src/pages/admin/AdminMobileMenu.tsx"]) {
    it(`${file}: ogni voce con un permesso apre una rotta con lo stesso controllo`, () => {
      const sbagliate: string[] = [];
      for (const riga of leggi(file).split("\n")) {
        const url = /url: "(\/admin\/[^"?]*)/.exec(riga)?.[1];
        const perm = /permission: "([a-z_]+)"/.exec(riga)?.[1];
        if (!url || !perm) continue;
        const percorso = url.replace("/admin/", "");
        // rotte con asterisco finale (es. marketing/whatsapp/*)
        const g = guardia[percorso] ?? guardia[`${percorso}/*`];
        if (g === undefined) continue; // voce che porta a un redirect o a una pagina interna
        if (g !== perm) sbagliate.push(`${url}: menu=${perm} rotta=${g}`);
      }
      expect(sbagliate).toEqual([]);
    });
  }
});

describe("migrazione dei permessi nel database", () => {
  const sql = leggi("supabase/migrations/20281008140000_team_piattaforma_permessi_nel_database.sql");

  it("le regole sono additive e passano da funzioni senza argomento di riga (costo zero per gli utenti normali)", () => {
    expect(sql).not.toMatch(/AS RESTRICTIVE/i);
    expect(sql).toContain("(SELECT public.admin_ha_uno_di(");
  });

  it("l'elenco aziende consentite vale anche nel database", () => {
    expect(sql).toContain("admin_azienda_consentita");
  });

  it("le funzioni non sono chiamabili da utenti anonimi", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.e_ruolo_piattaforma(uuid), public.admin_ha_uno_di(text[]), public.admin_azienda_consentita(uuid) FROM PUBLIC, anon");
  });
});
