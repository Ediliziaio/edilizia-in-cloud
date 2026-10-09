import { describe, expect, it } from "vitest";
import { parseStructuredResponse, sanitizeAnswer } from "../../../supabase/functions/_shared/structuredOutput";
import {
  silvioHistoryContent, silvioHistoryMessages, silvioToolResultForPrompt,
  silvioCompletionNotice, silvioAnswerWasInterrupted, silvioToolContextIsPartial,
} from "../../../supabase/functions/_shared/silvioAnswerQuality";

describe("Silvio keeps useful answers while removing internal narration", () => {
  it.each([
    "Vedo che restano da incassare 3.000 €.\n\nLa scadenza non è impostata: il saldo non è ancora un insoluto verificato.",
    "Noto che mancano le ore di due operai.\n\nIl consuntivo non è completo.",
    "Procedo con la bozza richiesta.\n\nÈ da approvare prima dell'invio.",
    "Dai dati che ho, il margine non è verificabile.\n\nMancano i costi dei materiali.",
  ])("keeps the conclusion and caveat: %s", answer => {
    expect(sanitizeAnswer(answer)).toEqual({ cleaned: answer, wasModified: false, isFullyChainOfThought: false });
  });
  it("retains a short exact answer after an internal preamble", () => {
    const raw = `Ho i dati dai tool. ${"Appunti interni. ".repeat(10)}\n\n3.000 €.`;
    expect(sanitizeAnswer(raw)).toEqual({ cleaned: "3.000 €.", wasModified: true, isFullyChainOfThought: false });
  });
  it.each(["Ho i dati dai tool. Analizzo:", "get_cashflow_status ritorna: errore"])("rejects an entirely internal one-line reply", raw => {
    expect(sanitizeAnswer(raw)).toMatchObject({ cleaned: "", wasModified: true, isFullyChainOfThought: true });
  });
  it("does not loosen recovery of a private thinking field", () => {
    const raw = JSON.stringify({ thinking: "Vedo che " + "Appunti interni non destinati all'utente. ".repeat(10), confidence: "medium", answer: "3.000 €." });
    expect(parseStructuredResponse(raw)?.answer).toBe("3.000 €.");
  });
});

describe("Follow-up context contains readable, completed turns", () => {
  const assistant = { assistant: true };
  it.each(["…", "...", "⚠️ C'è stato un problema tecnico: timeout", "💳 Credito finito", "⏳ Questa richiesta è già in elaborazione.", "Mi dispiace, non sono riuscito a comporre una risposta utile."])("omits failed/placeholding answers: %s", raw => {
    expect(silvioHistoryContent(raw, assistant)).toBeNull();
  });
  it("keeps real warnings and the user's own text", () => {
    const text = "⚠️ Attenzione: due fatture risultano scadute; manca la riconciliazione bancaria.";
    expect(silvioHistoryContent(text, assistant)).toBe(text);
    expect(silvioHistoryContent("⚠️ C'è stato un problema tecnico", { assistant: false })).toBe("⚠️ C'è stato un problema tecnico");
  });
  it("omits live text and extracts only the public saved answer", () => {
    const raw = JSON.stringify({ thinking: "PRIVATE", confidence: "high", answer: "La bozza non è stata inviata." });
    expect(silvioHistoryContent(raw, { assistant: true, streaming: true })).toBeNull();
    expect(silvioHistoryContent(raw, assistant)).toBe("La bozza non è stata inviata.");
    expect(silvioHistoryContent('{"thinking":"PRIVATE"}', assistant)).toBeNull();
  });
  it("marks earlier long messages as partial without changing stored text", () => {
    const raw = "Dato verificato. ".repeat(200);
    const result = silvioHistoryContent(raw, assistant)!;
    expect(result).toContain("Messaggio precedente parziale");
    expect(result.startsWith(raw.slice(0, 1500))).toBe(true);
    expect(raw.endsWith("Dato verificato. ")).toBe(true);
  });
  it("does not send the current long request as a truncated history turn", () => {
    const question = "Verifica il documento. ".repeat(300) + "Condizione finale indispensabile: non inviare.";
    const rows = [
      { id: "old", sender_id: "user", content: "Parliamo della commessa A." },
      { id: "answer", sender_id: "silvio", content: "Mancano i costi consuntivi." },
      { id: "current", sender_id: "user", content: question },
    ];
    const history = silvioHistoryMessages(rows, { assistantSenderId: "silvio", currentSenderId: "user", currentContent: question, currentMessageId: "current" });
    const messages = [...history, { role: "user", content: question }];
    expect(history).toHaveLength(2);
    expect(messages.at(-1)?.content).toBe(question);
    expect(messages.filter(m => m.content.includes("Condizione finale"))).toHaveLength(1);
    expect(rows[2].content).toBe(question);
  });
  it("keeps repeated older requests, other speakers and attribution", () => {
    const rows = [
      { id: "old", sender_id: "user", content: "Quanto manca?" },
      { id: "other", sender_id: "other-admin", content: "Quanto manca?" },
      { id: "current", sender_id: "user", content: "Quanto manca?" },
    ];
    expect(silvioHistoryMessages(rows, {
      assistantSenderId: "silvio", currentSenderId: "user", currentContent: "Quanto manca?", otherSenderPrefix: "[altro super_admin] ",
    })).toEqual([
      { role: "user", content: "Quanto manca?" },
      { role: "user", content: "[altro super_admin] Quanto manca?" },
    ]);
  });
});

describe("Large tool results remain valid JSON with explicit coverage", () => {
  it("preserves small tool receipts, nulls, zeroes and warning lists exactly", () => {
    const result = { success: false, error: "Permesso mancante", data: { total: null as number | null, paid: 0, data_quality: { warnings: ["Mancano i costi"] } } };
    expect(silvioToolResultForPrompt(result)).toBe(JSON.stringify(result));
    expect(silvioToolResultForPrompt(undefined)).toBe("null");
  });
  it("keeps totals and caveats even when a row collection precedes them", () => {
    const result = { success: true, data: {
      rows: Array.from({ length: 100 }, (_, i) => ({ id: i, note: "descrizione ".repeat(100), amount: 100 })),
      total_due: 3000, total_count: 100, coverage_complete: false,
      data_quality: { warnings: ["La riconciliazione bancaria è incompleta."] },
    } };
    const raw = JSON.stringify(result);
    const text = silvioToolResultForPrompt(result);
    const shown = JSON.parse(text);
    expect(text.length).toBeLessThanOrEqual(8000);
    expect(shown).toMatchObject({ _silvio_partial_result: true, summary: { success: true, data: {
      total_due: 3000, total_count: 100, coverage_complete: false,
      data_quality: { warnings: ["La riconciliazione bancaria è incompleta."] },
      rows: { _silvio_partial_array: true, available_items: 100 },
    } } });
    expect(shown.warning).toContain("Non calcolare totali dal campione");
    expect(JSON.stringify(result)).toBe(raw);
  });
  it("retains action status without promoting a large proposal to execution", () => {
    const shown = JSON.parse(silvioToolResultForPrompt({
      success: true, proposalId: "proposal-1", riskLevel: "yellow", pending_review: true,
      data: { draft: "Bozza da leggere. ".repeat(1000), sent: false },
    }));
    expect(shown.summary).toMatchObject({ success: true, proposalId: "proposal-1", riskLevel: "yellow", pending_review: true, data: { sent: false } });
  });
  it("keeps useful long narrative text when the partial result still fits the budget", () => {
    const narrative = "Condizione contrattuale verificata. ".repeat(40);
    const shown = JSON.parse(silvioToolResultForPrompt({ data: {
      draft: narrative, unrelated_rows: Array.from({ length: 200 }, (_, i) => ({ id: i, note: "note ".repeat(30) })),
    } }));
    expect(shown.summary.data.draft).toBe(narrative);
  });
  it("bounds escaping-heavy data without returning broken JSON", () => {
    for (const budget of [512, 1000, 8000]) {
      const text = silvioToolResultForPrompt({ data: Array.from({ length: 500 }, () => ({ note: '\\"\n'.repeat(100), amount: null as number | null })) }, budget);
      expect(text.length).toBeLessThanOrEqual(budget);
      expect(JSON.parse(text)._silvio_partial_result).toBe(true);
    }
  });
});

describe("An output limit cannot silently look like a completed analysis", () => {
  it("discloses incomplete inputs even if the model omitted the caveat", () => {
    const promptResult = silvioToolResultForPrompt({ data: "documento ".repeat(2000) });
    const answer = "Da incassare: 3.000 € nell'ambito selezionato.";
    const finished = silvioCompletionNotice(answer, "stop", silvioToolContextIsPartial(promptResult));
    expect(finished).toContain(answer);
    expect(finished).toContain("l’elenco potrebbe essere incompleto");
    expect(silvioToolContextIsPartial(silvioToolResultForPrompt({ data: { total: 3000 } }))).toBe(false);
  });
  it("uses one caveat for interrupted output with incomplete inputs", () => {
    const result = silvioCompletionNotice("Risposta in corso", "length", true);
    expect(result).toContain("interrotta");
    expect(result).not.toContain("l’elenco potrebbe essere incompleto");
  });
  it.each(["length", "max_tokens"])("marks %s without changing already readable facts", finish => {
    const answer = "Registrati 3.000 €; manca il consuntivo.";
    expect(silvioAnswerWasInterrupted(finish)).toBe(true);
    expect(silvioCompletionNotice(answer, finish)).toContain(answer);
    expect(silvioCompletionNotice(answer, finish)).toContain("non considero completata l’analisi");
  });
  it.each(["stop", "tool_calls", null, undefined])("does not change completed output (%s)", finish => {
    expect(silvioAnswerWasInterrupted(finish)).toBe(false);
    expect(silvioCompletionNotice("Saldo: 3.000 €.", finish)).toBe("Saldo: 3.000 €.");
  });
});
