/**
 * Silvio rispetta i permessi del venditore (25/09/2026).
 *
 * Silvio applicava i permessi della riga staff_permissions solo a
 * company_staff. Il venditore, che nella scala dei ruoli sta sopra, non
 * passava da nessun filtro: dalla chat leggeva tutte le commesse
 * (get_orders_summary, search_orders) con clienti, importi e date di posa,
 * anche senza il permesso «Ordini e Commesse». Florin vuole che il venditore,
 * di serie, veda solo Marketing & Vendita.
 *
 * Tiene fermo:
 *   · i ruoli che nell'app usano la riga permessi li usano anche in Silvio;
 *   · col preset Venditore gli strumenti delle commesse restano fuori,
 *     quelli del CRM e dei preventivi dentro, e la ricerca degli slot liberi
 *     si apre anche con i soli appuntamenti CRM;
 *   · nel motore e nella chat non resta nessun controllo solo su company_staff.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildStaffPermissionsUpdate, DEFAULT_PERMISSIONS, ROLE_PRESETS } from "@/components/users/permissionsDefaults";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";
import { RUOLI_CON_PERMESSI_STAFF, usaPermessiStaff } from "../../../supabase/functions/_shared/ruoloSilvio";
import {
  areaSpentaPerPermessi,
  getToolsForChannel,
  SILVIO_TOOLS,
} from "../../../supabase/functions/_shared/silvioTools";

/** La riga come la salva l'app per un venditore nuovo. */
const venditore = buildStaffPermissionsUpdate({
  ...DEFAULT_PERMISSIONS,
  ...ROLE_PRESETS.salesperson,
} as StaffPermissions) as unknown as Record<string, unknown>;

describe("i ruoli con la riga permessi", () => {
  it("sono gli stessi dell'app: staff, venditore, call center, operaio, subappaltatore", () => {
    expect([...RUOLI_CON_PERMESSI_STAFF].sort()).toEqual(
      ["call_center", "company_staff", "employee", "salesperson", "subcontractor"],
    );
    for (const ruolo of ["company_admin", "super_admin", "accountant", "customer"]) {
      expect(usaPermessiStaff(ruolo), ruolo).toBe(false);
    }
  });
});

describe("Silvio col venditore di serie", () => {
  it("le aree delle commesse e della fatturazione sono spente, CRM e preventivi no", () => {
    expect(areaSpentaPerPermessi(venditore, "cantiere")).toBe(true);
    expect(areaSpentaPerPermessi(venditore, "operations")).toBe(true);
    expect(areaSpentaPerPermessi(venditore, "fattura")).toBe(true);
    expect(areaSpentaPerPermessi(venditore, "crm")).toBe(false);
    expect(areaSpentaPerPermessi(venditore, "preventivi")).toBe(false);
    // Il calendario lavori no, ma gli appuntamenti CRM sì: gli slot liberi servono.
    expect(venditore.can_view_calendar).toBe(false);
    expect(areaSpentaPerPermessi(venditore, "calendar")).toBe(false);
  });

  it("gli strumenti delle commesse non gli vengono offerti, quelli del CRM sì", () => {
    // Si confrontano gli oggetti del registro: il nome sta nello schema.
    const offerti = new Set(
      getToolsForChannel({ channel: "internal_chat", role: "salesperson", staffPermissions: venditore }),
    );
    const senzaPermessi = new Set(getToolsForChannel({ channel: "internal_chat", role: "salesperson" }));
    for (const nome of ["get_orders_summary", "search_orders"]) {
      const tool = SILVIO_TOOLS[nome];
      expect(tool, nome).toBeDefined();
      // Il ruolo li ammette: è il permesso a toglierli.
      expect(senzaPermessi.has(tool), `${nome} ammesso al venditore dal ruolo`).toBe(true);
      expect(offerti.has(tool), nome).toBe(false);
    }
    expect([...offerti].some((t) => t.domain === "crm")).toBe(true);
  });

  it("senza riga permessi (caso storico) non si toglie niente", () => {
    expect(areaSpentaPerPermessi(null, "cantiere")).toBe(false);
  });
});

describe("nessun controllo solo su company_staff", () => {
  const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("il motore applica permessi e perimetro a tutti i ruoli con la riga", () => {
    const motore = leggi("supabase/functions/_shared/silvioToolExecution.ts");
    expect(motore).not.toMatch(/primaryRole\s*[!=]==\s*"company_staff"/);
    expect(motore.match(/usaPermessiStaff\(ctx\.primaryRole\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("la chat carica i permessi per gli stessi ruoli", () => {
    const chat = leggi("supabase/functions/silvio-chat/index.ts");
    expect(chat).toContain("const staffPermsPromise = usaPermessiStaff(primaryRole)");
  });
});
