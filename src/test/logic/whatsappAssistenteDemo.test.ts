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
};
const installaDeno = (serve?: (handler: Handler) => void) =>
  vi.stubGlobal("Deno", { env: { get: (key: string) => env[key] }, serve });
const rispostaJson = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
let gestore: Handler;
let db: DbMinimo;
let consegne: Riga[];
let sfondo: Promise<unknown>[];
let originali: Map<string, Blob>;

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
    const estensione = msg.type === "audio" ? "ogg" : "jpg";
    const path = [azienda, "2026-11", riga.id + "." + estensione].join("/");
    originali.set("whatsapp-media/" + path, file);
    riga.media_storage_path = path;
  }
  return riga;
}

async function elabora(riga: Riga) {
  const r = await gestore(richiesta("whatsapp-ai-processor", { message_id: riga.id }));
  expect(await r.json()).toMatchObject({ ok: true, status: "processed" });
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
  vi.stubGlobal("EdgeRuntime", { waitUntil: (p: Promise<unknown>) => sfondo.push(p) });
  const magazzinoFile = (bucket: string, path: string) => bucket + "/" + path;
  Object.assign(db, { storage: { from: (bucket: string) => ({
    download: async (path: string) => ({ data: originali.get(magazzinoFile(bucket, path)), error: null as null }),
    upload: async (path: string, data: Uint8Array, options: { contentType: string }) => {
      originali.set(magazzinoFile(bucket, path), new Blob([new Uint8Array(data)], { type: options.contentType }));
      return { error: null as null };
    },
  }) } });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/whatsapp-ai-processor")) {
      const evento = new Request(url, init);
      return evento.headers.has("x-cron-secret") ? new Response(null, { status: 202 }) : gestore(evento);
    }
    if (url.endsWith("/whatsapp-send")) {
      consegne.push(JSON.parse(String(init?.body)));
      return rispostaJson({ success: true, meta_message_id: "wamid.risposta" + consegne.length });
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
  it("archivia l'originale prima dell'OCR fallito e usa il vocale in coda sulla stessa bozza con una sola risposta", async () => {
    const foto = await registra({ id: "wamid.foto-demo", type: "image", image: { id: "234567" } },
      new Blob([new Uint8Array([255, 216, 255, 1])], { type: "image/jpeg" }));
    vi.setSystemTime(new Date("2026-11-20T10:00:07Z"));
    const vocale = await registra({ id: "wamid.voce-demo", type: "audio", audio: { id: "345678", voice: true } }, new Blob(["vocale demo"]));
    m.ai.mockResolvedValue({ choices: [{ message: { content: "DDT\nBolla di prova" } }] });
    m.router.mockImplementation(async () => {
      expect(db.tabelle.ddt_document_jobs).toEqual([expect.objectContaining({ source_key: foto.id, status: "da_leggere" })]);
      throw new Error("OCR simulato indisponibile");
    });
    m.transcribe.mockResolvedValue({ testo: "Carica questa bolla in prova simula.", lingua: "italian", durata: 7 });
    await elabora(foto);
    expect(consegne).toEqual([expect.objectContaining({ text: expect.stringContaining("Prova Simula") })]);
    expect(db.tabelle.ddt_document_jobs).toEqual([expect.objectContaining({
      source_key: foto.id, order_id: cantiere, destinazione: "cantiere", status: "da_leggere", whatsapp_voice_message_id: vocale.id,
      files: [expect.objectContaining({ bucket: "ddt-documenti" })],
    })]);
    expect([...originali.keys()].filter(path => path.startsWith("ddt-documenti/"))).toHaveLength(1);
    expect(vocale.processing_status).toBe("processed");
    expect(m.charge).toHaveBeenCalledTimes(1);
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
    expect(proposta.type).toBe("button");
    if (proposta.type !== "button") throw new Error("Proposta attesa");
    expect(proposta.body.text).toContain("PROVA-SIMULA");
    expect(proposta.action.buttons[0].reply.title).toBe("Assegna qui");
    const altriCantieri = proposta.action.buttons.find(b => b.reply.title === "Altri cantieri")!.reply;
    const tap = (id: string, scelta: { id: string; title: string }, bottone = false) => registra({
      id, type: "interactive", interactive: bottone ? { button_reply: scelta } : { list_reply: scelta },
    });
    await elabora(await tap("wamid.menu-0", altriCantieri, true));
    const ids = new Set<string>();
    for (let i = 1; i <= 3; i++) {
      const pagina = consegne[i].interactive as InteractivePayload;
      if (pagina.type !== "list") throw new Error("Lista attesa");
      const rows = pagina.action.sections[0].rows;
      expect(rows.length).toBeLessThanOrEqual(10);
      rows.filter(r => r.title.startsWith("Cantiere") || r.id.includes("ddt:cantiere:")).forEach(r => ids.add(r.id));
      const avanti = rows.find(r => r.title === "Altri risultati");
      if (avanti) await elabora(await tap("wamid.menu-" + i, avanti));
    }
    expect(ids.size).toBe(20);
    const ultima = [...ids].at(-1)!;
    await elabora(await tap("wamid.destinazione", { id: ultima, title: "Cantiere scelto" }));
    expect(db.tabelle.ddt_document_jobs).toEqual([expect.objectContaining({
      status: "review", source_key: foto.id, order_id: ultima.split(":").at(-1), destinazione: "cantiere",
    })]);
    expect(m.ai).not.toHaveBeenCalled();
  });

  it.each([
    ["romanian", "Astăzi la PROVA-SIMULA eu am lucrat 8 ore și Marco Demo 4 ore. Am montat 3 uși."],
    ["polish", "Dziś w PROVA-SIMULA pracowałem 8 godzin, a Marco Demo 4 godziny. Zamontowaliśmy 3 drzwi."],
  ])("traduce il rapportino (%s), mostra le ore individuali e registra solo dopo il Sì", async (lingua, originale) => {
    const messaggio = await registra({ id: "wamid.rapportino-demo", type: "audio", audio: { id: "345679", voice: true } }, new Blob(["vocale demo"]));
    const italiano = "Oggi a PROVA-SIMULA io ho lavorato 8 ore e Marco Demo 4 ore. Abbiamo montato 3 porte.";
    m.transcribe.mockResolvedValue({ testo: originale, lingua, durata: 11 });
    m.router.mockResolvedValue({ content: JSON.stringify({ testo_italiano: italiano }) });
    m.ai.mockResolvedValue(chiediConferma("crea_rapportino", { cantiere_hint: "PROVA-SIMULA", attivita: ["Montate 3 porte"],
      persone: [{ nome: "io", ore: 8 }, { nome: "Marco Demo", ore: 4 }] }));
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

  it("presenta all'operaio le funzioni abilitate e legge le assegnazioni di oggi senza AI", async () => {
    await elabora(await registra({ id: "wamid.aiuto", type: "text", text: { body: "Aiuto" } }));
    expect(consegne[0].text).toContain("Acquisti");
    expect(consegne[0].text).not.toContain("fatture");
    await elabora(await registra({ id: "wamid.oggi", type: "text", text: { body: "Dove lavoro oggi?" } }));
    expect(consegne[1].text).toContain("PROVA-SIMULA");
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
