/**
 * Call center di piattaforma: vede solo il CRM (contatti, opportunità, calendario), dall'area super admin.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALLCENTER_PIATTAFORMA_PERMESSI,
  PERMESSI_VIETATI_AL_CALLCENTER,
  PIATTAFORMA_COMPANY_ID,
  PRESET_CALLCENTER_ADMIN,
} from "../../../supabase/functions/_shared/callcenterPiattaforma";
import { STAFF_PERMISSION_DEFAULTS } from "../../../supabase/functions/_shared/staffPermissionsDefaults";
import { ADMIN_PLATFORM_ROLES, PLATFORM_ROLES, PLATFORM_ROLE_PRESETS } from "@/types/auth";
import { getRoleHomePath } from "@/lib/auth/appHome";
import { resolveRouteAccessRole } from "@/lib/auth/multiCompany";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";

const leggi = (percorso: string) => readFileSync(join(process.cwd(), percorso), "utf8");

describe("permessi sul CRM della piattaforma", () => {
  it("l'azienda è la stessa dell'interfaccia", () => {
    expect(PIATTAFORMA_COMPANY_ID).toBe(PLATFORM_ADMIN_COMPANY_ID);
  });

  it("ogni permesso concesso esiste davvero in staff_permissions", () => {
    for (const chiave of Object.keys(CALLCENTER_PIATTAFORMA_PERMESSI)) {
      expect(Object.keys(STAFF_PERMISSION_DEFAULTS), chiave).toContain(chiave);
    }
  });

  it("niente campagne, automazioni, posta, report, impostazioni né incassi", () => {
    for (const vietato of PERMESSI_VIETATI_AL_CALLCENTER) {
      expect(CALLCENTER_PIATTAFORMA_PERMESSI[vietato] ?? false, vietato).toBe(false);
    }
  });

  it("può lavorare su contatti, opportunità e calendario", () => {
    expect(CALLCENTER_PIATTAFORMA_PERMESSI.can_view_marketing_contacts).toBe(true);
    expect(CALLCENTER_PIATTAFORMA_PERMESSI.can_edit_marketing_contacts).toBe(true);
    expect(CALLCENTER_PIATTAFORMA_PERMESSI.can_view_marketing_opportunities).toBe(true);
    expect(CALLCENTER_PIATTAFORMA_PERMESSI.can_edit_marketing_opportunities).toBe(true);
    expect(CALLCENTER_PIATTAFORMA_PERMESSI.can_view_marketing_appointments).toBe(true);
  });
});

describe("il ruolo", () => {
  it("è un ruolo di piattaforma con il solo permesso «CRM e chiamate»", () => {
    expect(PLATFORM_ROLES).toContain("platform_callcenter");
    expect(ADMIN_PLATFORM_ROLES).toContain("platform_callcenter");
    expect(PLATFORM_ROLE_PRESETS.platform_callcenter).toEqual(PRESET_CALLCENTER_ADMIN);
    const p = PRESET_CALLCENTER_ADMIN;
    expect(p.crm_operatore).toBe(true);
    expect([p.can_manage_companies, p.can_manage_plans, p.can_manage_tickets, p.can_manage_referrals, p.can_manage_admins, p.can_view_platform_stats, p.can_manage_marketing]).toEqual(Array(7).fill(false));
  });

  it("dopo il login atterra sulle opportunità, non sulla dashboard di piattaforma", () => {
    expect(getRoleHomePath("platform_callcenter")).toBe("/admin/marketing/opportunita");
  });

  it("anche con il profilo legato alla piattaforma conserva il ruolo e può entrare in /admin", () => {
    const ruolo = resolveRouteAccessRole({
      globalRole: "platform_callcenter",
      accesses: [{ id: "profile-company", user_id: "u", company_id: PIATTAFORMA_COMPANY_ID, access_role: "company_staff", granted_by: null, created_at: "2026-10-08" }],
      selectedCompanyId: PIATTAFORMA_COMPANY_ID,
    });
    expect(ruolo).toBe("platform_callcenter");
    expect(ADMIN_PLATFORM_ROLES).toContain(ruolo);
  });
});

describe("cosa si vede e cosa si apre", () => {
  const menu = leggi("src/components/layouts/AdminLayout.tsx");
  const rotte = leggi("src/routes/adminRoutes.tsx");

  it("nel menu, con il solo permesso CRM compaiono tre voci: Contatti, Opportunità e Calendario", () => {
    const righe = menu.split("\n").filter((r) => r.includes('permission: "crm_operatore"'));
    expect(righe).toHaveLength(3);
    const url = righe.map((r) => /url: "([^"]+)"/.exec(r)?.[1]);
    expect(url).toEqual(["/admin/marketing/contatti", "/admin/marketing/opportunita", "/admin/marketing/calendario"]);
  });

  it("le voci pericolose del marketing restano dietro il marketing completo", () => {
    for (const url of ["/admin/marketing/email", "/admin/marketing/sms", "/admin/marketing/whatsapp", "/admin/marketing/automazioni", "/admin/marketing/form-builder", "/admin/marketing/lead-scraper", "/admin/marketing/clienti-servizio"]) {
      const riga = menu.split("\n").find((r) => r.includes(`url: "${url}"`));
      expect(riga, url).toBeTruthy();
      expect(riga, url).toContain('permission: "can_manage_marketing"');
    }
  });

  it("le rotte di contatti, dettaglio contatto, opportunità e calendario accettano il permesso CRM", () => {
    for (const percorso of ["marketing/contatti", "marketing/contatti/:id", "marketing/opportunita", "marketing/calendario"]) {
      expect(rotte).toContain(`<Route path="${percorso}" element={<RequireAdminPermission permission="crm_operatore">`);
    }
  });

  it("campagne, automazioni, posta e dashboard non si aprono con il solo permesso CRM", () => {
    for (const percorso of ["marketing/email", "marketing/whatsapp", "marketing/automazioni", "marketing/lead-scraper", "marketing/form-builder"]) {
      const riga = rotte.split("\n").find((r) => r.includes(`<Route path="${percorso}"`) || r.includes(`<Route path="${percorso}/*"`));
      expect(riga, percorso).toBeTruthy();
      expect(riga, percorso).not.toContain('permission="crm_operatore"');
    }
    const email = rotte.split("\n").find((r) => r.includes('<Route path="email"'));
    expect(email).toContain('permission="can_view_platform_stats"');
  });

  it("le tre pagine del CRM controllano il permesso CRM, non il marketing completo", () => {
    for (const pagina of ["AdminMarketingContacts", "AdminMarketingContactDetail", "AdminMarketingOpportunities", "AdminMarketingCalendar"]) {
      expect(leggi(`src/pages/admin/marketing/${pagina}.tsx`), pagina).toContain("hasCrmAccess: hasAccess");
    }
  });

  it("niente accesso come altri utenti, assistente di piattaforma né scorciatoie per il call center", () => {
    const layout = leggi("src/components/layouts/AdminLayout.tsx");
    expect(layout).toContain('const soloCrm = role === "platform_callcenter"');
    expect(layout).toContain("{soloSuperAdmin && <QuickLoginPopover />}");
    expect(layout).toContain('{!soloCrm && <SilvioFAB mode="admin" />}');
    expect(layout).toContain("{!soloCrm && <AdminQuickActions />}");
  });
});

describe("migrazione", () => {
  const sql = leggi("supabase/migrations/20281008120000_platform_callcenter.sql");
  it("aggiunge il ruolo, la colonna e rende has_permission consapevole del ruolo", () => {
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'platform_callcenter'");
    expect(sql).toContain("crm_operatore boolean NOT NULL DEFAULT false");
    expect(sql).toContain("has_role(_user_id, 'platform_callcenter'::app_role)");
  });
});
