import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * I PDF generati nel browser (@react-pdf) comprimono le immagini con fflate, che
 * lavora in un worker creato da un blob. La CSP di /* non dichiarava worker-src:
 * si ricadeva su script-src, che non ammette blob:, il worker veniva rifiutato e
 * la generazione restava ferma per sempre su «Generazione PDF in corso…», senza
 * un errore a schermo (la libreria non ascolta l'errore del worker).
 */
describe("CSP: i PDF nel browser possono avviare il loro worker", () => {
  const headers = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");
  const csp = headers
    .split("\n")
    .find((r) => r.trim().startsWith("Content-Security-Policy:")) ?? "";
  const direttive = new Map(
    csp
      .replace(/^\s*Content-Security-Policy:\s*/, "")
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((parti) => parti[0])
      .map(([nome, ...valori]) => [nome, valori] as const),
  );

  it("la CSP dichiara worker-src con blob:", () => {
    expect(csp).not.toBe("");
    expect(direttive.get("worker-src")).toEqual(expect.arrayContaining(["'self'", "blob:"]));
  });
});
