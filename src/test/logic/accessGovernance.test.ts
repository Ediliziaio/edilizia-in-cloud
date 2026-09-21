import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildAccessGovernanceSummary,
  evaluateAccessRisk,
  normalizeAccessRoles,
} from "@/lib/accessGovernance";

const NOW = new Date("2026-05-24T12:00:00.000Z");

describe("access governance", () => {
  it("normalizza worker come employee e rimuove ruoli duplicati", () => {
    expect(normalizeAccessRoles(["worker", "employee", "salesperson", "salesperson"])).toEqual([
      "employee",
      "salesperson",
    ]);
  });

  it("marca come rischio alto un admin senza 2FA o mai connesso", () => {
    const risk = evaluateAccessRisk({
      roles: ["company_admin"],
      require2fa: false,
      isBlocked: false,
      lockedUntil: null,
      lastLoginAt: null,
      activeSessions: 0,
      hasCrossCompanyAccess: false,
      hasCriticalPermissions: true,
    }, NOW);

    expect(risk.level).toBe("high");
    expect(risk.reasons).toContain("Admin senza 2FA");
    expect(risk.reasons).toContain("Mai connesso");
  });

  it("marca accessi esterni con permessi critici come rischio medio", () => {
    const risk = evaluateAccessRisk({
      roles: ["subcontractor"],
      require2fa: true,
      isBlocked: false,
      lockedUntil: null,
      lastLoginAt: "2026-05-20T10:00:00.000Z",
      activeSessions: 1,
      hasCrossCompanyAccess: true,
      hasCriticalPermissions: true,
    }, NOW);

    expect(risk.level).toBe("medium");
    expect(risk.reasons).toContain("Accesso esterno con permessi critici");
    expect(risk.reasons).toContain("Accesso multi-azienda");
  });

  it("produce KPI coerenti per la cabina di controllo accessi", () => {
    const summary = buildAccessGovernanceSummary([
      {
        id: "admin-1",
        roles: ["company_admin"],
        require2fa: false,
        isBlocked: false,
        lockedUntil: null,
        lastLoginAt: null,
        activeSessions: 0,
        hasCrossCompanyAccess: false,
        hasCriticalPermissions: true,
      },
      {
        id: "staff-1",
        roles: ["company_staff"],
        require2fa: true,
        isBlocked: false,
        lockedUntil: null,
        lastLoginAt: "2026-05-23T12:00:00.000Z",
        activeSessions: 1,
        hasCrossCompanyAccess: false,
        hasCriticalPermissions: false,
      },
      {
        id: "sub-1",
        roles: ["subcontractor"],
        require2fa: false,
        isBlocked: true,
        lockedUntil: null,
        lastLoginAt: "2026-05-20T12:00:00.000Z",
        activeSessions: 0,
        hasCrossCompanyAccess: true,
        hasCriticalPermissions: false,
      },
    ], NOW);

    expect(summary.totalUsers).toBe(3);
    expect(summary.adminsWithout2fa).toBe(1);
    expect(summary.blockedUsers).toBe(1);
    expect(summary.crossCompanyUsers).toBe(1);
    expect(summary.highRiskUsers).toBe(1);
  });

  it("non lascia la governance accessi in loading infinito quando una query resta sospesa", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/settings/AccessGovernancePanel.tsx"),
      "utf8",
    );

    expect(source).toContain("withClientTimeout");
    expect(source).toContain("Analisi accessi");
    expect(source).toContain("retry: 0");
  });

  it("mantiene la scheda dettaglio utente senza cast any nei flussi accessi critici", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/pages/azienda/settings/SettingsUserDetail.tsx"),
      "utf8",
    );

    expect(source).not.toContain("as any");
    expect(source).not.toContain("@typescript-eslint/no-explicit-any");
  });

  // Chi riceve il ruolo subappaltatore deve avere la sua riga nella tabella
  // italiana `subappaltatori` (mai `subcontractors`, quella inglese sbagliata).
  // Dal 21/09/2026 (commit da37f31bc) il cambio di ruolo dalla scheda utente
  // non lo fa più la pagina ma il database, con cambia_ruolo_utente: il
  // collegamento si controlla dove vive adesso, in tutte e due le strade che
  // danno il ruolo — il cambio di ruolo e la creazione di un utente nuovo.
  describe("collega il ruolo subappaltatore alla tabella italiana corretta", () => {
    const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

    it("la scheda utente cambia il ruolo attraverso il database", () => {
      const source = leggi("src/pages/azienda/settings/SettingsUserDetail.tsx");
      expect(source).toContain('supabase.rpc("cambia_ruolo_utente"');
      expect(source).not.toContain('"subcontractors"');
    });

    it("la funzione del database, nella sua ultima versione, crea la riga in subappaltatori", () => {
      // Una funzione si ridefinisce con una migrazione nuova, numerata dopo
      // (2028…): conta l'ultima che la definisce, non la prima.
      const cartella = resolve(process.cwd(), "supabase/migrations");
      const definizioni = readdirSync(cartella)
        .filter((f) => f.endsWith(".sql") && f >= "20280921130000")
        .sort()
        .filter((f) =>
          /create\s+or\s+replace\s+function\s+public\.cambia_ruolo_utente\s*\(/i.test(readFileSync(join(cartella, f), "utf8")),
        );
      expect(definizioni.length).toBeGreaterThan(0);
      const sql = readFileSync(join(cartella, definizioni[definizioni.length - 1]), "utf8");
      expect(sql).toMatch(/if\s+p_ruolo\s*=\s*'subcontractor'/);
      expect(sql).toMatch(/insert\s+into\s+public\.subappaltatori\s*\(\s*user_id\s*,\s*company_id/);
      expect(sql).not.toContain("subcontractors");
    });

    it("la creazione di un utente subappaltatore collega o crea la riga in subappaltatori", () => {
      const source = leggi("supabase/functions/create-company-staff/index.ts");
      expect(source).toContain('if (effectiveRoleType === "subcontractor" && userId && targetCompanyId)');
      expect(source).toContain('supabaseAdmin.from("subappaltatori").insert(');
      expect(source).not.toContain('"subcontractors"');
    });
  });
});
