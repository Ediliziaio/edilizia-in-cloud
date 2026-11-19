import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidaRuoliOperativi } from "@/lib/permessi/cacheRuoliOperativi";
import { queryKeys } from "@/lib/queryKeys";

describe("le persone compaiono subito dopo il cambio di ruolo", () => {
  it("aggiorna venditori attivi, dipendenti e assegnatari, conservando le altre aziende", async () => {
    const qc = new QueryClient();
    const attivi = queryKeys.salespeople.active("azienda");
    const altri = queryKeys.salespeople.active("altra");
    const dipendenti = queryKeys.employees.list("azienda");
    const assegnatari = ["company-staff-by-area", "azienda", ["cantiere"]];
    const campo = ["employees_active", "azienda"];
    const ufficio = ["office-employees", "azienda"];
    const organigramma = ["hr-organigramma", "azienda"];
    for (const key of [attivi, altri, dipendenti, assegnatari, campo, ufficio, organigramma]) qc.setQueryData(key, []);
    await invalidaRuoliOperativi(qc, "azienda");
    for (const key of [attivi, dipendenti, assegnatari, campo, ufficio, organigramma]) expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(altri)?.isInvalidated).toBe(false);
    qc.clear();
  });
});
