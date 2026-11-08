// parse-rapportino-ai (08/11/2026): carta e saldo si controllano prima di Whisper.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sorgente = readFileSync("supabase/functions/parse-rapportino-ai/index.ts", "utf8");
const corpo = sorgente.slice(sorgente.indexOf("await requireCompanyAccess("));

describe("Compila parlando: il credito prima dell'audio", () => {
  it("controlla carta e saldo dopo l'azienda e prima di tutto il resto", () => {
    const carta = corpo.indexOf("gateAiPayment(");
    const saldo = corpo.indexOf("precheckCreditoAudio(");
    const risposta = corpo.indexOf("creditDecisionResponse(credito");
    const lettura = corpo.indexOf("req.json()");
    expect(carta).toBeGreaterThan(-1);
    expect(saldo).toBeGreaterThan(carta);
    expect(risposta).toBeGreaterThan(saldo);
    expect(lettura).toBeGreaterThan(risposta);
  });
});
