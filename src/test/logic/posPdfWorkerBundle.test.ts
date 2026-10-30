/**
 * Il Worker che disegna il PDF del POS, come lo vede il build di produzione. Il 30/10/2026 il primo build con il Worker
 * si fermò: «UMD and IIFE output formats are not supported for code-splitting builds». In produzione un Worker è un
 * file unico (IIFE) e non può caricare pezzi dopo con import(): in sviluppo funzionava, in produzione no, e nessun
 * test unitario poteva accorgersene. Qui si fa il build del Worker per davvero (senza scrivere niente su disco).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Il Worker del PDF nel bundle di produzione", () => {
  it("si compila come file unico e porta con sé pdfmake e i font Roboto", () => {
    const radice = path.resolve(__dirname, "../../..");
    const uscita = execFileSync(process.execPath, [path.join(radice, "scripts/verifica-bundle-worker-pos.mjs")], { cwd: radice, encoding: "utf8", timeout: 240_000, stdio: ["ignore", "pipe", "pipe"] });
    const r = JSON.parse(uscita.trim().split("\n").pop()!) as { trovato: boolean; createPdf: boolean; roboto: boolean };
    expect(r.trovato, "il Worker deve uscire come file a sé").toBe(true);
    expect(r.createPdf).toBe(true);
    expect(r.roboto).toBe(true);
  }, 260_000);
});
