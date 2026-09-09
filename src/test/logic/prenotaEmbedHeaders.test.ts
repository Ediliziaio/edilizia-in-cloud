import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * L'embed di /prenota/<slug> sui siti dei clienti.
 *
 * In Cloudflare Pages, quando più regole di `_headers` corrispondono alla
 * stessa richiesta vince l'ULTIMA. La rimozione di X-Frame-Options per
 * /prenota stava prima del blocco /*, che subito dopo rimetteva SAMEORIGIN:
 * il riquadro restava vuoto sui siti dei clienti (ERR_BLOCKED_BY_RESPONSE)
 * mentre gli header sembravano a posto nel file. Questo test tiene fermo
 * l'ordine, che è l'unica cosa che conta.
 */
describe("Header per l'embed della prenotazione pubblica", () => {
  const headers = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");
  const righe = headers.split("\n");

  const indiceDi = (predicato: (riga: string) => boolean) => righe.findIndex(predicato);

  it("toglie X-Frame-Options su /prenota/*", () => {
    const blocco = headers.match(/^\/prenota\/\*\n(?:[ \t]+.*\n)+/m)?.[0] ?? "";
    expect(blocco).toContain("! X-Frame-Options");
  });

  it("lo fa DOPO il blocco /*, altrimenti la regola generale lo rimette", () => {
    const generale = indiceDi((r) => r.trim() === "/*");
    const prenota = indiceDi((r) => r.trim() === "/prenota/*" && righe.indexOf(r) > generale);
    const rimozione = righe.findIndex((r, i) => i > prenota && r.includes("! X-Frame-Options"));
    expect(generale).toBeGreaterThan(-1);
    expect(prenota).toBeGreaterThan(generale);
    expect(rimozione).toBeGreaterThan(prenota);
  });

  it("la CSP generale non blocca il framing con frame-ancestors", () => {
    // Togliere X-Frame-Options basta solo finché la CSP non dichiara
    // frame-ancestors: se un domani lo si aggiunge, i siti dei clienti vanno
    // elencati lì, o l'embed torna a rompersi senza che nessuno colleghi le
    // due cose.
    const csp = righe.find((r) => r.trim().startsWith("Content-Security-Policy:")) ?? "";
    expect(csp).not.toContain("frame-ancestors");
  });
});
