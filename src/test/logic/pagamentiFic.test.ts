// Incassi parziali e annulli verso Fatture in Cloud (30/10/2026): le rate dopo
// l'azione. Solo logica, senza rete.
import { describe, expect, it } from "vitest";
import {
  nuovoPagato,
  pagatoSuFic,
  ripartisciPagamenti,
  statoLocale,
  type RataFic,
} from "../../../supabase/functions/_shared/pagamentiFic";
import funzione from "../../../supabase/functions/billing-payment-push/index.ts?raw";
import tesoreria from "@/components/tesoreria/BankReconciliation.tsx?raw";

const base = { dataPagamento: "2026-10-30", scadenzaPredefinita: "2026-11-30", contoId: 7 };
const somma = (r: { amount: number }[]) => Math.round(r.reduce((t, x) => t + x.amount * 100, 0)) / 100;

describe("quanto risulta pagato", () => {
  it("la somma delle rate pagate", () => {
    expect(pagatoSuFic([{ amount: 100, status: "paid" }, { amount: 50, status: "not_paid" }, { amount: "20.5", status: "paid" }])).toBe(120.5);
  });

  it("salda, incassa e annulla, senza uscire da 0…lordo", () => {
    expect(nuovoPagato(1000, 200, { tipo: "salda" })).toBe(1000);
    expect(nuovoPagato(1000, 200, { tipo: "incassa", importo: 300 })).toBe(500);
    expect(nuovoPagato(1000, 900, { tipo: "incassa", importo: 300 })).toBe(1000);
    expect(nuovoPagato(1000, 500, { tipo: "annulla", importo: 300 })).toBe(200);
    expect(nuovoPagato(1000, 100, { tipo: "annulla", importo: 300 })).toBe(0);
  });
});

describe("ripartisciPagamenti", () => {
  it("nessuna rata su FIC, acconto: una pagata e il resto da pagare", () => {
    const r = ripartisciPagamenti({ ...base, rate: [], lordo: 1220, pagato: 400 })!;
    expect(r).toEqual([
      { amount: 400, due_date: "2026-11-30", paid_date: "2026-10-30", status: "paid", payment_account: { id: 7 } },
      { amount: 820, due_date: "2026-11-30", status: "not_paid" },
    ]);
  });

  it("saldare tutto: come prima, ogni rata pagata, le date già pagate restano", () => {
    const rate: RataFic[] = [
      { amount: 500, due_date: "2026-10-31", status: "paid", paid_date: "2026-10-15", payment_account: { id: 3 } },
      { amount: 500, due_date: "2026-11-30", status: "not_paid" },
    ];
    const r = ripartisciPagamenti({ ...base, rate, lordo: 1000, pagato: 1000 })!;
    expect(r.every((x) => x.status === "paid")).toBe(true);
    expect(r[0]).toMatchObject({ paid_date: "2026-10-15", payment_account: { id: 3 } });
    expect(r[1]).toMatchObject({ paid_date: "2026-10-30", payment_account: { id: 7 } });
  });

  it("due rate, incasso a metà della seconda: la seconda si divide", () => {
    const rate: RataFic[] = [
      { amount: 500, due_date: "2026-10-31", status: "paid", paid_date: "2026-10-15", payment_account: { id: 3 } },
      { amount: 500, due_date: "2026-11-30", status: "not_paid" },
    ];
    const r = ripartisciPagamenti({ ...base, rate, lordo: 1000, pagato: 700 })!;
    expect(r.map((x) => [x.amount, x.status, x.due_date])).toEqual([
      [500, "paid", "2026-10-31"],
      [200, "paid", "2026-11-30"],
      [300, "not_paid", "2026-11-30"],
    ]);
    expect(somma(r)).toBe(1000);
  });

  it("annullo: le parti da pagare con la stessa scadenza tornano una rata", () => {
    const rate: RataFic[] = [
      { amount: 500, due_date: "2026-10-31", status: "paid", paid_date: "2026-10-15", payment_account: { id: 3 } },
      { amount: 200, due_date: "2026-11-30", status: "paid", paid_date: "2026-10-30", payment_account: { id: 7 } },
      { amount: 300, due_date: "2026-11-30", status: "not_paid" },
    ];
    const r = ripartisciPagamenti({ ...base, rate, lordo: 1000, pagato: 500 })!;
    expect(r.map((x) => [x.amount, x.status, x.due_date])).toEqual([
      [500, "paid", "2026-10-31"],
      [500, "not_paid", "2026-11-30"],
    ]);
  });

  it("annullo totale: tutto da pagare, nessun conto richiesto", () => {
    const r = ripartisciPagamenti({ ...base, contoId: null, rate: [{ amount: 1000, due_date: "2026-10-31", status: "paid", paid_date: "2026-10-15" }], lordo: 1000, pagato: 0 })!;
    expect(r).toEqual([{ amount: 1000, due_date: "2026-10-31", status: "not_paid" }]);
  });

  it("una rata pagata senza conto e nessun conto da usare: null, non si inventa", () => {
    expect(ripartisciPagamenti({ ...base, contoId: null, rate: [], lordo: 1000, pagato: 100 })).toBeNull();
  });

  it("le rate sommano sempre il lordo, anche se su FIC la somma era sbagliata di un centesimo", () => {
    const r = ripartisciPagamenti({ ...base, rate: [{ amount: 333.33, due_date: "2026-10-31", status: "not_paid" }, { amount: 333.33, due_date: "2026-11-30", status: "not_paid" }, { amount: 333.33, due_date: "2026-12-31", status: "not_paid" }], lordo: 1000, pagato: 333.33 })!;
    expect(somma(r)).toBe(1000);
  });

  it("lo stato locale: pagata solo se coperta tutta", () => {
    expect(statoLocale(1000, 1000)).toBe("paid");
    expect(statoLocale(1000, 999.99)).toBe("issued");
    expect(statoLocale(1000, 0)).toBe("issued");
  });
});

describe("billing-payment-push usa il calcolo e resta compatibile", () => {
  it("senza azione salda tutto; incassa e annulla vogliono un importo", () => {
    expect(funzione).toContain('let azione: AzionePagamento = { tipo: "salda" };');
    expect(funzione).toContain('if (body.azione === "incassa" || body.azione === "annulla")');
    expect(funzione).toContain("if (!(importo > 0)) return json({ error: \"importo positivo richiesto\" }, 400);");
  });

  it("il pagato parte da quello su FIC e l'allineamento locale non segna più «paid» a prescindere", () => {
    expect(funzione).toContain("const pagatoPrima = pagatoSuFic(existing);");
    expect(funzione).toContain("ripartisciPagamenti({");
    expect(funzione).toContain("status: statoLocale(grossFromFic, pagatoDopo)");
    expect(funzione).not.toContain('.update({ status: "paid", paid_amount: inv.total');
  });

  it("l'accesso resta quello di prima: utente dell'azienda o chiamata interna", () => {
    expect(funzione).toContain("canAccessCompany(supabase, userId!, inv.company_id)");
  });
});

describe("Tesoreria tiene allineata Fatture in Cloud anche in parte e quando scollega", () => {
  it("un bonifico che paga solo una parte manda l'incasso parziale, non più niente", () => {
    expect(tesoreria).toContain('azione: "incassa", importo: matchedAmount');
    expect(tesoreria).not.toContain('inv.external_provider === "fattureincloud" && fullyPaid');
  });

  it("scollegare una fattura importata toglie il pagamento anche su Fatture in Cloud", () => {
    expect(tesoreria).toContain('body: { invoice_id: invId, azione: "annulla", importo: Number(rec.matched_amount || 0) }');
  });
});
