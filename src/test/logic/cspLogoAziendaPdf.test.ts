import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Impresa Vulcano, 10/11/2026: «non riesco a generare il PDF». Il logo dell'azienda è salvato come
 * https://app.ediliziaincloud.com/loghi/impresa-vulcano.png, ma l'app gira anche su www. e admin.: chi lavorava da
 * www. (l'utente che ha creato ODA-2026-0007) vedeva «Impossibile scaricare il PDF — Failed to fetch», perché la
 * CSP ammetteva il fetch solo verso 'self'. `generaPdfOperativo` legge il logo con fetch; react-pdf anche.
 */
const headers = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");

/** Le intestazioni di una regola di _headers (il percorso a inizio riga, le intestazioni rientrate sotto). */
function regola(percorso: string): string[] {
  const righe = headers.split("\n");
  const inizio = righe.findIndex((r) => r.trimEnd() === percorso);
  if (inizio < 0) return [];
  const fine = righe.findIndex((r, i) => i > inizio && !/^\s/.test(r));
  return righe.slice(inizio + 1, fine < 0 ? undefined : fine).map((r) => r.trim()).filter(Boolean);
}

const csp = regola("/*").find((r) => r.startsWith("Content-Security-Policy:")) ?? "";
const connectSrc =
  csp.replace(/^Content-Security-Policy:\s*/, "").split(";").map((d) => d.trim().split(/\s+/))
    .find(([nome]) => nome === "connect-src")?.slice(1) ?? [];

/** Il fetch di `url` da una pagina su `origine` passa la connect-src? ('self', host esatti e *.dominio). */
function fetchAmmesso(origine: string, url: string): boolean {
  const u = new URL(url);
  return connectSrc.some((sorgente) => {
    if (sorgente === "'self'") return u.origin === new URL(origine).origin;
    const m = /^(https?|wss?):\/\/(\*\.)?([^/]+)$/.exec(sorgente);
    if (!m || `${m[1]}:` !== u.protocol) return false;
    return m[2] ? u.hostname.endsWith(`.${m[3]}`) : u.host === m[3];
  });
}

describe("CSP: il logo dell'azienda si scarica da ogni dominio dell'app", () => {
  const logoVulcano = "https://app.ediliziaincloud.com/loghi/impresa-vulcano.png";

  it.each(["https://app.ediliziaincloud.com", "https://www.ediliziaincloud.com", "https://admin.ediliziaincloud.com"])(
    "da %s il PDF degli ordini legge il logo di Vulcano",
    (origine) => {
      expect(connectSrc.length).toBeGreaterThan(0);
      expect(fetchAmmesso(origine, logoVulcano)).toBe(true);
    },
  );

  it("restano ammessi Supabase e il resto, e un dominio estraneo resta chiuso", () => {
    const origine = "https://www.ediliziaincloud.com";
    expect(fetchAmmesso(origine, "https://rsbrguhkodgnqfomrevo.supabase.co/storage/v1/object/public/logos/a.png")).toBe(true);
    expect(fetchAmmesso(origine, "https://www.ediliziaincloud.com/fonts/EBGaramond-Regular.ttf?v=2")).toBe(true);
    expect(fetchAmmesso(origine, "https://ediliziaincloud.com.esempio.invalid/logo.png")).toBe(false);
    expect(fetchAmmesso(origine, "http://app.ediliziaincloud.com/loghi/impresa-vulcano.png")).toBe(false);
  });

  it("i loghi in public/loghi rispondono anche alle altre origini (CORS)", () => {
    expect(regola("/loghi/*")).toContain("Access-Control-Allow-Origin: *");
  });
});
