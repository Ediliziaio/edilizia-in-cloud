import { describe, expect, it, vi } from "vitest";
import { createLocalQuoteChatTransport } from "@/lib/preventivi/localQuoteChatTransport";
import type { QuoteChatRequest, QuoteChatResult } from "../../../supabase/functions/_shared/quoteConversation";
const id = "d2000000-0000-4000-a000-000000000002";
const request: QuoteChatRequest = { version: 1, companyId: id, sessionId: id, turnId: id, revision: 0, sourceId: null, lines: [], messages: [{ role: "user", text: "Preventivo" }] };
const options = { endpoint: "http://127.0.0.1:54321/functions/v1/ai-preventivo-conversazione", getToken: async () => "test-user-token", publishableKey: "publishable-test" };
const result: QuoteChatResult = { version: 1, turnId: id, revision: 0, model: "modello-verificato", references: [], simulated: false, turn: { version: 1, message: "Quali lavori?", title: "", questions: [], warnings: [], proposals: [], searches: [] } };
describe("Trasporto locale: nessun fallback verso produzione", () => {
  it.each([[502, 'non verificabile'], [401, 'Sessione AI scaduta'], [429, 'al limite']])('rende riconoscibile l’errore %s senza retry o testo remoto', async (status, detail) => {
    const fetch = vi.fn().mockResolvedValue(new Response('segreto remoto', { status: Number(status) }));
    await expect(createLocalQuoteChatTransport({ ...options, fetch })(request, new AbortController().signal)).rejects.toThrow(String(detail));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["https://remote.example/functions/v1/ai-preventivo-conversazione", "http://127.0.0.1:54321/functions/v1/silvio-chat", "http://token@localhost:54321/functions/v1/ai-preventivo-conversazione", `${options.endpoint}?secret=x`])("blocca %s", endpoint => {
    expect(() => createLocalQuoteChatTransport({ ...options, endpoint })).toThrow("locale");
  });
  it("verifica tenant e sessione prima di qualsiasi richiesta", async () => {
    const fetch = vi.fn(); const run = createLocalQuoteChatTransport({ ...options, fetch });
    await expect(run({ ...request, companyId: "b2000000-0000-4000-a000-000000000002" }, new AbortController().signal)).rejects.toThrow("Demo Azienda 2");
    await expect(createLocalQuoteChatTransport({ ...options, getToken: async () => null, fetch })(request, new AbortController().signal)).rejects.toThrow("Accedi");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("invia solo JWT utente e chiave pubblicabile, una richiesta senza retry", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    expect((await createLocalQuoteChatTransport({ ...options, fetch })(request, new AbortController().signal)).model).toBe("modello-verificato");
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1].headers).toMatchObject({ Authorization: "Bearer test-user-token", apikey: "publishable-test" });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(request);
  });
  it("non converte un servizio non attivo in risposta simulata", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(createLocalQuoteChatTransport({ ...options, fetch })(request, new AbortController().signal)).rejects.toThrow("non attivo"); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("segnala un esito provider incerto senza copiare payload o ripetere la richiesta", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "AI_REQUEST_UNCERTAIN", error: "contenuto server non fidato" }), { status: 504 }));
    await expect(createLocalQuoteChatTransport({ ...options, fetch })(request, new AbortController().signal)).rejects.toThrow("non viene ripetuta automaticamente");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rifiuta replay di un altro turno e simulazioni nascoste", async () => {
    for (const value of [{ ...result, revision: 1 }, { ...result, simulated: true }]) {
      const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status: 200 }));
      await expect(createLocalQuoteChatTransport({ ...options, fetch })(request, new AbortController().signal)).rejects.toThrow("turno corrente");
    }
  });
  it("annullamento durante il refresh credenziali non avvia il provider", async () => {
    const ctrl = new AbortController(); const fetch = vi.fn();
    const run = createLocalQuoteChatTransport({ ...options, fetch, getToken: async () => { ctrl.abort(); return "token"; } });
    await expect(run(request, ctrl.signal)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
});
