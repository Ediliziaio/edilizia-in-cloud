import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  creaHandlerBollettaFv,
  type DipendenzeBollettaFv,
} from "../../../supabase/functions/fv-leggi-bolletta/handler";
import { datiBollettaVuoti } from "../../../supabase/functions/_shared/fvBollette";
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
beforeEach(async () => {
  vi.clearAllMocks();
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
describe("Endpoint bollette: identità, OCR e conti AI", () => {
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
