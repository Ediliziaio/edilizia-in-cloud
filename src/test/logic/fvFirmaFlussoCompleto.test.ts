import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { createServer, type Server } from "node:http";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DbMinimo, denoFinto } from "../helpers/edgeFinto";
import type { ClausolaFirma } from "../../../supabase/functions/_shared/clausoleFirma";
import { createFullFvTemplate } from "@/lib/moduli-vendita/fullFvModules";
import { buildFvPreviewBase } from "@/lib/moduli-vendita/fvPreviewData";
import { renderFvPdfHtml } from "../../../supabase/functions/_shared/fvHtmlTemplate";

const state = vi.hoisted(() => ({ db: null as unknown as DbMinimo, otp: "", email: vi.fn(), storageError: false }));
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => await import("pdf-lib"));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => state.db }));
vi.mock("../../../supabase/functions/_shared/auth.ts", () => ({ requireAuth: async () => ({ userId: "u1", supabaseAdmin: state.db }), requireCompanyAccess: async (): Promise<void> => undefined, aziendaAccessibile: async () => true }));
vi.mock("../../../supabase/functions/_shared/requirePaymentMethod.ts", () => ({ checkPaymentMethod: async () => ({ allowed: true }) }));
vi.mock("../../../supabase/functions/_shared/getBranding.ts", () => ({ getBrandingForCompany: async () => ({ siteUrl: "https://example.test", platformName: "Impresa QA" }) }));
vi.mock("../../../supabase/functions/_shared/clausoleFirma.ts", () => ({ clausoleDellaFirma: async (): Promise<ClausolaFirma[]> => [], informativaPrivacyDellaFirma: async (): Promise<string | null> => null }));
vi.mock("../../../supabase/functions/_shared/proveFirma.ts", () => ({ conservaProveFirma: async (): Promise<void> => undefined }));
vi.mock("../../../supabase/functions/_shared/inviaSmsFirma.ts", () => ({ inviaSmsCodiceFirma: async () => ({ inviato: false }) }));
vi.mock("../../../supabase/functions/_shared/sendEmailUnified.ts", () => ({ sendEmailUnified: async (args: { templateName?: string; text?: string }) => {
  state.email(args);
  if (args.templateName === "fea_otp") state.otp = args.text?.match(/\b\d{6}\b/)?.[0] ?? "";
  return { ok: true, status: 200 };
} }));

// Lo stesso tipo che `Deno.serve` accetta: `denoFinto` consegna il gestore vero cosi' com'e'.
const handlers: Record<string, (r: Request) => Promise<Response> | Response> = {};
const files = new Map<string, Uint8Array>();
const env: Record<string, string> = {
  PREVENTIVI_PDF_RENDER_URL: process.env.PREVENTIVI_PDF_RENDER_URL ?? "",
  PREVENTIVI_PDF_TOKEN: process.env.PREVENTIVI_PDF_TOKEN ?? "",
  SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "test-only-service",
};
const enabled = Boolean(env.PREVENTIVI_PDF_RENDER_URL);
let sheetServer: Server | undefined;
const sheetOrigin = process.env.PREVENTIVI_PDF_FIXTURE_ORIGIN;
beforeAll(async () => {
  if (!enabled) return;
  vi.stubGlobal("Uint8Array", Object.getPrototypeOf(Buffer.prototype).constructor);
  if (sheetOrigin) {
    const origin = new URL(sheetOrigin);
    if (origin.hostname !== "127.0.0.1" || origin.protocol !== "http:") throw new Error("La scheda QA deve essere locale");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage([595, 842]).drawText("TECH QA pagina 1", { x: 40, y: 750, font, size: 24 });
    const rotated = pdf.addPage([595, 842]); rotated.drawText("TECH QA pagina 2", { x: 40, y: 750, font, size: 24 }); rotated.setRotation(degrees(90));
    const bytes = await pdf.save();
    sheetServer = createServer((_req, res) => { res.writeHead(200, { "Content-Type": "application/pdf" }); res.end(bytes); });
    await new Promise<void>((resolve, reject) => { sheetServer!.once("error", reject); sheetServer!.listen(Number(origin.port), "127.0.0.1", resolve); });
  }
  for (const name of ["fea-richiedi-firma", "fea-documento-pubblico", "fea-genera-otp", "fea-verifica-otp", "fea-completa-firma", "fea-pdf-firmato"]) {
    const deno = denoFinto(env); vi.stubGlobal("Deno", deno.finto);
    const module = `../../../supabase/functions/${name}/index.ts`;
    await import(/* @vite-ignore */ module);
    handlers[name] = deno.gestore()!;
  }
});
afterAll(async () => {
  if (sheetServer) await new Promise<void>(resolve => sheetServer!.close(() => resolve()));
  vi.unstubAllGlobals();
});
beforeEach(() => {
  state.db = new DbMinimo(); state.otp = ""; state.email.mockClear(); state.storageError = false; files.clear();
  state.db.tabelle.profiles = [{ id: "u1", company_id: "c1" }];
  state.db.tabelle.companies = [{ id: "c1", name: "Impresa QA" }];
  state.db.rpcs.has_permission_for_company = () => true;
  Object.assign(state.db, { storage: { from: (bucket: string) => ({
    download: async (file: string) => {
      const bytes = files.get(`${bucket}/${file}`);
      return { data: bytes ? { size: bytes.length, arrayBuffer: async () => new Uint8Array(bytes).buffer } : null, error: bytes ? null : { message: "File mancante" } };
    },
    upload: async (file: string, bytes: Uint8Array) => {
      if (state.storageError) return { error: { message: "Storage QA non disponibile" } };
      files.set(`${bucket}/${file}`, new Uint8Array(bytes)); return { error: null };
    },
    createSignedUrl: async (file: string) => ({ data: { signedUrl: `https://storage.example.test/${bucket}/${file}` }, error: null as null }),
  }) } });
});
async function call(name: string, body: Record<string, unknown>) {
  vi.stubGlobal("Deno", denoFinto(env).finto);
  const res = await handlers[name](new Request(`http://localhost/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}
function project(copy: boolean) {
  const id = crypto.randomUUID();
  const template = createFullFvTemplate({} as never, "c1", "nuovo");
  const input = buildFvPreviewBase(template); input.template = template;
  input.progetto.numero = copy ? "FV-COPIA-QA" : "FV-ORIGINALE-QA";
  input.cliente.nome = copy ? "Cliente copia QA" : "Cliente originale QA";
  const html = renderFvPdfHtml(input);
  files.set(`fv-progetti/c1/${id}/vendita.html`, new TextEncoder().encode(html));
  state.db.tabelle.fv_progetti = [{ id, company_id: "c1", numero: input.progetto.numero, stato: "bozza", pdf_vendita_url: `c1/${id}/vendita.html` }];
  return id;
}
async function request(id: string) {
  return call("fea-richiedi-firma", { tipo_documento: "fv", documento_id: id, tipo_firmatario: "b2b", signer_name: "Cliente QA", signer_email: "qa@example.test" });
}

describe.runIf(enabled)("Firma FV: gestori veri, Chromium vero, storage e invii simulati", () => {
  it("il solo accesso in lettura all'azienda non autorizza l'invio neppure chiamando direttamente la funzione", async () => {
    const id = project(false);
    state.db.rpcs.has_permission_for_company = () => false;
    expect((await request(id)).status).toBe(403);
    expect(state.db.tabelle.signature_requests ?? []).toHaveLength(0);
    expect(state.email).not.toHaveBeenCalled();
  });
  it.runIf(Boolean(sheetOrigin))("le schede autorizzate, anche ruotate, sono salvate e firmate con il preventivo", async () => {
    const id = project(false);
    state.db.tabelle.fv_componenti_progetto = [{ progetto_id: id, articolo_id: "a1", ordinamento: 1 }];
    state.db.tabelle.articoli_native_documenti = [{ company_id: "c1", articolo_id: "a1", autorizzata: true, url: `${sheetOrigin}/scheda.pdf`, ordine: 1 }];
    const sent = await request(id);
    expect(sent.status).toBe(200);
    const { token, request_id } = sent.body;
    const row = state.db.tabelle.signature_requests[0];
    Object.assign(row, { otp_tentativi: 0, otp_invii: 0, otp_hash: null, otp_errori_totali: 0 });
    const original = files.get(`quote-pdfs/${row.documento_path}`)!;
    expect((await PDFDocument.load(original)).getPageCount()).toBe(15);
    await call("fea-genera-otp", { token, request_id });
    const verified = await call("fea-verifica-otp", { token, otp: state.otp });
    expect((await call("fea-completa-firma", { token, sessione_firma: verified.body.sessione_firma })).body.success).toBe(true);
    const download = await call("fea-pdf-firmato", { request_id });
    const bytes = files.get(new URL(download.body.url).pathname.slice(1))!;
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(16);
    if (process.env.EIC_QA_PDF_DIR) {
      await mkdir(process.env.EIC_QA_PDF_DIR, { recursive: true });
      await writeFile(path.join(process.env.EIC_QA_PDF_DIR, "fv-con-schede-firmato.pdf"), bytes);
    }
    const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    const rendered = await task.promise;
    const text: string[] = [];
    for (let i = 1; i <= rendered.numPages; i++) {
      text.push((await (await rendered.getPage(i)).getTextContent()).items.filter(x => "str" in x).map(x => (x as { str: string }).str).join(" "));
    }
    await task.destroy();
    const first = text.findIndex(t => t.includes("TECH QA pagina 1"));
    expect(first).toBeGreaterThan(0);
    expect(text[first + 1]).toContain("TECH QA pagina 2");
    expect(first + 1).toBeLessThan(text.length - 2); // both sheets precede acceptance and certificate
  }, 90_000);
  it("il convertitore non accetta chiamate senza credenziale server", async () => {
    const response = await fetch(env.PREVENTIVI_PDF_RENDER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html: "<html></html>" }) });
    expect(response.status).toBe(401);
  });
  it("una risorsa non autorizzata ferma la stampa invece di produrre un PDF senza contenuti", async () => {
    const response = await fetch(env.PREVENTIVI_PDF_RENDER_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.PREVENTIVI_PDF_TOKEN}` },
      body: JSON.stringify({ html: '<html><body><div class="page"><img src="http://169.254.169.254/qa-blocked.png"></div></body></html>' }),
    });
    expect(response.status).toBe(422);
  }, 90_000);
  it.each([false, true])("dalla richiesta al codice, firma e download completo (copia=%s)", async copy => {
    const id = project(copy);
    const sent = await request(id);
    expect(sent.status).toBe(200);
    const { token, request_id } = sent.body;
    const row = state.db.tabelle.signature_requests[0];
    Object.assign(row, { otp_tentativi: 0, otp_invii: 0, otp_hash: null, otp_errori_totali: 0 });
    expect(row.documento_path).toMatch(/\.pdf$/);
    const frozen = files.get(`quote-pdfs/${row.documento_path}`)!;
    const pages = (await PDFDocument.load(frozen)).getPageCount();
    expect(pages).toBe(13);
    const opened = await call("fea-documento-pubblico", { token });
    expect(opened.body.pdf_url).toContain(row.documento_path);
    expect((await call("fea-genera-otp", { token, request_id })).body.success).toBe(true);
    expect(state.otp).toMatch(/^\d{6}$/);
    const verified = await call("fea-verifica-otp", { token, otp: state.otp });
    expect(verified.body.success).toBe(true);
    const signed = await call("fea-completa-firma", { token, sessione_firma: verified.body.sessione_firma });
    expect(signed.body.success).toBe(true);
    expect(state.db.tabelle.fv_progetti[0].stato).toBe("firmato");
    const download = await call("fea-pdf-firmato", { request_id });
    expect(download.status).toBe(200);
    const key = new URL(download.body.url).pathname.slice(1);
    const bytes = files.get(key)!;
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(pages + 1);
    const reopened = await call("fea-documento-pubblico", { token });
    expect(reopened.body.pdf_firmato_url).toBe(download.body.url);
    expect(row.documento_hash_firma).toBe(row.documento_hash);
    // A retry downloads the identical stored copy; it does not regenerate or duplicate it.
    const again = await call("fea-pdf-firmato", { request_id });
    expect(again.body.url).toBe(download.body.url);
    expect(Array.from(files.get(key)!)).toEqual(Array.from(bytes));
  }, 90_000);
  it("se il PDF non si salva non crea richieste e non invia email", async () => {
    const id = project(false); state.storageError = true;
    expect((await request(id)).status).toBe(500);
    expect(state.db.tabelle.signature_requests ?? []).toHaveLength(0);
    expect(state.email).not.toHaveBeenCalled();
  }, 90_000);
  it("senza conversione configurata non crea richieste HTML o certificati incompleti", async () => {
    const id = project(false);
    const previous = env.PREVENTIVI_PDF_RENDER_URL;
    delete env.PREVENTIVI_PDF_RENDER_URL;
    try {
      expect((await request(id)).status).toBe(400);
      expect(state.db.tabelle.signature_requests ?? []).toHaveLength(0);
      expect(state.email).not.toHaveBeenCalled();
    } finally { env.PREVENTIVI_PDF_RENDER_URL = previous; }
  });
  it("se il PDF congelato cambia, il codice OTP non autorizza a firmare un altro file", async () => {
    const id = project(false);
    const sent = await request(id);
    const { token, request_id } = sent.body;
    const row = state.db.tabelle.signature_requests[0];
    Object.assign(row, { otp_tentativi: 0, otp_invii: 0, otp_hash: null, otp_errori_totali: 0 });
    await call("fea-genera-otp", { token, request_id });
    const verified = await call("fea-verifica-otp", { token, otp: state.otp });
    files.set(`quote-pdfs/${row.documento_path}`, new TextEncoder().encode("%PDF-1.4 modificato"));
    expect((await call("fea-completa-firma", { token, sessione_firma: verified.body.sessione_firma })).status).toBe(409);
    expect(row.status).toBe("otp_verified");
    expect(row.signed_pdf_path).toBeUndefined();
  }, 90_000);
  it("un guasto al salvataggio della copia firmata si recupera al download senza perdere il documento", async () => {
    const id = project(false);
    const sent = await request(id);
    const { token, request_id } = sent.body;
    const row = state.db.tabelle.signature_requests[0];
    Object.assign(row, { otp_tentativi: 0, otp_invii: 0, otp_hash: null, otp_errori_totali: 0 });
    await call("fea-genera-otp", { token, request_id });
    const verified = await call("fea-verifica-otp", { token, otp: state.otp });
    state.storageError = true;
    expect((await call("fea-completa-firma", { token, sessione_firma: verified.body.sessione_firma })).body.success).toBe(true);
    expect(row.status).toBe("signed");
    expect(row.signed_pdf_path).toBeUndefined();
    state.storageError = false;
    const recovered = await call("fea-pdf-firmato", { request_id });
    expect(recovered.status).toBe(200);
    const key = new URL(recovered.body.url).pathname.slice(1);
    expect((await PDFDocument.load(files.get(key)!)).getPageCount()).toBe(14);
  }, 90_000);
  it.each([false, true])("anche il vecchio link HTML restituisce il preventivo completo senza riscrivere le prove (copia=%s)", async copy => {
    const id = project(copy);
    const requestId = crypto.randomUUID();
    const token = crypto.randomUUID().replace(/-/g, "");
    const original = files.get(`fv-progetti/c1/${id}/vendita.html`)!;
    // `BufferSource` esclude i buffer condivisi: i byte della mappa sono sempre su un ArrayBuffer normale.
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", original as Uint8Array<ArrayBuffer>))).map(b => b.toString(16).padStart(2, "0")).join("");
    const frozenPath = `c1/richieste/${requestId}.html`;
    files.set(`quote-pdfs/${frozenPath}`, original);
    const oldPath = `c1/firmati/${requestId}.pdf`;
    const certificate = await PDFDocument.create(); certificate.addPage([595, 842]);
    const oldBytes = await certificate.save(); files.set(`quote-pdfs/${oldPath}`, oldBytes);
    const row = { id: requestId, token, company_id: "c1", status: "signed", signed_at: "2026-10-26T10:00:00Z", tipo_documento: "fv", tipo_firmatario: "b2b", fv_progetto_id: id,
      signer_name: "Cliente QA", signer_email: "qa@example.test", documento_hash: hash, documento_path: frozenPath, signed_pdf_path: oldPath, codice_verifica: "OLD-CERTIFICATE" };
    state.db.tabelle.signature_requests = [row];
    const opened = await call("fea-documento-pubblico", { token });
    expect(opened.body.pdf_firmato_url).toContain("-completo.pdf");
    const key = new URL(opened.body.pdf_firmato_url).pathname.slice(1);
    expect((await PDFDocument.load(files.get(key)!)).getPageCount()).toBe(14);
    expect(row.documento_hash).toBe(hash);
    expect(Array.from(files.get(`quote-pdfs/${frozenPath}`)!)).toEqual(Array.from(original));
    expect(Array.from(files.get(`quote-pdfs/${oldPath}`)!)).toEqual(Array.from(oldBytes));
  }, 90_000);
});
