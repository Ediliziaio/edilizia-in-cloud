/**
 * Chi resta fuori dal gestionale e chi no (23/09/2026).
 *
 * Fino a ieri bastava un campo vuoto dell'anagrafica per chiudere fuori TUTTA
 * l'azienda: Ener Italia S.p.A. aveva la carta registrata e i dati di
 * fatturazione vuoti, e 28 persone vedevano la schermata di attivazione al posto
 * del gestionale, col pagamento già fatto. Ora chiude fuori solo chi non ha un
 * metodo di pagamento o non ha più l'abbonamento; i dati mancanti diventano un
 * avviso in alto per chi può compilarli.
 */
import { describe, expect, it, vi } from "vitest";

// Il modulo importa useAuth solo per la versione hook: qui si prova la regola pura.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: null as unknown, role: null as string | null }),
}));

import { statoAttivazione } from "@/hooks/useBillingActivationGate";

const ANAGRAFICA_COMPLETA = {
  business_name: "Ener Italia S.p.A.",
  vat_number: "IT01234567890",
  legal_address: "Via Roma 1",
  legal_city: "Milano",
  legal_postal_code: "20100",
};

const azienda = (extra: Record<string, unknown>) => ({
  id: "629d91e0-9d56-4736-a030-1e3833cba2ea",
  status: "free",
  ...extra,
});

describe("attivazione del gestionale", () => {
  it("carta registrata e anagrafica vuota: si entra, ma i dati vanno chiesti", () => {
    const s = statoAttivazione(azienda({ payment_method: "stripe" }), "company_admin");
    expect(s.isBlocked).toBe(false);
    expect(s.needsBillingData).toBe(true);
    expect(s.needsPaymentMethod).toBe(false);
    expect(s.canManage).toBe(true);
  });

  it("l'avviso dei dati vale anche per chi non può compilarli, ma non blocca nessuno", () => {
    const s = statoAttivazione(azienda({ payment_method: "bank_transfer" }), "salesperson");
    expect(s.isBlocked).toBe(false);
    expect(s.needsBillingData).toBe(true);
    expect(s.canManage).toBe(false);
  });

  it("senza metodo di pagamento si resta fuori, anche con l'anagrafica a posto", () => {
    const s = statoAttivazione(azienda({ payment_method: "none", ...ANAGRAFICA_COMPLETA }), "company_admin");
    expect(s.isBlocked).toBe(true);
    expect(s.needsPaymentMethod).toBe(true);
    expect(s.needsBillingData).toBe(false);
    expect(s.subscriptionExpired).toBe(false);
  });

  it("abbonamento scaduto o cancellato: blocco duro anche con carta e dati", () => {
    for (const status of ["expired", "canceled"]) {
      const s = statoAttivazione(azienda({ status, payment_method: "stripe", ...ANAGRAFICA_COMPLETA }), "company_admin");
      expect(s.isBlocked).toBe(true);
      expect(s.subscriptionExpired).toBe(true);
    }
  });

  it("regalata, demo, super_admin e prova in corso: niente blocco e niente avviso", () => {
    const esenti = [
      statoAttivazione(azienda({ payment_method: "comped" }), "company_admin"),
      statoAttivazione(azienda({ id: "778a2c76-1253-49f2-a5e8-283363ac3e29", payment_method: "none" }), "company_admin"),
      statoAttivazione(azienda({ payment_method: "none" }), "super_admin"),
      statoAttivazione(azienda({ payment_method: "none" }), "customer"),
      statoAttivazione(
        azienda({ status: "trial", payment_method: "none", trial_ends_at: new Date(Date.now() + 86_400_000).toISOString() }),
        "company_admin",
      ),
      statoAttivazione(null, "company_admin"),
    ];
    for (const s of esenti) {
      expect(s.isBlocked).toBe(false);
      expect(s.needsBillingData).toBe(false);
      expect(s.needsPaymentMethod).toBe(false);
    }
  });

  it("prova scaduta: torna a valere la regola del metodo di pagamento", () => {
    const s = statoAttivazione(
      azienda({ status: "trial", payment_method: "none", trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() }),
      "company_admin",
    );
    expect(s.isBlocked).toBe(true);
    expect(s.needsPaymentMethod).toBe(true);
  });
});
