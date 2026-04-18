/**
 * Unit test di sicurezza — SUPER_ADMIN_EMAIL_ALLOWLIST.
 *
 * Questi test sono volutamente pignoli: sono l'ultima linea di difesa
 * che impedisce a email NON autorizzate di assumere il ruolo super_admin
 * anche in presenza di una riga spuria su `user_roles` (DB compromesso,
 * seed errato, migrazione botched).
 *
 * Qualsiasi modifica futura all'allowlist o a isSuperAdminEmailAllowed
 * DEVE mantenere verdi tutti questi test.
 */
import { describe, it, expect } from "vitest";
import {
  SUPER_ADMIN_EMAIL_ALLOWLIST,
  isSuperAdminEmailAllowed,
} from "@/config/superAdmin";

describe("SUPER_ADMIN_EMAIL_ALLOWLIST", () => {
  it("contiene solo l'email dell'owner (flo.andriciuc@gmail.com)", () => {
    expect(SUPER_ADMIN_EMAIL_ALLOWLIST).toEqual(["flo.andriciuc@gmail.com"]);
    expect(SUPER_ADMIN_EMAIL_ALLOWLIST.length).toBe(1);
  });
});

describe("isSuperAdminEmailAllowed — happy path", () => {
  it("consente l'email esatta in lowercase", () => {
    expect(isSuperAdminEmailAllowed("flo.andriciuc@gmail.com")).toBe(true);
  });

  it("consente l'email case-insensitive (uppercase)", () => {
    expect(isSuperAdminEmailAllowed("FLO.ANDRICIUC@GMAIL.COM")).toBe(true);
  });

  it("consente l'email case-insensitive (mixed case)", () => {
    expect(isSuperAdminEmailAllowed("Flo.Andriciuc@Gmail.Com")).toBe(true);
  });

  it("tollera leading/trailing whitespace", () => {
    expect(isSuperAdminEmailAllowed("  flo.andriciuc@gmail.com  ")).toBe(true);
  });

  it("tollera tab e newline", () => {
    expect(isSuperAdminEmailAllowed("\tflo.andriciuc@gmail.com\n")).toBe(true);
  });
});

describe("isSuperAdminEmailAllowed — reject path", () => {
  it("blocca l'email incriminata del bug report (demo@azienda.srl)", () => {
    expect(isSuperAdminEmailAllowed("demo@azienda.srl")).toBe(false);
  });

  it("blocca email simili ma diverse", () => {
    expect(isSuperAdminEmailAllowed("flo.andriciuc@gmail.co")).toBe(false);
    expect(isSuperAdminEmailAllowed("flo.andriciuc@gmail.comm")).toBe(false);
    expect(isSuperAdminEmailAllowed("flo.andriciu@gmail.com")).toBe(false);
    expect(isSuperAdminEmailAllowed("floandriciuc@gmail.com")).toBe(false);
  });

  it("blocca subdomain attack", () => {
    expect(isSuperAdminEmailAllowed("flo.andriciuc@gmail.com.attacker.com")).toBe(false);
    expect(isSuperAdminEmailAllowed("flo.andriciuc@sub.gmail.com")).toBe(false);
  });

  it("blocca prefix/suffix attack", () => {
    expect(isSuperAdminEmailAllowed("a.flo.andriciuc@gmail.com")).toBe(false);
    expect(isSuperAdminEmailAllowed("flo.andriciuc@gmail.com.bad")).toBe(false);
  });

  it("blocca email vuota / null / undefined", () => {
    expect(isSuperAdminEmailAllowed("")).toBe(false);
    expect(isSuperAdminEmailAllowed("   ")).toBe(false);
    expect(isSuperAdminEmailAllowed(null)).toBe(false);
    expect(isSuperAdminEmailAllowed(undefined)).toBe(false);
  });

  it("blocca email comuni corp/test che potrebbero finire per sbaglio in user_roles", () => {
    expect(isSuperAdminEmailAllowed("admin@edilizia.io")).toBe(false);
    expect(isSuperAdminEmailAllowed("test@test.com")).toBe(false);
    expect(isSuperAdminEmailAllowed("root@localhost")).toBe(false);
    expect(isSuperAdminEmailAllowed("admin@admin.com")).toBe(false);
  });

  it("blocca stringhe con caratteri di controllo / injection", () => {
    expect(isSuperAdminEmailAllowed("flo.andriciuc@gmail.com\0extra")).toBe(false);
    expect(isSuperAdminEmailAllowed("'; DROP TABLE user_roles;--")).toBe(false);
  });
});
