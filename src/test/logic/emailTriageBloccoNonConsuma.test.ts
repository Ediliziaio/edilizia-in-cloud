/**
 * Triage delle email fermo per carta, abbonamento o credito (11/11/2026): il motivo vero
 * resta in ai_error, il tentativo NON si consuma e si riprova fra un'ora. Prima ogni
 * blocco scriveva «triage failed…» e bruciava uno dei tre tentativi.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ATTESA_BLOCCO_MS, motivoBloccoTriage, salvaTriage, type TriageResult } from "../../../supabase/functions/email-triage-ai/persistenza";

const db = new PGlite();
const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", company = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const CARTA = "Registra una carta di pagamento aziendale per usare questo strumento (Impostazioni → Fatturazione).";
const ABBONAMENTO = "Abbonamento sospeso o scaduto: rinnova per riattivare questo strumento.";
const errore = (nome: string, messaggio: string) => Object.assign(new Error(messaggio), { name: nome });
const result: TriageResult = { category: "altro", priority: "bassa", summary: "s", extracted: {}, suggested_action: "archivia" };

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE email_inbox(id uuid PRIMARY KEY,company_id uuid,status text DEFAULT 'new',ai_category text,
      ai_processed_at timestamptz,ai_priority text,ai_summary text,ai_extracted jsonb,ai_suggested_action text,ai_error text,
      CONSTRAINT email_inbox_ai_category_check CHECK(ai_category IN ('pending','altro','lead')));`);
  await db.exec("BEGIN;" + readFileSync("supabase/migrations/20261016112850_email_triage_salvataggio_sicuro.sql", "utf8") + "COMMIT;");
}, 60000);
afterAll(() => db.close());
beforeEach(async () => { await db.exec("TRUNCATE email_inbox"); await db.query("INSERT INTO email_inbox(id,company_id) VALUES($1,$2)", [id, company]); });

const client = () => ({
  rpc: async (_: string, a: { p_email_id: string; p_company_id: string }) => ({ data: (await db.query<{ n: number | null }>("SELECT claim_email_triage($1,$2) AS n", [a.p_email_id, a.p_company_id])).rows[0].n, error: null as null }),
  from: () => ({ update: (values: Record<string, unknown>) => {
    const filtri: Array<[string, unknown]> = [];
    const q = {
      eq: (k: string, v: unknown) => { filtri.push([k, v]); return q; },
      is: () => q, select: () => q,
      maybeSingle: async () => {
        const chiavi = Object.keys(values);
        const sql = `UPDATE email_inbox SET ${chiavi.map((k, i) => `${k}=$${i + 1}`).join(",")} WHERE ${filtri.map(([k], i) => `${k}=$${chiavi.length + i + 1}`).join(" AND ")} AND ai_processed_at IS NULL RETURNING id`;
        const rows = (await db.query<{ id: string }>(sql, [...Object.values(values), ...filtri.map(([, v]) => v)])).rows;
        return { data: rows[0] ?? null, error: null as null };
      },
    };
    return q;
  } }),
});
const riga = async () => (await db.query<{ ai_triage_attempts: number; ai_triage_retry_at: Date | null; ai_triage_claimed_at: unknown; ai_error: string | null; ai_processed_at: unknown }>("SELECT * FROM email_inbox")).rows[0];

describe("triage fermo per un blocco: tentativo intatto, motivo vero, si riprova fra un'ora", () => {
  it.each([["carta", CARTA], ["abbonamento", ABBONAMENTO]])("%s", async (_n, testo) => {
    const adesso = new Date("2026-11-11T10:00:00Z");
    const esito = await salvaTriage(client(), id, company, async () => { throw errore("AiRouterError", testo); }, () => adesso);
    expect(esito).toEqual({ state: "blocked", motivo: `triage sospeso: ${testo}` });
    const r = await riga();
    expect(r.ai_triage_attempts).toBe(0);
    expect(r.ai_error).toBe(`triage sospeso: ${testo}`);
    expect(r.ai_triage_claimed_at).toBeNull();
    expect(r.ai_processed_at).toBeNull();
    expect(new Date(r.ai_triage_retry_at!).getTime()).toBe(adesso.getTime() + ATTESA_BLOCCO_MS);
  });

  it("dieci blocchi di fila non bruciano i tre tentativi: tolto il blocco, l'email si classifica", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await salvaTriage(client(), id, company, async () => { throw errore("AiRouterError", CARTA); })).state).toBe("blocked");
      await db.exec("UPDATE email_inbox SET ai_triage_retry_at = now() - interval '1 minute'");
    }
    expect((await riga()).ai_triage_attempts).toBe(0);
    expect((await salvaTriage(client(), id, company, async () => result)).state).toBe("saved");
    expect(await riga()).toMatchObject({ ai_triage_attempts: 1, ai_error: null });
  });

  it("prima dell'ora non si riprova", async () => {
    await salvaTriage(client(), id, company, async () => { throw errore("AiRouterError", ABBONAMENTO); });
    const classify = vi.fn(async () => result);
    expect((await salvaTriage(client(), id, company, classify)).state).toBe("skipped");
    expect(classify).not.toHaveBeenCalled();
  });

  it("un errore qualunque consuma ancora il tentativo, come prima", async () => {
    expect((await salvaTriage(client(), id, company, async () => { throw new Error("timeout"); })).state).toBe("failed");
    expect(await riga()).toMatchObject({ ai_triage_attempts: 1, ai_error: "triage failed: nuovo tentativo pianificato" });
  });

  it("credito del provider: sospeso senza parlare della lettura dei documenti", () => {
    expect(motivoBloccoTriage(errore("AiProviderCreditError", "OpenRouter 402"))).toBe("triage sospeso: l'AI della piattaforma è momentaneamente ferma");
    expect(motivoBloccoTriage(new Error("timeout"))).toBeNull();
  });
});

describe("index.ts: la carta si guarda anche all'arrivo, e l'AI non inghiotte i blocchi", () => {
  const s = readFileSync("supabase/functions/email-triage-ai/index.ts", "utf8");
  it("processIngest controlla la carta prima del triage immediato", () => {
    const ingest = s.slice(s.indexOf("async function processIngest"), s.indexOf("async function processTriagePending"));
    expect(ingest).toMatch(/const gate = await checkPaymentMethod\(supa, companyId\);\s*if \(!gate\.allowed\)/);
    expect(ingest.indexOf("checkPaymentMethod")).toBeLessThan(ingest.indexOf("salvaTriage("));
  });
  it("triageOneEmail rilancia i blocchi invece di tornare null", () => {
    expect(s).toMatch(/if \(bloccoAiPerUtente\(e\)\) throw e;\s*console\.error\("\[email-triage\] ai failure:", e\);\s*return null;/);
  });
  it("le email vecchie restano fuori: la finestra del poller non cambia", () => {
    expect(s).toContain('.gte("received_at", dal)');
  });
});
