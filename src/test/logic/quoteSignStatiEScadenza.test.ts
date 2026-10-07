/**
 * Link pubblico dell'offerta (quote-sign, pagina /offerta/<token>): uno stato
 * concluso resta quello che è.
 *
 * Il controllo della scadenza girava PRIMA di guardare lo stato, per tutti: un
 * preventivo firmato (o rifiutato, o già diventato commessa) la cui data di
 * validità passava faceva rispondere «Offerta scaduta» a chi riapriva il link,
 * anche solo per scaricare il PDF firmato. In produzione i 14 preventivi
 * accettati hanno tutti la validità passata.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, denoFinto, type Riga } from "../helpers/edgeFinto";

const condiviso = vi.hoisted(() => ({
  db: null as unknown as DbMinimo,
  gestore: null as null | ((req: Request) => Promise<Response>),
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => condiviso.db }));
vi.mock("../../../supabase/functions/_shared/withMetrics.ts", () => ({
  serveConMetriche: (_nome: string, g: (req: Request) => Promise<Response>) => { condiviso.gestore = g; },
}));
vi.mock("../../../supabase/functions/_shared/sendEmailUnified.ts", () => ({
  sendEmailUnified: async () => ({ ok: true, status: 200, body: {} }),
}));

const TOKEN = "5f1c0a9e-7d2b-4c3a-8e11-0123456789ab";
const preventivo = (extra: Riga = {}): Riga => ({
  id: "q-1", company_id: "c-1", quote_number: "OFF-2026-042", title: "Serramenti", status: "inviata",
  signature_token: TOKEN, expires_at: "2026-09-01T10:00:00.000Z", subtotal: 1000, discount_percent: 0, discount_amount: 0,
  vat_amount: 220, total: 1220, signed_at: null, signed_by_name: null, created_at: "2026-08-01T10:00:00.000Z",
  client_name: "Mario Rossi", ...extra,
});

const ambiente = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "service" };

async function chiama(azione: string, extra: Riga = {}) {
  if (!condiviso.gestore) {
    vi.resetModules();
    vi.stubGlobal("Deno", denoFinto(ambiente).finto);
    const percorso = "../../../supabase/functions/quote-sign/index.ts";
    await import(/* @vite-ignore */ percorso);
  }
  // Deno si ristabilisce a ogni chiamata: il gestore lo legge a ogni richiesta.
  vi.stubGlobal("Deno", denoFinto(ambiente).finto);
  const r = await condiviso.gestore!(new Request("http://x/functions/v1/quote-sign", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: TOKEN, action: azione, ...extra }),
  }));
  return r.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T10:00:00.000Z"));
  condiviso.db = new DbMinimo();
  condiviso.db.tabelle.companies = [{ id: "c-1", name: "Rossi Serramenti" }];
  condiviso.db.tabelle.quote_items = [{ quote_id: "q-1", name: "Finestra", quantity: 1, unit_price: 1000, line_total: 1000, vat_rate: 22, sort_order: 0 }];
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("quote-sign: la validità scaduta non cancella uno stato concluso", () => {
  it.each(["accettata", "rifiutata", "convertita"])("«%s» con la validità passata: il link mostra l'offerta con il suo stato", async (stato) => {
    condiviso.db.tabelle.quotes = [preventivo({ status: stato, signed_at: stato === "rifiutata" ? null : "2026-08-10T09:00:00.000Z", signed_by_name: "Mario Rossi" })];
    const esito = await chiama("view");
    expect(esito.valid).toBe(true);
    expect(esito.status).toBe(stato);
    expect(esito.reason).toBeUndefined();
    expect((esito.quote as Riga).total).toBe(1220);
  });

  it("l'accettata non si può firmare di nuovo: «già firmata», non «scaduta»", async () => {
    condiviso.db.tabelle.quotes = [preventivo({ status: "accettata" })];
    expect(await chiama("sign", { signed_by_name: "Mario Rossi" })).toMatchObject({ valid: false, reason: "already_signed" });
    expect(await chiama("refuse")).toMatchObject({ valid: false, reason: "invalid_status" });
  });

  it("l'inviata con la validità passata è scaduta, e lo stato si allinea", async () => {
    condiviso.db.tabelle.quotes = [preventivo({ status: "inviata" })];
    expect(await chiama("view")).toMatchObject({ valid: false, reason: "expired" });
    expect(condiviso.db.tabelle.quotes[0].status).toBe("scaduta");
    expect(await chiama("sign", { signed_by_name: "Mario Rossi" })).toMatchObject({ valid: false, reason: "expired" });
  });

  it("una già «scaduta» resta scaduta anche se la data è stata spostata in avanti", async () => {
    condiviso.db.tabelle.quotes = [preventivo({ status: "scaduta", expires_at: "2026-12-31T10:00:00.000Z" })];
    expect(await chiama("view")).toMatchObject({ valid: false, reason: "expired" });
  });

  it("l'inviata ancora valida si vede e si può firmare", async () => {
    condiviso.db.tabelle.quotes = [preventivo({ status: "inviata", expires_at: "2026-11-01T10:00:00.000Z" })];
    const esito = await chiama("view");
    expect(esito.valid).toBe(true);
    expect(esito.status).toBe("inviata");
  });
});
