/**
 * La pagina di cancellazione dati deve rispondere 200 anche al crawler di Meta.
 *
 * 14/09/2026: Meta bloccava il passaggio in modalità Live perché
 * www.ediliziaincloud.com/data-deletion/ restituiva 404 a facebookexternalhit:
 * il middleware serve ai bot solo le pagine della sua mappa, e quella non c'era.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const middleware = readFileSync(join(ROOT, "functions/_middleware.js"), "utf8");
const redirects = readFileSync(join(ROOT, "public/_redirects"), "utf8");

describe("pagina di cancellazione dati per i bot", () => {
  it("facebookexternalhit è trattato come bot", () => {
    expect(middleware).toMatch(/\/facebookexternalhit\/i/);
  });

  it("la mappa delle pagine per i bot contiene /data-deletion con le istruzioni", () => {
    expect(middleware).toMatch(/"\/data-deletion": \{/);
    expect(middleware).toMatch(/privacy@ediliziaincloud\.com/);
    expect(middleware).toMatch(/meta-data-deletion-callback/);
  });

  it("l'indirizzo italiano porta alla stessa pagina", () => {
    expect(redirects).toMatch(/^\/cancellazione-dati\s+\/data-deletion\/\s+301$/m);
  });
});
