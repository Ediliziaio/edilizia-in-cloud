import { webcrypto, randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo, type Riga } from "../helpers/edgeFinto";
import { handleBotOperativo } from "../../../supabase/functions/whatsapp-webhook/handlers/bot_operativo";
import { extractMessageContent } from "../../../supabase/functions/whatsapp-webhook/parser";
import type { IncomingWhatsAppMessage, WANumber } from "../../../supabase/functions/whatsapp-webhook/types";
import { apriFattureCliente } from "../../../supabase/functions/whatsapp-ai-processor/tools/ufficio/apri_fatture_cliente";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";
import { verificaTraduzioneVocale } from "../../../supabase/functions/whatsapp-ai-processor/traduzioneVocale";
import type { InteractivePayload } from "../../../supabase/functions/whatsapp-ai-processor/interactive";

type Handler = (req: Request) => Promise<Response>;
const m = vi.hoisted(() => ({
  db: null as unknown,
  ai: vi.fn(),
  transcribe: vi.fn(),
  router: vi.fn(),
  charge: vi.fn(),
  routine: null as Handler | null,
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => m.db }));
vi.mock("../../../supabase/functions/whatsapp-ai-processor/openai.ts", () => ({
  callOpenAI: m.ai, transcribeAudioWhisper: m.transcribe,
}));
vi.mock("../../../supabase/functions/_shared/aiRouter.ts", () => ({ aiRouterComplete: m.router }));
vi.mock("../../../supabase/functions/_shared/ai-provider/billing.ts", () => ({ precallCheck: async () => ({ allow: true }) }));
vi.mock("../../../supabase/functions/_shared/ai-provider/directApi.ts", () => ({
  chargeAndLogDirect: m.charge, estimateWhisperCostUsd: () => 0.0006,
}));
vi.mock("../../../supabase/functions/_shared/withMetricsRapida.ts", () => ({
  serveConMetricheRapida: (_name: string, handler: Handler) => { m.routine = handler; },
}));

const azienda = "demo-azienda-2-locale";
const cantiere = "00000000-0000-4000-8000-000000000021";
const acquisti = "00000000-0000-4000-8000-000000000022";
const mittente = "393331234500";
const linea: WANumber = { id: "linea-demo", company_id: azienda, purpose: "bot_operativo", agent_id: null,
  stato: "active", display_name: null, operational_settings: { bot_enabled: true, ai_auto_process: true } };
const env: Record<string, string> = {
  SUPABASE_URL: "https://locale.invalid", SUPABASE_SERVICE_ROLE_KEY: "service-locale",
  INTERNAL_WORKER_KEY: "worker-locale", APP_URL: "https://app.locale.invalid",
  PROACTIVE_CRON_SECRET: "cron-locale",
};
const installaDeno = (serve?: (handler: Handler) => void) =>
  vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] }, serve });
const rispostaJson = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
let gestore: Handler;
let db: DbMinimo;
let consegne: Riga[];
let sfondo: Promise<unknown>[];
let originali: Map<string, Blob>;
let lettureAccodate: string[];

function richiesta(percorso: string, body: Riga) {
  return new Request(env.SUPABASE_URL + "/functions/v1/" + percorso, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer service-locale", "x-internal-worker-key": "worker-locale" },
    body: JSON.stringify(body),
  });
}

async function registra(msg: Omit<IncomingWhatsAppMessage, "from">, file?: Blob) {
  const ingresso = { ...msg, from: mittente };
  await handleBotOperativo(db as unknown as ToolCtx["supabase"], {
    waNumber: linea, phoneNumberId: "123456", msg: ingresso, extracted: extractMessageContent(ingresso),
    senderPhone: mittente, senderName: "Andrea Demo",
  });
  const riga = db.tabelle.whatsapp_messages.at(-1)!;
  riga.id = randomUUID();
  riga.created_at = new Date().toISOString();
  if (file) {
    const estensione = msg.type === "audio" ? "ogg" : file.type === "application/pdf" ? "pdf" : "jpg";
    const path = [azienda, "2026-11", riga.id + "." + estensione].join("/");
    originali.set("whatsapp-media/" + path, file);
    riga.media_storage_path = path;
  }
  return riga;
}

async function elabora(riga: Riga, stato: "processed" | "failed" = "processed") {
  const r = await gestore(richiesta("whatsapp-ai-processor", { message_id: riga.id }));
  expect(await r.json()).toMatchObject({ ok: stato === "processed", status: stato });
  while (sfondo.length) await Promise.all(sfondo.splice(0));
}

function chiediConferma(azione: string, parametri: Riga) {
  return { model: "fixture-locale", choices: [{ message: {
    role: "assistant", content: null as string | null, tool_calls: [{
      id: "esempio-tool", type: "function", function: {
        name: "chiedi_conferma", arguments: JSON.stringify({ domanda: "Confermi?", azione, parametri }),
      },
    }],
  } }] };
}

beforeAll(async () => {
  installaDeno(handler => { gestore = handler; });
  const entrateEdge = import.meta.glob("../../../supabase/functions/{whatsapp-ai-processor,bot-routine-dispatch}/index.ts");
  await entrateEdge["../../../supabase/functions/whatsapp-ai-processor/index.ts"]();
  await entrateEdge["../../../supabase/functions/bot-routine-dispatch/index.ts"]();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
  installaDeno();
  vi.stubGlobal("crypto", webcrypto);
  db = new DbMinimo();
  m.db = db;
  for (const fn of [m.ai, m.router, m.transcribe, m.charge]) fn.mockReset();
  sfondo = [];
  consegne = [];
  originali = new Map();
  lettureAccodate = [];
  vi.stubGlobal("EdgeRuntime", { waitUntil: (p: Promise<unknown>) => sfondo.push(p) });
  const magazzinoFile = (bucket: string, path: string) => bucket + "/" + path;
  Object.assign(db, { storage: { from: (bucket: string) => ({
    download: async (path: string) => ({ data: originali.get(magazzinoFile(bucket, path)), error: null as null }),
    upload: async (path: string, data: Uint8Array | Blob, options: { contentType: string }) => {
      originali.set(magazzinoFile(bucket, path), new Blob([data instanceof Blob ? data : new Uint8Array(data)], { type: options.contentType }));
      return { data: { path }, error: null as null };
    },
  }) } });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/whatsapp-ai-processor")) {
      const evento = new Request(url, init);
      return evento.headers.has("x-cron-secret") ? new Response(null, { status: 202 }) : gestore(evento);
    }
    if (url.endsWith("/whatsapp-send")) {
      const body = JSON.parse(String(init?.body)) as Riga;
      consegne.push(body);
      const providerId = "wamid.risposta" + consegne.length;
      const origine = db.tabelle.whatsapp_messages?.find(r => r.id === body.reply_to_id && r.direction === "inbound");
      if (origine?.linked_record_type === "tickets") db.tabelle.whatsapp_messages.push({
        id: randomUUID(), wa_message_id: providerId, company_id: azienda, wa_number_id: linea.id, direction: "outbound",
        to_phone: mittente, linked_record_type: "tickets", linked_record_id: origine.linked_record_id, processing_status: "processed",
      });
      return rispostaJson({ success: true, meta_message_id: providerId });
    }
    if (url.endsWith("/ddt-documenti-processa")) {
      const id = JSON.parse(String(init?.body)).id;
      expect(db.tabelle.ddt_document_jobs.find(j => j.id === id)).toMatchObject({ status: "queued" });
      lettureAccodate.push(id);
      return new Response(null, { status: 202 });
    }
    throw new Error("Chiamata di rete inattesa nella prova locale: " + url);
  }));
  const operazioni = new Map<string, Riga>();
  db.rpcs.whatsapp_operation_claim = a => {
    const key = String(a.p_key);
    const old = operazioni.get(key);
    if (old) return { id: old.id, state: old.status, result: old.result };
    operazioni.set(key, { id: key, owner: a.p_owner, status: "running" });
    return { id: key, state: "claimed" };
  };
  db.rpcs.whatsapp_operation_finish = a => {
    const old = operazioni.get(String(a.p_id));
    if (!old || old.owner !== a.p_owner) return false;
    Object.assign(old, { status: a.p_status, result: a.p_result });
    return true;
  };
  db.rpcs.whatsapp_conversation_claim = () => true;
  db.rpcs.whatsapp_conversation_release = () => true;
  db.rpcs.ddt_whatsapp_memorizza_invio = ({ p_company, p_numero, p_mittente, p_invio }) => {
    const invio = p_invio as { id: string; origini: { id: string; duplicata: boolean }[]; daRimandare?: unknown[] };
    const origine = db.tabelle.whatsapp_messages.find(r => r.id === invio.id && r.company_id === p_company &&
      r.wa_number_id === p_numero && r.from_phone === p_mittente);
    if (!origine) return false;
    origine.ai_extracted_data = { ...(origine.ai_extracted_data as Riga | null), ddt_invio: JSON.parse(JSON.stringify(invio)) };
    db.tabelle.ddt_whatsapp_invii ??= [];
    const riepilogo = { id: invio.id, company_id: p_company, ricevuti: invio.origini.length,
      duplicati_identici: invio.origini.filter(o => o.duplicata).length, da_rimandare: invio.daRimandare?.length ?? 0 };
    const precedente = db.tabelle.ddt_whatsapp_invii.find(r => r.id === invio.id);
    if (precedente) Object.assign(precedente, riepilogo);
    else db.tabelle.ddt_whatsapp_invii.push(riepilogo);
    for (const bolla of db.tabelle.ddt_document_jobs ?? []) {
      if (bolla.company_id === p_company && !bolla.whatsapp_invio_id && invio.origini.some(o => o.id === bolla.source_key))
        bolla.whatsapp_invio_id = invio.id;
    }
    return true;
  };
  db.rpcs.ddt_ingresso_invii = ({ p_company, p_invio }) =>
    (db.tabelle.ddt_whatsapp_invii ?? []).filter(r => r.company_id === p_company && r.id === p_invio).map(r => {
      const bolle = (db.tabelle.ddt_document_jobs ?? []).filter(b => b.company_id === p_company && b.whatsapp_invio_id === r.id);
      return { ...r, in_lettura: bolle.filter(b => ["queued", "processing", "da_leggere"].includes(String(b.status))).length,
        da_controllare: bolle.filter(b => b.status === "review").length,
        da_riprovare: bolle.filter(b => b.status === "error").length,
        registrate: bolle.filter(b => b.status === "registered").length };
    });
  db.rpcs.whatsapp_contesto_rapportino = () => ({
    persone: [
      { employee_id: "dip-a", nome: "Andrea Demo", sono_io: true },
      { employee_id: "dip-m", nome: "Marco Demo", sono_io: false },
    ],
    solo_ore: false, solo_timbratura: false, giorni_indietro: 7,
  });
  db.tabelle.ai_whatsapp_numbers = [{ ...linea }];
  db.tabelle.employees = [
    { id: "dip-a", company_id: azienda, user_id: "utente-a", first_name: "Andrea", last_name: "Demo", phone_whatsapp: mittente, is_active: true },
    { id: "dip-m", company_id: azienda, user_id: "utente-m", first_name: "Marco", last_name: "Demo", phone_whatsapp: "+40 721 234 500", is_active: true },
  ];
  db.tabelle.profiles = [{ id: "utente-a", company_id: azienda, first_name: "Andrea", last_name: "Demo" }];
  db.tabelle.user_roles = [{ user_id: "utente-a", role: "employee" }];
  db.tabelle.whatsapp_sessions = [{ id: "sessione-a", company_id: azienda, phone_number: mittente, wa_number_id: linea.id, state_data: null }];
  db.tabelle.orders = [{ id: cantiere, company_id: azienda, order_code: "PROVA-SIMULA", description: "Prova Simula",
    status: "in_corso", indirizzo_lavori: "Via Demo 12", work_start_date: "2026-11-20" }];
  db.tabelle.order_campo_assignments = ["utente-a", "utente-m"].map(user_id => ({ company_id: azienda, order_id: cantiere, user_id }));
  db.tabelle.company_uffici = [{ id: acquisti, nome: "Acquisti", company_id: azienda, attivo: true }];
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Assistente WhatsApp locale sullo scenario di Demo Azienda 2", () => {
  it("chiede il cantiere per il ritardo del vocale e applica una volta le date confermate", async () => {
    db.tabelle.user_roles = [{ user_id: "utente-a", role: "company_admin" }];
    db.rpcs.silvio_context_actor_roles = () => ["company_admin"];
    db.rpcs.has_permission_for_company = ({ _user_id, _permission, _company_id }) =>
      _user_id === "utente-a" && _company_id === azienda && _permission === "can_edit_orders";
    db.tabelle.orders.push({ ...db.tabelle.orders[0], id: randomUUID(), order_code: "SECONDO", description: "Secondo cantiere" });
    db.rpcs.cronoprogramma_ritardo_whatsapp = ({ p_azienda, p_utente, p_commessa, p_proposta }) => {
      expect([p_azienda, p_utente, p_commessa]).toEqual([azienda, "utente-a", cantiere]);
      if (p_proposta) {
        expect(p_proposta).toEqual({ versione: "prima", fine: "2026-11-27", fasi: [
          { id: "posa", inizio: "2026-11-16", fine: "2026-11-25" },
          { id: "finiture", inizio: "2026-11-26", fine: "2026-11-27" },
        ], sottofasi: [] });
        return { ok: true, fine: "2026-11-27", fasi: 2, sottofasi: 0 };
      }
      return { versione: "prima", commessa: { titolo: "PROVA-SIMULA", fine: "2026-11-24" }, fasi: [
        { id: "posa", nome: "Posa serramenti", inizio: "2026-11-16", fine: "2026-11-20", stato: "in_corso", percentuale: 40 },
        { id: "finiture", nome: "Finiture", inizio: "2026-11-23", fine: "2026-11-24", stato: "da_iniziare", percentuale: 0 },
      ], sottofasi: [] };
    };
    m.transcribe.mockResolvedValueOnce({ testo: "Finiamo la fase Posa serramenti con tre giorni di ritardo.", lingua: "italian", durata: 5 });
    const vocale = await registra({ id: "wamid.ritardo-cantiere", type: "audio", audio: { id: "510900" } }, new Blob(["ritardo"]));
    await elabora(vocale);
    const domanda = consegne.at(-1)?.interactive as InteractivePayload;
    expect(domanda.body.text).toContain("Su quale cantiere sposto le date di 3 giorni lavorativi?");
    await elabora(await registra({ id: "wamid.ritardo-scelta", type: "text", text: { body: "PROVA-SIMULA" } }));
    const anteprima = consegne.at(-1)?.interactive as InteractivePayload;
    expect(anteprima.body.text).toContain("24/11/2026 → 27/11/2026");
    expect(anteprima.body.text).toContain("Posa serramenti. Fine 20/11/2026 → 25/11/2026");
    expect(db.rpcChiamate.filter(r => r.nome === "cronoprogramma_ritardo_whatsapp" && r.args.p_proposta)).toHaveLength(0);
    if (anteprima.type !== "button") throw new Error("Atteso bottone di conferma");
    const button_reply = anteprima.action.buttons[0].reply;
    await elabora(await registra({ id: "wamid.ritardo-conferma", type: "interactive", interactive: { button_reply } }));
    expect(consegne.at(-1)?.text).toContain("Fine lavori prevista 27/11/2026");
    expect(consegne.at(-1)?.text).toContain("vista_cantiere=cronoprogramma");
    await elabora(await registra({ id: "wamid.ritardo-conferma-due", type: "interactive", interactive: { button_reply } }));
    expect(db.rpcChiamate.filter(r => r.nome === "cronoprogramma_ritardo_whatsapp" && r.args.p_proposta)).toHaveLength(1);
    expect(m.ai).not.toHaveBeenCalled();
  });

  it("chiede il profilo autorizzato quando dal campo arriva un ritardo", async () => {
    const ritardo = await registra({ id: "wamid.ritardo-solo-campo", type: "text",
      text: { body: "Finiamo in ritardo di 3 giorni al cantiere PROVA-SIMULA" } });
    await elabora(ritardo);
    expect(consegne.at(-1)?.text).toContain("serve un profilo abilitato");
    expect(db.rpcChiamate.some(r => r.nome === "cronoprogramma_ritardo_whatsapp")).toBe(false);
    expect(m.ai).not.toHaveBeenCalled();
  });

  it.each(["invio lento", "rifiuto Meta"])("mostra la scrittura durante il vocale e risponde anche con %s", async (esitoMeta) => {
    Object.assign(db.tabelle.ai_whatsapp_numbers[0], {
      phone_number_id: "123456", access_token_encrypted: "token-fittizio",
    });
    db.rpcs.resolve_company_feature = () => ({ is_enabled: true });
    const fetchLocale = fetch;
    let notificaAvvio!: (init: RequestInit) => void;
    const avvioIndicatore = new Promise<RequestInit>(resolve => { notificaAvvio = resolve; });
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://graph.facebook.com/v25.0/123456/messages") {
        notificaAvvio(init!);
        if (esitoMeta === "rifiuto Meta") return new Response(null, { status: 429 });
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
        });
      }
      return fetchLocale(url, init);
    });
    vi.stubGlobal("fetch", fetcher);

    m.transcribe.mockImplementationOnce(async () => {
      await avvioIndicatore;
      return { testo: "Rapportino di oggi a PROVA-SIMULA. Ho montato 3 porte.", lingua: "italian" };
    });
    m.ai.mockResolvedValueOnce(chiediConferma("crea_rapportino", {
      cantiere_hint: "PROVA-SIMULA", attivita: ["Montate 3 porte"],
    }));
    const vocale = await registra({ id: "wamid.vocale-indicatore", type: "audio", audio: { id: "345682", voice: true } }, new Blob(["vocale demo"]));
    await elabora(vocale);

    const indicatore = await avvioIndicatore;
    expect(JSON.parse(String(indicatore.body))).toEqual({
      messaging_product: "whatsapp", status: "read", message_id: "wamid.vocale-indicatore", typing_indicator: { type: "text" },
    });
    expect(indicatore.signal?.aborted).toBe(true);
    expect(consegne).toEqual([expect.objectContaining({
      interactive: expect.objectContaining({ body: { text: expect.stringContaining("Montate 3 porte") } }),
    })]);

    const duplicato = await gestore(richiesta("whatsapp-ai-processor", { message_id: vocale.id }));
    expect(await duplicato.json()).toMatchObject({ skip: "already_processed" });
    expect(fetcher.mock.calls.filter(([url]) => String(url).startsWith("https://graph.facebook.com/"))).toHaveLength(1);
  });

  it("accoda la lettura e consente al vocale di destinare la stessa bolla prima dell'OCR", async () => {
    const foto = await registra({ id: "wamid.foto-demo", type: "image", image: { id: "234567" } },
      new Blob([new Uint8Array([255, 216, 255, 1])], { type: "image/jpeg" }));
    vi.setSystemTime(new Date("2026-11-20T10:00:07Z"));
    const vocale = await registra({ id: "wamid.voce-demo", type: "audio", audio: { id: "345678", voice: true } }, new Blob(["vocale demo"]));
    m.ai.mockResolvedValue({ choices: [{ message: { content: "DDT\nBolla di prova" } }] });
    m.transcribe.mockResolvedValue({ testo: "Carica questa bolla in prova simula.", lingua: "italian", durata: 7 });
    await elabora(foto);
    expect(consegne).toEqual([expect.objectContaining({ text: expect.stringContaining("Prova Simula") })]);
    expect(db.tabelle.ddt_document_jobs).toEqual([expect.objectContaining({
      source_key: foto.id, order_id: cantiere, destinazione: "cantiere", status: "queued", whatsapp_voice_message_id: vocale.id,
      files: [expect.objectContaining({ bucket: "ddt-documenti" })],
    })]);
    expect([...originali.keys()].filter(path => path.startsWith("ddt-documenti/"))).toHaveLength(1);
    expect(vocale.processing_status).toBe("processed");
    expect(m.charge).toHaveBeenCalledTimes(1);
    expect(lettureAccodate).toEqual([db.tabelle.ddt_document_jobs[0].id]);
    expect(m.router).not.toHaveBeenCalled();
    const fotoMonitor = db.tabelle.ai_attivita_live.find(r => r.flusso === "whatsapp");
    expect(fotoMonitor).toMatchObject({
      attore: "Andrea Demo", stato: "completata", fase: "destinazione_ddt", bolla_id: db.tabelle.ddt_document_jobs[0].id,
      passaggi: expect.arrayContaining([
        expect.objectContaining({ fase: "allegato_salvato" }),
        expect.objectContaining({ fase: "bolla_accodata" }),
      ]),
    });
    expect(db.tabelle.ai_attivita_live).toContainEqual(expect.objectContaining({
      stato: "completata", fase: "risposta_inviata", bolla_id: db.tabelle.ddt_document_jobs[0].id,
      passaggi: expect.arrayContaining([
        expect.objectContaining({ fase: "trascrizione", durata_ms: expect.any(Number) }),
        expect.objectContaining({ fase: "vocale_ricevuto" }),
        expect.objectContaining({ fase: "invio_risposta", durata_ms: expect.any(Number) }),
      ]),
    }));
    expect(JSON.stringify(fotoMonitor)).not.toContain(mittente);
    expect(JSON.stringify(fotoMonitor)).not.toContain("Prova Simula");
  });

  it("mette in cima il cantiere della timbratura e raggiunge il ventesimo senza superare dieci opzioni", async () => {
    const altri = Array.from({ length: 19 }, (_, i) => ({
      id: randomUUID(), company_id: azienda, order_code: "DEMO-" + (i + 1), status: "in_corso",
      description: "Cantiere " + (i + 1), work_start_date: "2026-11-20",
    }));
    db.tabelle.orders.push(...altri);
    db.tabelle.order_campo_assignments.push(...altri.map(o => ({ company_id: azienda, user_id: "utente-a", order_id: o.id })));
    db.tabelle.campo_timbrature = [{ company_id: azienda, user_id: "utente-a", order_id: cantiere, timestamp_evento: "2026-11-20T08:00:00Z" }];
    const foto = await registra({ id: "wamid.foto-20", type: "image", image: { id: "234568", caption: "Bolla di prova" } },
      new Blob([new Uint8Array([255, 216, 255, 1])], { type: "image/jpeg" }));
    m.router.mockResolvedValue({ content: JSON.stringify({ document_type: "ddt", ddt_number: "DDT-20", supplier_name: "Demo",
      items: [{ description: "Tubi", quantity: 12, unit: "m" }] }) });
    await elabora(foto);
    const proposta = consegne[0].interactive as InteractivePayload;
    if (proposta.type !== "list") throw new Error("Attesa la lista nel primo messaggio");
    expect(proposta.body.text).toContain("Bolla salvata");
    expect(proposta.body.text).toMatch(/Cantiere suggerito.*PROVA-SIMULA/);
    expect(proposta.action.button).toBe("Scegli destinazione");
    expect(proposta.action.sections[0].rows[0].id).toBe(`ddt:cantiere:${foto.id}:${cantiere}`);
    const tap = (id: string, scelta: { id: string; title: string }) => registra({
      id, type: "interactive", interactive: { list_reply: scelta },
    });
    const ids = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const pagina = consegne[i].interactive as InteractivePayload;
      if (pagina.type !== "list") throw new Error("Lista attesa");
      if (i > 0) expect(pagina.body.text).not.toMatch(/salvata|conservata/i);
      const rows = pagina.action.sections[0].rows;
      expect(rows.length).toBeLessThanOrEqual(10);
      expect(rows).toContainEqual({ id: `ddt:depositi:${foto.id}:0`, title: "Magazzino" });
      rows.filter(r => r.id.startsWith("ddt:cantiere:")).forEach(r => ids.add(r.id));
      const avanti = rows.find(r => r.title === "Altri risultati");
      if (avanti) await elabora(await tap("wamid.menu-" + i, avanti));
    }
    expect(ids.size).toBe(20);
    const ultima = [...ids].at(-1)!;
    await elabora(await tap("wamid.destinazione", { id: ultima, title: "Cantiere scelto" }));
    expect(db.tabelle.ddt_document_jobs).toEqual([expect.objectContaining({
      status: "queued", source_key: foto.id, order_id: ultima.split(":").at(-1), destinazione: "cantiere",
    })]);
    expect(consegne.at(-1)?.text).toMatch(/Bolla collegata al cantiere/);
    expect(m.ai).not.toHaveBeenCalled();
  });

  it("conserva 20 bolle e collega lo stesso vocale con una sola risposta", async () => {
    const foto = [];
    for (let i = 0; i < 20; i++) {
      const messaggio = await registra({ id: `wamid.invio-${i}`, type: "image", image: { id: String(123450 + i),
        ...(i === 0 ? { caption: "Bolla di prova" } : {}) } },
        new Blob([new Uint8Array([255, 216, 255, i])], { type: "image/jpeg" }));
      messaggio.created_at = new Date(Date.now() - 2000 + i * 10).toISOString();
      foto.push(messaggio);
    }
    m.ai.mockResolvedValue({ choices: [{ message: { content: "DDT\nForniture Demo" } }] });
    m.transcribe.mockResolvedValueOnce({ testo: "Tutte per PROVA-SIMULA.", lingua: "italian", durata: 3 });
    const vocale = await registra({ id: "wamid.invio-voce", type: "audio", audio: { id: "234580", voice: true } },
      new Blob(["vocale di prova"]));

    await elabora(foto[0]);
    expect(consegne).toHaveLength(1);
    expect(consegne[0].text).toBe("20 bolle per PROVA-SIMULA in DDT → Documenti in ingresso.");
    expect(db.tabelle.ddt_document_jobs).toHaveLength(20);
    expect(db.tabelle.ddt_document_jobs).toEqual(expect.arrayContaining(foto.map(f => expect.objectContaining({
      source_key: f.id, order_id: cantiere, destinazione: "cantiere", whatsapp_voice_message_id: vocale.id,
    }))));
    expect(foto.every(f => f.processing_status === "processed")).toBe(true);
    expect(m.transcribe).toHaveBeenCalledTimes(1);
  });

  it("in Demo Azienda 2 recupera 18 foto ricevute dopo il vocale a causa della rete lenta", async () => {
    const adesso = Date.now();
    const primaSpedizione = adesso - 60_000;
    m.ai.mockResolvedValue({ choices: [{ message: { content: "DDT\nForniture Demo" } }] });
    async function fotoSpedita(i: number, secondiSpedizione: number = i * 2) {
      const f = await registra({ id: `wamid.ritardo-${i}`, timestamp: String((primaSpedizione + secondiSpedizione * 1000) / 1000),
        type: "image", image: { id: String(345678 + i) } },
        new Blob([new Uint8Array([255, 216, 255, i])], { type: "image/jpeg" }));
      return f;
    }
    const prima = await fotoSpedita(0, 6);
    prima.created_at = new Date(adesso - 2000).toISOString();
    const seconda = await fotoSpedita(1, 7);
    seconda.created_at = new Date(adesso - 1000).toISOString();
    m.transcribe.mockResolvedValueOnce({ testo: "Cantiere PROVA-SIMULA", lingua: "italian", durata: 3 });
    const vocale = await registra({ id: "wamid.ritardo-voce", timestamp: String((primaSpedizione + 55_000) / 1000),
      type: "audio", audio: { id: "345699", voice: true } }, new Blob(["tutte per Prova Simula"]));
    await elabora(prima);
    expect(consegne).toHaveLength(1);
    expect(consegne[0].text).toContain("2 bolle per PROVA-SIMULA");

    for (let i = 2; i < 20; i++) {
      vi.setSystemTime(adesso + (i - 1) * 15_000);
      await elabora(await fotoSpedita(i, i === 2 ? 0 : i * 2));
    }
    expect(db.tabelle.ddt_document_jobs).toHaveLength(20);
    expect(db.tabelle.ddt_document_jobs.every(b => b.order_id === cantiere && b.whatsapp_voice_message_id === vocale.id &&
      b.whatsapp_invio_id === prima.id)).toBe(true);
    expect(db.tabelle.ddt_whatsapp_invii).toEqual([expect.objectContaining({ id: prima.id, ricevuti: 20, da_rimandare: 0 })]);
    expect(consegne).toHaveLength(1);
    expect(m.transcribe).toHaveBeenCalledTimes(1);

    vi.setSystemTime(adesso + 300_000);
    const successiva = await fotoSpedita(20, 360);
    await elabora(successiva);
    expect(db.tabelle.ddt_document_jobs.find(b => b.source_key === successiva.id)).toMatchObject({
      whatsapp_invio_id: successiva.id, order_id: null,
    });
    expect(consegne).toHaveLength(2);
    const chiamateAi = m.ai.mock.calls.length;
    db.tabelle.ddt_document_jobs.find(b => b.source_key === prima.id)!.status = "registered";
    db.tabelle.ddt_document_jobs.find(b => b.source_key === seconda.id)!.status = "review";
    await elabora(await registra({ id: "wamid.stato-invio", type: "text", context: { id: String(seconda.wa_message_id) },
      text: { body: "Quante bolle sono arrivate?" } }));
    expect(consegne.at(-1)?.text).toContain("20 allegati ricevuti");
    expect(consegne.at(-1)?.text).toContain("18 bolle in lettura");
    expect(consegne.at(-1)?.text).toContain("1 bolla da controllare");
    expect(consegne.at(-1)?.text).toContain("1 bolla registrata");
    expect(consegne.at(-1)?.text).toContain(`ddt_invio=${prima.id}`);
    await elabora(await registra({ id: "wamid.stato-ultimo", type: "text", text: { body: "Le mie bolle" } }));
    expect(consegne.at(-1)?.text).toContain(`ddt_invio=${successiva.id}`);
    expect(m.ai).toHaveBeenCalledTimes(chiamateAi);
  });

  it("limita lo stato delle bolle al mittente e alla linea", async () => {
    for (const [i, extra] of [{ from_phone: "393331234501" }, { wa_number_id: "linea-diversa" }, { company_id: "azienda-diversa" }].entries()) {
      db.tabelle.whatsapp_messages ??= [];
      db.tabelle.whatsapp_messages.push({ company_id: azienda, from_phone: mittente, wa_number_id: linea.id,
        direction: "inbound", id: randomUUID(), ai_extracted_data: { ddt_invio: { origini: [{ provider: "wamid.altra-" + i }] } }, ...extra });
    }
    await elabora(await registra({ id: "wamid.stato-privato", type: "text", context: { id: "wamid.altra-0" }, text: { body: "Stato bolle" } }));
    expect(consegne.at(-1)?.text).toContain("Non trovo un invio per questa foto nella tua chat");
    await elabora(await registra({ id: "wamid.stato-linea", type: "text", text: { body: "Le mie bolle" } }));
    expect(consegne.at(-1)?.text).toContain("Non trovo invii raggruppati");
    expect(db.rpcChiamate.some(r => r.nome === "ddt_ingresso_invii")).toBe(false);
    expect(m.ai).not.toHaveBeenCalled();
  });

  it("mostra un menu per l’invio, esclude il duplicato e rispetta la destinazione scritta sulla singola foto", async () => {
    const secondo = randomUUID();
    db.tabelle.orders.push({ id: secondo, company_id: azienda, order_code: "SECONDO", description: "Secondo cantiere",
      status: "in_corso", work_start_date: "2026-11-20" });
    db.tabelle.order_campo_assignments.push({ company_id: azienda, order_id: secondo, user_id: "utente-a" });
    const foto: Awaited<ReturnType<typeof registra>>[] = [];
    for (const [i, byte] of [1, 2, 3, 4, 1].entries()) {
      const f = await registra({ id: `wamid.gruppo-${i}`, type: "image", image: { id: String(234580 + i), caption: "Bolla" } },
        new Blob([new Uint8Array([255, 216, 255, byte])], { type: "image/jpeg" }));
      f.created_at = new Date(Date.now() - 1000 + i * 10).toISOString();
      foto.push(f);
    }
    await elabora(foto[0]);
    expect(consegne).toHaveLength(1);
    const menu = consegne[0].interactive as InteractivePayload;
    if (menu.type !== "list") throw new Error("Lista cantieri attesa");
    expect(menu.body.text).toContain("Ho salvato 4 bolle");
    expect(db.tabelle.ddt_document_jobs).toHaveLength(4);
    db.tabelle.purchase_orders = [{ id: "oda", company_id: azienda, order_id: secondo, oda_number: "ODA-42", status: "inviato" }];
    db.tabelle.ddt_document_jobs.find(d => d.source_key === foto[2].id)!.result = { riferimenti: { ordine_acquisto: "ODA-42" } };
    await elabora(await registra({ id: "wamid.gruppo-eccezione", type: "text", context: { id: "wamid.gruppo-1" },
      text: { body: "Cantiere SECONDO" } }));
    const sito = menu.action.sections[0].rows.find(r => r.id === `ddt-invio:cantiere:${foto[0].id}:${cantiere}`)!;
    await elabora(await registra({ id: "wamid.gruppo-sito", type: "interactive", interactive: { list_reply: sito } }));
    expect(db.tabelle.ddt_document_jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_key: foto[0].id, order_id: cantiere }),
      expect.objectContaining({ source_key: foto[1].id, order_id: secondo }),
      expect.objectContaining({ source_key: foto[3].id, order_id: cantiere }),
    ]));
    expect(db.tabelle.ddt_document_jobs.find(d => d.source_key === foto[2].id)?.order_id).toBeNull();
    expect(consegne.at(-1)?.text).toContain("2 bolle per PROVA-SIMULA");
    expect(consegne.at(-1)?.text).toContain("1 bolla da verificare");
    expect(consegne.at(-1)?.text).toContain("1 bolla già in archivio");
  });

  it("tiene separati due invii aperti e permette di destinare quello citato", async () => {
    const invii = [];
    for (let gruppo = 0; gruppo < 2; gruppo++) {
      const foto = [];
      for (let i = 0; i < 2; i++) {
        const f = await registra({ id: `wamid.distinto-${gruppo}-${i}`, type: "image",
          image: { id: String(234590 + gruppo * 2 + i), caption: "Bolla" } },
          new Blob([new Uint8Array([255, 216, 255, gruppo * 2 + i])], { type: "image/jpeg" }));
        f.created_at = new Date(Date.now() - 20_000 + gruppo * 10_000 + i * 10).toISOString();
        foto.push(f);
      }
      await elabora(foto[0]);
      invii.push(foto);
    }
    await elabora(await registra({ id: "wamid.distinti-tutte", type: "text", text: { body: "Tutte per PROVA-SIMULA" } }));
    expect(consegne.at(-1)?.text).toContain("Ho più invii da destinare");
    expect(db.tabelle.ddt_document_jobs.every(d => !d.order_id)).toBe(true);
    await elabora(await registra({ id: "wamid.distinti-citazione", type: "text", context: { id: "wamid.distinto-1-0" },
      text: { body: "Tutte per PROVA-SIMULA" } }));
    const assegnate = db.tabelle.ddt_document_jobs.filter(d => d.order_id === cantiere).map(d => d.source_key);
    expect(assegnate).toEqual(expect.arrayContaining(invii[1].map(r => r.id)));
    expect(assegnate).toHaveLength(2);
  });

  it("conserva le bolle arrivate e cita soltanto l’allegato da rimandare", async () => {
    const foto = [];
    for (let i = 0; i < 3; i++) {
      const f = await registra({ id: `wamid.incompleto-${i}`, type: "image",
        image: { id: String(234599 + i), caption: "Bolla" } },
        i < 2 ? new Blob([new Uint8Array([255, 216, 255, i])], { type: "image/jpeg" }) : undefined);
      f.created_at = new Date(Date.now() - 2000 + i * 10).toISOString();
      foto.push(f);
    }
    await elabora(foto[0]);
    expect(db.tabelle.ddt_document_jobs).toHaveLength(2);
    expect(consegne).toHaveLength(2);
    expect(consegne[0].interactive).toMatchObject({ body: { text: expect.stringContaining("Ho salvato 2 bolle") } });
    expect(consegne[1]).toMatchObject({ text: expect.stringContaining("Rimanda solo questo file"), reply_to_id: foto[2].id });
    expect(foto[2].processing_status).toBe("failed");
  });

  it.each([
    ["romanian", "Astăzi la PROVA-SIMULA eu am lucrat 8 ore și Marco 4 ore. Am montat 3 uși."],
    ["polish", "Dziś w PROVA-SIMULA pracowałem 8 godzin, a Marco 4 godziny. Zamontowaliśmy 3 drzwi."],
  ])("traduce il rapportino (%s), mostra le ore individuali e registra solo dopo il Sì", async (lingua, originale) => {
    const messaggio = await registra({ id: "wamid.rapportino-demo", type: "audio", audio: { id: "345679", voice: true } }, new Blob(["vocale demo"]));
    const italiano = "Oggi a PROVA-SIMULA io ho lavorato 8 ore e Marco 4 ore. Abbiamo montato 3 porte.";
    m.transcribe.mockResolvedValue({ testo: originale, lingua, durata: 11 });
    m.router.mockResolvedValue({ content: JSON.stringify({ testo_italiano: italiano }) });
    m.ai.mockResolvedValue(chiediConferma("crea_rapportino", { cantiere_hint: "PROVA-SIMULA", attivita: ["Montate 3 porte"],
      persone: [{ nome: "io", ore: 8 }, { nome: "Marco", ore: 4 }] }));
    await elabora(messaggio);
    expect(messaggio.ai_extracted_data).toMatchObject({ lingua_audio: lingua, trascrizione_originale: originale, trascrizione_italiana: italiano });
    const domanda = consegne[0].interactive;
    expect(domanda).toMatchObject({ body: { text: expect.stringMatching(/Andrea Demo.*8 h[\s\S]*Marco Demo.*4 h/) } });
    expect(db.tabelle.campo_rapportini ?? []).toHaveLength(0);
    const conferma = await registra({ id: "wamid.rapportino-si", type: "text", text: { body: "Sì" } });
    await elabora(conferma);
    expect(db.tabelle.campo_rapportini).toEqual([expect.objectContaining({
      order_id: cantiere, whatsapp_message_id: messaggio.id, stato: "inviato", descrizione_lavori: "Montate 3 porte",
      presenze: [expect.objectContaining({ employee_id: "dip-a", ore: 8 }), expect.objectContaining({ employee_id: "dip-m", ore: 4 })],
    })]);
    expect(m.ai).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("corregge un rapportino già salvato dal vocale, bozza cambiata in app: %s", async modificataInApp => {
    m.transcribe.mockResolvedValueOnce({ testo: "Oggi a PROVA-SIMULA. Io ho fatto 8 ore. Marco ha fatto 4 ore. Abbiamo montato tre porte.",
      lingua: "italian", durata: 9 });
    m.ai.mockResolvedValueOnce(chiediConferma("crea_rapportino", { cantiere_hint: "PROVA-SIMULA", data_lavoro: "oggi",
      attivita: ["Montate tre porte"], persone: [{ nome: "io", ore: 8 }, { nome: "Marco", ore: 4 }] }));
    const vocale = await registra({ id: "wamid.squadra-originale", type: "audio", audio: { id: "345680" } }, new Blob(["vocale"]));
    await elabora(vocale);
    const prima = consegne.at(-1)?.interactive as InteractivePayload;
    expect(prima.body.text).toContain("Bozza salvata in Campo");
    const bozza = db.tabelle.campo_rapportini[0];
    const bozzaId = bozza.id;
    await elabora(await registra({ id: "wamid.correzione-ore", type: "text", text: { body: "Marco Demo 7,5 ore" } }));
    const corretta = consegne.at(-1)?.interactive as InteractivePayload;
    expect(corretta.body.text).toMatch(/15,5 h[\s\S]*Andrea Demo.*8 h[\s\S]*Marco Demo.*7,5 h/);
    if (prima.type !== "button" || corretta.type !== "button") throw new Error("Atteso bottone rapportino");
    await elabora(await registra({ id: "wamid.squadra-si-vecchio", type: "interactive", interactive: { button_reply: prima.action.buttons[0].reply } }));
    expect(consegne.at(-1)?.text).toContain("domanda precedente");
    expect(bozza.stato).toBe("bozza");
    if (modificataInApp) ((bozza.presenze as Riga[])[1]).ore = 5;
    await elabora(await registra({ id: "wamid.squadra-si-corretto", type: "interactive", interactive: { button_reply: corretta.action.buttons[0].reply } }),
      modificataInApp ? "failed" : "processed");
    expect(db.tabelle.campo_rapportini).toEqual([expect.objectContaining({
      id: bozzaId, stato: modificataInApp ? "bozza" : "inviato", whatsapp_message_id: vocale.id,
      descrizione_lavori: "Montate tre porte", presenze: [
        expect.objectContaining({ employee_id: "dip-a", ore: 8 }),
        expect.objectContaining({ employee_id: "dip-m", ore: modificataInApp ? 5 : 7.5 }),
      ],
    })]);
    if (modificataInApp) expect(consegne.at(-1)?.text).toContain("sono cambiate nel gestionale");
    expect(m.ai).toHaveBeenCalledOnce();
  });

  it.each(["cognome", "pulsante", "vocale"])("chiarisce quale Marco con %s e conserva le ore del vocale", async (modalita) => {
    const squadra = [
      { employee_id: "dip-m", nome: "Marco Demo" },
      { employee_id: "dip-v", nome: "Marco Verdi" },
      { employee_id: "dip-f", nome: "Francesco Blu" },
      { employee_id: "dip-va", nome: "Valerio Rossi" },
    ];
    db.rpcs.whatsapp_contesto_rapportino = ({ p_order, p_day }) => {
      expect(p_order).toBe(cantiere);
      expect(p_day).toBe("2026-11-20");
      return { persone: squadra, solo_ore: false, solo_timbratura: false, giorni_indietro: 7 };
    };
    m.transcribe.mockResolvedValueOnce({
      testo: "Oggi a PROVA-SIMULA Marco 8 ore, Francesco 6 ore, Valerio 4 ore. Abbiamo montato 3 porte.",
      lingua: "italian", durata: 11,
    });
    m.ai.mockResolvedValueOnce(chiediConferma("crea_rapportino", {
      cantiere_hint: "PROVA-SIMULA", attivita: ["Montate 3 porte"], note: "Manca la quarta porta",
      persone: [{ nome: "Marco", ore: 8 }, { nome: "Francesco", ore: 6 }, { nome: "Valerio", ore: 4 }],
    }));
    const vocale = await registra({ id: "wamid.squadra-vocale", type: "audio", audio: { id: "345680", voice: true } }, new Blob(["vocale demo"]));
    await elabora(vocale);

    const scelta = consegne[0].interactive as InteractivePayload;
    expect(scelta.body.text).toContain("Quale Marco ha lavorato 8 ore?");
    expect(scelta.body.text).toContain("Marco Demo");
    expect(scelta.body.text).toContain("Marco Verdi");
    if (scelta.type !== "button") throw new Error("Attesi due nomi e Annulla");
    const verdi = scelta.action.buttons.find(b => b.reply.title.includes("Marco Verdi"))!.reply;
    expect(db.tabelle.campo_rapportini ?? []).toHaveLength(0);

    await elabora(await registra({ id: "wamid.squadra-si-prematuro", type: "text", text: { body: "Sì" } }));
    expect(consegne[1].interactive).toEqual(scelta);
    expect(db.tabelle.campo_rapportini ?? []).toHaveLength(0);

    if (modalita === "cognome") {
      await elabora(await registra({ id: "wamid.squadra-cognome", type: "text", text: { body: "Verdi" } }));
    } else if (modalita === "pulsante") {
      await elabora(await registra({ id: "wamid.squadra-pulsante", type: "interactive", interactive: { button_reply: verdi } }));
    } else {
      m.transcribe.mockResolvedValueOnce({ testo: "Marco Verdi.", lingua: "italian", durata: 3 });
      await elabora(await registra({ id: "wamid.squadra-risposta-voce", type: "audio", audio: { id: "345681", voice: true } }, new Blob(["secondo vocale"])));
    }
    const riepilogo = consegne[2].interactive as InteractivePayload;
    expect(riepilogo.body.text).toMatch(/Marco Verdi.*8 h[\s\S]*Francesco Blu.*6 h[\s\S]*Valerio Rossi.*4 h/);
    expect(riepilogo.body.text).toContain("Montate 3 porte");
    expect(riepilogo.body.text).toContain("Vocale allegato");
    expect(db.tabelle.campo_rapportini ?? []).toHaveLength(0);

    await elabora(await registra({ id: "wamid.squadra-scelta-scaduta", type: "interactive", interactive: { button_reply: verdi } }));
    expect(consegne[3].text).toContain("domanda precedente");
    expect(db.tabelle.campo_rapportini ?? []).toHaveLength(0);

    await elabora(await registra({ id: "wamid.squadra-si-finale", type: "text", text: { body: "Sì" } }));
    expect(db.tabelle.campo_rapportini).toEqual([expect.objectContaining({
      order_id: cantiere, data_lavoro: "2026-11-20", whatsapp_message_id: vocale.id, stato: "inviato",
      descrizione_lavori: "Montate 3 porte", note: "Manca la quarta porta",
      presenze: [
        { employee_id: "dip-v", nome: "Marco Verdi", ore: 8 },
        { employee_id: "dip-f", nome: "Francesco Blu", ore: 6 },
        { employee_id: "dip-va", nome: "Valerio Rossi", ore: 4 },
      ],
    })]);
    expect(m.ai).toHaveBeenCalledTimes(1);
  });

  it("dopo la scelta del cantiere chiede una conferma separata con le persone esatte", async () => {
    const altro = "00000000-0000-4000-8000-000000000023";
    db.tabelle.orders.push({ id: altro, company_id: azienda, order_code: "SECONDO", description: "Secondo cantiere",
      status: "in_corso", work_start_date: "2026-11-20" });
    db.tabelle.order_campo_assignments.push({ company_id: azienda, order_id: altro, user_id: "utente-a" });
    db.rpcs.whatsapp_contesto_rapportino = ({ p_order }) => ({
      persone: [{ employee_id: "dip-m", nome: "Marco " + (p_order === altro ? "Verdi" : "Demo") }],
      solo_ore: false, solo_timbratura: false, giorni_indietro: 7,
    });
    m.ai.mockResolvedValueOnce(chiediConferma("crea_rapportino", { persone: [{ nome: "Marco", ore: 8 }] }));
    const messaggio = await registra({ id: "wamid.squadra-senza-cantiere", type: "text", text: { body: "Rapportino di oggi: Marco 8 ore" } });
    await elabora(messaggio);
    const scelta = consegne[0].interactive as InteractivePayload;
    expect(scelta.body.text).toContain("Poi ti mostro il riepilogo da confermare.");
    if (scelta.type !== "button") throw new Error("Attesi due cantieri e Annulla");
    const destinazione = scelta.action.buttons.find(b => b.reply.title === "Secondo cantiere")!.reply;
    await elabora(await registra({ id: "wamid.squadra-cantiere", type: "interactive", interactive: { button_reply: destinazione } }));
    expect(consegne[1].interactive).toMatchObject({ body: { text: expect.stringMatching(/Marco Verdi.*8 h[\s\S]*Cantiere: SECONDO/) } });
    expect(db.tabelle.campo_rapportini ?? []).toHaveLength(0);
    await elabora(await registra({ id: "wamid.squadra-cantiere-si", type: "text", text: { body: "Sì" } }));
    expect(db.tabelle.campo_rapportini).toEqual([expect.objectContaining({
      order_id: altro, whatsapp_message_id: messaggio.id, stato: "inviato",
      presenze: [{ employee_id: "dip-m", nome: "Marco Verdi", ore: 8 }],
    })]);
    expect(m.ai).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("ricapitola il vocale personale in rumeno prima di inviarlo (cantiere dettato: %s)", async (conCantiere) => {
    const altro = randomUUID();
    Object.assign(db.tabelle.orders[0], {
      order_code: "SIM-S1", description: "SIMULAZIONE S1 — 8 operai in economia + trasporto",
    });
    db.tabelle.orders.push({ id: altro, company_id: azienda, order_code: "SECONDO", description: "Secondo cantiere",
      status: "in_corso", work_start_date: "2026-11-20" });
    db.tabelle.order_campo_assignments.push({ company_id: azienda, order_id: altro, user_id: "utente-a" });
    const originale = `Astăzi am lucrat 8 ore${conCantiere ? " pe șantierul SECONDO" : ""}. Am montat două ferestre la primul etaj.`;
    const italiano = `Oggi ho lavorato 8 ore${conCantiere ? " nel cantiere SECONDO" : ""}. Ho montato due finestre al primo piano.`;
    m.transcribe.mockResolvedValueOnce({ testo: originale, lingua: "romanian", durata: 8 });
    m.router.mockResolvedValueOnce({ content: JSON.stringify({ testo_italiano: italiano }) });
    m.ai.mockResolvedValueOnce(chiediConferma("crea_rapportino", {
      ore_lavorate: 8, attivita: ["Montaggio due finestre al primo piano"],
      ...(conCantiere ? { cantiere_hint: "SECONDO" } : {}),
    }));
    const vocale = await registra({ id: "wamid.rapportino-personale", type: "audio", audio: { id: "345690", voice: true } },
      new Blob(["vocale demo"]));
    await elabora(vocale);
    expect(vocale.ai_extracted_data).toMatchObject({ trascrizione_italiana: italiano, lingua_audio: "romanian" });
    expect(originali.has("whatsapp-media/" + vocale.media_storage_path)).toBe(true);
    expect(db.tabelle.campo_rapportini ?? []).toHaveLength(0);

    const scelta = consegne[0].interactive as InteractivePayload;
    if (conCantiere) {
      expect(scelta.type).toBe("list");
      expect(scelta.body.text).toContain("Cantiere: SECONDO");
    } else {
      expect(scelta.body.text).toContain("Poi ti mostro il riepilogo da confermare.");
    }
    const opzioni = scelta.type === "list" ? scelta.action.sections[0].rows : scelta.action.buttons.map(b => b.reply);
    const sim = opzioni.find(row => row.title.startsWith("SIMULAZIONE S1"))!;
    await elabora(await registra({ id: "wamid.rapportino-personale-cantiere", type: "interactive",
      interactive: scelta.type === "list" ? { list_reply: sim } : { button_reply: sim } }));
    const riepilogo = consegne[1].interactive as InteractivePayload;
    expect(riepilogo.body.text).toContain("Cantiere: SIM-S1");
    expect(riepilogo.body.text).toContain("Ore personali: 8 h");
    expect(riepilogo.body.text).toContain("Vocale allegato");
    expect(riepilogo.body.text).not.toContain("operai in economia");
    expect(db.tabelle.campo_rapportini ?? []).toHaveLength(0);

    if (riepilogo.type !== "button") throw new Error("Attesa la conferma del rapportino");
    const invia = riepilogo.action.buttons[0].reply;
    expect(invia.title).toBe("Invia all’ufficio");
    await elabora(await registra({ id: "wamid.rapportino-personale-si", type: "interactive", interactive: { button_reply: invia } }));
    expect(db.tabelle.campo_rapportini).toEqual([expect.objectContaining({
      order_id: cantiere, whatsapp_message_id: vocale.id, stato: "inviato", ore_lavorate: 8,
      descrizione_lavori: "Montaggio due finestre al primo piano",
    })]);
    expect(m.ai).toHaveBeenCalledTimes(1);
  });

  it("invia la richiesta ad Acquisti come attività di quella commessa dopo conferma", async () => {
    const messaggio = await registra({ id: "wamid.richiesta-demo", type: "text",
      text: { body: "Chiedi ad Acquisti tre controtelai per domani per PROVA-SIMULA" } });
    m.ai.mockResolvedValue(chiediConferma("crea_attivita_ufficio", { ufficio: "Ufficio Acquisti", cantiere_hint: "PROVA-SIMULA",
      titolo: "Procurare tre controtelai", note: "Consegnare in cantiere", scadenza: "2026-11-21" }));
    await elabora(messaggio);
    expect(consegne[0].interactive).toMatchObject({ body: { text: expect.stringContaining("Acquisti") } });
    expect(db.tabelle.tasks ?? []).toHaveLength(0);
    const conferma = await registra({ id: "wamid.ufficio-si", type: "text", text: { body: "Sì" } });
    await elabora(conferma);
    expect(db.tabelle.tasks).toEqual([expect.objectContaining({
      id: messaggio.id, ufficio_id: acquisti, company_id: azienda, created_by: "utente-a", order_id: cantiere,
      title: "Procurare tre controtelai", status: "da_fare", due_date: "2026-11-21", activity_scope: "ufficio",
    })]);
    expect(consegne[1].text).toContain("Attività inviata a Acquisti");
    expect(m.ai).toHaveBeenCalledTimes(1);
  });

  it("porta in Merce presa lo scontrino originale dopo il vocale del pagante e la conferma", async () => {
    const esborso = randomUUID();
    db.rpcs.campo_acquisto_registra_whatsapp = () => esborso;
    m.ai.mockResolvedValueOnce({ choices: [{ message: { content: "SCONTRINO\nFerramenta demo" } }] });
    m.router.mockResolvedValueOnce({ content: JSON.stringify({
      document_type: "scontrino", supplier_name: "Ferramenta demo", ddt_date: "2026-11-20", total_amount: 23.45,
    }) });
    const foto = await registra({ id: "wamid.scontrino", type: "image", image: { id: "234570" } },
      new Blob([new Uint8Array([255, 216, 255, 2])], { type: "image/jpeg" }));
    await elabora(foto);
    expect(foto.ai_extracted_data).toMatchObject({ scontrino_wa: { importo: 23.45 }, operational_triage: { intent: "scontrino" } });
    expect(consegne[0].text).toContain("L’hai pagato tu");
    m.transcribe.mockResolvedValueOnce({ testo: "L’ho pagato io, per il cantiere PROVA-SIMULA.", lingua: "italian", durata: 4 });
    await elabora(await registra({ id: "wamid.scontrino-voce", type: "audio", audio: { id: "345682" } }, new Blob(["vocale"])));
    const proposta = consegne[1].interactive as InteractivePayload;
    expect(proposta.body.text).toContain("Pagato da te");
    expect(proposta.body.text).toContain("23,45");
    expect(db.rpcChiamate.some(r => r.nome === "campo_acquisto_registra_whatsapp")).toBe(false);
    if (proposta.type !== "button") throw new Error("Attesa conferma");
    await elabora(await registra({ id: "wamid.scontrino-ok", type: "interactive", interactive: {
      button_reply: proposta.action.buttons[0].reply,
    } }));
    expect(db.rpcChiamate.filter(r => r.nome === "campo_acquisto_registra_whatsapp")).toEqual([expect.objectContaining({
      args: expect.objectContaining({ p_order_id: cantiere, p_tipo_documento: "scontrino", p_totale: 23.45,
        p_modalita: "pagato_da_me", p_foto_path: expect.stringContaining("/acquisti/"), p_lettura: { fonte: "whatsapp", messaggio: foto.id } }),
    })]);
    expect(foto).toMatchObject({ linked_record_id: esborso, linked_record_type: "campo_acquisti", cantiere_id: cantiere });
  });

  it("mantiene l'allegato incerto in attesa e lo instrada quando l'utente cita la foto", async () => {
    m.ai.mockResolvedValueOnce({ choices: [{ message: { content: "INCERTO\nTesto sfocato" } }] });
    const foto = await registra({ id: "wamid.allegato-sfocato", type: "image", image: { id: "234571" } },
      new Blob([new Uint8Array([255, 216, 255, 3])], { type: "image/jpeg" }));
    await elabora(foto);
    expect(foto).toMatchObject({ ai_intent: "unknown", media_storage_path: expect.any(String) });
    expect(consegne[0].text).toContain("Ho salvato questo allegato");
    expect(consegne[0].reply_to_id).toBe(foto.id);
    expect(db.tabelle.ai_attivita_live[0]).toMatchObject({ stato: "in_attesa", fase: "da_smistare" });
    expect(db.tabelle.ddt_document_jobs ?? []).toHaveLength(0);
    await elabora(await registra({ id: "wamid.allegato-sfocato-risposta", type: "text",
      context: { id: "wamid.allegato-sfocato" }, text: { body: "È una bolla per il cantiere PROVA-SIMULA" },
    }));
    expect(foto.ai_intent).toBe("ddt");
    expect(db.tabelle.ddt_document_jobs).toEqual([expect.objectContaining({ order_id: cantiere, status: "queued", source_key: foto.id })]);
    expect(m.ai).toHaveBeenCalledTimes(1);
  });

  it("apre in Assistenza il ticket dettato, con il cantiere corretto", async () => {
    m.transcribe.mockResolvedValueOnce({
      testo: "Apri un ticket di manutenzione. La serratura è bloccata al cantiere PROVA-SIMULA.", lingua: "italian", durata: 7,
    });
    const vocale = await registra({ id: "wamid.ticket-vocale", type: "audio", audio: { id: "345683" } }, new Blob(["vocale"]));
    await elabora(vocale);
    expect(db.tabelle.tickets).toEqual([expect.objectContaining({
      id: vocale.id, category: "manutenzione", order_id: cantiere, descrizione: expect.stringContaining("serratura"), status: "aperto",
    })]);
    expect(consegne[0].text).toContain("Ticket aperto in Assistenza");
    expect(consegne[0].text).toContain("Vocale allegato");
    expect(originali.get(`ticket-attachments/${vocale.id}/wa-${vocale.id}.ogg`)?.size).toBe(6);
    expect(db.tabelle.ticket_messages ?? []).toContainEqual(expect.objectContaining({
      id: vocale.id, ticket_id: vocale.id, attachment_url: `${vocale.id}/wa-${vocale.id}.ogg`,
    }));
    const foto = await registra({ id: "wamid.ticket-foto", type: "image", image: { id: "345692" }, context: { id: "wamid.risposta1" } },
      new Blob(["FOTO"], { type: "image/jpeg" }));
    await elabora(foto);
    expect(originali.get(`ticket-attachments/${vocale.id}/wa-${foto.id}.jpg`)?.size).toBe(4);
    expect(db.tabelle.ticket_messages).toHaveLength(2);
    expect(db.tabelle.ticket_messages).toContainEqual(expect.objectContaining({
      id: foto.id, ticket_id: vocale.id, attachment_url: `${vocale.id}/wa-${foto.id}.jpg`,
    }));
    expect(db.tabelle.tickets).toHaveLength(1);
    db.tabelle.tickets[0].status = "in_lavorazione";
    await elabora(await registra({ id: "wamid.ticket-stato", type: "text", context: { id: "wamid.risposta2" },
      text: { body: "A che punto è?" } }));
    expect(consegne.at(-1)?.text).toContain("è in lavorazione");
    expect(db.tabelle.ticket_messages).toHaveLength(2);
    expect(m.ai).not.toHaveBeenCalled();
  });

  it("assegna alla persona dell’ufficio e conserva il vocale dopo la conferma", async () => {
    const laura = randomUUID();
    db.tabelle.profiles.push({ id: laura, company_id: azienda, first_name: "Laura", last_name: "Verdi", deleted_at: null });
    db.tabelle.ufficio_membri = [{ company_id: azienda, ufficio_id: acquisti, profile_id: laura }];
    db.rpcs.silvio_commesse_visibili = () => [{ id: cantiere }];
    m.transcribe.mockResolvedValueOnce({ testo: "Chiedi a Laura di chiamare il fornitore domani per PROVA-SIMULA", lingua: "italian", durata: 6 });
    m.ai.mockResolvedValue(chiediConferma("crea_attivita_ufficio", { responsabile: "Laura",
      titolo: "Chiamare il fornitore", scadenza: "2026-11-21", cantiere_hint: "PROVA-SIMULA" }));
    const vocale = await registra({ id: "wamid.attivita-laura", type: "audio", audio: { id: "345695" } }, new Blob(["vocale"]));
    await elabora(vocale);
    const proposta = consegne[0].interactive as InteractivePayload;
    expect(proposta.body.text).toContain("Responsabile Laura Verdi");
    expect(proposta.body.text).toContain("Vocale allegato");
    if (proposta.type !== "button") throw new Error("Attesa conferma attività");
    const conferma = proposta.action.buttons[0].reply;
    await elabora(await registra({ id: "wamid.laura-si", type: "interactive", interactive: { button_reply: conferma } }));
    expect(db.tabelle.tasks).toEqual([expect.objectContaining({
      id: vocale.id, assigned_to: laura, ufficio_id: acquisti, due_date: "2026-11-21", order_id: cantiere,
    })]);
    expect(db.tabelle.task_attachments).toEqual([expect.objectContaining({ task_id: vocale.id, mime_type: "audio/ogg" })]);
    expect(consegne.at(-1)?.text).toContain("Laura Verdi");
    await elabora(await registra({ id: "wamid.laura-si-due", type: "interactive", interactive: { button_reply: conferma } }));
    expect(db.tabelle.tasks).toHaveLength(1);
    expect(db.tabelle.task_attachments).toHaveLength(1);
  });

  it("registra il guasto sul mezzo in carico e lascia in chat quello riferito a un altro mezzo", async () => {
    db.tabelle.hr_profili = [{ id: "profilo-a", company_id: azienda, user_id: "utente-a", attivo: true }];
    db.tabelle.mezzi = [
      { id: "furgone", company_id: azienda, nome: "Furgone 1", targa: "AB123CD", assegnato_hr_profilo_id: "profilo-a" },
      { id: "altro-furgone", company_id: azienda, nome: "Furgone 2", targa: "CD456EF", assegnato_hr_profilo_id: "profilo-b" },
    ];
    const arriva = (id: string, body: string) => registra({ id, type: "text", text: { body } });
    const problema = await arriva("wamid.guasto", "Segnala un guasto sul furgone AB123CD. La spia motore è accesa.");
    await elabora(problema);
    await elabora(await arriva("wamid.guasto-altro", "Segnala un guasto sul furgone CD456EF. La spia motore è accesa."));
    expect(db.tabelle.mezzi_segnalazioni).toEqual([expect.objectContaining({
      id: problema.id, mezzo_id: "furgone", hr_profilo_id: "profilo-a", tipo: "guasto",
    })]);
    expect(consegne[0].text).toContain("Furgone 1");
    expect(consegne[1].text).toContain("Quale mezzo?");
    expect(consegne[1].text).not.toContain("Furgone 2");
    expect(m.ai).not.toHaveBeenCalled();
  });

  it("usa un solo passaggio AI per il rapporto rumeno con ore verificabili", async () => {
    const originale = "Raportul de azi la PROVA-SIMULA: Andrea 8 ore, Marco 4 ore. Am montat 3 uși.";
    const italiano = "Rapportino di oggi a PROVA-SIMULA: Andrea 8 ore, Marco 4 ore. Abbiamo montato 3 porte.";
    m.transcribe.mockResolvedValueOnce({ testo: originale, lingua: "romanian", durata: 10 });
    m.router.mockResolvedValueOnce({ content: JSON.stringify({ testo_italiano: italiano, rapportino: {
      data_lavoro: "oggi", cantiere_hint: "PROVA-SIMULA", persone: [{ nome: "Andrea", ore: 8 }, { nome: "Marco", ore: 4 }],
      attivita: ["Abbiamo montato 3 porte"],
    } }) });
    await elabora(await registra({ id: "wamid.rapportino-rapido", type: "audio", audio: { id: "345684" } }, new Blob(["vocale"])));
    expect(consegne[0].interactive).toMatchObject({ body: { text: expect.stringMatching(/Andrea Demo.*8 h[\s\S]*Marco Demo.*4 h/) } });
    expect(m.router).toHaveBeenCalledOnce();
    expect(m.ai).not.toHaveBeenCalled();
    expect(db.tabelle.campo_rapportini ?? []).toHaveLength(0);
  });

  it("riprende il preventivo dettato dopo giorni e consegna il PDF alla stessa chat dopo il bottone", async () => {
    const quoteId = randomUUID();
    const path = azienda + "/" + quoteId + ".pdf";
    db.tabelle.user_roles = [{ user_id: "utente-a", role: "company_admin" }];
    db.rpcs.silvio_context_actor_roles = () => ["company_admin"];
    db.rpcs.whatsapp_salva_bozza_preventivo = args => {
      const b = db.tabelle.whatsapp_preventivi_bozze.find(r => r.id === args.p_id && r.revisione === args.p_revisione)!;
      expect(args.p_anteprima).toEqual(b.anteprima);
      Object.assign(b, { stato: "salvata", quote_id: quoteId });
      db.tabelle.quotes = [{ id: quoteId, company_id: azienda, client_name: b.cliente, quote_number: "OFF-DEMO",
        source: "silvio", ai_richiesta_id: b.id }];
      return { success: true, quote_id: quoteId, quote_number: "OFF-DEMO", status: "bozza",
        items_count: 1, subtotal_eur: 1000, vat_eur: 220, total_eur: 1220 };
    };
    const messaggio = await registra({ id: "wamid.computo-vocale", type: "audio", audio: { id: "345685" } }, new Blob(["vocale"]));
    const fetchLocale = fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/ai-genera-preventivo-v2")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          company_id: azienda, per_utente: "utente-a", descrizione: expect.stringContaining("posa di 40 metri quadrati"),
          ai_richiesta_id: messaggio.id,
        });
        return rispostaJson({ success: true, sezioni: [{ righe: [{
          nome: "Posa pavimento", quantita: 40, unita_misura: "mq", unit_price: 25, item_category: "posa",
        }] }] });
      }
      if (String(url).endsWith("/generate-quote-pdf")) {
        expect(db.tabelle.quotes[0].id).toBe(quoteId);
        db.tabelle.quotes[0].pdf_storage_path = path;
        return rispostaJson({ pdf_path: path, signed_url: env.SUPABASE_URL + "/storage/v1/object/sign/quote-pdfs/" + path + "?token=locale" });
      }
      return fetchLocale(url, init);
    }));
    m.transcribe.mockResolvedValueOnce({ testo: "Fammi un preventivo per Rossi, posa di 40 metri quadrati, IVA 22 per cento e mandami qui il PDF.",
      lingua: "italian", durata: 10 });
    await elabora(messaggio);
    expect(consegne[0].text).toContain("Sto preparando le voci");
    expect(db.tabelle.whatsapp_preventivi_bozze[0]).toMatchObject({ id: messaggio.id, stato: "pronta", invia_pdf_qui: true });
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    db.tabelle.whatsapp_sessions[0].state_data = null;
    await elabora(await registra({ id: "wamid.computo-riprendi", type: "text", text: { body: "Riprendi preventivo" } }));
    const proposta = consegne.at(-1)?.interactive as InteractivePayload;
    expect(proposta.body.text).toContain("40 mq ×");
    expect(proposta.body.text).toContain("ti mando il PDF in questa chat");
    expect(db.tabelle.quotes ?? []).toHaveLength(0);
    if (proposta.type !== "button") throw new Error("Atteso bottone preventivo");
    await elabora(await registra({ id: "wamid.computo-si", type: "interactive", interactive: {
      button_reply: proposta.action.buttons[0].reply,
    } }));
    expect(db.rpcChiamate.filter(r => r.nome === "whatsapp_salva_bozza_preventivo")).toEqual([expect.objectContaining({
      args: expect.objectContaining({ p_id: messaggio.id, p_anteprima: expect.objectContaining({
        items: [expect.objectContaining({ quantity: 40, unit_of_measure: "mq", unit_price: 25, item_type: "labor" })],
      }) }),
    })]);
    expect(consegne.filter(r => r.type === "document")).toEqual([expect.objectContaining({ to: mittente, wa_number_id: linea.id })]);
    expect(db.tabelle.quotes[0]).toMatchObject({ id: quoteId, ai_richiesta_id: messaggio.id, pdf_storage_path: path });
    expect(m.ai).not.toHaveBeenCalled();
    expect(db.tabelle.ai_attivita_live).toContainEqual(expect.objectContaining({
      flusso: "preventivo", assistente: "WhatsApp", stato: "completata", fase: "pdf_inviato",
      richiesta: { tipo: "preventivo", id: messaggio.id, risorsa_id: quoteId },
      passaggi: expect.arrayContaining([
        expect.objectContaining({ fase: "compone_pdf", durata_ms: expect.any(Number) }),
        expect.objectContaining({ fase: "pdf_pronto" }),
        expect.objectContaining({ fase: "invio_risposta", durata_ms: expect.any(Number) }),
      ]),
    }));
  });

  it("conserva il PDF in una bozza e genera le voci dopo aver ricevuto cliente e IVA", async () => {
    db.tabelle.user_roles = [{ user_id: "utente-a", role: "company_admin" }];
    db.rpcs.silvio_context_actor_roles = () => ["company_admin"];
    const original = fetch;
    let letture = 0;
    let generazioni = 0;
    let percorsoPdfNuovo: string | null = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/silvio-extract-pdf")) {
        letture++;
        if (percorsoPdfNuovo) expect(JSON.parse(String(init?.body)).storage_path).toBe(percorsoPdfNuovo);
        return rispostaJson({ text: `Posa ceramica\t${percorsoPdfNuovo ? "15,00" : "12,50"}\tmq`, coverage: { complete: true } });
      }
      if (String(url).endsWith("/ai-genera-preventivo-v2")) {
        generazioni++;
        expect(JSON.parse(String(init?.body)).descrizione).toContain(`Posa ceramica\t${percorsoPdfNuovo ? "15,00" : "12,50"}\tmq`);
        return rispostaJson({ success: true, sezioni: [{ righe: [{
          nome: "Posa ceramica", quantita: percorsoPdfNuovo ? 15 : 12.5, unita_misura: "mq", unit_price: 32, item_category: "posa",
        }] }] });
      }
      return original(url, init);
    }));
    const pdf = await registra({ id: "wamid.computo-pdf", type: "document", document: {
      id: "349980", mime_type: "application/pdf", filename: "Computo.pdf", caption: "Prepara un preventivo da questo computo",
    } }, new Blob(["%PDF-1.7"], { type: "application/pdf" }));
    await elabora(pdf);
    expect(db.tabelle.whatsapp_preventivi_bozze[0]).toMatchObject({ id: pdf.id, stato: "da_completare", cliente: null, iva: null });
    expect(letture).toBe(1);
    expect(generazioni).toBe(0);
    await elabora(await registra({ id: "wamid.preventivo-dati", type: "text", text: { body: "Cliente Bianchi, IVA 10%" } }));
    expect(db.tabelle.whatsapp_preventivi_bozze).toHaveLength(1);
    expect(db.tabelle.whatsapp_preventivi_bozze[0]).toMatchObject({ id: pdf.id, revisione: 2, stato: "pronta", cliente: "Bianchi", iva: 10 });
    expect(db.tabelle.whatsapp_preventivi_bozze[0].anteprima).not.toHaveProperty("description");
    expect(letture).toBe(1);
    expect(generazioni).toBe(1);
    await elabora(await registra({ id: "wamid.preventivo-riapri", type: "text", text: { body: "Riprendi preventivo" } }));
    expect(consegne.at(-1)?.interactive).toMatchObject({ body: { text: expect.stringContaining("12,5 mq") } });
    expect(db.tabelle.quotes ?? []).toHaveLength(0);

    const prima = consegne.at(-1)?.interactive as InteractivePayload;
    const bozza = db.tabelle.whatsapp_preventivi_bozze[0];
    const codice = String(bozza.id).slice(0, 10).toUpperCase();
    bozza.codice = codice;
    const altra = { ...bozza, id: randomUUID(), cliente: "Rossi" };
    db.tabelle.whatsapp_preventivi_bozze.push({ ...altra, codice: String(altra.id).slice(0, 10).toUpperCase() });
    const pdfNuovo = await registra({ id: "wamid.rev-pdf", type: "document", document: {
      id: "349981", mime_type: "application/pdf", filename: "Computo aggiornato.pdf", caption: "Sostituisci PDF",
    } }, new Blob(["%PDF-1.7 aggiornato"], { type: "application/pdf" }));
    percorsoPdfNuovo = String(pdfNuovo.media_storage_path);
    await elabora(pdfNuovo);
    expect(consegne.at(-1)?.text).toContain("seguito dal codice della bozza");
    expect(letture).toBe(1);
    const sostituisci = (id: string) => registra({ id, type: "text", context: { id: "wamid.rev-pdf" },
      text: { body: `Sostituisci PDF ${codice}` } });
    await elabora(await sostituisci("wamid.pdf-revisione"));
    expect(consegne.at(-1)?.text).toContain("PDF sostituito");
    expect(bozza).toMatchObject({ id: pdf.id, revisione: 3, stato: "pronta", cliente: "Bianchi", iva: 10, pdf_path: pdfNuovo.media_storage_path });
    expect(db.tabelle.whatsapp_preventivi_bozze[1]).toMatchObject({ cliente: "Rossi", revisione: 2, pdf_path: pdf.media_storage_path });
    expect(db.tabelle.ddt_document_jobs ?? []).toHaveLength(0);
    expect(originali.has(`whatsapp-media/${pdf.media_storage_path}`)).toBe(true);
    if (prima.type !== "button") throw new Error("Atteso bottone preventivo");
    db.rpcs.whatsapp_salva_bozza_preventivo = ({ p_revisione }) => {
      expect(p_revisione).toBe(2);
      return { success: false };
    };
    const obsoleta = await registra({ id: "wamid.preventivo-conferma-vecchia", type: "interactive", interactive: { button_reply: prima.action.buttons[0].reply } });
    await elabora(obsoleta, "failed");
    expect(consegne.at(-1)?.text).toContain("Riprendi la bozza WhatsApp");
    expect(db.tabelle.quotes ?? []).toHaveLength(0);
    await elabora(await sostituisci("wamid.pdf-revisione-ripetuta"));
    expect(consegne.at(-1)?.interactive).toMatchObject({ body: { text: expect.stringContaining("15 mq ×") } });
    expect(bozza.revisione).toBe(3);
    expect(letture).toBe(2);
    expect(generazioni).toBe(2);
  });

  it("presenta all'operaio le funzioni abilitate e legge le assegnazioni di oggi senza AI", async () => {
    await elabora(await registra({ id: "wamid.aiuto", type: "text", text: { body: "Aiuto" } }));
    expect(consegne[0].text).toContain("Acquisti");
    expect(consegne[0].text).not.toContain("fatture");
    await elabora(await registra({ id: "wamid.oggi", type: "text", text: { body: "Dove lavoro oggi?" } }));
    expect(consegne[1].text).toContain("PROVA-SIMULA");
    expect(m.ai).not.toHaveBeenCalled();
  });

  it("conserva il PDF del preventivo anche senza il permesso di modificarlo", async () => {
    const pdf = await registra({ id: "wamid.pdf-solo-campo", type: "document", document: {
      id: "349988", mime_type: "application/pdf", filename: "Computo.pdf", caption: "Sostituisci PDF",
    } }, new Blob(["%PDF-1.7"], { type: "application/pdf" }));
    await elabora(pdf);
    expect(consegne.at(-1)?.text).toContain("PDF salvato in Conversazioni");
    expect(originali.has(`whatsapp-media/${pdf.media_storage_path}`)).toBe(true);
    expect(db.tabelle.whatsapp_preventivi_bozze ?? []).toHaveLength(0);
    expect(db.tabelle.ddt_document_jobs ?? []).toHaveLength(0);
    expect(m.ai).not.toHaveBeenCalled();
  });

  it("mostra l'anteprima del mattino per gli assegnati e mantiene il prefisso internazionale", async () => {
    db.tabelle.bot_routine = [{ company_id: azienda, id: "routine-demo", wa_number_id: linea.id, tipo: "todo_operaio",
      attiva: true, ora: "07:00:00", template_nome: "brief_giornaliero", regole: { ai: true, solo_telefoni: ["+40 721 234 500"] } }];
    db.tabelle.order_work_phases = [{ id: "fase-demo", company_id: azienda, order_id: cantiere, name: "Posa serramenti",
      start_date: "2026-11-20", status: "in_corso" }];
    db.tabelle.order_employees = [{ employee_id: "dip-m", phase_id: "fase-demo", order_id: cantiere }];
    const response = await m.routine!(richiesta("bot-routine-dispatch", { company_id: azienda, tipo: "todo_operaio", force: true, anteprima: true }));
    expect(await response.json()).toMatchObject({ anteprima: [{ a: "40721234500", nome: "Marco Demo",
      testo: expect.stringMatching(/PROVA-SIMULA[\s\S]*Via Demo 12[\s\S]*Posa serramenti[\s\S]*Andrea/) }] });
    expect(consegne).toHaveLength(0);
    expect(db.tabelle.wa_operational_reminder_log ?? []).toHaveLength(0);
  });

  it("cerca solo fatture dell’azienda con i normali diritti e riporta il link del dettaglio", async () => {
    const ctx = { supabase: db, company_id: azienda, user_id: "utente-a", role_grants: ["fatture.read"], kind: "ufficio" } as unknown as ToolCtx;
    const riga = { company_id: azienda, id: "fattura-1", tipo: "fattura", origine: "importata", elenco_cliente: "Rossi Demo",
      stato: "emessa", numero: "31/2026", data_emissione: "2026-11-06" };
    db.tabelle.documenti_fiscali_elenco_con_importate = [riga,
      { ...riga, id: "da-escludere", company_id: "altra-azienda" },
      { ...riga, id: "proforma", tipo: "proforma" }, { ...riga, id: "bozza", stato: "bozza" },
    ];
    expect(await apriFattureCliente(ctx, { ricerca: "Rossi" })).toMatchObject({ ok: true, data: { fatture: [
      expect.objectContaining({ numero: "31/2026", link: "https://app.locale.invalid/azienda/documenti/importata/fattura-1" }),
    ] } });
    expect(await apriFattureCliente({ ...ctx, role_grants: [] }, { ricerca: "Rossi" })).toMatchObject({ ok: false });
    expect(consegne).toHaveLength(0);
  });

  it("nei giri successivi della routine conserva un invio a testa e rifiuta un numero di prova non valido", async () => {
    vi.setSystemTime(new Date("2026-11-20T06:08:00Z"));
    db.tabelle.bot_routine = [{ company_id: azienda, id: "routine-demo", wa_number_id: linea.id, tipo: "todo_operaio",
      attiva: true, ora: "07:00:00", template_nome: "brief_giornaliero", regole: { ai: false } }];
    const piano = { company_id: azienda, tipo: "todo_operaio" };
    const invalid = await m.routine!(richiesta("bot-routine-dispatch", { ...piano, solo_telefono: "telefono?" }));
    expect(invalid.status).toBe(400);
    expect(consegne).toHaveLength(0);
    for (let i = 0; i < 2; i++) await m.routine!(richiesta("bot-routine-dispatch", piano));
    expect(consegne).toHaveLength(2);
    expect(new Set(consegne.map(r => r.idempotency_key)).size).toBe(2);
    expect(db.tabelle.wa_operational_reminder_log).toHaveLength(2);
  });

  it("mantiene decimali, nomi e codici di una traduzione e rifiuta una cifra cambiata", () => {
    const originale = "Na budowie PROVA-SIMULA Jan pracował 7,5 godziny.";
    expect(verificaTraduzioneVocale(originale, "In cantiere PROVA-SIMULA Jan ha lavorato 7,5 ore.")).toContain("7,5 ore");
    expect(() => verificaTraduzioneVocale(originale, "Jan ha lavorato 8 ore a PROVA-SIMULA.")).toThrow("traduzione_vocale_da_verificare");
    expect(verificaTraduzioneVocale("عمل علي ٧٫٥ ساعات.", "Ali ha lavorato 7,5 ore.")).toContain("7,5 ore");
    expect(() => verificaTraduzioneVocale("Jan 8 godzin, Marco 4 godziny.", "Jan 4 ore, Marco 8 ore.")).toThrow("traduzione_vocale_da_verificare");
  });
});
