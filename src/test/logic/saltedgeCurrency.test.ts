import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { formatTreasuryCurrency, sumTreasuryByCurrency, treasuryTransactionAmount } from "../../lib/treasury";
import { SaltTestDatabase } from "../helpers/saltedgeDatabase";

const db = new SaltTestDatabase();
beforeAll(async () => {
  await db.setup();
  await db.pg.exec(await readFile("supabase/migrations/20261027163625_saltedge_currency_precision.sql", "utf8"));
});
afterAll(async () => db.pg.close());

describe("Salt Edge: valute native senza conversioni implicite", () => {
  it("mantiene l'euro predefinito ma non etichetta USD e BTC come euro", () => {
    expect(formatTreasuryCurrency(10)).toContain("€");
    expect(formatTreasuryCurrency(10, "—", "USD")).not.toContain("€");
    expect(formatTreasuryCurrency(0.01234567, "—", "BTC")).toContain("0,01234567");
  });
  it("somma esclusivamente importi nella stessa valuta", () => {
    expect(sumTreasuryByCurrency([{ currency: "EUR", amount: 20 }, { currency: "USD", amount: 10 }, { currency: "USD", amount: -10 }], r => r.amount))
      .toEqual([{ currency: "EUR", total: 20 }, { currency: "USD", total: 0 }]);
  });
  it("recupera la precisione originale dei movimenti Salt Edge senza cambiare quelli manuali", () => {
    expect(treasuryTransactionAmount({ amount: 0.01, currency: "BTC", metadata: { provider: "saltedge", currency_code: "BTC", amount: 0.01234567 } })).toBe(0.01234567);
    expect(treasuryTransactionAmount({ amount: 10, currency: "EUR", metadata: { provider: "other", amount: 999 } })).toBe(10);
    expect(treasuryTransactionAmount({ amount: 10, currency: "EUR", metadata: { provider: "saltedge", currency_code: "USD", amount: 999 } })).toBe(10);
    expect(treasuryTransactionAmount({ amount: 10, currency: "EUR", metadata: { provider: "saltedge", currency_code: "EUR", amount: null } })).toBe(10);
  });
  it("salva il saldo BTC con otto decimali nel database reale di test", async () => {
    const company = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const connection = await db.from("bank_connections").insert({ company_id: company, institution_id: "fake", provider_slug: "saltedge" }).select("id").single();
    expect(connection.error).toBeNull();
    const account = await db.from("bank_accounts").insert({ company_id: company, connection_id: (connection.data as { id: string }).id, external_account_id: "se:precision", currency: "BTC", current_balance: 0.01234567 }).select("current_balance").single();
    expect(account.error).toBeNull();
    expect((account.data as { current_balance: string }).current_balance).toBe("0.01234567");
  });
});
