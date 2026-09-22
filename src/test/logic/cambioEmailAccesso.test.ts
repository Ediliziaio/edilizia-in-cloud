/**
 * Cambio dell'email di accesso dalla scheda utente (22/09/2026).
 *
 * Il ramo «change_email» di company-access-manage stava dopo il controllo su
 * access_id, che serve solo alle azioni su una riga di accesso (ruolo, stato,
 * revoca): ogni cambio email finiva in «access_id mancante» e l'email non
 * cambiava mai. La scheda poi mostrava solo «Edge Function returned a non-2xx
 * status code», senza il motivo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const leggi = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("cambio email di accesso", () => {
  const funzione = leggi("supabase/functions/company-access-manage/index.ts");

  it("il ramo change_email viene prima del controllo su access_id", () => {
    const ramo = funzione.indexOf('if (action === "change_email")');
    const controllo = funzione.indexOf('if (!accessId) return errorResponse("access_id mancante"');
    expect(ramo).toBeGreaterThan(0);
    expect(controllo).toBeGreaterThan(0);
    expect(ramo).toBeLessThan(controllo);
  });

  it("anche le altre azioni senza access_id stanno prima del controllo", () => {
    const controllo = funzione.indexOf('if (!accessId) return errorResponse("access_id mancante"');
    for (const azione of ["list", "invite", "change_email"]) {
      expect(funzione.indexOf(`if (action === "${azione}")`)).toBeLessThan(controllo);
    }
    for (const azione of ["update-role", "set-status", "revoke"]) {
      expect(funzione.indexOf(`if (action === "${azione}")`)).toBeGreaterThan(controllo);
    }
  });

  it("la scheda utente mostra il motivo vero quando il cambio non riesce", () => {
    const scheda = leggi("src/pages/azienda/settings/SettingsUserDetail.tsx");
    expect(scheda).toContain('await edgeErrorMessage(fnErr, "Cambio email non riuscito.")');
    expect(scheda).not.toContain("if (fnErr) throw new Error(fnErr.message);");
  });
});
