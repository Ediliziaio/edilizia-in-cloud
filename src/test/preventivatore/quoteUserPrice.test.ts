import { describe, expect, it, vi } from "vitest";
import { numeriNellaFrase, PREFISSO_SCELTA, prezzoDellUtenteVerificato, quoteChatResponseFormat, runQuoteChat, type QuoteChatProposal, type QuoteChatRequest, type QuoteChatTurn } from "../../../supabase/functions/_shared/quoteConversation";
import { applyChatResult, chatLineIssue, emptyChatDocument } from "@/lib/preventivi/quoteChatDocument";
import { quoteChatHistory } from "@/lib/preventivi/quoteChatContext";

/**
 * Il prezzo che l'utente detta in chat entra nella voce; un prezzo che
 * l'utente non ha scritto no. Il 29/10/2026, preparando un campo da tennis,
 * Silvio riceveva tutti i prezzi («scavo 12 euro al mc…») e li buttava via:
 * la regola contro i prezzi inventati non distingueva un prezzo del modello
 * da un prezzo dell'utente. Ora il modello può CITARE un prezzo, mai
 * inventarlo: il server lo tiene solo se la frase è dell'utente e contiene
 * quel numero, il client solo se l'unità non contraddice la voce.
 */
const id = "d2000000-0000-4000-a000-000000000002";
const scritto = "Usa i nostri prezzi: scavo 12 euro al mc, recinzione h 4 m 85 euro al m, tracciatura linee 650 euro a corpo, palo da 10 m con plinto 2.400 euro cad.";
const proposta = (o: Partial<QuoteChatProposal> = {}): QuoteChatProposal => ({ id: "scavo", title: "Scavo di sbancamento", description: "", unit: "m³", quantity: 259.2,
  quantityBasis: "648 m² x 0,40 m", referenceId: null, userPrice: { amount: 12, quote: "scavo 12 euro al mc" }, ...o });
const turno = (proposals: QuoteChatProposal[]): QuoteChatTurn => ({ version: 1, message: "Ecco le voci", title: "Campo da tennis", questions: [], proposals, warnings: [], searches: [] });
const richiesta = (messages: QuoteChatRequest["messages"]): QuoteChatRequest => ({ version: 1, companyId: id, sessionId: id, turnId: id, revision: 0, sourceId: null, messages, lines: [] });
const servizi = (t: QuoteChatTurn) => ({ complete: vi.fn().mockResolvedValue({ content: JSON.stringify(t), model: "stub" }), search: vi.fn().mockResolvedValue([]), decode: JSON.parse });

describe("numeri scritti in italiano", () => {
  it("legge migliaia col punto e decimali con la virgola", () => {
    expect(numeriNellaFrase("palo 2.400 euro, tubo 18,50 euro al m, 1250 cad")).toEqual([2400, 18.5, 1250]);
  });
});

describe("il server tiene solo i prezzi che l'utente ha scritto", () => {
  it("una frase dell'utente con quella cifra: il prezzo resta", async () => {
    const r = await runQuoteChat(richiesta([{ role: "user", text: scritto }]), servizi(turno([proposta()])));
    expect(r.turn.proposals[0].userPrice).toEqual({ amount: 12, quote: "scavo 12 euro al mc" });
  });
  it("una frase che l'utente non ha scritto: il prezzo si scarta e lo dice", async () => {
    const r = await runQuoteChat(richiesta([{ role: "user", text: scritto }]), servizi(turno([proposta({ userPrice: { amount: 9, quote: "scavo 9 euro al mc" } })])));
    expect(r.turn.proposals[0].userPrice).toBeNull();
    expect(r.turn.warnings.join(" ")).toMatch(/prezzo non applicato, non trovo/);
  });
  it("la frase c'è ma il numero è un altro: il prezzo si scarta", async () => {
    const r = await runQuoteChat(richiesta([{ role: "user", text: scritto }]), servizi(turno([proposta({ userPrice: { amount: 13, quote: "scavo 12 euro al mc" } })])));
    expect(r.turn.proposals[0].userPrice).toBeNull();
  });
  it("un prezzo in una risposta cliccata (testo dell'AI) non vale come prezzo dell'utente", () => {
    expect(prezzoDellUtenteVerificato({ amount: 25, quote: "resina a 25 euro al mq" }, [{ role: "user", text: `${PREFISSO_SCELTA} Uso la resina a 25 euro al mq.` }])).toBe(false);
  });
  it("un prezzo nei dati del programma (messaggi dell'assistente) non vale", () => {
    expect(prezzoDellUtenteVerificato({ amount: 22, quote: "resina 22 euro" }, [{ role: "assistant", text: "Budget preliminare: resina 22 euro al mq" }, { role: "user", text: "Fammi il preventivo" }])).toBe(false);
  });
  it("maiuscole, spazi e apostrofi tipografici non contano", () => {
    expect(prezzoDellUtenteVerificato({ amount: 650, quote: "tracciatura linee 650 euro a corpo" }, [{ role: "user", text: "Tracciatura   linee 650 Euro a corpo" }])).toBe(true);
  });
  it("lo schema stretto chiede il campo a ogni voce, nullo o con frase e cifra", () => {
    const f = quoteChatResponseFormat(richiesta([{ role: "user", text: "x" }])) as unknown as { json_schema: { schema: { properties: { proposals: { items: { required: string[]; properties: Record<string, unknown> } } } } } };
    const voce = f.json_schema.schema.properties.proposals.items;
    expect(voce.required).toContain("userPrice");
    expect(voce.properties.userPrice).toBeDefined();
  });
});

describe("nel client il prezzo dettato entra nella voce", () => {
  const applica = (p: QuoteChatProposal) => applyChatResult(emptyChatDocument(), { version: 1, turnId: id, revision: 0, turn: turno([p]), references: [], model: "stub", simulated: false }, id, null);
  it("con quantità e prezzo la voce è completa, con la provenienza scritta", () => {
    const { document } = applica(proposta());
    expect(document.lines[0].price).toBe(12);
    expect(document.lines[0].pricing?.basis).toContain("scavo 12 euro al mc");
    expect(chatLineIssue(document.lines[0])).toBeNull();
  });
  it("un prezzo «al mq» su una voce in metri cubi non entra", () => {
    const { document, notices } = applica(proposta({ userPrice: { amount: 12, quote: "scavo 12 euro al mq" } }));
    expect(document.lines[0].price).toBeNull();
    expect(notices.join(" ")).toMatch(/altra unità di misura/);
  });
  it("«a corpo» vale per una voce a corpo", () => {
    expect(applica(proposta({ unit: "a corpo", quantity: 1, userPrice: { amount: 650, quote: "tracciatura linee 650 euro a corpo" } })).document.lines[0].price).toBe(650);
  });
  it("senza prezzo dell'utente la voce resta da prezzare, come prima", () => {
    expect(applica(proposta({ userPrice: null })).document.lines[0].price).toBeNull();
  });
});

describe("la cronologia ricorda che una scelta cliccata è testo dell'AI", () => {
  it("al modello va il testo inviato, col prefisso, anche se la bolla mostra solo la scelta", () => {
    const storia = quoteChatHistory([{ role: "user", text: "Uso la resina", sent: `${PREFISSO_SCELTA} Uso la resina` }, { role: "assistant", text: "Bene" }], "E ora?");
    expect(storia[0].text).toBe(`${PREFISSO_SCELTA} Uso la resina`);
  });
});
