/**
 * send-quote-signature: un preventivo già firmato, rifiutato o diventato commessa
 * non si rimanda «per la firma».
 *
 * In modalità firma la funzione rimetteva SEMPRE il preventivo in «inviata»,
 * annullava le richieste di firma aperte e mandava un nuovo link al cliente. Un
 * clic su «Reinvia» da una pagina rimasta aperta (il cliente nel frattempo aveva
 * firmato) faceva tornare «inviata» un'offerta accettata. La modalità «solo PDF»
 * aveva già la guardia («senza retrocedere uno già firmato»).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, denoFinto, type Riga } from "../helpers/edgeFinto";

const condiviso = vi.hoisted(() => ({
  db: null as unknown as DbMinimo,
  gestore: null as null | ((req: Request) => Promise<Response>),
  email: [] as Array<{ to: string[]; subject: string; html: string }>,
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => condiviso.db }));
vi.mock("../../../supabase/functions/_shared/auth.ts", () => ({
  requireAuth: async () => ({ userId: "u-1", supabaseAdmin: condiviso.db }),
  requireCompanyAccess: async () => ({ companyId: "c-1" }),
}));
vi.mock("../../../supabase/functions/_shared/preventivoVisibile.ts", () => ({
  preventivoVisibile: async () => true,
  preventivoModificabile: async () => true,
}));
vi.mock("../../../supabase/functions/_shared/sendEmailUnified.ts", () => ({
  sendEmailUnified: async (a: { to: string[]; subject: string; html: string }) => { condiviso.email.push(a); return { ok: true, status: 200, body: {} }; },
}));
vi.mock("../../../supabase/functions/_shared/getPlatformSetting.ts", () => ({ getPlatformSetting: async () => "https://app.example.it" }));
vi.mock("../../../supabase/functions/_shared/getBranding.ts", () => ({
  getBrandingForCompany: async () => ({ siteUrl: "https://app.example.it", hidePoweredBy: true, platformName: "EiC" }),
}));
vi.mock("../../../supabase/functions/_shared/fetchWithTimeout.ts", () => ({
  fetchWithTimeout: async (url: string) => (String(url).includes("generate-quote-pdf")
    ? new Response(JSON.stringify({ pdf_path: "c-1/OFF-2026-042.pdf", signed_url: "https://storage.example.it/pdf" }), { status: 200 })
    : new Response(JSON.stringify({ ok: true }), { status: 200 })),
}));

const preventivo = (extra: Riga = {}): Riga => ({
  id: "q-1", company_id: "c-1", quote_number: "OFF-2026-042", title: "Serramenti", status: "bozza",
  total: 1220, discount_percent: 0, client_name: "Mario Rossi", client_email: "mario@example.it", client_company: null,
  client_vat_number: null, client_phone: null, signature_token: null, sent_at: null, expires_at: null, ...extra,
});

const ambiente = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };

async function invia(corpo: Riga = {}) {
  if (!condiviso.gestore) {
    vi.resetModules();
    const deno = denoFinto(ambiente);
    vi.stubGlobal("Deno", deno.finto);
    const percorso = "../../../supabase/functions/send-quote-signature/index.ts";
    await import(/* @vite-ignore */ percorso);
    condiviso.gestore = deno.gestore() as (req: Request) => Promise<Response>;
  }
  // Deno si ristabilisce a ogni chiamata: il gestore lo legge a ogni richiesta.
  vi.stubGlobal("Deno", denoFinto(ambiente).finto);
  const r = await condiviso.gestore!(new Request("http://x/functions/v1/send-quote-signature", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer prova" },
    body: JSON.stringify({ quote_id: "q-1", recipient_email: "mario@example.it", expires_days: 15, ...corpo }),
  }));
  return { stato: r.status, corpo: (await r.json()) as Record<string, unknown> };
}

beforeEach(() => {
  condiviso.db = new DbMinimo();
  condiviso.db.tabelle.companies = [{ id: "c-1", name: "Rossi Serramenti", logo_url: null }];
  condiviso.db.tabelle.signature_requests = [];
  condiviso.email.length = 0;
  condiviso.gestore = null;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("send-quote-signature: lo stato del preventivo", () => {
  it.each(["accettata", "rifiutata", "convertita"])("«%s»: non si rimanda per la firma, e non cambia niente", async (stato) => {
    condiviso.db.tabelle.quotes = [preventivo({ status: stato, signed_at: "2026-09-10T09:00:00Z", signature_token: "tok-vecchio" })];
    condiviso.db.tabelle.signature_requests = [{ id: "s-1", quote_id: "q-1", status: "signed", token: "vecchio" }];
    const { stato: http, corpo } = await invia();
    expect(http).toBe(409);
    expect(String(corpo.error)).toMatch(/già|non si può/i);
    expect(condiviso.db.tabelle.quotes[0]).toMatchObject({ status: stato, signature_token: "tok-vecchio" });
    expect(condiviso.db.tabelle.signature_requests).toHaveLength(1);
    expect(condiviso.db.tabelle.signature_requests[0].status).toBe("signed");
    expect(condiviso.email).toHaveLength(0);
    expect(condiviso.db.scritture).toHaveLength(0);
  });

  it("una bozza parte: inviata, richiesta di firma aperta, email al cliente con la scadenza scelta", async () => {
    condiviso.db.tabelle.quotes = [preventivo({ status: "bozza" })];
    const { stato: http, corpo } = await invia();
    expect(http).toBe(200);
    expect(corpo.success).toBe(true);
    expect(condiviso.db.tabelle.quotes[0].status).toBe("inviata");
    expect(condiviso.db.tabelle.signature_requests.filter((s) => s.status === "pending")).toHaveLength(1);
    expect(condiviso.email).toHaveLength(1);
    expect(condiviso.email[0].to).toEqual(["mario@example.it"]);
  });

  it("«Reinvia» di un'offerta inviata: la richiesta vecchia si annulla e ne parte una nuova", async () => {
    condiviso.db.tabelle.quotes = [preventivo({ status: "inviata", signature_token: "tok-vecchio", sent_at: "2026-09-20T10:00:00Z" })];
    condiviso.db.tabelle.signature_requests = [{ id: "s-1", company_id: "c-1", quote_id: "q-1", status: "pending", token: "vecchio" }];
    const { stato: http } = await invia();
    expect(http).toBe(200);
    expect(condiviso.db.tabelle.signature_requests.map((s) => s.status).sort()).toEqual(["cancelled", "pending"]);
    expect(condiviso.db.tabelle.quotes[0].status).toBe("inviata");
  });

  it("«solo PDF» su un'offerta già accettata manda il PDF senza toccarne lo stato", async () => {
    condiviso.db.tabelle.quotes = [preventivo({ status: "accettata", signed_at: "2026-09-10T09:00:00Z" })];
    const { stato: http } = await invia({ mode: "solo_pdf" });
    expect(http).toBe(200);
    expect(condiviso.email).toHaveLength(1);
    expect(condiviso.db.tabelle.quotes[0].status).toBe("accettata");
  });
});
