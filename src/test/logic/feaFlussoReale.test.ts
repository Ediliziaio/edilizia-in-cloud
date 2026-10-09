import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, denoFinto, type Riga } from "../helpers/edgeFinto";

const stato = vi.hoisted(() => ({ db: null as unknown as DbMinimo, emailOk: true, smsOk: false, email: vi.fn(), pdf: vi.fn() }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => stato.db }));
vi.mock("../../../supabase/functions/_shared/sendEmailUnified.ts", () => ({ sendEmailUnified: async (args: unknown) => { stato.email(args); return { ok: stato.emailOk, status: stato.emailOk ? 200 : 503 }; } }));
vi.mock("../../../supabase/functions/_shared/inviaSmsFirma.ts", () => ({ inviaSmsCodiceFirma: async () => ({ inviato: stato.smsOk }) }));
vi.mock("../../../supabase/functions/_shared/getBranding.ts", () => ({ getBrandingForCompany: async () => ({ siteUrl: "https://example.test", platformName: "Demo & Figli" }) }));
vi.mock("../../../supabase/functions/_shared/clausoleFirma.ts", () => ({ clausoleDellaFirma: async (): Promise<unknown[]> => [] }));
vi.mock("../../../supabase/functions/_shared/pdfFirmato.ts", () => ({ assicuraPdfFirmato: async () => { stato.pdf(); return { path: "c-1/firmato.pdf", codiceVerifica: "ABCD-1234-5678" }; } }));

const TOKEN = "12345678-1234-1234-1234-123456789abc";
const env = { SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "test-service" };
const handlers: Record<string, (r: Request) => Promise<Response> | Response> = {};
const richiesta = (extra: Riga = {}): Riga => ({
  id: "r-1", token: TOKEN, company_id: "c-1", status: "otp_verified", tipo_documento: "quote", tipo_firmatario: "b2b",
  signer_name: "Mario Rossi", signer_email: "mario@example.test", signer_phone: null, quote_id: "q-1", created_by: "u-1", otp_canale: "email",
  expires_at: "2099-12-31T10:00:00.000Z", otp_scadenza: "2099-12-31T10:00:00.000Z", otp_tentativi: 0, ...extra,
});
async function hash(otp: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp + "r-1")))).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function chiama(nome: string, body: Riga = {}) {
  vi.stubGlobal("Deno", denoFinto(env).finto);
  const r = await handlers[nome](new Request("https://example.test/" + nome, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: TOKEN, ...body }) }));
  return { status: r.status, data: await r.json() as Riga };
}
beforeEach(async () => {
  vi.stubGlobal("Blob", NodeBlob);
  stato.db = new DbMinimo(); stato.emailOk = true; stato.smsOk = false; stato.email.mockClear(); stato.pdf.mockClear();
  Object.assign(stato.db, { storage: { from: () => ({ download: async (): Promise<{ data: Blob; error: null }> => ({ data: new Blob(["%PDF-test"]), error: null }), createSignedUrl: async (path: string): Promise<{ data: { signedUrl: string }; error: null }> => ({ data: { signedUrl: `https://example.test/${path}` }, error: null }) }) } });
  stato.db.tabelle.signature_requests = [richiesta({ otp_hash: await hash("123456") })];
  stato.db.tabelle.quotes = [{ id: "q-1", company_id: "c-1", status: "inviata", created_by: "u-1" }];
  for (const nome of ["fea-completa-firma", "fea-rifiuta-firma", "fea-verifica-otp", "fea-genera-otp", "fea-documento-pubblico"]) {
    if (handlers[nome]) continue;
    const d = denoFinto(env); vi.stubGlobal("Deno", d.finto);
    const path = `../../../supabase/functions/${nome}/index.ts`;
    await import(/* @vite-ignore */ path);
    handlers[nome] = d.gestore()!;
  }
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("FEA: gestori reali, nessun invio a persone reali", () => {
  it("il link firmato scarica la copia conservata, non il PDF originale", async () => {
    stato.db.tabelle.signature_requests[0] = richiesta({ status: "signed", signed_pdf_path: "c-1/firmati/r-1.pdf" });
    expect((await chiama("fea-documento-pubblico")).data).toMatchObject({ already_signed: true, pdf_firmato_url: "https://example.test/c-1/firmati/r-1.pdf" });
  });
  it("la copia firmata di un'altra azienda non viene esposta", async () => {
    stato.db.tabelle.signature_requests[0] = richiesta({ status: "signed", signed_pdf_path: "c-2/firmati/altro.pdf" });
    expect((await chiama("fea-documento-pubblico")).data.pdf_firmato_url).toBeNull();
  });
  it("nessun token valido: nessun documento e nessun link scaricabile", async () => {
    expect((await chiama("fea-documento-pubblico", { token: "unknown12345678" })).status).toBe(404);
  });
  it("registra una firma e genera una sola copia PDF", async () => {
    expect((await chiama("fea-completa-firma")).data.success).toBe(true);
    expect(stato.db.tabelle.signature_requests[0].status).toBe("signed");
    expect(stato.db.tabelle.quotes[0].status).toBe("accettata");
    expect(stato.pdf).toHaveBeenCalledTimes(1);
  });
  it("due firme contemporanee: una sola firma, un solo PDF e una sola conferma", async () => {
    const esiti = await Promise.all([chiama("fea-completa-firma"), chiama("fea-completa-firma")]);
    expect(esiti.filter(e => e.data.success === true)).toHaveLength(1);
    expect(stato.pdf).toHaveBeenCalledTimes(1); expect(stato.email).toHaveBeenCalledTimes(1);
  });
  it("firma e rifiuto contemporanei non si sovrascrivono", async () => {
    const esiti = await Promise.all([chiama("fea-completa-firma"), chiama("fea-rifiuta-firma")]);
    expect(esiti.filter(e => e.data.success === true)).toHaveLength(1);
    const s = stato.db.tabelle.signature_requests[0];
    expect(s.status === "signed" ? s.refused_at : s.signed_at).toBeFalsy();
  });
  it("non firma dopo la scadenza del link, anche se l'OTP era verificato", async () => {
    stato.db.tabelle.signature_requests[0].expires_at = "2020-01-01T00:00:00.000Z";
    expect((await chiama("fea-completa-firma")).status).toBe(410); expect(stato.pdf).not.toHaveBeenCalled();
  });
  it.each([undefined, null, false, "true", 1])("il consenso del privato deve essere esplicitamente true (%s)", async consenso => {
    stato.db.tabelle.signature_requests[0].tipo_firmatario = "b2c";
    expect((await chiama("fea-completa-firma", { b2c_recesso_accettato: consenso })).status).toBe(400);
    expect(stato.db.tabelle.signature_requests[0].status).toBe("otp_verified");
  });
  it("non comunica una firma riuscita se manca il preventivo collegato", async () => {
    stato.db.tabelle.quotes = [];
    expect((await chiama("fea-completa-firma")).status).toBe(500);
    expect(stato.db.tabelle.signature_requests[0].status).toBe("otp_verified"); expect(stato.pdf).not.toHaveBeenCalled();
  });
  it.each(["refused", "cancelled", "expired"])("l'OTP non riapre una richiesta %s", async status => {
    stato.db.tabelle.signature_requests[0].status = status;
    expect((await chiama("fea-verifica-otp", { otp: "123456" })).status).toBe(410);
    expect((await chiama("fea-genera-otp", { request_id: "r-1" })).status).toBe(410);
    expect(stato.db.tabelle.signature_requests[0].status).toBe(status); expect(stato.email).not.toHaveBeenCalled();
  });
  it("il solo ID della richiesta non autorizza un invio OTP", async () => {
    expect((await chiama("fea-genera-otp", { request_id: "r-1", token: undefined })).status).toBe(400);
    expect(stato.email).not.toHaveBeenCalled();
  });
  it("un token diverso non autorizza l'invio OTP", async () => {
    expect((await chiama("fea-genera-otp", { request_id: "r-1", token: "abcdefgh12345678" })).status).toBe(404);
    expect(stato.email).not.toHaveBeenCalled();
  });
  it("se email e SMS falliscono non dice codice inviato, e consente di riprovare", async () => {
    stato.db.tabelle.signature_requests[0] = richiesta({ status: "pending", otp_hash: null, otp_scadenza: null });
    stato.emailOk = false;
    expect((await chiama("fea-genera-otp", { request_id: "r-1" })).status).toBe(502);
    expect(stato.db.tabelle.signature_requests[0].otp_hash).toBeNull();
    stato.emailOk = true;
    expect((await chiama("fea-genera-otp", { request_id: "r-1" })).data.success).toBe(true);
  });
  it("l'SMS riuscito permette di proseguire anche se l'email non parte", async () => {
    stato.db.tabelle.signature_requests[0] = richiesta({ status: "pending", otp_hash: null, otp_scadenza: null, signer_phone: "+393331234567" });
    stato.emailOk = false; stato.smsOk = true;
    expect((await chiama("fea-genera-otp", { request_id: "r-1" })).data).toMatchObject({ success: true, sms_inviato: true });
  });
  it("il nuovo codice ripristina i cinque tentativi", async () => {
    stato.db.tabelle.signature_requests[0] = richiesta({ status: "pending", otp_tentativi: 5, otp_scadenza: "2020-01-01T00:00:00.000Z" });
    expect((await chiama("fea-genera-otp", { request_id: "r-1" })).data.success).toBe(true);
    expect(stato.db.tabelle.signature_requests[0].otp_tentativi).toBe(0);
  });
  it("le varianti del token funzionano anche nelle fasi successive all'apertura", async () => {
    stato.db.tabelle.signature_requests[0].token = TOKEN.replace(/-/g, "");
    expect((await chiama("fea-verifica-otp", { otp: "123456" })).data.success).toBe(true);
    expect((await chiama("fea-completa-firma")).data.success).toBe(true);
  });
  it("una copia email fallita non viene segnata come consegnata", async () => {
    stato.emailOk = false;
    expect((await chiama("fea-completa-firma")).data.success).toBe(true);
    expect(stato.db.tabelle.signature_requests[0].b2c_email_copia).not.toBe(true);
    expect(stato.db.tabelle.fea_audit_log.some(r => r.evento === "email_copia_inviata")).toBe(false);
  });
  it("due richieste di un nuovo codice inviano una sola email", async () => {
    stato.db.tabelle.signature_requests[0] = richiesta({ status: "pending", otp_hash: null, otp_scadenza: null });
    await Promise.all([chiama("fea-genera-otp", { request_id: "r-1" }), chiama("fea-genera-otp", { request_id: "r-1" })]);
    expect(stato.email).toHaveBeenCalledTimes(1);
  });
  it("rispetta il canale NOT NULL e conferma il codice già inviato senza duplicarlo", async () => {
    stato.db.tabelle.signature_requests[0] = richiesta({ status: "pending", otp_hash: null, otp_scadenza: null });
    expect((await chiama("fea-genera-otp", { request_id: "r-1" })).data.success).toBe(true);
    expect((await chiama("fea-genera-otp", { request_id: "r-1" })).data).toMatchObject({ success: true, gia_inviato: true });
    expect(stato.email).toHaveBeenCalledTimes(1);
    for (const s of stato.db.scritture.filter(s => s.tabella === "signature_requests")) {
      expect(s.dati).not.toHaveProperty("otp_canale", null);
    }
  });
  it("un codice salvato ma non ancora consegnato non viene dichiarato inviato", async () => {
    stato.db.tabelle.signature_requests[0].otp_scadenza = new Date(Date.now() + 600_000).toISOString();
    expect((await chiama("fea-genera-otp", { request_id: "r-1" })).status).toBe(409);
    expect(stato.email).not.toHaveBeenCalled();
  });
  it.each(["fea-completa-firma", "fea-verifica-otp", "fea-rifiuta-firma", "fea-genera-otp"])("%s non dichiara successo se la scrittura fallisce", async nome => {
    const from = stato.db.from.bind(stato.db);
    vi.spyOn(stato.db, "from").mockImplementation(tabella => {
      const q = from(tabella);
      if (tabella === "signature_requests") {
        const update = q.update.bind(q);
        vi.spyOn(q, "update").mockImplementation(payload => {
          update(payload);
          Object.defineProperty(q, "then", { value: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "database indisponibile" } }).then(resolve) });
          return q;
        });
      }
      return q;
    });
    stato.db.tabelle.signature_requests[0].otp_scadenza = new Date(Date.now() + 120_000).toISOString();
    expect((await chiama(nome, { otp: "123456", request_id: "r-1" })).status).toBe(500);
    expect(stato.email).not.toHaveBeenCalled(); expect(stato.pdf).not.toHaveBeenCalled();
  });
  it("cinque errori bloccano il codice, un nuovo codice lo riabilita realmente", async () => {
    stato.db.tabelle.signature_requests[0].status = "pending";
    for (let i = 0; i < 5; i++) expect((await chiama("fea-verifica-otp", { otp: "999999" })).status).toBe(401);
    expect((await chiama("fea-verifica-otp", { otp: "123456" })).status).toBe(429);
    stato.db.tabelle.signature_requests[0].otp_scadenza = "2020-01-01T00:00:00.000Z";
    expect((await chiama("fea-genera-otp", { request_id: "r-1" })).data.success).toBe(true);
    const email = stato.email.mock.calls[0][0] as { html: string };
    const nuovo = email.html.match(/>(\d{6})<\/div>/)?.[1]; expect(nuovo).toMatch(/^\d{6}$/);
    expect((await chiama("fea-verifica-otp", { otp: nuovo })).data.success).toBe(true);
  });
});
