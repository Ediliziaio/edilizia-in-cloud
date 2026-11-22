import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  creaHandlerBollettaFv,
  type DipendenzeBollettaFv,
} from "../../../supabase/functions/fv-leggi-bolletta/handler";
import { datiBollettaVuoti } from "../../../supabase/functions/_shared/fvBollette";
import { creaHandlerBollettaFvAsincrona } from "../../../supabase/functions/fv-leggi-bolletta/asincrona";
const company = "10000000-0000-4000-a000-000000000001",
  project = "20000000-0000-4000-a000-000000000001",
  pod = "IT001E12345678";
const bytes = new TextEncoder().encode(
  "%PDF-1.7\nDocumento sintetico per test",
);
let path: string,
  permesso: boolean,
  stato: string,
  visibile: boolean,
  testo: string,
  nonLette: number[];
const ai = vi.fn(), pdf = vi.fn(), download = vi.fn();
const jsonResponse = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers });
const chain = {
  select: () => chain,
  eq: () => chain,
  maybeSingle: async () => ({
    data: visibile
      ? { id: project, company_id: company, stato, deleted_at: null as string | null }
      : null,
    error: null as Error | null,
  }),
};
const deps = {
  headers: {
    getCorsHeaders: () => ({}),
    jsonResponse,
    errorResponse: (message: string, status: number, headers: HeadersInit) =>
      jsonResponse({ error: message }, status, headers),
  },
  requireCompanyAccess: async () => {},
  requireAuth: async () => ({
    userId: "30000000-0000-4000-a000-000000000001",
    supabaseAdmin: {},
  }),
  utente: () => ({
    from: () => chain,
    rpc: async () => ({ data: permesso, error: null as Error | null }),
    storage: { from: () => ({ download }) },
  }),
  aiRouterComplete: ai,
  extractPdfWithCoverage: pdf,
  erroreAiPerUtente: (e: unknown) =>
    e instanceof Error && e.message === "credito"
      ? {
        status: 402,
        body: {
          error: "Crediti AI esauriti. Puoi inserire i consumi manualmente.",
        },
      }
      : null,
} as unknown as DipendenzeBollettaFv;
const invoke = (body: Record<string, unknown> = {}) =>
  creaHandlerBollettaFv(deps)(
    new Request("https://test.invalid/fv-leggi-bolletta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sintetico",
      },
      body: JSON.stringify({
        progetto_id: project,
        path,
        nome: "bolletta-test.pdf",
        ...body,
      }),
    }),
  );
const claimJob = vi.fn(), finishJob = vi.fn();
let pendingJobs: Promise<void>[] = [];
const invokeAsync = (body: Record<string, unknown> = {}) => creaHandlerBollettaFvAsincrona(deps, {
  prendi: claimJob, concludi: finishJob, prosegui: (p) => { pendingJobs.push(p); },
})(new Request("https://test.invalid/fv-leggi-bolletta", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer sintetico" },
  body: JSON.stringify({ asincrona: true, progetto_id: project, path, nome: "Test.pdf", ...body }),
}));
beforeEach(async () => {
  vi.clearAllMocks();
  pendingJobs = [];
  claimJob.mockReset().mockResolvedValue({ id: "job1", avviata: true, stato: "in_corso" });
  finishJob.mockReset().mockResolvedValue(true);
  permesso = true;
  stato = "bozza";
  visibile = true;
  nonLette = [];
  testo = `POD ${pod}\nConsumo annuo: 6.000 kWh`;
  const hash = Array.from(
    new Uint8Array(await webcrypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  path = `${company}/${project}/${hash}.pdf`;
  download.mockImplementation(async () => ({
    data: {
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer.slice(0),
    },
    error: null as Error | null,
  }));
  pdf.mockImplementation(async () => ({
    text: testo,
    pages: [{ page: 1, text: testo, method: "native" }],
    coverage: {
      pages_total: 3,
      pages_unreadable: nonLette,
      text_truncated: false,
    },
  }));
  ai.mockResolvedValue({
    content: JSON.stringify({
      forniture: [{ ...datiBollettaVuoti(), pod, consumo_annuo_kwh: 6000 }],
    }),
    rawResponse: { choices: [{ finish_reason: "stop" }] },
  });
});
describe("Lettura recuperabile delle bollette", () => {
  it("risponde prima dell'AI e conserva l'esito per la riapertura del progetto", async () => {
    let resolveAi!: (value: unknown) => void;
    ai.mockImplementation(() => new Promise((resolve) => { resolveAi = resolve; }));
    const response = await invokeAsync();
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ lettura: { id: "job1", stato: "in_corso", errore: null } });
    expect(finishJob).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(ai).toHaveBeenCalledOnce());
    resolveAi({ content: JSON.stringify({ forniture: [{ ...datiBollettaVuoti(), pod, consumo_annuo_kwh: 6000, spesa_annua: 1800 }] }), rawResponse: { choices: [{ finish_reason: "stop" }] } });
    await Promise.all(pendingJobs);
    expect(finishJob).toHaveBeenCalledWith({}, "job1", expect.any(String), 200, expect.objectContaining({ documenti: expect.arrayContaining([expect.objectContaining({ dati: expect.objectContaining({ consumo_annuo_kwh: 6000, spesa_annua: 1800 }) })]) }));
  });
  it("autorizza progetto e permessi prima della presa e di ogni costo", async () => {
    visibile = false; expect((await invokeAsync()).status).toBe(403);
    expect(claimJob).not.toHaveBeenCalled(); expect(ai).not.toHaveBeenCalled();
    visibile = true; permesso = false; expect((await invokeAsync()).status).toBe(403);
    expect(claimJob).not.toHaveBeenCalled();
  });
  it("non avvia un secondo worker e restituisce un esito già pronto senza rileggerlo", async () => {
    claimJob.mockResolvedValue({ id: "job1", avviata: false, stato: "in_corso" });
    expect((await invokeAsync()).status).toBe(202); expect(pendingJobs).toHaveLength(0);
    claimJob.mockResolvedValue({ id: "job1", avviata: false, stato: "completata", documenti: [{ id: "risultato" }] });
    expect(await (await invokeAsync()).json()).toMatchObject({ documenti: [{ id: "risultato" }] });
    expect(ai).not.toHaveBeenCalled();
  });
  it("conserva il blocco credito come errore recuperabile, senza dati inventati", async () => {
    ai.mockRejectedValue(Error("credito")); expect((await invokeAsync()).status).toBe(202);
    await Promise.all(pendingJobs);
    expect(finishJob).toHaveBeenCalledWith({}, "job1", expect.any(String), 402, { error: "Crediti AI esauriti. Puoi inserire i consumi manualmente." });
  });
  it("se non può prendere il lavoro non scarica e non chiama il provider", async () => {
    claimJob.mockRejectedValue(Error("database")); expect((await invokeAsync()).status).toBe(503);
    expect(download).not.toHaveBeenCalled(); expect(ai).not.toHaveBeenCalled();
  });
});
describe("Endpoint bollette: identità, OCR e conti AI", () => {
  it("una lettura OCR più completa non riusa la struttura parziale dello stesso PDF", async () => {
    const cache = new Map<string, string>();
    let providerCalls = 0;
    ai.mockImplementation(async (options) => {
      let content = cache.get(options.cacheKey);
      const cached = content != null;
      if (!content) {
        providerCalls++;
        content = JSON.stringify({ forniture: [{ ...datiBollettaVuoti(), pod, consumo_annuo_kwh: 6000,
          spesa_annua: options.messages[1].content.includes("Seconda lettura completa") ? 1800 : null }] });
        cache.set(options.cacheKey, content);
      }
      return { content, rawResponse: cached ? { cached: true } : { choices: [{ finish_reason: "stop" }] } };
    });
    testo = "Prima lettura parziale"; nonLette = [3];
    const first = await (await invoke()).json();
    expect(first.documenti[0].dati.spesa_annua).toBeNull();
    expect(first.documenti[0].pagine_non_lette).toEqual([3]);
    testo = "Seconda lettura completa"; nonLette = [];
    const second = await (await invoke()).json();
    expect(second.documenti[0].dati.spesa_annua).toBe(1800);
    expect(second.documenti[0].pagine_non_lette).toEqual([]);
    expect(ai.mock.calls[1][0].idempotencyKey).not.toBe(ai.mock.calls[0][0].idempotencyKey);
    const third = await (await invoke()).json();
    expect(third.documenti[0].dati.spesa_annua).toBe(1800);
    expect(ai.mock.calls[2][0].cacheKey).toBe(ai.mock.calls[1][0].cacheKey);
    expect(providerCalls).toBe(2);
  });
  it("blocca un progetto non visibile prima di scaricare o chiamare l'AI", async () => {
    visibile = false;
    expect((await invoke()).status).toBe(403);
    expect(download).not.toHaveBeenCalled();
    expect(ai).not.toHaveBeenCalled();
  });
  it("nega un documento di altro progetto", async () => {
    expect(
      (await invoke({
        path: path.replace(project, "40000000-0000-4000-a000-000000000001"),
      })).status,
    ).toBe(403);
    expect(download).not.toHaveBeenCalled();
  });
  it("nega l'elaborazione senza permesso di modifica", async () => {
    permesso = false;
    expect((await invoke()).status).toBe(403);
    expect(ai).not.toHaveBeenCalled();
  });
  it("non aggiunge bollette a un preventivo già emesso", async () => {
    stato = "emesso";
    expect((await invoke()).status).toBe(409);
    expect(ai).not.toHaveBeenCalled();
  });
  it("controlla contenuto e hash del file prima del provider", async () => {
    path = path.replace(/\/[a-f0-9]{64}\.pdf$/, "/" + "f".repeat(64) + ".pdf");
    expect((await invoke()).status).toBe(400);
    expect(ai).not.toHaveBeenCalled();
  });
  it("usa il testo nativo e mantiene i dati da confermare con origine", async () => {
    const r = await invoke(), data = await r.json();
    expect(r.status).toBe(200);
    expect(data.documenti[0]).toMatchObject({
      confermato: false,
      path,
      dati: { pod, consumo_annuo_kwh: 6000, pagine: { consumo_annuo_kwh: 1 } },
    });
    expect(ai.mock.calls[0][0]).toMatchObject({
      companyId: company,
      guardProviderRequest: true,
      cacheSoloSeFinita: true,
    });
    expect(ai.mock.calls[0][0].messages[1].content).toContain(pod);
  });
  it("separa le forniture di una scansione multipagina e segnala pagine non lette", async () => {
    nonLette = [3];
    ai.mockResolvedValue({
      content: JSON.stringify({
        forniture: [{ pod, consumo_annuo_kwh: 6000 }, {
          pod: "IT002E87654321",
          consumo_annuo_kwh: 9000,
        }],
      }),
      rawResponse: { choices: [{ finish_reason: "stop" }] },
    });
    const data = await (await invoke()).json();
    expect(data.documenti).toHaveLength(2);
    expect(data.documenti[0].pagine_non_lette).toEqual([3]);
    expect(data.documenti[0].dati.avvisi.join(" ")).toContain("3");
    expect(data.documenti[0].id).not.toBe(data.documenti[1].id);
  });
  it("propaga un blocco crediti e consente la compilazione manuale", async () => {
    ai.mockRejectedValue(Error("credito"));
    const r = await invoke();
    expect(r.status).toBe(402);
    expect((await r.json()).error).toMatch(/Crediti AI/);
  });
  it("riusa una lettura JSON completa dalla cache senza dichiararla troncata", async () => {
    ai.mockResolvedValue({
      content: JSON.stringify({ forniture: [{ pod, consumo_annuo_kwh: 6000, spesa_annua: 1800 }] }),
      rawResponse: { cached: true },
    });
    const r = await invoke();
    expect(r.status).toBe(200);
    expect((await r.json()).documenti[0].dati.consumo_annuo_kwh).toBe(6000);
  });
  it("conserva il consumo leggibile di un facsimile senza POD né spesa annua", async () => {
    testo = "Energia elettrica, consumo annuo 4220 kWh. Totale periodo 272 euro, incluso canone TV 18 euro.";
    ai.mockResolvedValue({
      content: JSON.stringify({ forniture: [{ pod: null, consumo_annuo_kwh: 4220, totale_da_pagare: 272, spesa_annua: null, canone_tv: 18, avvisi: ['POD oscurato nel facsimile'] }] }),
      rawResponse: { choices: [{ finish_reason: "stop" }] },
    });
    const r = await invoke();
    expect(r.status).toBe(200);
    const d = (await r.json()).documenti[0].dati;
    expect(d.pod).toBeNull();
    expect(d.consumo_annuo_kwh).toBe(4220);
    expect(d.spesa_annua).toBeNull();
  });
  it("riusa anche l'OCR completo dalla cache mantenendo la copertura della pagina", async () => {
    ai.mockResolvedValueOnce({ content: `POD ${pod}\nConsumo annuo: 6000 kWh`, rawResponse: { cached: true } });
    pdf.mockImplementation(async (_b, o) => {
      const r = await o.ocrPage(1, bytes);
      expect(r.finishReason).toBe("stop");
      return { text: r.text, pages: [{ page: 1, text: r.text, method: "ocr" }], coverage: { pages_total: 1, pages_unreadable: [] } };
    });
    const r = await invoke();
    expect(r.status).toBe(200);
    expect((await r.json()).documenti[0].pagine_non_lette).toEqual([]);
  });
  it("non conferma una risposta AI troncata o JSON non valido", async () => {
    ai.mockResolvedValue({
      content: "{",
      rawResponse: { choices: [{ finish_reason: "length" }] },
    });
    expect((await invoke()).status).toBe(422);
    ai.mockResolvedValue({
      content: "{",
      rawResponse: { choices: [{ finish_reason: "stop" }] },
    });
    expect((await invoke()).status).toBe(422);
  });
  it("non chiama AI per un testo completo e univoco con etichette verificate", async () => {
    testo =
      `Intestatario: Mario Esempio\nIndirizzo di fornitura: Via Test 1\nPeriodo dal: 2025-01-01\nPeriodo al: 2025-12-31\nPOD ${pod}\nConsumo annuo: 6.000 kWh\nConsumo del periodo: 6.000 kWh\nSpesa annua: 1.800,00 euro\nQuote fisse: 360,00 euro\nQuote consumi: 1.440,00 euro`;
    const r = await invoke(), d = await r.json();
    expect(r.status).toBe(200);
    expect(d.documenti[0].metodo).toBe("testo");
    expect(ai).not.toHaveBeenCalled();
  });
  it("un PDF illeggibile non provoca una seconda lettura AI priva di testo", async () => {
    testo = "";
    expect((await invoke()).status).toBe(422);
    expect(ai).not.toHaveBeenCalled();
  });
  it("inoltra soltanto la pagina scansita all'OCR con idempotenza e attribuzione aziendale", async () => {
    pdf.mockImplementation(
      async (
        _b: unknown,
        o: { ocrPage: (n: number, b: Uint8Array) => Promise<{ text: string }> },
      ) => {
        ai.mockResolvedValueOnce({
          content: `POD ${pod}\nPotenza impegnata: 15 kW`,
          rawResponse: { choices: [{ finish_reason: "stop" }] },
        });
        const r = await o.ocrPage(2, bytes);
        return {
          text: `Pagina nativa\n${r.text}`,
          pages: [{ page: 1, text: "Pagina nativa", method: "native" }, {
            page: 2,
            text: r.text,
            method: "ocr",
          }],
          coverage: {
            pages_total: 2,
            pages_unreadable: [],
            text_truncated: false,
          },
        };
      },
    );
    const r = await invoke(), d = await r.json();
    expect(r.status).toBe(200);
    expect(ai.mock.calls[0][0].idempotencyKey).toContain("ocr:2");
    expect(ai.mock.calls[0][0].companyId).toBe(company);
    expect(d.documenti[0].dati.potenza_impegnata_kw).toBe(15);
    expect(d.documenti[0].dati.pagine.potenza_impegnata_kw).toBe(2);
  });
  it("legge una foto come pagina uno e conserva il formato reale", async () => {
    const foto = new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xe0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ]),
      hash = Array.from(
        new Uint8Array(await webcrypto.subtle.digest("SHA-256", foto)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
    path = `${company}/${project}/${hash}.jpg`;
    download.mockResolvedValue({
      data: { size: foto.byteLength, arrayBuffer: async () => foto.buffer },
      error: null as Error | null,
    });
    const r = await invoke(), d = await r.json();
    expect(r.status).toBe(200);
    expect(pdf).not.toHaveBeenCalled();
    expect(ai.mock.calls[0][0].messages[1].content[1].image_url.url).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    expect(d.documenti[0]).toMatchObject({
      mime: "image/jpeg",
      pagine_totali: 1,
      confermato: false,
    });
  });
});
