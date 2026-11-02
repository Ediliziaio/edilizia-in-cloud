/**
 * La edge function `silvio-commessa`, fase 3: il modo `chat` (gli strumenti tornano al
 * browser, la funzione non applica niente), i documenti letti dove stanno (niente copie in
 * silvio-uploads, percorso preso dalla riga che chi chiama vede) e il modo `apri` della ⓘ.
 * Database e storage finti (dbFinto), provider AI finto al posto di `aiRouterComplete`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbFinto, denoFinto } from "../helpers/dbFinto";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const ALTRA_AZIENDA = "e7bc8fd0-fcab-4c02-bcfe-98a1488c3e7e";
const UTENTE = "1dbe6ceb-6b04-4d43-a617-8a709cb22f07";
const COMMESSA = "0a000000-0000-4000-a000-000000000034";
const ALLEGATO = "0b000000-0000-4000-a000-000000000001";
const EMAIL = "0c000000-0000-4000-a000-000000000001";
/** Un'azienda vera (non Demo 2): «Crea con Silvio» lo decide il database. */
const AZIENDA_VERA = "0d000000-0000-4000-a000-000000000001";

interface ChiamataAI { taskKey: string; messages: Array<{ role: string; content: unknown }>; params?: { tools?: unknown[] }; estimatedCostEur?: number }

const runtime = vi.hoisted(() => ({
  db: null as unknown as DbFinto,
  /** Quello che la RLS mostra a chi chiama. */
  utente: null as unknown as DbFinto,
  chiamate: [] as ChiamataAI[],
  messaggio: null as Record<string, unknown> | null,
  errore: null as Error | null,
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: (_url: string, chiave: string): unknown => (chiave === "chiave-anon" ? runtime.utente.client : runtime.db.client),
}));
vi.mock("../../../supabase/functions/_shared/auth.ts", () => ({
  requireAuth: async () => ({ userId: UTENTE, supabaseAdmin: runtime.db.client }),
  requireCompanyAccess: async (_db: unknown, _u: string, companyId: string) => {
    if (companyId !== AZIENDA && companyId !== AZIENDA_VERA) throw new Response(JSON.stringify({ error: "Accesso negato" }), { status: 403 });
  },
}));
vi.mock("../../../supabase/functions/_shared/requirePaymentMethod.ts", () => ({ gateAiPayment: async (): Promise<null> => null }));
vi.mock("../../../supabase/functions/_shared/aiRouter.ts", () => {
  class AiRouterError extends Error {}
  class AiCompanyCreditError extends AiRouterError {}
  return {
    AiRouterError,
    AiCompanyCreditError,
    aiRouterComplete: async (opts: ChiamataAI) => {
      runtime.chiamate.push(opts);
      if (runtime.errore) throw runtime.errore;
      const m = runtime.messaggio ?? { content: "{}" };
      return {
        content: typeof m.content === "string" ? m.content : "",
        rawResponse: { choices: [{ message: m, finish_reason: "stop" }] },
        modelUsed: "finto/chat", costBilledEur: 0.0021, costRealEur: 0.0015, totalTokens: 3000,
      };
    },
  };
});

let gestore: ((req: Request) => Promise<Response>) | null = null;
let deno: ReturnType<typeof denoFinto> | null = null;

beforeEach(() => {
  runtime.db = new DbFinto({ orders: [{ id: COMMESSA, company_id: AZIENDA }] });
  runtime.db.rispostaRpc.has_permission_for_company = true;
  runtime.utente = new DbFinto();
  runtime.chiamate = [];
  runtime.messaggio = null;
  runtime.errore = null;
});
afterEach(() => vi.unstubAllGlobals());

async function chiama(corpo: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  // Deno serve anche durante la richiesta (il client di chi chiama legge l'ambiente): si rimette a ogni chiamata.
  deno ??= denoFinto({ SUPABASE_URL: "https://finto.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "chiave-servizio", SUPABASE_ANON_KEY: "chiave-anon" });
  vi.stubGlobal("Deno", deno.deno);
  if (!gestore) {
    vi.resetModules();
    const percorso = "../../../supabase/functions/silvio-commessa/index.ts";
    await import(/* @vite-ignore */ percorso);
    gestore = deno.gestore();
  }
  const r = await gestore(new Request("https://finto.supabase.co/functions/v1/silvio-commessa", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:8080", Authorization: "Bearer t" }, body: JSON.stringify(corpo),
  }));
  return { status: r.status, data: (await r.json()) as Record<string, unknown> };
}

const contesto = { modo: "crea", oggi: "2026-10-31", variabili: [{ chiave: "fasi.work_start_date", etichetta: "Inizio lavori", valore: "2026-11-09", fonte: "contratto", stato: "fatto" }], conflitti: [] as unknown[], altre: [] as unknown[] };

describe("silvio-commessa, modo chat", () => {
  it("«sposta tutto di una settimana e togli la ditta»: il modello sceglie due strumenti, la funzione li restituisce senza applicarli", async () => {
    runtime.messaggio = {
      content: null,
      tool_calls: [
        { id: "1", type: "function", function: { name: "sposta_date", arguments: JSON.stringify({ settimane: 1 }) } },
        { id: "2", type: "function", function: { name: "togli", arguments: JSON.stringify({ chiave: "ditte.assegnate" }) } },
        { id: "3", type: "function", function: { name: "cancella_commessa", arguments: "{}" } },
      ],
    };
    const r = await chiama({ modo: "chat", company_id: AZIENDA, messaggio: "sposta tutto di una settimana e togli la ditta", contesto, richiesta_id: "r1" });
    expect(r.status).toBe(200);
    expect(r.data.strumenti).toEqual([
      { nome: "sposta_date", argomenti: { settimane: 1 } },
      { nome: "togli", argomenti: { chiave: "ditte.assegnate" } },
    ]);
    expect(r.data.costo_eur).toBe(0.0021);
    const c = runtime.chiamate[0];
    expect(c.taskKey).toBe("silvio_commessa_chat");
    expect((c.params?.tools ?? []).map((t) => (t as { function: { name: string } }).function.name))
      .toEqual(["cambia_valore", "sposta_date", "aggiungi_fase", "togli", "scegli_fonte", "spiega"]);
    expect(c.estimatedCostEur).toBeGreaterThan(0); // il router controlla il saldo con questa stima
    expect(String(c.messages[1].content)).toContain("fasi.work_start_date");
    expect(c.messages.at(-1)).toEqual({ role: "user", content: "sposta tutto di una settimana e togli la ditta" });
    // Niente scritto nel database.
    expect(runtime.db.operazioni.filter((o) => o.modo !== "select")).toEqual([]);
  });

  it("crediti finiti: 402 col messaggio del router, che li controlla prima di chiamare il provider", async () => {
    const { AiCompanyCreditError } = await import("../../../supabase/functions/_shared/aiRouter.ts");
    runtime.errore = new (AiCompanyCreditError as unknown as new (m: string) => Error)("Credito insufficiente: ricarica");
    const r = await chiama({ modo: "chat", company_id: AZIENDA, messaggio: "togli la ditta", contesto });
    expect(r.status).toBe(402);
    expect(String(r.data.error)).toContain("Credito insufficiente");
  });

  it("rifiuta senza messaggio, senza bozza, con un messaggio troppo lungo o un'altra azienda", async () => {
    expect((await chiama({ modo: "chat", company_id: AZIENDA, messaggio: " ", contesto })).status).toBe(400);
    expect((await chiama({ modo: "chat", company_id: AZIENDA, messaggio: "ciao" })).status).toBe(400);
    expect((await chiama({ modo: "chat", company_id: AZIENDA, messaggio: "x".repeat(2001), contesto })).status).toBe(413);
    expect((await chiama({ modo: "chat", company_id: ALTRA_AZIENDA, messaggio: "ciao", contesto })).status).toBe(403);
    expect(runtime.chiamate).toHaveLength(0);
  });
});

describe("silvio-commessa, documenti letti dove stanno", () => {
  const rispostaLettura = { content: JSON.stringify({ aree: { economia: { "economia.total_amount": { valore: 12000, dove: "testo", citazione: "importo 12.000", fiducia: 0.9 } } } }) };

  it("un documento della commessa si legge dal suo bucket, col percorso della riga che chi chiama vede: niente copie in silvio-uploads", async () => {
    runtime.utente.righe("order_attachments").push({ id: ALLEGATO, order_id: COMMESSA, file_name: "Capitolato.txt", file_url: `orders/${COMMESSA}/1-capitolato.txt` });
    runtime.db.file.set(`order-attachments/orders/${COMMESSA}/1-capitolato.txt`, { bytes: new TextEncoder().encode("Lavori per importo 12.000 euro"), contentType: null });
    runtime.messaggio = rispostaLettura;
    const r = await chiama({ company_id: AZIENDA, fonte: { tipo: "documento", etichetta: "Capitolato.txt" }, documento: { tipo: "allegato_commessa", id: ALLEGATO } });
    expect(r.status).toBe(200);
    const fr = r.data.frammento as { fonte: { id: string } };
    expect(fr.fonte.id).toBe(`orders/${COMMESSA}/1-capitolato.txt`);
    expect([...runtime.db.file.keys()].filter((k) => k.startsWith("silvio-uploads/"))).toEqual([]);
  });

  it("un allegato che chi chiama non vede, o di una commessa di un'altra azienda, non si legge", async () => {
    runtime.db.file.set(`order-attachments/orders/${COMMESSA}/1-capitolato.txt`, { bytes: new TextEncoder().encode("x"), contentType: null });
    const nascosto = await chiama({ company_id: AZIENDA, fonte: { tipo: "documento", etichetta: "x" }, documento: { tipo: "allegato_commessa", id: ALLEGATO } });
    expect(nascosto.status).toBe(404);

    runtime.db = new DbFinto({ orders: [{ id: COMMESSA, company_id: ALTRA_AZIENDA }] });
    runtime.db.rispostaRpc.has_permission_for_company = true;
    runtime.utente.righe("order_attachments").push({ id: ALLEGATO, order_id: COMMESSA, file_name: "x.txt", file_url: `orders/${COMMESSA}/1-capitolato.txt` });
    const altra = await chiama({ company_id: AZIENDA, fonte: { tipo: "documento", etichetta: "x" }, documento: { tipo: "allegato_commessa", id: ALLEGATO } });
    expect(altra.status).toBe(404);
    expect(runtime.chiamate).toHaveLength(0);

    const forma = await chiama({ company_id: AZIENDA, fonte: { tipo: "documento", etichetta: "x" }, documento: { tipo: "allegato_commessa", id: "../x" } });
    expect(forma.status).toBe(400);
  });

  it("l'allegato di un'email: dalla riga di email_inbox, sotto la cartella dell'azienda; l'id della fonte dice come riaprirlo", async () => {
    runtime.utente.righe("email_inbox").push({
      id: EMAIL, company_id: AZIENDA,
      attachments: [{ filename: "firma.png", storage_path: `${AZIENDA}/m1/0-firma.png` }, { filename: "Contratto.txt", storage_path: `${AZIENDA}/m1/1-contratto.txt` }],
    });
    runtime.db.file.set(`email-attachments/${AZIENDA}/m1/1-contratto.txt`, { bytes: new TextEncoder().encode("importo 12.000"), contentType: null });
    runtime.messaggio = rispostaLettura;
    const r = await chiama({ company_id: AZIENDA, fonte: { tipo: "contratto", etichetta: "Contratto.txt" }, documento: { tipo: "allegato_email", email_id: EMAIL, indice: 1 } });
    expect(r.status).toBe(200);
    expect((r.data.frammento as { fonte: { id: string } }).fonte.id).toBe(`email:${EMAIL}:1`);

    // Un percorso fuori dalla cartella dell'azienda non si scarica, anche se la riga si vede.
    runtime.utente.righe("email_inbox")[0].attachments = [{ filename: "x.txt", storage_path: `${ALTRA_AZIENDA}/m1/x.txt` }];
    const fuori = await chiama({ company_id: AZIENDA, fonte: { tipo: "documento", etichetta: "x" }, documento: { tipo: "allegato_email", email_id: EMAIL, indice: 0 } });
    expect(fuori.status).toBe(404);
  });

  it("modo apri: un indirizzo firmato per la ⓘ, con gli stessi controlli e senza AI", async () => {
    runtime.utente.righe("email_inbox").push({ id: EMAIL, company_id: AZIENDA, attachments: [{ filename: "Contratto.pdf", storage_path: `${AZIENDA}/m1/c.pdf` }] });
    runtime.db.file.set(`email-attachments/${AZIENDA}/m1/c.pdf`, { bytes: new Uint8Array([1]), contentType: null });
    const r = await chiama({ modo: "apri", company_id: AZIENDA, documento: { tipo: "allegato_email", email_id: EMAIL, indice: 0 } });
    expect(r.status).toBe(200);
    expect(String(r.data.url)).toContain(`email-attachments/${AZIENDA}/m1/c.pdf`);
    expect(r.data.nome).toBe("Contratto.pdf");
    expect((await chiama({ modo: "apri", company_id: AZIENDA, documento: { tipo: "allegato_email", email_id: EMAIL, indice: 3 } })).status).toBe(404);
    expect(runtime.chiamate).toHaveLength(0);
  });
});

describe("silvio-commessa, revisione dell'1/11: chi entra e da dove", () => {
  const rispostaLettura = { content: JSON.stringify({ aree: {} }) };

  it("E1: chi non ha «Modifica commesse» (cliente del portale, segnalatore, subappaltatore) non entra in nessuno dei quattro modi", async () => {
    runtime.db.rispostaRpc.has_permission_for_company = false;
    const lettura = await chiama({ company_id: AZIENDA, testo: "rifare bagno" });
    const chat = await chiama({ modo: "chat", company_id: AZIENDA, messaggio: "ciao", contesto });
    const apri = await chiama({ modo: "apri", company_id: AZIENDA, documento: { tipo: "allegato_email", email_id: EMAIL, indice: 0 } });
    const allega = await chiama({ modo: "allega", company_id: AZIENDA, bozza_id: COMMESSA, documenti: [{ documento: { tipo: "allegato_email", email_id: EMAIL, indice: 0 } }] });
    for (const r of [lettura, chat, apri, allega]) {
      expect(r.status).toBe(403);
      expect(String(r.data.error)).toMatch(/permesso di modificare le commesse/);
    }
    expect(runtime.chiamate).toHaveLength(0);
    const permessi = runtime.db.chiamateRpc.filter((c) => c.nome === "has_permission_for_company");
    expect(permessi).toHaveLength(4);
    expect(permessi[0].args).toEqual({ _user_id: UTENTE, _permission: "can_edit_orders", _company_id: AZIENDA });
  });

  it("E2: in un'azienda con «Crea con Silvio» spento la edge risponde 403; acceso da un override, entra", async () => {
    const spenta = await chiama({ company_id: AZIENDA_VERA, testo: "rifare bagno" });
    expect(spenta.status).toBe(403);
    expect(String(spenta.data.error)).toMatch(/non è attivo/);
    expect(runtime.chiamate).toHaveLength(0);

    runtime.db.righe("company_feature_overrides").push({ company_id: AZIENDA_VERA, feature_key: "silvio_crea_commessa", access_level: "enabled", is_enabled: true, expires_at: null });
    runtime.db.righe("companies").push({ id: AZIENDA_VERA, subscription_plan_id: null });
    runtime.messaggio = rispostaLettura;
    expect((await chiama({ company_id: AZIENDA_VERA, testo: "rifare bagno" })).status).toBe(200);
  });

  it("E3: un allegato della commessa con un percorso fuori dalla sua cartella non si legge", async () => {
    runtime.utente.righe("order_attachments").push({ id: ALLEGATO, order_id: COMMESSA, file_name: "x.txt", file_url: `orders/${ALTRA_AZIENDA}/segreto.txt` });
    runtime.db.file.set(`order-attachments/orders/${ALTRA_AZIENDA}/segreto.txt`, { bytes: new TextEncoder().encode("segreto"), contentType: null });
    const r = await chiama({ company_id: AZIENDA, fonte: { tipo: "documento", etichetta: "x" }, documento: { tipo: "allegato_commessa", id: ALLEGATO } });
    expect(r.status).toBe(404);
    // E nemmeno un documento di variante di un'altra commessa.
    runtime.utente.righe("order_attachments")[0].file_url = `order-variation-documents/${AZIENDA}/${ALTRA_AZIENDA}/v/p.pdf`;
    expect((await chiama({ company_id: AZIENDA, fonte: { tipo: "documento", etichetta: "x" }, documento: { tipo: "allegato_commessa", id: ALLEGATO } })).status).toBe(404);
    expect(runtime.chiamate).toHaveLength(0);
  });

  it("E7: senza «oggi» dalla bozza la chat usa il giorno italiano, non quello UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-30T23:30:00Z"));
    try {
      runtime.messaggio = { content: "ok" };
      await chiama({ modo: "chat", company_id: AZIENDA, messaggio: "ciao", contesto: { ...contesto, oggi: undefined } });
      expect(JSON.stringify(runtime.chiamate[0].messages[0].content)).toContain("2026-12-01");
    } finally {
      vi.useRealTimers();
    }
  });
});
