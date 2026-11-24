/**
 * «Verifica accesso…» a tutto schermo a ogni ricarica (24/11/2026): le funzioni del piano dell'azienda
 * restano nella memoria del browser, così la sezione si apre subito e la lettura fresca arriva dietro.
 */
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/queryKeys";
import { shouldPersistQuery, shouldPersistQuerySafe } from "@/lib/queryPersister";

describe("le funzioni del piano nella memoria del browser", () => {
  const chiave = queryKeys.featureFlags.companyResolved("azienda-1");

  it("la risposta di resolve_company_features si conserva tra una ricarica e l'altra", () => {
    expect(shouldPersistQuery(chiave)).toBe(true);
    const righe = [{ feature_key: "modulo_serramenti_attivo", is_enabled: true, access_level: "enabled" }];
    expect(shouldPersistQuerySafe({ queryKey: chiave, state: { data: righe, status: "success" } })).toBe(true);
  });

  it("una lettura non ancora tornata o fallita non si conserva", () => {
    expect(shouldPersistQuerySafe({ queryKey: chiave, state: { data: undefined, status: "pending" } })).toBe(false);
    expect(shouldPersistQuerySafe({ queryKey: chiave, state: { data: undefined, status: "error" } })).toBe(false);
  });

  it("il controllo della singola funzione, di ripiego, resta sempre letto dal database", () => {
    expect(shouldPersistQuery(["feature-access", "azienda-1", "modulo_serramenti_attivo"])).toBe(false);
  });
});
