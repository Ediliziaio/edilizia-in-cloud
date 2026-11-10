/** Le edge del lotto 5 del giornale, coi gestori veri e un database finto. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbFinto, denoFinto } from "../helpers/dbFinto";
import { buildGiornaleHtml, type AziendaDocumentoGiornale, type GiornataDocumento } from "../../../supabase/functions/_shared/documentoGiornale";
import { improntaTokenDl, nuovoTokenDl, emailDlValida } from "../../../supabase/functions/_shared/linkGiornaleDl";

const condiviso = vi.hoisted(() => ({ client: null as unknown, invia: vi.fn(), accesso: vi.fn() }));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => condiviso.client }));
vi.mock("../../../supabase/functions/_shared/sendEmailUnified.ts", () => ({ sendEmailUnified: condiviso.invia }));
vi.mock("../../../supabase/functions/_shared/companyAuth.ts", () => ({ verifyCompanyAccess: condiviso.accesso }));
vi.mock("../../../supabase/functions/_shared/getBranding.ts", () => ({
  getBrandingForCompany: async () => ({ siteUrl: "https://app.test", platformName: "EiC", hidePoweredBy: false }),
}));
vi.mock("../../../supabase/functions/_shared/aziendaDocumento.ts", () => ({
  leggiAziendaDocumento: async () => ({ ragione_sociale: "Impresa Srl", partita_iva: "1", colore_primario: null as string | null, logo_url: null as string | null }),
}));

const ENV = { SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_ANON_KEY: "a" };
const OK = "Bearer utente";

function rete(db: DbFinto, utente: string | null = "u1") {
  condiviso.client = {
    ...db.client,
    auth: { getUser: async (t: string) => (utente && t === "utente" ? { data: { user: { id: utente } }, error: null as unknown } : { data: { user: null as unknown }, error: { message: "no" } as unknown }) },
  };
}

async function gestore(nome: string): Promise<(req: Request) => Promise<Response>> {
  const { deno, gestore: g } = denoFinto(ENV);
  vi.stubGlobal("Deno", deno);
  vi.resetModules();
  const percorso = `../../../supabase/functions/${nome}/index`;
  await import(/* @vite-ignore */ percorso);
  return g();
}

const post = (corpo: unknown, auth: string | null = OK) =>
  new Request("https://x/f", { method: "POST", headers: auth ? { Authorization: auth } : {}, body: JSON.stringify(corpo) });

const firmata = { id: "g1", company_id: "az", order_id: "o1", data_lavori: "2026-11-05", stato: "firmata", pm_signed_at: "2026-11-05T17:00:00Z", pm_signature_hash: "abcdef1234567890" };

function dbPagina(pagina: Record<string, unknown> = firmata, puo: unknown = true): DbFinto {
  const db = new DbFinto({ giornale_lavori: [pagina], giornale_invii_dl: [], orders: [{ id: "o1", company_id: "az", customer_id: "cli", description: "Villa", order_code: "C1" }] });
  db.rispostaRpc.puo_modificare_giornale = puo;
  return db;
}

beforeEach(() => { condiviso.invia.mockReset(); condiviso.invia.mockResolvedValue({ ok: true, status: 200 }); condiviso.accesso.mockReset(); condiviso.accesso.mockResolvedValue(undefined); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("giornale-invia-dl", () => {
  const corpo = { giornale_id: "g1", email: "dl@studio.it", conferma: true };

  it("401 senza login", async () => {
    const db = dbPagina(); rete(db);
    const g = await gestore("giornale-invia-dl");
    expect((await g(post(corpo, null))).status).toBe(401);
    rete(db, null);
    expect((await g(post(corpo, "Bearer altro"))).status).toBe(401);
    expect(condiviso.invia).not.toHaveBeenCalled();
  });

  it("403 senza il permesso: nessun invio, nessun link", async () => {
    const db = dbPagina(firmata, false); rete(db);
    const r = await (await gestore("giornale-invia-dl"))(post(corpo));
    expect(r.status).toBe(403);
    expect(db.chiamateRpc).toEqual([{ nome: "puo_modificare_giornale", args: { p_company_id: "az" } }]);
    expect(condiviso.invia).not.toHaveBeenCalled();
    expect(db.tabelle.giornale_invii_dl).toHaveLength(0);
  });

  it("niente invio senza conferma, su una bozza o con un indirizzo sbagliato", async () => {
    let db = dbPagina(); rete(db);
    const g = await gestore("giornale-invia-dl");
    expect((await g(post({ ...corpo, conferma: undefined }))).status).toBe(400);
    expect((await g(post({ ...corpo, email: "non-valida" }))).status).toBe(400);
    db = dbPagina({ ...firmata, stato: "bozza" }); rete(db);
    expect((await g(post(corpo))).status).toBe(409);
    expect(condiviso.invia).not.toHaveBeenCalled();
  });

  it("spedisce il link e registra data e metodo; il token nel database è solo un'impronta", async () => {
    const db = dbPagina(); rete(db);
    const r = await (await gestore("giornale-invia-dl"))(post(corpo));
    expect(r.status).toBe(200);
    expect(condiviso.invia).toHaveBeenCalledTimes(1);
    const args = condiviso.invia.mock.calls[0][0] as { to: string[]; html: string; stream: string; companyId: string };
    expect(args).toMatchObject({ to: ["dl@studio.it"], stream: "transactional", companyId: "az" });
    const token = args.html.match(/giornale-dl\/([A-Za-z0-9_-]{43})/)![1];
    const riga = db.tabelle.giornale_invii_dl[0];
    expect(riga.token_hash).toBe(await improntaTokenDl(token));
    expect(riga.token_hash).not.toBe(token);
    expect(Date.parse(riga.scade_il as string)).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect(db.tabelle.giornale_lavori[0]).toMatchObject({ dl_notification_method: "email" });
    expect(db.tabelle.giornale_lavori[0].dl_notified_at).toBeTruthy();
  });

  it("se l'email non parte il link sparisce e la pagina non risulta inviata", async () => {
    condiviso.invia.mockResolvedValue({ ok: false, status: 402, body: {} });
    const db = dbPagina(); rete(db);
    const r = await (await gestore("giornale-invia-dl"))(post(corpo));
    expect(r.status).toBe(402);
    expect(db.tabelle.giornale_invii_dl).toHaveLength(0);
    expect(db.tabelle.giornale_lavori[0].dl_notified_at).toBeUndefined();
  });

  it("il doppio clic non spedisce due volte", async () => {
    const db = dbPagina(); rete(db);
    const g = await gestore("giornale-invia-dl");
    await g(post(corpo));
    expect((await g(post(corpo))).status).toBe(429);
    expect(condiviso.invia).toHaveBeenCalledTimes(1);
  });
});

describe("giornale-dl-documento", () => {
  const seme = async (scade: Date, pagina: Record<string, unknown> = firmata) => {
    const token = nuovoTokenDl();
    const db = dbPagina(pagina);
    db.tabelle.giornale_invii_dl.push({ giornale_id: "g1", company_id: "az", token_hash: await improntaTokenDl(token), scade_il: scade.toISOString() });
    db.tabelle.giornale_annotazioni = [{ giornale_id: "g1", testo: "Precisazione", autore_id: null, created_at: "2026-11-06T10:00:00Z" }];
    rete(db);
    return token;
  };

  it("senza token valido non dà niente", async () => {
    rete(dbPagina());
    const g = await gestore("giornale-dl-documento");
    expect((await g(post({ token: "corto" }, null))).status).toBe(400);
    expect((await g(post({ token: nuovoTokenDl() }, null))).status).toBe(404);
  });

  it("il link scaduto risponde 410", async () => {
    const token = await seme(new Date(Date.now() - 1000));
    expect((await (await gestore("giornale-dl-documento"))(post({ token }, null))).status).toBe(410);
  });

  it("col link buono si legge senza login, con le annotazioni", async () => {
    const token = await seme(new Date(Date.now() + 86_400_000));
    const r = await (await gestore("giornale-dl-documento"))(post({ token }, null));
    expect(r.status).toBe(200);
    const { html } = await r.json() as { html: string };
    expect(html).toContain("Precisazione");
    expect(html).toContain('<span class="doc-etichetta ok">Firmata</span>');
  });

  it("una bozza non esce nemmeno col token", async () => {
    const token = await seme(new Date(Date.now() + 86_400_000), { ...firmata, stato: "bozza" });
    expect((await (await gestore("giornale-dl-documento"))(post({ token }, null))).status).toBe(404);
  });
});

describe("giornale-foto-cliente", () => {
  function dbFoto(): DbFinto {
    const db = new DbFinto({
      orders: [{ id: "o1", company_id: "az", customer_id: "cli" }],
      giornale_lavori: [
        { id: "g1", company_id: "az", order_id: "o1", data_lavori: "2026-11-05", visibile_cliente: true, stato: "firmata" },
        { id: "g2", company_id: "az", order_id: "o1", data_lavori: "2026-11-06", visibile_cliente: true, stato: "bozza" },
        { id: "g3", company_id: "az", order_id: "o1", data_lavori: "2026-11-07", visibile_cliente: false, stato: "firmata" },
      ],
      giornale_foto: [
        { id: "f1", giornale_id: "g1", url: "foto-cantiere/az/o1/giornale/a.jpg", storage_path: "az/o1/giornale/a.jpg" },
        { id: "f-altra", giornale_id: "g1", url: "", storage_path: "az/ALTRA/giornale/b.jpg" },
        { id: "f2", giornale_id: "g2", url: "", storage_path: "az/o1/giornale/c.jpg" },
        { id: "f3", giornale_id: "g3", url: "", storage_path: "az/o1/giornale/d.jpg" },
      ],
    });
    for (const p of ["az/o1/giornale/a.jpg", "az/ALTRA/giornale/b.jpg", "az/o1/giornale/c.jpg", "az/o1/giornale/d.jpg"]) db.file.set(`foto-cantiere/${p}`, { dati: new Uint8Array(), contentType: "image/jpeg" } as never);
    return db;
  }

  it("401 senza login, 403 sulla commessa di un altro", async () => {
    const db = dbFoto(); rete(db, "u-altro");
    const g = await gestore("giornale-foto-cliente");
    expect((await g(post({ order_id: "o1" }, null))).status).toBe(401);
    expect((await g(post({ order_id: "o1" }))).status).toBe(403);
    expect((await g(post({ order_id: "inesistente" }))).status).toBe(403);
  });

  it("solo le foto delle pagine firmate e visibili, dentro la cartella della commessa", async () => {
    const db = dbFoto(); rete(db, "cli");
    const r = await (await gestore("giornale-foto-cliente"))(post({ order_id: "o1" }));
    expect(r.status).toBe(200);
    const { link } = await r.json() as { link: Record<string, string> };
    expect(Object.keys(link)).toEqual(["f1"]);
  });

  it("l'utente bloccato non passa", async () => {
    const db = dbFoto(); db.rispostaRpc.utente_bloccato = true; rete(db, "cli");
    expect((await (await gestore("giornale-foto-cliente"))(post({ order_id: "o1" }))).status).toBe(403);
  });
});

describe("generate-giornale-pdf", () => {
  it("il cliente del portale, anche con l'azienda giusta nel profilo, non scarica il giornale", async () => {
    const db = new DbFinto({ user_roles: [{ user_id: "cli", role: "customer" }], giornale_lavori: [] });
    rete(db, "cli");
    expect((await (await gestore("generate-giornale-pdf"))(post({ company_id: "az" }))).status).toBe(403);
  });

  it("allo staff dà il documento con eventi, annotazioni e presenze per nome", async () => {
    const db = new DbFinto({
      user_roles: [{ user_id: "u1", role: "company_admin" }],
      giornale_lavori: [{ ...firmata, pm_signed_by: "u1", giornale_foto: [] }],
      giornale_eventi: [{ id: "e1", giornale_id: "g1", tipo: "problema", testo: "Infiltrazione", stato: "aperto" }],
      giornale_annotazioni: [{ giornale_id: "g1", testo: "Corretto il numero", autore_id: "u1", created_at: "2026-11-06T10:00:00Z" }],
      campo_rapportini: [{ id: "r1", company_id: "az", order_id: "o1", data_lavoro: "2026-11-05", stato: "approvato", user_id: "u2", ore_lavorate: 8 }],
      profiles: [{ id: "u1", first_name: "Tito", last_name: "Lare" }, { id: "u2", first_name: "Mario", last_name: "Rossi" }],
    });
    rete(db);
    const r = await (await gestore("generate-giornale-pdf"))(post({ company_id: "az" }));
    expect(r.status).toBe(200);
    const { html } = await r.json() as { html: string };
    expect(html).toContain("Infiltrazione");
    expect(html).toContain("Corretto il numero");
    expect(html).toContain("Mario Rossi");
    expect(html).toContain("Tito Lare");
    expect(html).toContain("abcdef123456");
  });
});

describe("documento del giornale", () => {
  const azienda: AziendaDocumentoGiornale = { ragione_sociale: "Impresa", partita_iva: null, colore_primario: null, logo_url: null };
  const base: GiornataDocumento = {
    id: "g", data_lavori: "2026-11-05", condizioni_meteo: null, lavorazioni_eseguite: "Getto", materiali_utilizzati: null, personale_presente: 2,
    note: null, avanzamento_percentuale: null, temperatura: null, firmato_da: null, firmato_il: null,
  };

  it("numeri di pagina dalla stampa del browser", () => {
    const html = buildGiornaleHtml([base], null, azienda);
    expect(html).toContain('"Pag. " counter(page) " / " counter(pages)');
    expect(html).toContain("@bottom-center");
  });

  it("una bozza lo dice chiaro, una firmata no", () => {
    expect(buildGiornaleHtml([{ ...base, stato: "bozza" }], null, azienda)).toContain("Bozza, non firmata");
    const f = buildGiornaleHtml([{ ...base, stato: "firmata", pm_signed_at: "2026-11-05T17:00:00Z", firmatario: "Tito", pm_signature_hash: "abcdef1234567890fff" }], null, azienda);
    expect(f).not.toContain("Bozza, non firmata");
    expect(f).toContain("abcdef123456");
    expect(f).not.toContain("abcdef1234567");
    expect(f).toContain("05/11/2026 18:00");
  });

  it("eventi per tipo, annotazioni in coda con data e autore, testo sempre escapato", () => {
    const html = buildGiornaleHtml([{
      ...base, stato: "firmata", firmato_da: "Capo",
      persone: [{ nome: "Mario Rossi", ore: 8 }],
      eventi: [
        { id: "2", tipo: "nota", testo: "<b>x</b>" },
        { id: "1", tipo: "problema", testo: "Perdita", stato: "chiuso", chiuso_il: "2026-11-06T09:00:00Z", nota_chiusura: "Riparata" },
      ],
      annotazioni: [{ testo: "Dopo la firma", created_at: "2026-11-07T10:00:00Z", autore: "Tito" }],
    }], null, azienda);
    expect(html.indexOf(">Problema<")).toBeLessThan(html.indexOf(">Nota<"));
    expect(html).toContain("Chiuso il 06/11/2026 10:00");
    expect(html).toContain("Riparata");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("Mario Rossi (8 h)");
    expect(html.indexOf("Annotazioni successive")).toBeGreaterThan(html.indexOf("Capocantiere"));
    expect(html).toContain("07/11/2026 11:00 · Tito");
  });

  it("indirizzi email", () => {
    expect(emailDlValida("a@b.it")).toBe(true);
    expect(emailDlValida("a@b")).toBe(false);
    expect(emailDlValida("a@b.it, c@d.it")).toBe(false);
  });
});
