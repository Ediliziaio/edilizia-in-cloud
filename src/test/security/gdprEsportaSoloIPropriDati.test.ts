/**
 * «Scarica i miei dati» consegna i dati PERSONALI di chi chiede; quelli
 * dell'azienda solo all'amministratore (o super admin) con «Esporta Clienti»
 * (09/10/2026).
 *
 * L'azione request_export della funzione gdpr-compliance aggiunge le commesse, i contatti (fino a 500) e gli appuntamenti
 * dell'azienda solo se chi chiede è amministratore di QUESTA azienda (o super admin) e ha il permesso «Esporta Clienti»; scrive
 * il registro prima di consegnare il file (la regola di esportazioniCrm.test.ts). Chi non ha i requisiti riceve i propri dati.
 *
 * Il test fa girare il gestore VERO con un database e uno storage finti (le
 * funzioni importano da esm.sh e nei test quegli import non si risolvono).
 * Le guardie di accesso (amministraAzienda, verificaPermessoAzienda) sono
 * quelle vere; solo la funzione has_permission_for_company del database è
 * riscritta qui con la stessa regola del SQL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, denoFinto, type Riga } from "../helpers/edgeFinto";

const condiviso = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => condiviso.client }));
vi.mock("../../../supabase/functions/_shared/withMetrics.ts", () => ({
  conMetriche: (_nome: string, gestore: unknown) => gestore,
}));
vi.mock("../../../supabase/functions/_shared/systemEmail.ts", () => ({
  sendSystemEmail: async () => ({ ok: true }),
}));

const A = "az-a";
const B = "az-b";

const leggiBlob = (blob: Blob): Promise<string> =>
  typeof blob.text === "function"
    ? blob.text()
    : new Promise((ok, ko) => {
      const lettore = new FileReader();
      lettore.onload = () => ok(String(lettore.result));
      lettore.onerror = () => ko(lettore.error);
      lettore.readAsText(blob);
    });

/** Database + storage + autenticazione finti, con il registro di cosa succede e in che ordine. */
class MondoFinto extends DbMinimo {
  /** Le tabelle lette, nell'ordine: serve a provare che per chi non può non si legge nemmeno quella dell'azienda. */
  letture: string[] = [];
  /** «registro» e «file», nell'ordine in cui accadono. */
  eventi: string[] = [];
  files: Record<string, string> = {};
  tabelleInGuasto = new Set<string>();
  /** Utenti a cui has_permission_for_company risponde no, anche se per il database sarebbe sì. */
  permessoNegato = new Set<string>();
  utenti: Record<string, { id: string; email: string }> = {};

  from(tabella: string) {
    this.letture.push(tabella);
    if (this.tabelleInGuasto.has(tabella)) {
      const guasto = { data: null as unknown, error: { message: `guasto su ${tabella}` } };
      const finto: Record<string, unknown> = {};
      for (const verbo of ["insert", "select", "single", "update", "eq"]) finto[verbo] = () => finto;
      finto.then = (ok: (v: unknown) => unknown) => Promise.resolve(guasto).then(ok);
      return finto as unknown as ReturnType<DbMinimo["from"]>;
    }
    const interrogazione = super.from(tabella);
    if (tabella === "user_audit_log") {
      const inserisci = interrogazione.insert.bind(interrogazione);
      interrogazione.insert = (dati: unknown) => {
        this.eventi.push("registro");
        return inserisci(dati);
      };
    }
    return interrogazione;
  }

  auth = {
    getUser: async (token: string) => {
      const utente = this.utenti[token];
      return utente
        ? { data: { user: utente }, error: null as unknown }
        : { data: { user: null as unknown }, error: { message: "invalid JWT" } };
    },
  };

  storage = {
    createBucket: () => Promise.resolve({ data: null as unknown, error: null as unknown }),
    from: (bucket: string) => ({
      upload: async (percorso: string, blob: Blob) => {
        this.eventi.push("file");
        this.files[`${bucket}/${percorso}`] = await leggiBlob(blob);
        return { data: {} as unknown, error: null as unknown };
      },
      createSignedUrl: async (percorso: string) => ({
        data: { signedUrl: `https://storage.example/${bucket}/${percorso}?token=firmato` },
        error: null as unknown,
      }),
    }),
  };
}

let mondo: MondoFinto;

function popola(m: MondoFinto) {
  const persona = (id: string, company: string | null, nome: string, bloccato = false): Riga => ({
    id, company_id: company, first_name: nome, last_name: "Prova", email: `${id}@esempio.it`, is_blocked: bloccato,
  });
  m.tabelle.profiles = [
    persona("u-admin", A, "Anna"),
    persona("u-admin-senza", A, "Anselmo"),
    persona("u-admin-bloccato", A, "Bianca", true),
    persona("u-staff-esporta", A, "Carlo"),
    persona("u-operaio", A, "Olga"),
    persona("u-cliente", A, "Clara"),
    persona("u-super", A, "Sara"),
    persona("u-altra-azienda", B, "Bruno"),
  ];
  m.tabelle.user_roles = [
    { user_id: "u-admin", role: "company_admin" },
    { user_id: "u-admin-senza", role: "company_admin" },
    { user_id: "u-admin-bloccato", role: "company_admin" },
    { user_id: "u-staff-esporta", role: "company_staff" },
    { user_id: "u-operaio", role: "employee" },
    { user_id: "u-cliente", role: "customer" },
    { user_id: "u-super", role: "super_admin" },
    { user_id: "u-altra-azienda", role: "company_admin" },
  ];
  m.tabelle.multi_company_access = [];
  m.tabelle.staff_permissions = [
    { user_id: "u-staff-esporta", company_id: A, can_export_clients: true },
    { user_id: "u-operaio", company_id: A, can_export_clients: false },
  ];
  m.tabelle.orders = [
    { id: "o-1", company_id: A, order_code: "C-2026-001", description: "Bagno Rossi", total_amount: 9000, created_at: "2026-09-01", status: "in_corso" },
    { id: "o-2", company_id: A, order_code: "C-2026-002", description: "Cappotto Verdi", total_amount: 22000, created_at: "2026-09-02", status: "in_corso" },
    { id: "o-3", company_id: A, order_code: "C-2026-003", description: "Serramenti Neri", total_amount: 14000, created_at: "2026-09-03", status: "chiusa" },
    { id: "o-9", company_id: B, order_code: "ALTRA-777", description: "Commessa di un'altra azienda", total_amount: 1, created_at: "2026-09-04", status: "in_corso" },
  ];
  m.tabelle.marketing_contacts = [
    ...[1, 2, 3, 4].map((n) => ({ id: `m-${n}`, company_id: A, email: `cliente${n}@privato.it`, phone: `33300000${n}`, last_name: `Cliente${n}` })),
    { id: "m-9", company_id: B, email: "altra@azienda.it", phone: "3999999999", last_name: "Estranea" },
  ];
  m.tabelle.appointments = [
    { id: "a-1", company_id: A, title: "Sopralluogo Rossi", appointment_date: "2026-10-12", status: "confermato" },
    { id: "a-2", company_id: A, title: "Posa Verdi", appointment_date: "2026-10-14", status: "confermato" },
    { id: "a-9", company_id: B, title: "Appuntamento altrui", appointment_date: "2026-10-15", status: "confermato" },
  ];
  // Ogni persona ha un'azione sua, riconoscibile dal nome: serve a vedere di chi sono le righe del file.
  m.tabelle.company_activity_log = [
    { company_id: A, user_id: "u-operaio", action: "azione.di.u-operaio", target_type: "order", details: {}, created_at: "2026-09-10" },
    { company_id: A, user_id: "u-admin", action: "azione.di.u-admin", target_type: "contact", details: {}, created_at: "2026-09-11" },
    { company_id: A, user_id: "u-cliente", action: "azione.di.u-cliente", target_type: "contact", details: {}, created_at: "2026-09-12" },
  ];
  m.tabelle.gdpr_consents = [
    { user_id: "u-operaio", company_id: A, consent_type: "analytics", granted: true },
    { user_id: "u-admin", company_id: A, consent_type: "analytics", granted: false },
    { user_id: "u-cliente", company_id: A, consent_type: "marketing_email", granted: true },
  ];
  m.tabelle.gdpr_data_requests = [];
  m.tabelle.gdpr_audit_log = [];
  m.tabelle.user_audit_log = [];
  for (const id of ["u-admin", "u-admin-senza", "u-admin-bloccato", "u-staff-esporta", "u-operaio", "u-cliente", "u-super", "u-altra-azienda"]) {
    m.utenti[`token-${id}`] = { id, email: `${id}@esempio.it` };
  }

  // La regola di public.has_permission_for_company: super admin sì; amministratore della
  // propria azienda sì; altrimenti la colonna di staff_permissions di QUELL'azienda.
  m.rpcs.has_permission_for_company = (args) => {
    const utente = String(args._user_id);
    const permesso = String(args._permission);
    const azienda = String(args._company_id);
    if (m.permessoNegato.has(utente)) return false;
    const ruoli = (m.tabelle.user_roles ?? []).filter((r) => r.user_id === utente).map((r) => r.role);
    if (ruoli.includes("super_admin")) return true;
    const profilo = (m.tabelle.profiles ?? []).find((p) => p.id === utente);
    if (ruoli.includes("company_admin") && profilo?.company_id === azienda) return true;
    const riga = (m.tabelle.staff_permissions ?? []).find((r) => r.user_id === utente && r.company_id === azienda);
    return Boolean(riga?.[permesso]);
  };
}

async function chiedeLExport(chi: string, azione = "request_export") {
  vi.resetModules();
  const { finto, gestore } = denoFinto({ SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: "service" });
  vi.stubGlobal("Deno", finto);
  const percorso = "../../../supabase/functions/gdpr-compliance/index.ts";
  await import(/* @vite-ignore */ percorso);
  const risposta = await gestore()!(new Request("http://x/functions/v1/gdpr-compliance", {
    method: "POST",
    headers: { authorization: `Bearer token-${chi}`, "content-type": "application/json" },
    body: JSON.stringify({ action: azione }),
  }));
  return { stato: risposta.status, corpo: (await risposta.json()) as Record<string, unknown> };
}

/** Il file consegnato: l'unico caricato nello storage. */
function fileConsegnato(): { testo: string; json: Record<string, unknown> & { activity_log?: Riga[]; consents?: Riga[]; profile?: Riga; orders?: Riga[]; contacts?: Riga[]; appointments?: Riga[]; ambito?: string } } {
  const testi = Object.values(mondo.files);
  expect(testi, "deve esserci un solo file nello storage").toHaveLength(1);
  return { testo: testi[0], json: JSON.parse(testi[0]) };
}

beforeEach(() => {
  mondo = new MondoFinto();
  condiviso.client = mondo;
  popola(mondo);
});
afterEach(() => { vi.unstubAllGlobals(); });

const TABELLE_DELL_AZIENDA = ["orders", "marketing_contacts", "appointments"];

describe("request_export: chi non può esportare i clienti riceve solo i suoi dati", () => {
  const SENZA_I_DATI_DELL_AZIENDA: Array<[string, string]> = [
    ["un operaio (staff senza permessi)", "u-operaio"],
    ["un cliente del portale con un profilo nell'azienda", "u-cliente"],
    ["uno staff che ha «Esporta Clienti» ma non è amministratore", "u-staff-esporta"],
    ["un amministratore a cui il permesso «Esporta Clienti» manca", "u-admin-senza"],
    ["un amministratore bloccato", "u-admin-bloccato"],
  ];

  it.each(SENZA_I_DATI_DELL_AZIENDA)("%s: profilo, suo registro e suoi consensi, niente dati dell'azienda", async (_chi, id) => {
    mondo.permessoNegato.add("u-admin-senza");
    const { stato, corpo } = await chiedeLExport(id);

    expect(stato).toBe(200);
    expect(corpo.success).toBe(true);
    const { json, testo } = fileConsegnato();

    // Solo le tre cose personali (più la riga che dice di cosa si tratta).
    expect(Object.keys(json).sort()).toEqual(["activity_log", "ambito", "consents", "profile"]);
    expect(json.profile?.id).toBe(id);
    expect((json.activity_log ?? []).map((r) => r.action)).toEqual(
      id === "u-operaio" || id === "u-cliente" ? [`azione.di.${id}`] : [],
    );
    for (const consenso of json.consents ?? []) expect(consenso.user_id).toBe(id);
    expect(json.ambito).toMatch(/non sono inclusi/);

    // Niente di ciò che appartiene all'azienda o ad altre persone.
    for (const segreto of ["C-2026-001", "Bagno Rossi", "cliente1@privato.it", "333000001", "Sopralluogo Rossi", "ALTRA-777", "altra@azienda.it", "azione.di.u-admin"]) {
      expect(testo, segreto).not.toContain(segreto);
    }

    // Non si leggono nemmeno le tabelle dell'azienda.
    for (const tabella of TABELLE_DELL_AZIENDA) expect(mondo.letture, tabella).not.toContain(tabella);
  });

  it.each(SENZA_I_DATI_DELL_AZIENDA)("%s: la richiesta resta nel registro come copia dei dati personali", async (_chi, id) => {
    mondo.permessoNegato.add("u-admin-senza");
    await chiedeLExport(id);

    const registro = mondo.tabelle.user_audit_log;
    expect(registro).toHaveLength(1);
    expect(registro[0]).toMatchObject({
      company_id: A,
      actor_id: id,
      target_user_id: id,
      action: "personal_data_exported",
    });
    expect((registro[0].details as Record<string, unknown>).dati_azienda_inclusi).toBe(false);
    // Non è un'esportazione di contatti: niente crm_exported.
    expect(registro.some((r) => r.action === "crm_exported")).toBe(false);

    const richiesta = mondo.tabelle.gdpr_data_requests[0];
    expect(richiesta).toMatchObject({ user_id: id, request_type: "export", status: "completed" });
    expect(mondo.tabelle.gdpr_audit_log[0]).toMatchObject({ action: "data_export_completed" });
    expect((mondo.tabelle.gdpr_audit_log[0].details as Record<string, unknown>).dati_azienda_inclusi).toBe(false);
  });
});

describe("request_export: amministratore con «Esporta Clienti» e super admin, come prima", () => {
  it.each([
    ["un amministratore con il permesso", "u-admin"],
    ["un super admin", "u-super"],
  ])("%s riceve anche commesse, contatti e appuntamenti della SUA azienda", async (_chi, id) => {
    const { stato, corpo } = await chiedeLExport(id);

    expect(stato).toBe(200);
    expect(corpo).toMatchObject({ success: true, expires_in_hours: 24 });
    expect(String(corpo.download_url)).toContain("gdpr-exports/az-a/");
    const { json, testo } = fileConsegnato();

    expect(Object.keys(json).sort()).toEqual(["activity_log", "ambito", "appointments", "consents", "contacts", "orders", "profile"]);
    expect(json.profile?.id).toBe(id);
    expect((json.orders ?? []).map((r) => r.id)).toEqual(["o-1", "o-2", "o-3"]);
    expect((json.contacts ?? []).map((r) => r.id)).toEqual(["m-1", "m-2", "m-3", "m-4"]);
    expect((json.appointments ?? []).map((r) => r.id)).toEqual(["a-1", "a-2"]);
    expect(json.ambito).toMatch(/dati dell'azienda/);
    // Di un'altra azienda, mai.
    for (const estraneo of ["ALTRA-777", "altra@azienda.it", "Appuntamento altrui"]) expect(testo, estraneo).not.toContain(estraneo);
    // E dei colleghi nel registro attività: solo il suo.
    expect((json.activity_log ?? []).every((r) => !String(r.action).includes("u-operaio"))).toBe(true);
  });

  it("l'esportazione di contatti lascia crm_exported nel registro, con quante righe sono uscite", async () => {
    await chiedeLExport("u-admin");

    const registro = mondo.tabelle.user_audit_log;
    expect(registro).toHaveLength(1);
    expect(registro[0]).toMatchObject({ company_id: A, actor_id: "u-admin", action: "crm_exported" });
    expect(registro[0].details).toMatchObject({
      oggetto: "contatti",
      formato: "json",
      righe: 4,
      filtri: { origine: "Scarica i miei dati", commesse: 3, appuntamenti: 2 },
      request_id: mondo.tabelle.gdpr_data_requests[0].id,
    });
    expect((mondo.tabelle.gdpr_audit_log[0].details as Record<string, unknown>).dati_azienda_inclusi).toBe(true);
  });

  it("un amministratore di un'altra azienda riceve i dati della sua, mai di A", async () => {
    mondo.tabelle.orders.push({ id: "o-b1", company_id: B, order_code: "B-001", description: "Lavoro di B", total_amount: 5, created_at: "2026-09-05", status: "in_corso" });
    await chiedeLExport("u-altra-azienda");

    const { json, testo } = fileConsegnato();
    expect((json.orders ?? []).map((r) => r.id).sort()).toEqual(["o-9", "o-b1"]);
    expect(testo).not.toContain("C-2026-001");
    expect(mondo.tabelle.user_audit_log[0]).toMatchObject({ company_id: B, actor_id: "u-altra-azienda" });
  });
});

describe("request_export: la traccia nel registro viene prima del file", () => {
  it.each(["u-admin", "u-operaio"])("%s: il registro è scritto prima che il file sia caricato", async (id) => {
    await chiedeLExport(id);
    expect(mondo.eventi).toEqual(["registro", "file"]);
  });

  it("se il registro non si scrive, il file non parte e la richiesta non risulta completata", async () => {
    mondo.tabelleInGuasto.add("user_audit_log");
    const { stato, corpo } = await chiedeLExport("u-admin");

    expect(stato).toBe(500);
    expect(String(corpo.error)).toContain("guasto su user_audit_log");
    expect(mondo.files).toEqual({});
    expect(mondo.tabelle.gdpr_data_requests[0].status).toBe("processing");
    expect(mondo.tabelle.gdpr_data_requests[0].download_url).toBeUndefined();
  });

  it("se non si riesce a controllare il permesso, nel dubbio restano i dati personali", async () => {
    // L'amministratore c'è, ma la lettura dei suoi permessi fallisce.
    mondo.rpcs.has_permission_for_company = () => { throw new Error("database irraggiungibile"); };
    const { stato } = await chiedeLExport("u-admin");

    expect(stato).toBe(200);
    expect(Object.keys(fileConsegnato().json).sort()).toEqual(["activity_log", "ambito", "consents", "profile"]);
  });
});

describe("request_export: altri casi", () => {
  it("senza un utente riconosciuto risponde 401 e non carica niente", async () => {
    const { stato } = await chiedeLExport("sconosciuto");
    expect(stato).toBe(401);
    expect(mondo.files).toEqual({});
    expect(mondo.tabelle.gdpr_data_requests).toEqual([]);
  });

  it("una richiesta già in corso non ne apre un'altra e non consegna niente", async () => {
    mondo.tabelle.gdpr_data_requests = [{ id: "r-0", user_id: "u-admin", request_type: "export", status: "pending", company_id: A }];
    const { stato } = await chiedeLExport("u-admin");
    expect(stato).toBe(400);
    expect(mondo.files).toEqual({});
    expect(mondo.tabelle.user_audit_log).toEqual([]);
  });
});

describe("il codice: i dati dell'azienda stanno solo dietro la regola", () => {
  const sorgente = readFileSync(join(__dirname, "../../../supabase/functions/gdpr-compliance/index.ts"), "utf8");
  const inizio = sorgente.indexOf('case "request_export": {');
  const fine = sorgente.indexOf('case "request_deletion": {');
  const blocco = sorgente.slice(inizio, fine);

  it("la regola chiede amministratore dell'azienda E «Esporta Clienti», con le guardie comuni del server", () => {
    expect(sorgente).toMatch(/import \{ amministraAzienda \} from ["']\.\.\/_shared\/amministraAzienda\.ts["']/);
    expect(sorgente).toMatch(/import \{ verificaPermessoAzienda \} from ["']\.\.\/_shared\/permessoAzienda\.ts["']/);
    expect(sorgente).toContain('await verificaPermessoAzienda(admin, userId, companyId, ["can_export_clients"], "esportare i dati dei clienti");');
    expect(sorgente).toContain("!(await amministraAzienda(admin, userId, companyId))");
    // Nel dubbio, no.
    expect(sorgente).toMatch(/catch \(e\) \{[\s\S]*?return false;/);
  });

  it("commesse, contatti e appuntamenti si leggono solo dentro «if (conDatiAzienda)»", () => {
    expect(inizio).toBeGreaterThan(-1);
    expect(fine).toBeGreaterThan(inizio);
    const apertura = blocco.indexOf("if (conDatiAzienda) {");
    expect(apertura).toBeGreaterThan(-1);
    for (const tabella of TABELLE_DELL_AZIENDA) {
      const posizioni = [...blocco.matchAll(new RegExp(`from\\("${tabella}"\\)`, "g"))].map((m) => m.index!);
      expect(posizioni.length, tabella).toBe(1);
      expect(posizioni[0], tabella).toBeGreaterThan(apertura);
    }
  });

  it("il registro si scrive prima di caricare il file", () => {
    const registro = blocco.indexOf('.from("user_audit_log")');
    const caricamento = blocco.indexOf(".upload(");
    expect(registro).toBeGreaterThan(-1);
    expect(caricamento).toBeGreaterThan(registro);
    expect(blocco).toContain("if (registroError) throw registroError;");
  });
});
