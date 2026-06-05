import { describe, it, expect } from "vitest";
import { slug } from "@/components/flow-builder/config-panels/EmailBodyEditor";

/**
 * GUARD anti-regressione del bug "picker bugiardo":
 * il picker del builder inserisce {{contact.<slug(name)>}}, mentre il resolver
 * lato motore (supabase/functions/_shared/contactCustomFields.ts) cerca
 * {{contact.<toSnakeCase(name)>}}. Se le due funzioni divergono, il campo
 * personalizzato NON viene sostituito nell'email/WhatsApp/SMS.
 *
 * Replica ESATTA di toSnakeCase (resolver). Se cambia là, questo test rompe e
 * ricorda di riallineare anche `slug`.
 */
function toSnakeCase(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const NAMES = [
  "Telefono Ufficio",
  "Codice Cliente",
  "Città",
  "P.IVA",
  "Note interne 2024",
  "Referente (commerciale)",
  "email_secondaria",
  "Ruolo/Mansione",
];

describe("custom field merge-key: picker (slug) ↔ resolver (toSnakeCase)", () => {
  it("producono la STESSA chiave per ogni nome campo", () => {
    for (const name of NAMES) {
      expect(slug(name)).toBe(toSnakeCase(name));
    }
  });

  it("genera chiavi snake_case valide (solo a-z0-9_)", () => {
    for (const name of NAMES) {
      const k = slug(name);
      expect(k).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
    }
  });

  it("esempio end-to-end: 'Telefono Ufficio' → contact.telefono_ufficio", () => {
    expect(`contact.${slug("Telefono Ufficio")}`).toBe("contact.telefono_ufficio");
  });
});
