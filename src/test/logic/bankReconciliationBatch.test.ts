import { describe, it, expect } from "vitest";
import {
  draftProblem,
  draftDifference,
  draftPayload,
  proposalClaims,
  strongProposal,
  ownAccountTransfer,
  type BankDraft,
  type BankProposal,
} from "@/lib/finance/bankReconciliationBatch";
import type { BankMovement } from "@/lib/finance/bankWorkspace";
const c = (key = "documento:1", residuo = 100): BankProposal => ({
  key,
  id: key,
  tipo: "documento",
  titolo: "FT-2026-101",
  residuo,
  forte: true,
  motivi: ["Importo e identità"],
  incongruenze: [],
});
const movement = {
  id: "t1",
  status: "booked",
  currency: "EUR",
  amount: 100,
  transaction_type: "credit",
  links: { remaining: 100, matched: 0, revision: 0 },
} as BankMovement;
function draft(id = "t1", amount = "100"): BankDraft {
  return {
    movement: { ...movement, id },
    mode: "documents",
    rows: { "documento:1": { candidate: c(), amount } },
    category: "",
    note: "",
    differenceReason: "",
    reviewed: true,
  };
}
describe("lotto bancario", () => {
  it("ammette saldo singolo e conserva revisioni e importi nel payload", () => {
    const d = draft();
    expect(draftProblem(d, [d])).toBeNull();
    expect(draftPayload(d)).toMatchObject({
      id: "t1",
      revision: 0,
      expected_remaining: 100,
      rows: [{ tipo: "documento", importo: 100 }],
    });
  });
  it("ammette cumulativo e acconto esplicitamente parziale", () => {
    const d = draft("t1", "40");
    d.rows["documento:2"] = { candidate: c("documento:2", 60), amount: "60" };
    expect(draftProblem(d, [d])).toBeNull();
    delete d.rows["documento:2"];
    expect(draftProblem(d, [d])).toContain("differenza");
    d.differenceReason = "Acconto";
    expect(draftDifference(d)).toBe(60);
    expect(draftProblem(d, [d])).toBeNull();
  });
  it("più incassi sulla stessa fattura rispettano insieme il residuo", () => {
    const a = draft("t1", "40"),
      b = draft("t2", "60");
    a.movement.links = { ...a.movement.links, remaining: 40 };
    b.movement.links = { ...b.movement.links, remaining: 60 };
    expect(draftProblem(a, [a, b])).toBeNull();
    b.rows["documento:1"].amount = "61";
    expect(draftProblem(a, [a, b])).toContain("superano il residuo");
  });
  it("non propone per il blocco duplicati e ambiguità anche con punteggio alto", () => {
    const a = c(),
      b = c("documento:2");
    expect(strongProposal([a], proposalClaims({ t1: [a] }))).toBe(a);
    expect(strongProposal([a, b], proposalClaims({ t1: [a, b] }))).toBeNull();
    expect(
      strongProposal([a], proposalClaims({ t1: [a], t2: [a] })),
    ).toBeNull();
    expect(
      strongProposal([{ ...a, incongruenze: ["IBAN diverso"] }], new Map()),
    ).toBeNull();
  });
  it("riconosce il giroconto soltanto verso un altro conto della stessa azienda", () => {
    const m = { ...movement, account_id: "a", debtor_iban: "IT 123" };
    expect(ownAccountTransfer(m, [{ id: "b", iban: "IT123" }])).toBe(true);
    expect(ownAccountTransfer(m, [{ id: "a", iban: "IT123" }])).toBe(false);
  });
  it("senza fattura richiede categoria; non classifica di nuovo movimenti parziali", () => {
    const d = { ...draft(), mode: "none" as const, rows: {} };
    expect(draftProblem(d, [d])).toContain("categoria");
    d.category = "Giroconto";
    expect(draftProblem(d, [d])).toBeNull();
    d.movement = { ...d.movement, links: { ...d.movement.links, matched: 1 } };
    expect(draftProblem(d, [d])).toContain("parziale");
  });
  it("non tratta una ritenuta come pagamento inventato", () => {
    const d = draft("t1", "110");
    expect(draftProblem(d, [d])).toContain("quota");
    d.mode = "withholding";
    expect(draftProblem(d, [d])).toBeNull();
    d.rows["documento:1"].candidate.tipo = "scadenza";
    expect(draftProblem(d, [d])).toContain("fattura interna");
  });
});
