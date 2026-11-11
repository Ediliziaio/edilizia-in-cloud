/**
 * AI ferma per carta mancante, abbonamento sospeso o scaduto, credito finito: l'utente
 * legge il motivo vero, non «riprova» o «problema del file» (controllo dell'11/11/2026).
 *
 * Tiene fermo che:
 *   · «Abbonamento sospeso o scaduto…» diventa 402 payment_method_required come la carta;
 *   · i due testi del gate, arrivati in un 500 senza codice, aprono la finestra della carta;
 *   · la lettura del PDF pagina per pagina rilancia i blocchi invece di contarli come pagine
 *     non lette (computo-ai-extract, silvio-commessa, silvio-extract-pdf);
 *   · computo e Silvio rispondono col codice; il bot WhatsApp non dice «riprova».
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { bloccoAiPerUtente, erroreAiPerUtente } from "../../../supabase/functions/_shared/erroriAi";
import { SENZA_AI, messaggioErroreLettura } from "../../../supabase/functions/_shared/computoErroreLettura";
import { readPdfPages, type PdfPageLike } from "../../../supabase/functions/_shared/pdfExtraction";
import { classificaErroreBot } from "../../../supabase/functions/whatsapp-ai-processor/erroreBot";
import { STR } from "../../../supabase/functions/whatsapp-ai-processor/prompts/strings";
import { classificaBloccoPagamento } from "@/lib/creditoEsaurito";

// I testi veri di _shared/requirePaymentMethod.ts (Deno non si importa in vitest per via degli URL).
const CARTA = "Registra una carta di pagamento aziendale per usare questo strumento (Impostazioni → Fatturazione).";
const ABBONAMENTO = "Abbonamento sospeso o scaduto: rinnova per riattivare questo strumento.";
const SALDO = "Credito insufficiente o bloccato: Saldo €0.00 insufficiente per stima €0.0685";
const PROVIDER = "Tutti i modelli falliti per task 'pdf_vision_extract' (2 tentativi) — ultimo errore: google/gemini-2.5-flash: OpenRouter 402: credito provider insufficiente";

const errore = (nome: string, messaggio: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(messaggio), { name: nome, ...extra });

describe("1. abbonamento sospeso o scaduto come la carta", () => {
  it("i testi del gate restano quelli di requirePaymentMethod.ts", () => {
    const gate = readFileSync("supabase/functions/_shared/requirePaymentMethod.ts", "utf8");
    expect(gate).toContain(JSON.stringify(CARTA));
    expect(gate).toContain(JSON.stringify(ABBONAMENTO));
  });

  it("402 payment_method_required col testo vero, e si apre la finestra della carta", () => {
    const e = erroreAiPerUtente(errore("AiRouterError", ABBONAMENTO))!;
    expect(e).toEqual({ status: 402, body: { error: ABBONAMENTO, code: "payment_method_required" } });
    expect(classificaBloccoPagamento(e.status, e.body)).toBe("payment");
  });

  it("il computo fermo per l'abbonamento suggerisce PriMus ed Excel come per la carta", () => {
    expect(messaggioErroreLettura(`AI Router error: ${ABBONAMENTO}`, "pdf")).toContain(SENZA_AI);
    expect(messaggioErroreLettura(ABBONAMENTO, "xlsx")).toBe(`Extraction error: ${ABBONAMENTO}`);
  });

  it("bloccoAiPerUtente: carta, abbonamento, credito dell'azienda e del provider sì; i modelli giù no", () => {
    expect(bloccoAiPerUtente(errore("AiRouterError", CARTA))?.body.code).toBe("payment_method_required");
    expect(bloccoAiPerUtente(errore("AiRouterError", ABBONAMENTO))?.body.code).toBe("payment_method_required");
    expect(bloccoAiPerUtente(errore("AiCompanyCreditError", SALDO, { reason: "insufficient_balance" }))?.body.code).toBe("insufficient_credits");
    expect(bloccoAiPerUtente(errore("AiRouterError", PROVIDER))?.body.code).toBe("servizio_non_disponibile");
    expect(bloccoAiPerUtente(errore("AiRouterError", "Tutti i modelli falliti per task 'x' — ultimo errore: timeout"))).toBeNull();
    expect(bloccoAiPerUtente(new Error("PDF corrotto"))).toBeNull();
  });
});

describe("2. il gate in un 500 senza codice apre comunque la finestra della carta", () => {
  it.each([
    [500, { error: `Errore interno: ${CARTA}` }],
    [500, { error: `AI Router error: ${ABBONAMENTO}` }],
    [502, { error: "Registra una carta di pagamento aziendale per usare l'AI." }],
    [500, { message: ABBONAMENTO }],
  ])("%i %j → payment", (status, corpo) => {
    expect(classificaBloccoPagamento(status, corpo)).toBe("payment");
  });

  it("gli altri 500 restano fuori", () => {
    expect(classificaBloccoPagamento(500, { error: "Errore interno: timeout" })).toBeNull();
    expect(classificaBloccoPagamento(500, { error: "Il pagamento della fattura è scaduto" })).toBeNull();
  });

  it("il credito finito resta credito, non carta", () => {
    expect(classificaBloccoPagamento(500, { error: `AI Router error: ${SALDO}` })).toBe("credits");
  });
});

describe("3. la lettura del PDF non nasconde i blocchi", () => {
  const scan = (): PdfPageLike => ({ getTextContent: async () => ({ items: [] }), getOperatorList: async () => ({ fnArray: [99] }) });
  const documento = (n: number) => ({ numPages: n, getPage: async () => scan() });

  it.each([
    ["carta", errore("AiRouterError", CARTA)],
    ["abbonamento", errore("AiRouterError", ABBONAMENTO)],
    ["credito dell'azienda", errore("AiCompanyCreditError", SALDO, { reason: "insufficient_balance" })],
    ["credito del provider", errore("AiProviderCreditError", "OpenRouter 402")],
  ])("%s: si rilancia alla prima pagina, senza provare le altre", async (_nome, err) => {
    const ocr = vi.fn(async () => { throw err; });
    await expect(readPdfPages(documento(3), { imageOps: [99], maxChars: 1000, ocrPage: ocr })).rejects.toBe(err);
    expect(ocr).toHaveBeenCalledTimes(1);
  });

  it("un errore qualunque della pagina resta «pagina non letta»", async () => {
    const r = await readPdfPages(documento(2), { imageOps: [99], maxChars: 1000, ocrPage: async () => { throw new Error("timeout"); } });
    expect(r.coverage.pages_unreadable).toEqual([1, 2]);
    expect(r.pages[0].warning).toBe("Lettura della pagina non riuscita.");
  });
});

describe("4-5. computo e Silvio rispondono col motivo", () => {
  const sorgente = (f: string) => readFileSync(`supabase/functions/${f}/index.ts`, "utf8");

  it("computo-ai-extract: 402/503 col codice dal catch dell'estrazione", () => {
    const s = sorgente("computo-ai-extract");
    expect(s).toMatch(/const perUtente = erroreAiPerUtente\(err\);\s*if \(perUtente\) return jsonResponse\(perUtente\.body, perUtente\.status, cors\);\s*return errorResponse\(err\.message, 500, cors\);/);
    // L'involucro «AI Router error:» lascia passare i blocchi, così il nome della classe resta.
    expect(s.match(/if \(bloccoAiPerUtente\(err\)\) throw err;/g)?.length).toBe(2);
  });

  it("silvio-extract-pdf: prima erroreAiPerUtente, poi «Verifica il file»", () => {
    const s = sorgente("silvio-extract-pdf");
    expect(s.indexOf("erroreAiPerUtente(error)")).toBeGreaterThan(0);
    expect(s.indexOf("erroreAiPerUtente(error)")).toBeLessThan(s.indexOf("Estrazione PDF non riuscita. Verifica il file"));
  });

  it("silvio-commessa: il blocco dall'OCR diventa la risposta col codice, non «carica una foto nitida»", () => {
    const s = sorgente("silvio-commessa");
    expect(s).toMatch(/const blocco = bloccoAiPerUtente\(e\);\s*if \(blocco\) return jsonResponse\(blocco\.body, blocco\.status, cors\);\s*throw e;/);
    expect(s).not.toContain("creditoFinito");
  });
});

describe("7. bot WhatsApp", () => {
  it("carta e abbonamento: blocco dell'azienda col motivo per l'ufficio", () => {
    expect(classificaErroreBot(errore("AiRouterError", CARTA))).toEqual({ tipo: "blocco_azienda", motivo: CARTA });
    expect(classificaErroreBot(new Error(`OCR vision fallito: AI Router error: ${ABBONAMENTO}`))).toEqual({ tipo: "blocco_azienda", motivo: ABBONAMENTO });
  });

  it("credito finito e chiave rifiutata restano «AI ferma»; il resto è generico", () => {
    expect(classificaErroreBot(errore("AiCompanyCreditError", SALDO))).toEqual({ tipo: "ai_ferma" });
    expect(classificaErroreBot(new Error("OpenRouter 401 unauthorized"))).toEqual({ tipo: "ai_ferma" });
    expect(classificaErroreBot(new Error("TypeError: x is undefined"))).toEqual({ tipo: "generico" });
  });

  it("la frase per chi scrive è neutra: niente carta, abbonamento né «riprova tra un momento»", () => {
    for (const frase of [STR.shared.ai_non_disponibile_avvisato, STR.shared.ai_non_disponibile]) {
      expect(frase).toMatch(/^Al momento non posso rispondere in automatico/);
      expect(frase).not.toMatch(/carta|abbonamento|credito|Riprova tra un momento/i);
    }
  });

  it("index.ts usa la classificazione e avvisa l'ufficio con un ticket", () => {
    const s = readFileSync("supabase/functions/whatsapp-ai-processor/index.ts", "utf8");
    expect(s).toContain("const esito = classificaErroreBot(err);");
    expect(s).toMatch(/esito\.tipo === "blocco_azienda"\) \{\s*const avvisato = await ticketPerUfficio\(/);
    expect(s).not.toMatch(/const aiFerma = \//);
  });
});
