import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { clientSerramentiLocali, sqlSerramentiLocale, tabellaDaFixture } from "../helpers/supabaseSerramentiLocale";
import type { SupabaseClient } from "@supabase/supabase-js";

const attivo = process.env.EIC_SR_BACKEND_LOCALE === "1";
const stato = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: (_, key) => {
  if (!stato.client) throw new Error("Client locale non inizializzato");
  const value = Reflect.get(stato.client, key); return typeof value === "function" ? value.bind(stato.client) : value;
} }) }));
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => await import("pdf-lib"));
// Only the browser canvas decoder is replaced by its Node equivalent. No API,
// database, storage, quote duplication, renderer or signing code is simulated.
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url || url.startsWith("data:")) return url;
  const u = url.startsWith("/") ? new URL(url, "http://127.0.0.1:8080") : new URL(url);
  if (!["127.0.0.1", "localhost"].includes(u.hostname)) throw new Error("Immagine remota non ammessa");
  const { default: sharp } = await import("sharp");
  const bytes = await sharp(await readFile(path.resolve("public", u.pathname.slice(1)))).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
} }));

import { createProgetto, getProgetto, updateProgetto, duplicaProgetto } from "@/lib/serramenti/api";
import { renderSerramentoBlob } from "@/hooks/useSerramentoPDF";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";
import { makeSrQuoteModelSnapshot } from "@/lib/serramenti/quoteModel";
import { nuovaAnalisiIntervento, SCENARI_ESISTENTI } from "@/lib/serramenti/analisiIntervento";
import { importiDelPreventivo } from "@/lib/serramenti/righePreventivo";
import { upsertModuleQuote } from "@/lib/moduli/quoteBridge";
import { congelaDocumento } from "../../../supabase/functions/_shared/documentoCongelato";
import { assicuraPdfFirmato } from "../../../supabase/functions/_shared/pdfFirmato";

vi.setConfig({ testTimeout: 120000 });
let admin: SupabaseClient;
let userId = "";
const companyId = crypto.randomUUID();
const supplierId = crypto.randomUUID();
const lineId = crypto.randomUUID();
let fixture: Awaited<ReturnType<typeof buildMockPdfData>>;
const ids: string[] = [];

beforeAll(async () => {
  if (!attivo) return;
  const clients = clientSerramentiLocali(); admin = clients.admin; stato.client = clients.utente;
  const password = crypto.randomUUID() + "aA1!";
  const email = `sr-${crypto.randomUUID()}@example.test`;
  const auth = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (auth.error || !auth.data.user) throw auth.error ?? new Error("Utente locale non creato");
  userId = auth.data.user.id;
  const session = await stato.client.auth.signInWithPassword({ email, password }); if (session.error) throw session.error;
  sqlSerramentiLocale(`create table if not exists public.companies(id uuid primary key, name text, recensioni_online jsonb);
    create table if not exists public.profiles(id uuid primary key,company_id uuid,first_name text,last_name text,email text,phone text,avatar_url text);`);
  const template = createFullSerramentiTemplate({ company_id: companyId, ragione_sociale: "Impresa test locale" }, "finestre");
  fixture = await buildMockPdfData({ moduleId: "finestre", template, companyName: "Impresa test locale" });
  const modelColumns = Object.fromEntries(["cointestatario_nome", "cointestatario_cognome", "cointestatario_codice_fiscale", "cointestatario_email", "cointestatario_telefono"].map(k => [k, "text"]));
  sqlSerramentiLocale(
    tabellaDaFixture("sr_progetti", fixture.detail.progetto as unknown as Record<string, unknown>, { ...modelColumns,
      code: "text default ('SR-LOCAL-' || substr(gen_random_uuid()::text,1,8))", created_by: "uuid default auth.uid()", created_at: "timestamptz default now()", updated_at: "timestamptz default now()", deleted_at: "timestamptz", firmato_il: "timestamptz", revision_number: "numeric default 1", modello_snapshot: "jsonb" }) +
    tabellaDaFixture("sr_serramenti_progetto", fixture.detail.serramenti[0] as unknown as Record<string, unknown>, { supplier_product_line_id: "uuid", supplier_catalog_id: "uuid", disegno_config: "jsonb" }) +
    ["sr_accessori_progetto", "sr_progetti_media", "sr_calcolo_risparmio", "sr_servizi_progetto"].map(n => tabellaDaFixture(n, {}, { progetto_id: "uuid", position: "numeric" })).join("\n") + `
    create table if not exists public.sr_template_pdf(company_id uuid,iva_percentuale_default numeric,valido_giorni_default numeric,anticipo_pct_default numeric);
    create table if not exists public.preventivo_impostazioni(company_id uuid,pdf_mostra_sconti boolean);
    create table if not exists public.supplier_catalogs(id uuid primary key,company_id uuid,nome text);
    create table if not exists public.supplier_product_lines(id uuid primary key,company_id uuid,supplier_catalog_id uuid,nome text,materiale text,immagini jsonb);
    create table if not exists public.listino_macrocategorie(id uuid primary key,company_id uuid,nome text,attivo boolean,sort_order numeric,mostra_pagina_dedicata_pdf boolean);
    create table if not exists public.fea_configurazione(company_id uuid,clausole_vess jsonb);
    create table if not exists public.quotes(id uuid primary key default gen_random_uuid(),company_id uuid,created_by uuid,quote_number text,status text,source text,title text,client_name text,client_email text,client_phone text,subtotal numeric,vat_amount numeric,total numeric,validity_days numeric,expires_at timestamptz,pdf_storage_path text,pdf_generated_at timestamptz,signature_token text default gen_random_uuid()::text,sent_at timestamptz,viewed_at timestamptz,signed_at timestamptz);
    create table if not exists public.signature_requests(id uuid primary key default gen_random_uuid(),company_id uuid,status text,tipo_documento text,tipo_firmatario text,signer_name text,signer_email text,signed_at timestamptz,firma_ip text,firma_user_agent text,documento_hash text,quote_id uuid,fv_progetto_id uuid,sessione_id uuid,contratto_subappalto_id uuid,order_id uuid,categoria text,documento_path text,livello_firma text,firmatario_id uuid,b2c_recesso boolean,clausole_approvate jsonb,signer_phone text,otp_canale text,signed_pdf_path text,signed_pdf_hash text,codice_verifica text,gruppo_firma_id uuid,ordine_firmatario numeric,firmatari_richiesti numeric);
    create table if not exists public.fea_audit_log(id uuid primary key default gen_random_uuid(),company_id uuid,request_id uuid,evento text,metadati jsonb);
    create or replace function public.generate_quote_number(p_company_id uuid) returns text language sql security invoker set search_path='' as $$ select 'Q-LOCAL-' || substr(gen_random_uuid()::text,1,8) $$;
    grant usage on schema public to authenticated,service_role;
    grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
    grant execute on function public.generate_quote_number(uuid) to authenticated,service_role;`);
  const check = sqlSerramentiLocale("select count(*) from pg_constraint where conname='sr_analisi_intervento_formato';").trim();
  if (check !== "1") sqlSerramentiLocale(await readFile("supabase/migrations/20281026140002_analisi_serramenti_prima_dopo.sql", "utf8"));
  sqlSerramentiLocale(`alter table public.profiles enable row level security;
    drop policy if exists sr_test_profilo on public.profiles; create policy sr_test_profilo on public.profiles to authenticated using(id=auth.uid()) with check(id=auth.uid());`);
  for (const table of ["sr_progetti", "quotes", "signature_requests", "companies", "supplier_catalogs", "supplier_product_lines", "listino_macrocategorie", "preventivo_impostazioni", "sr_template_pdf", "fea_configurazione"]) {
    const col = table === "companies" ? "id" : "company_id";
    sqlSerramentiLocale(`alter table public.${table} enable row level security; drop policy if exists sr_test_azienda on public.${table};
      create policy sr_test_azienda on public.${table} to authenticated using(${col} in(select company_id from public.profiles where id=auth.uid())) with check(${col} in(select company_id from public.profiles where id=auth.uid()));`);
  }
  for (const table of ["sr_serramenti_progetto", "sr_accessori_progetto", "sr_progetti_media", "sr_calcolo_risparmio", "sr_servizi_progetto"]) sqlSerramentiLocale(`alter table public.${table} enable row level security; drop policy if exists sr_test_progetto on public.${table}; create policy sr_test_progetto on public.${table} to authenticated using(progetto_id in(select id from public.sr_progetti)) with check(progetto_id in(select id from public.sr_progetti));`);
  sqlSerramentiLocale(`drop policy if exists sr_test_file on storage.objects; create policy sr_test_file on storage.objects for all to authenticated using(bucket_id='quote-pdfs' and split_part(name,'/',1) in(select company_id::text from public.profiles where id=auth.uid())) with check(bucket_id='quote-pdfs' and split_part(name,'/',1) in(select company_id::text from public.profiles where id=auth.uid())); notify pgrst,'reload schema';`);
  for (const [table, row] of [
    ["companies", { id: companyId, name: "Impresa test locale" }],
    ["profiles", { id: userId, company_id: companyId, first_name: "Consulente", last_name: "Locale", email }],
    ["supplier_catalogs", { id: supplierId, company_id: companyId, nome: "Fornitore test locale" }],
    ["supplier_product_lines", { id: lineId, company_id: companyId, supplier_catalog_id: supplierId, nome: "PVC configurazione locale", materiale: "pvc", immagini: [{ id: "pvc", ruolo: "principale", didascalia: "Prodotto selezionato", url: "http://127.0.0.1:8080/render-references/profiles/Profilo-PVC-2ante-Maniglia-Centrale-Bianco.jpeg" }] }],
  ] as const) { const { error } = await admin.from(table).insert(row); if (error) throw new Error(`${table}: ${error.message}`); }
  const buckets = await admin.storage.listBuckets();
  if (!buckets.data?.some(b => b.id === "quote-pdfs")) { const b = await admin.storage.createBucket("quote-pdfs", { public: false }); if (b.error) throw b.error; }
}, 120000);

afterAll(async () => { if (attivo && stato.client) await stato.client.auth.signOut(); });
async function testo(bytes: Uint8Array) {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }); const doc = await task.promise; const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map(x => "str" in x ? x.str : "").join(" "));
  await task.destroy(); return pages;
}

describe.runIf(attivo)("Serramenti: API vere, Supabase locale, Storage reale e PDF firmato", () => {
  it("non legge o modifica la valutazione di un'altra azienda", async () => {
    const foreignId = crypto.randomUUID();
    const other = await admin.from("sr_progetti").insert({ id: foreignId, company_id: crypto.randomUUID(), stato: "bozza" }); if (other.error) throw other.error;
    await expect(getProgetto(foreignId)).rejects.toThrow("Progetto non trovato");
    await expect(updateProgetto(foreignId, { analisi_intervento: nuovaAnalisiIntervento() })).rejects.toThrow("accesso negato");
    expect((await admin.from("sr_progetti").select("analisi_intervento").eq("id", foreignId).single()).data?.analisi_intervento).toBeNull();
  });
  it.each(["alluminio_freddo", "legno", "pvc"] as const)("%s: creazione, salvataggio, riapertura, copie e firma senza Uw precedente", async esistente => {
    const template = createFullSerramentiTemplate({ company_id: companyId, ragione_sociale: "Impresa test locale" }, "finestre");
    const a = nuovaAnalisiIntervento(); a.esistente = esistente; a.problemi = ["freddo", "spifferi"];
    const p = await createProgetto({ cliente_nome: "Cliente test locale", cliente_email: "cliente@example.test", modello_snapshot: makeSrQuoteModelSnapshot(companyId, "finestre", template), analisi_intervento: a }, companyId);
    ids.push(p.id);
    const row = { ...fixture.detail.serramenti[0], id: crypto.randomUUID(), progetto_id: p.id, family_id: null, supplier_product_line_id: lineId, supplier_catalog_id: supplierId, materiale: "pvc", disegno_config: null };
    const ins = await stato.client!.from("sr_serramenti_progetto").insert(row); if (ins.error) throw ins.error;
    await updateProgetto(p.id, { analisi_intervento: a, tipo_intervento: "sostituzione", schema_pagamento: "tre_step", pagamento_milestones: [{ label: "Saldo", percentuale: 100 }], detrazione_aliquota: 0 });
    expect((await getProgetto(p.id)).progetto.analisi_intervento).toEqual(a);
    for (const revisione of [true, false]) {
      const copy = await duplicaProgetto(p.id, { comeRevisione: revisione }); ids.push(copy.newId);
      expect((await getProgetto(copy.newId)).progetto.analisi_intervento).toEqual(a);
      if (revisione) {
        const personalizzata = structuredClone(a); personalizzata.posa.ripristini = "esclusa";
        await updateProgetto(copy.newId, { analisi_intervento: personalizzata });
        expect((await getProgetto(copy.newId)).progetto.analisi_intervento?.posa.ripristini).toBe("esclusa");
        expect((await getProgetto(p.id)).progetto.analisi_intervento?.posa.ripristini).toBe("inclusa");
      }
    }
    for (const id of ids.slice(-3)) {
      const d = await getProgetto(id);
      const blob = await renderSerramentoBlob({ detail: d, useFreshTemplate: true, company: { name: "Impresa test locale" } });
      const bytes = new Uint8Array(await blob.arrayBuffer()); const before = await testo(bytes); const text = before.join(" ");
      expect(text).toContain(SCENARI_ESISTENTI[esistente].nome); expect(text).toContain("PVC configurazione locale");
      expect(text).toContain("Confronto qualitativo"); expect(text).not.toContain("Uw inferiore del");
      expect(text).toContain("La posa prevista nella tua offerta");
      const amounts = importiDelPreventivo(d, d.progetto);
      const quote = await upsertModuleQuote({ companyId, userId, moduleKey: "sr", progettoId: id, titolo: "Prova locale serramenti", clientName: "Cliente test locale", clientEmail: "cliente@example.test", subtotal: amounts.imponibile, vatAmount: amounts.iva, total: amounts.totale, validityDays: 30, pdfBlob: blob });
      const reqId = crypto.randomUUID();
      const snapshot = await congelaDocumento(admin, { tipo: "quote", documentoId: quote.id, companyId, aziendaNome: "Impresa test locale", firmatario: "Cliente test locale" }, reqId);
      const request = await admin.from("signature_requests").insert({ id: reqId, company_id: companyId, status: "signed", signed_at: new Date().toISOString(), tipo_documento: "quote", tipo_firmatario: "b2b", quote_id: quote.id, signer_name: "Cliente test locale", signer_email: "cliente@example.test", documento_path: snapshot.path, documento_hash: snapshot.hash, livello_firma: "semplice", clausole_approvate: [] }); if (request.error) throw request.error;
      const signed = await assicuraPdfFirmato(admin, reqId);
      const download = await admin.storage.from("quote-pdfs").download(signed.path); if (download.error) throw download.error;
      const signedBytes = new Uint8Array(await download.data.arrayBuffer()); const after = await testo(signedBytes);
      expect(after.length).toBe(before.length + 1); before.forEach((page, i) => expect(after[i]).toContain(page));
      expect(after.at(-1)).toContain("DOCUMENTO FIRMATO"); expect((await assicuraPdfFirmato(admin, reqId)).creato).toBe(false);
      const stamp = new Date().toISOString();
      const closed = await admin.from("sr_progetti").update({ stato: "accettato", firmato_il: stamp }).eq("id", id); if (closed.error) throw closed.error;
      const qClosed = await admin.from("quotes").update({ status: "accettata", signed_at: stamp }).eq("id", quote.id); if (qClosed.error) throw qClosed.error;
      const reopened = await getProgetto(id);
      const conserved = await renderSerramentoBlob({ detail: reopened, useFreshTemplate: true });
      expect(new Uint8Array(await conserved.arrayBuffer())).toEqual(signedBytes);
      await expect(updateProgetto(id, { analisi_intervento: { ...a, motivo: "Modifica vietata dopo firma" } })).rejects.toThrow("Salvataggio progetto fallito");
      const out = process.env.EIC_QA_PDF_DIR; if (out) { await mkdir(out, { recursive: true }); await writeFile(path.join(out, `${esistente}-${id === p.id ? "originale" : id === ids.at(-1) ? "copia" : "revisione"}-firmato.pdf`), signedBytes); }
    }
  });
});
