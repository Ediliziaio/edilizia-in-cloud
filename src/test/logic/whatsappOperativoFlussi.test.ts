import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
import { handleBotOperativo } from "../../../supabase/functions/whatsapp-webhook/handlers/bot_operativo";
import { extractMessageContent } from "../../../supabase/functions/whatsapp-webhook/parser";
import type { IncomingWhatsAppMessage, WANumber } from "../../../supabase/functions/whatsapp-webhook/types";
import { acquisisciDdtWhatsapp } from "../../../supabase/functions/_shared/ddtWhatsappPersistente";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";
import {
  leggiDestinazioneBolla, trattaBollaInConversazione,
} from "../../../supabase/functions/whatsapp-ai-processor/bolleInConversazione";
import { aggiungiPaginaBolla } from "../../../supabase/functions/whatsapp-ai-processor/pagineBolla";
import { creaRapportino } from "../../../supabase/functions/whatsapp-ai-processor/tools/operaio/crea_rapportino";
import {
  giornoRapportinoWhatsapp, normalizzaPresenze, vocalePermetteBozza,
} from "../../../supabase/functions/whatsapp-ai-processor/tools/operaio/rapportinoSquadra";
import {
  downloadMetaMedia, LIMITE_MEDIA_WHATSAPP,
} from "../../../supabase/functions/whatsapp-ai-processor/metaMedia";

const m = vi.hoisted(() => ({ siti: vi.fn(), accesso: vi.fn(), resolve: vi.fn() }));
vi.mock("../../../supabase/functions/whatsapp-ai-processor/tools/shared/cantieriAperti", async importOriginal => ({
  ...await importOriginal<typeof import("../../../supabase/functions/whatsapp-ai-processor/tools/shared/cantieriAperti")>(),
  commesseAperte: m.siti, cercaCommesseUfficio: m.siti,
}));
vi.mock("../../../supabase/functions/whatsapp-ai-processor/tools/shared/siteAccess", () => ({
  requireSiteAccess: m.accesso,
}));
vi.mock("../../../supabase/functions/whatsapp-ai-processor/tools/shared/resolve_cantiere", () => ({
  resolveCantiere: m.resolve,
}));

const rossi = { id: "rossi", client_name: "Marco Rossi", indirizzo_lavori: "Via Manzoni 9", order_code: "ORD-042" };
const persone = [
  { employee_id: "e1", nome: "Andrea Rinaldi", sono_io: true },
  { employee_id: "e2", nome: "Marco Verdi" },
  { employee_id: "e3", nome: "Luca Blu" },
];
const job = { id: "bolla-1", source_key: "foto-1", result: { intestazione: { numero_ddt: "438" } }, status: "review",
  company_id: "azienda", created_by: "utente", employee_id: "e1", source: "whatsapp", order_id: null,
  warehouse_id: null, destinazione: null };
const foto = { id: "foto-1", wa_message_id: "wamid.foto", from_phone: "393331234567",
  wa_number_id: "linea", company_id: "azienda", direction: "inbound", message_type: "image", created_at: new Date().toISOString() };

type Row = Record<string, unknown>;

function ambiente(tabelle: Record<string, Row[]>) {
  const writes = vi.fn();
  const rpc = vi.fn().mockResolvedValue({ data: { persone, solo_ore: false, solo_timbratura: false, giorni_indietro: 7 }, error: null });
  const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
  const db = {
    rpc,
    storage: { from: () => ({
      download: async () => ({ data: new Blob(["%PDF-pagina-prova"]), error: null as null }),
      upload,
    }) },
    from: (tabella: string) => {
      const filtri: ((r: Row) => boolean)[] = [];
      let update: Row | null = null;
      let inserimento: Row | null = null;
      const risultati = (): Row[] => {
        if (inserimento) {
          const riga = { updated_at: new Date().toISOString(), ...inserimento, id: "nuovo-rapportino" };
          (tabelle[tabella] ??= []).push(riga);
          writes(tabella, riga);
          return [riga];
        }
        const righe = (tabelle[tabella] ?? []).filter(r => filtri.every(f => f(r)));
        if (update) for (const riga of righe) { Object.assign(riga, update); writes(tabella, riga); }
        return righe;
      };
      const q = {
        select: () => q, order: () => q, limit: () => q,
        eq: (chiave: string, valore: unknown) => { filtri.push(r => r[chiave] === valore); return q; },
        is: (chiave: string, valore: unknown) => { filtri.push(r => r[chiave] === valore); return q; },
        in: (chiave: string, valori: unknown[]) => { filtri.push(r => valori.includes(r[chiave])); return q; },
        contains: (chiave: string, valore: Row) => {
          filtri.push(r => Object.entries(valore).every(([k, v]) => (r[chiave] as Row | undefined)?.[k] === v));
          return q;
        },
        not: (chiave: string) => {
          const [colonna, campo] = chiave.split("->>");
          filtri.push(r => campo ? (r[colonna] as Row | undefined)?.[campo] != null : r[colonna] != null);
          return q;
        },
        gte: (chiave: string, valore: string) => { filtri.push(r => String(r[chiave]) >= valore); return q; },
        update: (riga: Row) => { update = riga; return q; },
        insert: (riga: Row) => { inserimento = riga; return q; },
        maybeSingle: async () => ({ data: risultati()[0] ?? null, error: null as null }),
        single: async () => ({ data: risultati()[0] ?? null, error: null as null }),
        then: (resolve: (result: { data: Row[]; error: null }) => void) => resolve({ data: risultati(), error: null }),
      };
      return q;
    },
  };
  const ctx = {
    supabase: db, company_id: "azienda", user_id: "utente", employee_id: "e1",
    waNumberId: "linea", phone: "393331234567", sessionId: null, kind: "operaio",
    role_grants: ["ddt.write", "rapportino.write"], locale: "it",
  } as unknown as ToolCtx;
  return { ctx, writes, rpc, upload };
}

beforeEach(() => {
  vi.resetAllMocks();
  m.siti.mockResolvedValue([rossi]);
  m.accesso.mockResolvedValue(undefined);
  m.resolve.mockResolvedValue({ source: "none" });
});
afterEach(() => vi.unstubAllGlobals());

describe("DDT operativo", () => {
  it("collega al cantiere il DDT già acquisito quando arriva il vocale con la destinazione", async () => {
    const riga = { ...job };
    const { ctx, writes } = ambiente({ whatsapp_messages: [foto], ddt_document_jobs: [riga] });
    expect(await trattaBollaInConversazione(ctx, { id: "audio-1", tipo: "audio", testo: "È per il cantiere Rossi di via Manzoni", riferimento: null, ddtLetto: false }))
      .toContain("Bolla n. 438 salvata sul cantiere Marco Rossi");
    expect(riga).toMatchObject({ order_id: "rossi", destinazione: "cantiere" });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(writes).toHaveBeenCalledWith("ddt_document_jobs", expect.any(Object));
  });

  it("dal payload Meta alla coda DDT con l’originale e la destinazione del vocale", async () => {
    const db = new DbMinimo();
    const archivia = vi.fn().mockResolvedValue({ error: null });
    const storage = { from: () => ({
      download: async () => ({ data: new Blob(["%PDF-bolla-prova"]), error: null as null }),
      upload: archivia,
    }) };
    const client = Object.assign(db, { storage }) as unknown as ToolCtx["supabase"];
    const waNumber: WANumber = { id: "linea", company_id: "azienda", purpose: "bot_operativo", agent_id: null,
      stato: "active", display_name: null, operational_settings: { bot_enabled: true, ai_auto_process: false } };
    const registra = (msg: IncomingWhatsAppMessage) => handleBotOperativo(client, {
      msg, waNumber, phoneNumberId: "123456", senderName: "Operaio di prova", senderPhone: foto.from_phone,
      extracted: extractMessageContent(msg),
    });
    await registra({ id: "wamid.bolla", from: foto.from_phone, type: "document",
      document: { id: "234567", filename: "ddt.pdf", mime_type: "application/pdf" } });
    const originale = db.tabelle.whatsapp_messages[0];
    expect(originale).toMatchObject({ company_id: "azienda", wa_number_id: "linea", media_url: "wa-media://234567" });
    await acquisisciDdtWhatsapp(client, { storagePath: "azienda/2026-11/ddt.pdf", companyId: "azienda", userId: "utente",
      employeeId: "e1", messageId: String(originale.id), result: { document_type: "ddt", ddt_number: "438" } });
    await registra({ id: "wamid.voce", from: foto.from_phone, type: "audio", timestamp: "1795172400",
      audio: { id: "345678", voice: true }, context: { id: "wamid.bolla" } });
    const vocale = db.tabelle.whatsapp_messages[1];
    expect(vocale.metadata).toMatchObject({ reply_to: "wamid.bolla", voice: true });
    const { ctx } = ambiente({});
    expect(await trattaBollaInConversazione({ ...ctx, supabase: client }, {
      id: String(vocale.id), tipo: "audio", testo: "È per il cantiere Rossi di via Manzoni",
      riferimento: "wamid.bolla", ddtLetto: false,
    })).toContain("Bolla n. 438 salvata sul cantiere Marco Rossi");
    expect(db.tabelle.ddt_document_jobs).toEqual([expect.objectContaining({
      source_key: originale.id, order_id: "rossi", destinazione: "cantiere",
      files: [expect.objectContaining({ bucket: "ddt-documenti" })],
    })]);
    expect(archivia).toHaveBeenCalledTimes(1);
  });

  it("distingue due bolle aperte e usa il riferimento al messaggio originale", async () => {
    const prima = { ...job }, seconda = { ...job, id: "bolla-2", source_key: "foto-2" };
    const { ctx, writes } = ambiente({ whatsapp_messages: [foto, { ...foto, id: "foto-2", wa_message_id: "wamid.seconda" }], ddt_document_jobs: [prima, seconda] });
    const input = { id: "audio-2", tipo: "audio", testo: "Cantiere Rossi", riferimento: null, ddtLetto: false };
    expect(await trattaBollaInConversazione(ctx, input)).toContain("Ci sono 2 bolle");
    expect(writes).not.toHaveBeenCalled();
    expect(await trattaBollaInConversazione(ctx, { ...input, riferimento: "wamid.seconda" })).toContain("salvata");
    expect(prima.order_id).toBeNull();
    expect(seconda.order_id).toBe("rossi");
  });

  it("lascia visibile la bolla se manca il deposito e aggiorna solo quello indicato", async () => {
    const riga = { ...job };
    const { ctx, writes } = ambiente({
      whatsapp_messages: [foto], ddt_document_jobs: [riga],
      warehouses: [{ company_id: "azienda", id: "bolgare", name: "Bolgare", is_active: true },
        { company_id: "azienda", id: "centro", name: "Centro", is_active: true }],
    });
    const input = { id: "testo-1", tipo: "text", testo: "Va in magazzino", riferimento: null, ddtLetto: false };
    expect(await trattaBollaInConversazione(ctx, input)).toContain("Quale magazzino");
    expect(writes).not.toHaveBeenCalled();
    expect(await trattaBollaInConversazione(ctx, { ...input, testo: "Va in magazzino di Bolgare" })).toContain("magazzino Bolgare");
    expect(riga).toMatchObject({ warehouse_id: "bolgare", order_id: null, destinazione: "magazzino" });
  });

  it("non usa una foto di un altro numero e non trasforma un rapportino in destinazione", async () => {
    const { ctx, writes } = ambiente({ whatsapp_messages: [{ ...foto, wa_number_id: "altra-linea" }], ddt_document_jobs: [{ ...job }] });
    await expect(trattaBollaInConversazione(ctx, { id: "audio-1", tipo: "audio", testo: "Cantiere Rossi", riferimento: null, ddtLetto: false })).resolves.toBeNull();
    expect(writes).not.toHaveBeenCalled();
    expect(leggiDestinazioneBolla("Cantiere Rossi, oggi abbiamo fatto 8 ore")).toBeNull();
  });

  it("completa una destinazione citata quando il webhook dell’originale arriva dopo", async () => {
    const audio = { ...foto, id: "audio-anticipato", message_type: "audio", metadata: { reply_to: "wamid.foto" }, ai_extracted_data: null };
    const bolla = { ...job };
    const tabelle = { whatsapp_messages: [audio] as Row[], ddt_document_jobs: [] as Row[] };
    const { ctx } = ambiente(tabelle);
    expect(await trattaBollaInConversazione(ctx, {
      id: audio.id, tipo: "audio", testo: "È per il cantiere Rossi", riferimento: "wamid.foto", ddtLetto: false,
    })).toContain("quando arriva il documento");
    tabelle.whatsapp_messages.push(foto);
    tabelle.ddt_document_jobs.push(bolla);
    expect(await trattaBollaInConversazione(ctx, {
      id: foto.id, tipo: "image", testo: "", riferimento: null, ddtLetto: true, providerId: "wamid.foto",
    })).toContain("salvata sul cantiere Marco Rossi");
    expect(bolla.order_id).toBe("rossi");
  });

  it("accoda una seconda pagina al DDT citato e ignora la stessa pagina al reinvio", async () => {
    const bolla = { ...job, files: [{ size: 100, path: "originale" }], updated_at: "2026-11-20T08:00:00Z" };
    const { ctx, upload } = ambiente({ whatsapp_messages: [foto], ddt_document_jobs: [bolla] });
    const voce = { ...ctx, requestId: "pagina-2", mediaCorrente: { storagePath: "azienda/2026-11/pagina2.pdf", url: "", tipo: "document" } };
    expect(await aggiungiPaginaBolla(voce, "wamid.foto")).toContain("Ora sono 2");
    expect(bolla.status).toBe("queued");
    expect(bolla.files).toHaveLength(2);
    expect(await aggiungiPaginaBolla(voce, "wamid.foto")).toContain("già presente");
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("chiede una conferma se il riferimento sulla bolla punta a un altro cantiere", async () => {
    m.resolve.mockResolvedValue({ source: "oda", cantiere_id: "bianchi", cantiere_nome: "Bianchi" });
    const { ctx, writes } = ambiente({
      whatsapp_messages: [foto], ddt_document_jobs: [{ ...job, result: { riferimenti: { ordine_cliente: "ODA-222" } } }],
    });
    expect(await trattaBollaInConversazione(ctx, { id: "foto-1", tipo: "image", testo: "Cantiere Rossi", riferimento: null, ddtLetto: true })).toContain("La bolla indica Bianchi");
    expect(writes).not.toHaveBeenCalled();
  });

  it("salva dopo la prima foto quando l’indirizzo della bolla identifica il cantiere", async () => {
    const bolla = { ...job, result: { ...job.result, luogo_destinazione: { indirizzo: "Via Manzoni, 9" } } };
    const { ctx } = ambiente({ whatsapp_messages: [foto], ddt_document_jobs: [bolla] });
    expect(await trattaBollaInConversazione(ctx, { id: foto.id, tipo: "image", testo: "", riferimento: null, ddtLetto: true }))
      .toContain("Bolla n. 438 salvata sul cantiere Marco Rossi");
    expect(bolla).toMatchObject({ order_id: "rossi", destinazione: "cantiere" });
  });

  it("conserva l’originale senza scegliere tra indirizzo e ordine in conflitto", async () => {
    m.resolve.mockResolvedValue({ source: "oda", cantiere_id: "bianchi", cantiere_nome: "Bianchi" });
    const bolla = { ...job, result: { luogo_destinazione: { indirizzo: "Via Manzoni, 9" }, riferimenti: { ordine_cliente: "ODA-222" } } };
    const { ctx, writes } = ambiente({ whatsapp_messages: [foto], ddt_document_jobs: [bolla] });
    expect(await trattaBollaInConversazione(ctx, { id: foto.id, tipo: "image", testo: "", riferimento: null, ddtLetto: true }))
      .toContain("indicano cantieri diversi");
    expect(writes).not.toHaveBeenCalled();
  });
});

describe("rapportino operativo", () => {
  it("dal primo vocale salva una bozza, riusa il record e conferma senza duplicare le attività", async () => {
    const tabelle = { orders: [{ ...rossi, company_id: "azienda" }], campo_rapportini: [] as Row[] };
    const { ctx } = ambiente(tabelle);
    const adesso = new Date();
    const tester = { ...ctx, sourceMessageId: "vocale-1", sentAt: adesso.toISOString(), transcript:
      "Oggi al cantiere Rossi io e Marco abbiamo fatto otto ore di posa serramenti ciascuno. Luca ha fatto quattro ore di sigillatura. Abbiamo montato cinque finestre e due portefinestre." };
    const proposta = { order_id: rossi.id, data_lavoro: giornoRapportinoWhatsapp("oggi", adesso), cantiere_hint: "Rossi",
      persone: [{ nome: "io", ore: 8 }, { nome: "Marco", ore: 8 }, { nome: "Luca", ore: 4 }],
      attivita: ["Montate cinque finestre e due portefinestre"], note: "Manca il controtelaio" };
    const cantieri = [{ id: rossi.id, titolo: rossi.client_name, dettaglio: rossi.indirizzo_lavori }];
    expect(vocalePermetteBozza(tester, proposta, proposta, cantieri)).toBe(true);
    expect(vocalePermetteBozza({ ...tester, transcript: "Oggi al cantiere Rossi io Marco e Luca abbiamo fatto otto ore complessive" }, proposta, proposta, cantieri)).toBe(false);
    expect(vocalePermetteBozza(tester, proposta, proposta, [...cantieri, { id: "altro", titolo: "Luca Rossi", dettaglio: "Via Verdi" }])).toBe(false);
    expect(await creaRapportino(tester, proposta, "bozza")).toMatchObject({ ok: true, user_message: expect.stringContaining("20 ore totali per 3 persone") });
    expect(await creaRapportino(tester, proposta, "bozza")).toMatchObject({ ok: true, data: { is_new: false } });
    expect(tabelle.campo_rapportini).toHaveLength(1);
    expect(tabelle.campo_rapportini[0]).toMatchObject({ stato: "bozza", whatsapp_message_id: "vocale-1" });
    expect(await creaRapportino(tester, proposta)).toMatchObject({ ok: true, data: { is_new: false } });
    expect(tabelle.campo_rapportini[0]).toMatchObject({ stato: "inviato", note: proposta.note, descrizione_lavori: proposta.attivita[0] });
  });

  it("registra 20 ore con tre presenze e separa lavori eseguiti e impedimenti", async () => {
    const { ctx, writes } = ambiente({ orders: [{ ...rossi, company_id: "azienda" }], campo_rapportini: [] });
    const esito = await creaRapportino({ ...ctx, sourceMessageId: "vocale-1" }, {
      order_id: "rossi", persone: [{ nome: "io", ore: 8 }, { nome: "Marco", ore: 8 }, { nome: "Luca", ore: 4 }],
      attivita: ["Montate cinque finestre e due portefinestre", "Sigillatura"],
      note: "Portafinestra del piano terra da fare, manca il controtelaio",
    });
    expect(esito).toMatchObject({ ok: true, user_message: expect.stringContaining("20 ore totali per 3 persone") });
    expect(writes).toHaveBeenCalledWith("campo_rapportini", expect.objectContaining({
      whatsapp_message_id: "vocale-1", stato: "inviato", presenze: [
        { employee_id: "e1", nome: "Andrea Rinaldi", ore: 8 },
        { employee_id: "e2", nome: "Marco Verdi", ore: 8 },
        { employee_id: "e3", nome: "Luca Blu", ore: 4 },
      ],
      descrizione_lavori: "Montate cinque finestre e due portefinestre. Sigillatura",
      note: expect.stringContaining("controtelaio"),
    }));
  });

  it("blocca il salvataggio quando manca l’autorizzazione corrente", async () => {
    const { ctx, writes, rpc } = ambiente({ orders: [{ ...rossi, company_id: "azienda" }] });
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect(await creaRapportino(ctx, { order_id: "rossi", persone: [{ nome: "Marco", ore: 8 }] })).toMatchObject({ ok: false });
    expect(writes).not.toHaveBeenCalled();
  });

  it("chiede nome completo se due operai coincidono e usa l'istante del messaggio in ora italiana", () => {
    expect(() => normalizzaPresenze([{ nome: "Marco", ore: 8 }], [...persone, { employee_id: "e4", nome: "Marco Rossi" }])).toThrow("Quale Marco");
    expect(() => normalizzaPresenze([{ nome: "Luca", ore: 4 }], [{ ...persone[2], gia_registrato_da_altri: true }])).toThrow("già registrato");
    expect(giornoRapportinoWhatsapp("oggi", new Date("2026-11-19T23:40Z"))).toBe("2026-11-20");
    expect(giornoRapportinoWhatsapp("ieri", new Date("2026-11-19T23:40Z"))).toBe("2026-11-19");
    expect(() => giornoRapportinoWhatsapp("2026-02-31", new Date())).toThrow("data di lavoro valida");
  });
});

describe("media Meta", () => {
  it("usa il numero destinatario del webhook e rinnova una volta un URL scaduto", async () => {
    const f = vi.fn().mockResolvedValueOnce(Response.json({ url: "https://lookaside.fbsbx.com/primo", mime_type: "audio/ogg; codecs=opus" }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ url: "https://lookaside.fbsbx.com/nuovo", mime_type: "audio/ogg", file_size: 3 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", f);
    expect(await downloadMetaMedia("123456", "fixture", "345678")).toEqual({ bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/ogg" });
    expect(String(f.mock.calls[0][0])).toContain("phone_number_id=345678");
    expect(String(f.mock.calls[3][0])).toBe("https://lookaside.fbsbx.com/nuovo");
  });

  it("rifiuta i file oltre la soglia del gestionale prima di scaricarli", async () => {
    const f = vi.fn().mockResolvedValue(Response.json({ url: "https://lookaside.fbsbx.com/pdf", mime_type: "application/pdf", file_size: LIMITE_MEDIA_WHATSAPP + 1 }));
    vi.stubGlobal("fetch", f);
    await expect(downloadMetaMedia("123456", "fixture", "345678")).rejects.toMatchObject({ codice: "file_grande" });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
