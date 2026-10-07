/**
 * Promemoria di scadenza del preventivo: il bottone dell'email porta il cliente
 * dove può FIRMARE.
 *
 * L'offerta parte con la firma elettronica a codice OTP (/firma-fea/<token>) e
 * per quel preventivo la firma «col solo nome» è chiusa (quote-sign risponde 409:
 * «usa il link di firma elettronica ricevuto via email»). Il promemoria invece
 * mandava a /preventivo/<id>?token=<token del preventivo>, la pagina vecchia:
 * il cliente vedeva l'offerta, poteva solo rifiutarla, e firmando prendeva
 * «Link non valido».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, denoFinto, type Riga } from "../helpers/edgeFinto";

const condiviso = vi.hoisted(() => ({
  db: null as unknown as DbMinimo,
  invii: [] as Array<{ to: string[]; html: string; subject: string; metadata?: unknown }>,
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => condiviso.db }));
vi.mock("../../../supabase/functions/_shared/sendEmailUnified.ts", () => ({
  sendEmailUnified: async (a: { to: string[]; html: string; subject: string; metadata?: unknown }) => {
    condiviso.invii.push(a);
    return { ok: true, status: 200, body: {} };
  },
}));
vi.mock("../../../supabase/functions/_shared/getBranding.ts", () => ({
  getBrandingForCompany: async () => ({ siteUrl: "https://app.example.it" }),
}));

const SEGRETO = "segreto-di-prova";
const preventivo = (extra: Riga = {}): Riga => ({
  id: "q-1", quote_number: "OFF-2026-042", title: "Serramenti", status: "inviata",
  expires_at: "2026-10-09T10:00:00.000Z", client_name: "Mario Rossi", client_email: "mario@example.it",
  total: 12200, company_id: "c-1", created_by: "u-1",
  signature_token: "5f1c0a9e-7d2b-4c3a-8e11-0123456789ab",
  companies: { name: "Rossi Serramenti", email: "info@rossi.it" },
  ...extra,
});

async function lanciaPromemoria() {
  vi.resetModules();
  const { finto, gestore } = denoFinto({
    CRON_SECRET: SEGRETO, SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "service", SITE_URL: "https://sito.example.it",
  });
  vi.stubGlobal("Deno", finto);
  const percorso = "../../../supabase/functions/quote-expiry-reminder/index.ts";
  await import(/* @vite-ignore */ percorso);
  const risposta = await gestore()!(new Request("http://x/functions/v1/quote-expiry-reminder", { method: "POST", headers: { "x-cron-secret": SEGRETO } }));
  return risposta.json() as Promise<{ success: boolean; processed: number; reminders_sent: number }>;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Le 08:03 italiane del 6 ottobre 2026: il preventivo scade fra tre giorni, il 9.
  vi.setSystemTime(new Date("2026-10-06T06:03:00.000Z"));
  condiviso.db = new DbMinimo();
  condiviso.invii.length = 0;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const linkDellEmail = () => /href="([^"]+)"/.exec(condiviso.invii[0].html)?.[1];

describe("quote-expiry-reminder: il link del promemoria", () => {
  it("con una firma elettronica in corso, il link è quello della firma elettronica", async () => {
    condiviso.db.tabelle.quotes = [preventivo()];
    condiviso.db.tabelle.signature_requests = [
      { id: "s-0", quote_id: "q-1", token: "vecchio0000000000000000000000000", status: "cancelled", created_at: "2026-09-20T10:00:00Z" },
      { id: "s-1", quote_id: "q-1", token: "a1b2c3d4e5f60718293a4b5c6d7e8f90", status: "pending", created_at: "2026-09-25T10:00:00Z" },
      { id: "s-2", quote_id: "altro-preventivo", token: "ffffffffffffffffffffffffffffffff", status: "pending", created_at: "2026-09-26T10:00:00Z" },
    ];
    const esito = await lanciaPromemoria();
    expect(esito.processed).toBe(1);
    expect(condiviso.invii).toHaveLength(1);
    expect(condiviso.invii[0].to).toEqual(["mario@example.it"]);
    expect(linkDellEmail()).toBe("https://app.example.it/firma-fea/a1b2c3d4e5f60718293a4b5c6d7e8f90");
  });

  it("una richiesta già verificata col codice (otp_verified) vale come in corso", async () => {
    condiviso.db.tabelle.quotes = [preventivo()];
    condiviso.db.tabelle.signature_requests = [
      { id: "s-1", quote_id: "q-1", token: "0123456789abcdef0123456789abcdef", status: "otp_verified", created_at: "2026-09-25T10:00:00Z" },
    ];
    await lanciaPromemoria();
    expect(linkDellEmail()).toBe("https://app.example.it/firma-fea/0123456789abcdef0123456789abcdef");
  });

  it("firma scaduta, annullata o già fatta: non si manda al cliente un link di firma che non si apre", async () => {
    condiviso.db.tabelle.quotes = [preventivo()];
    condiviso.db.tabelle.signature_requests = [
      { id: "s-1", quote_id: "q-1", token: "11111111111111111111111111111111", status: "expired", created_at: "2026-09-25T10:00:00Z" },
    ];
    await lanciaPromemoria();
    // Senza una richiesta viva, il ripiego è la pagina dell'offerta col token del preventivo (/offerta/…), che gestisce stato e consensi.
    expect(linkDellEmail()).toBe("https://app.example.it/offerta/5f1c0a9e-7d2b-4c3a-8e11-0123456789ab");
  });

  it("preventivo senza firma elettronica (invio vecchio): la pagina /offerta/<token>", async () => {
    condiviso.db.tabelle.quotes = [preventivo()];
    condiviso.db.tabelle.signature_requests = [];
    await lanciaPromemoria();
    expect(linkDellEmail()).toBe("https://app.example.it/offerta/5f1c0a9e-7d2b-4c3a-8e11-0123456789ab");
  });

  it("la notifica interna parte lo stesso, e senza email del cliente non si scrive a nessuno", async () => {
    condiviso.db.tabelle.quotes = [preventivo({ client_email: null })];
    condiviso.db.tabelle.signature_requests = [];
    const esito = await lanciaPromemoria();
    expect(condiviso.invii).toHaveLength(0);
    expect(esito.reminders_sent).toBe(1);
    expect(condiviso.db.rpcChiamate.map((c) => c.nome)).toEqual(["create_notification"]);
  });

  it("un preventivo nel cestino non riceve promemoria (né email al cliente né notifica)", async () => {
    condiviso.db.tabelle.quotes = [
      preventivo({ id: "q-cestino", deleted_at: "2026-10-01T10:00:00.000Z" }),
      preventivo({ id: "q-vivo", deleted_at: null }),
    ];
    condiviso.db.tabelle.signature_requests = [];
    const esito = await lanciaPromemoria();
    expect(esito.processed).toBe(1);
    expect(condiviso.invii).toHaveLength(1);
    expect(condiviso.db.rpcChiamate.filter((c) => c.nome === "create_notification").map((c) => c.args.p_entity_id)).toEqual(["q-vivo"]);
  });

  it("solo i preventivi inviati che scadono fra tre o un giorno", async () => {
    condiviso.db.tabelle.quotes = [
      preventivo({ id: "q-bozza", status: "bozza" }),
      preventivo({ id: "q-lontano", expires_at: "2026-10-20T10:00:00.000Z" }),
      preventivo({ id: "q-firmato", status: "accettata" }),
    ];
    const esito = await lanciaPromemoria();
    expect(esito.processed).toBe(0);
    expect(condiviso.invii).toHaveLength(0);
  });
});
