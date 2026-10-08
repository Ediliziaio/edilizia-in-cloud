import { describe, expect, it } from "vitest";
import { publicAiAnswer, readableStreamingMarkdown, visibleAiAnswer, SILVIO_MISSING_PUBLIC_ANSWER } from "@/lib/silvio/visibleAnswer";
import { SILVIO_REPLY_STYLE } from "../../../supabase/functions/_shared/silvioReplyStyle";
import { readFileSync } from "node:fs";

const answer = '**Una commessa da verificare.**\n\n| Commessa | Prossimo passo |\n| --- | --- |\n| DEMO-001 | Verifica le ore |\n\nBudget non verificabile: mancano i costi.';
const envelope = JSON.stringify({ thinking: 'SECRET ragionamento "answer": "falso"', confidence: "high", uncertainty_reasons: ["dati mancanti"], answer });

describe("Only the public Silvio answer is delivered", () => {
  it.each([envelope, `Ecco: ${envelope}`, `\`\`\`json\n${envelope}\n\`\`\``, `Procedo con i dati disponibili.\n\n\`\`\`json\n${envelope}\n\`\`\``, `[${envelope}]`])("unwraps a saved envelope including a prose preamble", raw => {
    expect(publicAiAnswer(raw)).toBe(answer);
  });
  it("never leaks private fields at any stream boundary", () => {
    for (let i = 1; i <= envelope.length; i++) {
      const result = visibleAiAnswer(envelope.slice(0, i), { streaming: true });
      expect(result).not.toMatch(/SECRET|thinking|confidence|uncertainty_reasons|falso/);
      expect(result === "" || answer.startsWith(result)).toBe(true);
    }
  });
  it("never streams an internal preamble when structured output is expected", () => {
    const raw = `Procedo con i tool.\n\n${envelope}`;
    for (let i = 1; i <= raw.length; i++) {
      const result = visibleAiAnswer(raw.slice(0, i), { streaming: true, structured: true });
      expect(result === "" || answer.startsWith(result)).toBe(true);
    }
  });
  it.each([`Preambolo.\n\n\`\`\`json\n${envelope}\n\`\`\``, `Ecco: ${envelope}`, `[${envelope}]`])("does not leak reasoning in any fragment of a legacy stream", raw => {
    for (let i = 1; i <= raw.length; i++) {
      expect(visibleAiAnswer(raw.slice(0, i), { streaming: true })).not.toMatch(/SECRET|thinking|confidence|falso/);
    }
  });
  it("ignores nested answers and quoted spoofed keys", () => {
    expect(publicAiAnswer(JSON.stringify({ uncertainty_reasons: [{ answer: "SECRET" }], thinking: '"answer":"SECRET"', answer: "Risposta vera" }))).toBe("Risposta vera");
  });
  it("handles answer before metadata and arrays before the answer", () => {
    expect(publicAiAnswer(JSON.stringify({ answer, confidence: "high" }))).toBe(answer);
    expect(publicAiAnswer(JSON.stringify({ uncertainty_reasons: [1, { nested: [2, 3] }], answer }))).toBe(answer);
  });
  it.each(['{"answer":"Risposta" \n , "thinking":"SECRET"}', '{"answer":"Risposta"\n"thinking":"SECRET"}'])("handles spacing or a missing comma before private fields", raw => {
    expect(publicAiAnswer(raw)).toBe("Risposta");
  });
  it("decodes escaped quotes, slashes, newlines and split Unicode", () => {
    const expected = 'Dice "ciao".\nPercorso C:\\foto / 🟠';
    const raw = '{"thinking":"SECRET","answer":"Dice \\"ciao\\".\\nPercorso C:\\\\foto \\/ \\ud83d\\udfe0"}';
    expect(publicAiAnswer(raw)).toBe(expected);
    const halfway = raw.indexOf('\\udfe0');
    expect(visibleAiAnswer(raw.slice(0, halfway), { streaming: true })).toBe(expected.slice(0, -2).trim());
  });
  it.each(['{"thinking":"SECRET"}', '{"thinking":"SECRET","answer":""}', '{"thinking":"SECRET"', '{"thinking" "SECRET"}', '{"think'])('never substitutes thinking for a missing answer (%s)', raw => {
    expect(publicAiAnswer(raw)).toBe(SILVIO_MISSING_PUBLIC_ANSWER);
  });
  it("keeps a partial public answer if the wrapper is truncated", () => {
    expect(publicAiAnswer('{"thinking":"SECRET","answer":"**Risposta utile**\\nMancano le ore')).toBe('**Risposta utile**\nMancano le ore');
  });
  it.each(['## Titolo\n\nTesto **completo**.', 'Esempio: {"answer":"campo prodotto"}', '```json\n{"product":"cemento","quantity":4}\n```', '```chart\n{"type":"bar","values":[1,2]}\n```'])("preserves legitimate Markdown, code and charts", raw => {
    expect(publicAiAnswer(raw)).toBe(raw);
  });
  it("keeps caveats and does not silently shorten a detailed report", () => {
    const detailed = "Dettaglio necessario.\n".repeat(100) + "Mancano i costi: dato non definitivo.";
    expect(publicAiAnswer(JSON.stringify({ thinking: "SECRET", answer: detailed }))).toBe(detailed);
  });
  it("keeps complete code intact and does not flash empty emphasis", () => {
    expect(readableStreamingMarkdown('**')).toBe('');
    expect(readableStreamingMarkdown('Testo **')).toBe('Testo ');
    const code = '```js\nconst a = "**";\n```';
    expect(readableStreamingMarkdown(code)).toBe(code);
    expect(readableStreamingMarkdown('Testo `**`')).toBe('Testo `**`');
  });
  it("specifies concise replies and separates work, payment and budget risks", () => {
    expect(SILVIO_REPLY_STYLE).toContain("100-180");
    expect(SILVIO_REPLY_STYLE).toContain("100%");
    expect(SILVIO_REPLY_STYLE).toContain("scadenza");
    expect(SILVIO_REPLY_STYLE).toContain("budget");
  });
  it("wires the same protection into stream writes and final delivery without promoting thinking", () => {
    const source = readFileSync("supabase/functions/silvio-chat/index.ts", "utf8");
    expect(source).toContain("visibleAiAnswer(testo, { streaming: true, structured: useStructured })");
    expect(source).toContain("scriviSegnaposto(risposta)");
    expect(source).toContain("finalContent = avevaEnvelope ? publicAiAnswer(finalContent) : structured.answer");
    expect(source).not.toContain("thinkingMatch[1]");
    expect(source).toContain("+ SILVIO_REPLY_STYLE");
  });
});
