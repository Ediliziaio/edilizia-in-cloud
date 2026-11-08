/**
 * Lettura del computo fermata dalla carta o dal credito AI: il messaggio dice
 * che PriMus ed Excel si leggono senza AI (5 computi su 22 fermi così, 07/11/2026).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SENZA_AI, messaggioErroreLettura } from "../../../supabase/functions/_shared/computoErroreLettura";

const CARTA = "AI Router error: Registra una carta di pagamento aziendale per usare questo strumento (Impostazioni → Fatturazione).";
const OPENROUTER = "OCR vision fallito: AI Router error: Tutti i modelli falliti — ultimo errore: OpenRouter 402: {\"error\":{\"message\":\"This request requires at least $0.50 in balance for files\"}}";

describe("messaggio di una lettura del computo fallita", () => {
  it("senza carta: il motivo resta, più l'indicazione di PriMus ed Excel", () => {
    const m = messaggioErroreLettura(CARTA, "pdf");
    expect(m).toContain("carta di pagamento");
    expect(m).toContain(SENZA_AI);
  });
  it("crediti dell'azienda finiti: stessa indicazione", () => {
    expect(messaggioErroreLettura("I crediti AI dell’azienda sono insufficienti", "image")).toContain(SENZA_AI);
  });
  it("credito della piattaforma finito: niente JSON del provider, si dice di riprovare", () => {
    const m = messaggioErroreLettura(OPENROUTER, "pdf");
    expect(m).not.toContain("{");
    expect(m).toMatch(/Riprova più tardi/);
    expect(m).toContain(SENZA_AI);
  });
  it("altri errori e file già PriMus/Excel: il messaggio di prima", () => {
    expect(messaggioErroreLettura("File corrotto", "pdf")).toBe("Extraction error: File corrotto");
    expect(messaggioErroreLettura(CARTA, "xlsx")).toBe(`Extraction error: ${CARTA}`);
  });
  it("la funzione lo usa", () => {
    expect(readFileSync("supabase/functions/computo-ai-extract/index.ts", "utf8")).toContain("messaggioErroreLettura(");
  });
});
