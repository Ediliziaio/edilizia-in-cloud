/**
 * sr-public-progetto e il token di firma (revisione del 05/10/2026, punto 2).
 *
 * La pagina /stima è raggiungibile da chi ha il link del preventivo, che non è
 * necessariamente il firmatario: il token di firma si dà solo con la richiesta in
 * attesa del codice («pending»). Con il codice già inserito la pagina riceve invece
 * «firma_in_corso»: dice al cliente di riaprire il link che ha ricevuto, da dove la
 * firma si completa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbFinto, denoFinto, type Riga } from "../helpers/dbFinto";

const condiviso = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => condiviso.client }));

const FUNZIONE = "../../../supabase/functions/sr-public-progetto/index";
const AZIENDA = "az-1";
const PROGETTO = "0afd020b-0f5e-3fff-84f0-4f51a853acd4";
const PREVENTIVO = "pv-1";
const TOKEN_STIMA = "token-pubblico-della-stima-0001";
const TOKEN_FIRMA = "tokenDiFirmaSegretoDelFirmatario";

const tra = (giorni: number) => new Date(Date.now() + giorni * 86_400_000).toISOString();

function seme(richieste: Riga[]): Record<string, Riga[]> {
  return {
    sr_progetti: [{
      id: PROGETTO, code: "SR-2026-001", stato: "consegnato", company_id: AZIENDA, cliente_nome: "Marta", cliente_cognome: "Rossi",
      public_token: TOKEN_STIMA, firmato_il: null, pdf_html_url: null, consulente_id: null, allow_self_signing: false,
    }],
    companies: [{ id: AZIENDA, name: "Azienda Prova", business_name: "Azienda Prova S.r.l." }],
    sr_template_pdf: [],
    profiles: [],
    quotes: [{ id: PREVENTIVO, company_id: AZIENDA, source: `modulo:sr:${PROGETTO}` }],
    signature_requests: richieste.map((r, i) => ({ id: `r${i}`, quote_id: PREVENTIVO, token: TOKEN_FIRMA, status: "pending", expires_at: tra(5), created_at: tra(-1 + i / 10), ...r })),
  };
}

let db: DbFinto;
async function carica(richieste: Riga[]): Promise<Record<string, unknown>> {
  db = new DbFinto(seme(richieste));
  condiviso.client = db.client;
  const { deno, gestore } = denoFinto({ SUPABASE_URL: "https://finto.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "chiave" });
  vi.stubGlobal("Deno", deno);
  vi.resetModules();
  await import(/* @vite-ignore */ FUNZIONE);
  const res = await gestore()(new Request("https://finto.supabase.co/functions/v1/sr-public-progetto", { method: "POST", body: JSON.stringify({ token: TOKEN_STIMA }) }));
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("il token di firma sulla pagina /stima", () => {
  it("con la richiesta in attesa del codice la pagina riceve il token: da lì parte «Firma con il codice»", async () => {
    const r = await carica([{ status: "pending" }]);
    expect(r.firma_token).toBe(TOKEN_FIRMA);
    expect(r.firma_in_corso).toBe(false);
  });

  it("con il codice già verificato il token NON si dà: chi ha solo il link /stima non può chiudere la firma", async () => {
    const r = await carica([{ status: "otp_verified" }]);
    expect(r.firma_token).toBeNull();
    expect(JSON.stringify(r)).not.toContain(TOKEN_FIRMA);
  });

  it("e la pagina lo sa: «firma in corso» invece di «chiedi il link all'azienda»", async () => {
    const r = await carica([{ status: "otp_verified" }]);
    expect(r.firma_in_corso).toBe(true);
  });

  it.each(["signed", "expired", "cancelled", "refused"])("richiesta %s: niente token e niente «firma in corso»", async (stato) => {
    const r = await carica([{ status: stato }]);
    expect(r.firma_token).toBeNull();
    expect(r.firma_in_corso).toBe(false);
  });

  it("scaduta per data: niente token, anche se lo stato è ancora «pending»", async () => {
    const r = await carica([{ status: "pending", expires_at: tra(-1) }]);
    expect(r.firma_token).toBeNull();
    expect(r.firma_in_corso).toBe(false);
  });

  it("vale la richiesta più recente: una vecchia in attesa non fa riaffiorare il token dopo una nuova già al codice", async () => {
    const r = await carica([
      { status: "pending", token: "vecchioTokenSegreto", created_at: tra(-3) },
      { status: "otp_verified", created_at: tra(-1) },
    ]);
    expect(r.firma_token).toBeNull();
    expect(r.firma_in_corso).toBe(true);
  });

  it("un progetto già firmato non cerca nemmeno la richiesta", async () => {
    const s = seme([{ status: "pending" }]);
    s.sr_progetti[0].firmato_il = new Date().toISOString();
    db = new DbFinto(s);
    condiviso.client = db.client;
    const { deno, gestore } = denoFinto({ SUPABASE_URL: "https://finto.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "chiave" });
    vi.stubGlobal("Deno", deno);
    vi.resetModules();
    await import(/* @vite-ignore */ FUNZIONE);
    const res = await gestore()(new Request("https://finto.supabase.co/x", { method: "POST", body: JSON.stringify({ token: TOKEN_STIMA }) }));
    const r = (await res.json()) as Record<string, unknown>;
    expect(r.firma_token).toBeNull();
    expect(r.firma_in_corso).toBe(false);
  });
});
