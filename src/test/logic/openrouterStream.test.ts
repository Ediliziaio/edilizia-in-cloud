import { describe, it, expect } from "vitest";
import {
  applicaEvento,
  creaAccumulatore,
  estraiEventiSse,
  rispostaDaAccumulatore,
} from "../../../supabase/functions/_shared/openrouterStream";

// Lo stream SSE di OpenRouter come arriva davvero: a pezzi arbitrari, con
// commenti keep-alive, tool call spezzate in piu' eventi e l'usage in coda.
// Il router lo ricompone nella forma di una risposta normale: se questa
// ricomposizione sbaglia, a valle si perdono tool call o si fattura zero.

function evento(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

describe("estraiEventiSse", () => {
  it("separa gli eventi completi e restituisce il pezzo incompleto come resto", () => {
    const grezzo = `data: {"a":1}\n\n: OPENROUTER PROCESSING\n\ndata: {"b":2}\n\ndata: {"c"`;
    const { eventi, resto } = estraiEventiSse(grezzo);
    expect(eventi).toEqual(['{"a":1}', '{"b":2}']);
    expect(resto).toBe('data: {"c"');
  });

  it("ignora i commenti keep-alive e i campi che non sono data", () => {
    const grezzo = `: OPENROUTER PROCESSING\nevent: ping\nid: 7\ndata: {"x":true}\n\n`;
    const { eventi } = estraiEventiSse(grezzo);
    expect(eventi).toEqual(['{"x":true}']);
  });

  it("concatena piu' righe data dello stesso evento con un a capo", () => {
    const { eventi } = estraiEventiSse(`data: riga1\ndata: riga2\n\n`);
    expect(eventi).toEqual(["riga1\nriga2"]);
  });

  it("accetta anche i fine riga Windows", () => {
    const { eventi, resto } = estraiEventiSse(`data: {"a":1}\r\n\r\ndata: [DONE]\r\n\r\n`);
    expect(eventi).toEqual(['{"a":1}', "[DONE]"]);
    expect(resto).toBe("");
  });
});

describe("applicaEvento + rispostaDaAccumulatore", () => {
  it("ricompone una risposta di solo testo con usage e finish_reason", () => {
    const acc = creaAccumulatore();
    const pezzi: Array<Record<string, unknown>> = [
      { id: "gen-1", model: "anthropic/claude-sonnet-4.5", choices: [{ index: 0, delta: { role: "assistant", content: "Ciao" }, finish_reason: null }] },
      { id: "gen-1", choices: [{ index: 0, delta: { content: " Florin" }, finish_reason: null }] },
      { id: "gen-1", choices: [{ index: 0, delta: { content: "." }, finish_reason: "stop" }] },
      { id: "gen-1", choices: [{ index: 0, delta: { content: "", role: "assistant" }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 3, cost: 0.001 } },
    ];
    for (const p of pezzi) expect(applicaEvento(acc, JSON.stringify(p))).toBe("dati");
    expect(applicaEvento(acc, "[DONE]")).toBe("fine");

    const r = rispostaDaAccumulatore(acc);
    expect(r.id).toBe("gen-1");
    expect(r.model).toBe("anthropic/claude-sonnet-4.5");
    expect(r.choices[0].message.content).toBe("Ciao Florin.");
    expect(r.choices[0].message.tool_calls).toBeUndefined();
    expect(r.choices[0].finish_reason).toBe("stop");
    expect(r.usage).toEqual({ prompt_tokens: 100, completion_tokens: 3, cost: 0.001 });
    expect(acc.eventi).toBe(4);
  });

  it("ricompone due tool call arrivate a frammenti, con gli argomenti concatenati", () => {
    const acc = creaAccumulatore();
    const pezzi: Array<Record<string, unknown>> = [
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "get_overdue_payments", arguments: "" } }] }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"days' } }] }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '":30}' } }] }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 1, id: "call_b", type: "function", function: { name: "get_cashflow_status", arguments: "{}" } }] }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
    ];
    for (const p of pezzi) applicaEvento(acc, JSON.stringify(p));

    const r = rispostaDaAccumulatore(acc);
    expect(r.choices[0].finish_reason).toBe("tool_calls");
    expect(r.choices[0].message.content).toBe("");
    expect(r.choices[0].message.tool_calls).toEqual([
      { id: "call_a", type: "function", function: { name: "get_overdue_payments", arguments: '{"days":30}' } },
      { id: "call_b", type: "function", function: { name: "get_cashflow_status", arguments: "{}" } },
    ]);
  });

  it("da' un id di ripiego a una tool call arrivata senza id", () => {
    const acc = creaAccumulatore();
    applicaEvento(acc, JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: "crea_task", arguments: "{}" } }] }, finish_reason: null }] }));
    const tc = rispostaDaAccumulatore(acc).choices[0].message.tool_calls!;
    expect(tc[0].id).toBe("call_0");
  });

  it("registra l'errore a meta' stream", () => {
    const acc = creaAccumulatore();
    applicaEvento(acc, JSON.stringify({ choices: [{ index: 0, delta: { content: "Sto per" }, finish_reason: null }] }));
    applicaEvento(acc, JSON.stringify({ id: "cmpl-1", error: { code: "server_error", message: "Provider crashed" }, choices: [{ index: 0, delta: { content: "" }, finish_reason: "error" }] }));
    expect(acc.errore).toBe("Provider crashed");
    expect(acc.finishReason).toBe("error");
  });

  it("non si rompe su eventi vuoti o non JSON", () => {
    const acc = creaAccumulatore();
    expect(applicaEvento(acc, "")).toBe("vuoto");
    expect(applicaEvento(acc, "non-json")).toBe("vuoto");
    expect(applicaEvento(acc, "42")).toBe("vuoto");
    expect(acc.eventi).toBe(0);
  });

  it("gestisce uno stream reale spezzato in punti arbitrari", () => {
    const completo =
      `: OPENROUTER PROCESSING\n\n` +
      evento({ id: "g", choices: [{ index: 0, delta: { content: "Le rate " }, finish_reason: null }] }) +
      evento({ id: "g", choices: [{ index: 0, delta: { content: "scadute sono 3." }, finish_reason: "stop" }] }) +
      evento({ id: "g", choices: [{ index: 0, delta: { content: "" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 6 } }) +
      `data: [DONE]\n\n`;
    // Pezzi da 7 byte: le righe si spezzano ovunque, anche dentro il JSON.
    const acc = creaAccumulatore();
    let buffer = "";
    let fine = false;
    for (let i = 0; i < completo.length && !fine; i += 7) {
      buffer += completo.slice(i, i + 7);
      const { eventi, resto } = estraiEventiSse(buffer);
      buffer = resto;
      for (const ev of eventi) {
        if (applicaEvento(acc, ev) === "fine") { fine = true; break; }
      }
    }
    expect(fine).toBe(true);
    expect(acc.content).toBe("Le rate scadute sono 3.");
    expect(acc.usage).toEqual({ prompt_tokens: 10, completion_tokens: 6 });
  });
});
