/**
 * verifyCompanyAccess non fa più passare un accesso multi-azienda sospeso,
 * ancora da accettare o scaduto (21/09/2026).
 *
 * Bastava che la riga di multi_company_access esistesse. Dall'11/07/2026
 * (migration 20271216000001: stati invited/active/suspended e scadenza) i
 * guardiani del database contano solo le righe attive e non scadute, e così
 * aziendaAccessibile in auth.ts; le quindici funzioni che usano
 * verifyCompanyAccess no. Ora la regola è una sola: verifyCompanyAccess la
 * prende da aziendaAccessibile.
 *
 * Perché il test legge il codice invece di chiamarlo: auth.ts importa da
 * esm.sh e nei test quegli import non si risolvono. Portare la regola in un
 * file senza import vorrebbe dire toccare auth.ts, e la CI ripubblicherebbe
 * tutte le funzioni che lo importano (217 il 21/09/2026).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const FUNZIONI = join(ROOT, "supabase/functions");
const leggi = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Da una firma esportata fino all'export successivo. */
function corpo(sorgente: string, firma: string): string {
  const inizio = sorgente.indexOf(firma);
  if (inizio === -1) throw new Error(`firma non trovata: ${firma}`);
  const fine = sorgente.indexOf("\nexport ", inizio + firma.length);
  return sorgente.slice(inizio, fine === -1 ? undefined : fine);
}

/** I file .ts delle funzioni (non delle librerie condivise) che nominano verifyCompanyAccess. */
function chiamanti(): Array<{ file: string; testo: string }> {
  const trovati: Array<{ file: string; testo: string }> = [];
  const gira = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) gira(p);
      else if (nome.endsWith(".ts")) {
        const testo = readFileSync(p, "utf8");
        if (testo.includes("verifyCompanyAccess")) trovati.push({ file: relative(ROOT, p), testo });
      }
    }
  };
  for (const nome of readdirSync(FUNZIONI)) {
    const p = join(FUNZIONI, nome);
    if (!nome.startsWith("_") && statSync(p).isDirectory()) gira(p);
  }
  return trovati;
}

describe("verifyCompanyAccess prende la regola da aziendaAccessibile", () => {
  const companyAuth = leggi("supabase/functions/_shared/companyAuth.ts");
  const verifica = corpo(companyAuth, "export async function verifyCompanyAccess(");

  it("profilo e multi-azienda passano da aziendaAccessibile di auth.ts", () => {
    expect(companyAuth).toContain('import { aziendaAccessibile } from "./auth.ts";');
    expect(verifica).toContain("if (await aziendaAccessibile(supabase, userId, companyId)) return;");
  });

  it("non legge più multi_company_access per conto suo", () => {
    expect(companyAuth).not.toContain("multi_company_access\")");
  });

  it("l'impersonificazione del super admin resta, se non è scaduta, e viene dopo", () => {
    const impersonificazione = verifica.indexOf('.from("active_impersonations")');
    expect(impersonificazione).toBeGreaterThan(verifica.indexOf("await aziendaAccessibile("));
    expect(verifica).toContain('.eq("admin_user_id", userId)');
    expect(verifica).toContain('.gt("expires_at", new Date().toISOString())');
  });

  it("se niente combacia, lancia", () => {
    expect(verifica).toContain('throw new Error("Non autorizzato: accesso negato a questa azienda");');
  });
});

describe("aziendaAccessibile guarda stato e scadenza", () => {
  const regola = corpo(leggi("supabase/functions/_shared/auth.ts"), "export async function aziendaAccessibile(");

  it("senza azienda, niente accesso", () => {
    expect(regola).toContain("if (!companyId) return false;");
  });

  it("vale l'azienda del profilo", () => {
    expect(regola).toContain('.from("profiles").select("company_id").eq("id", userId).maybeSingle()');
  });

  it("dell'accesso multi-azienda conta solo la riga attiva e non scaduta", () => {
    expect(regola).toContain('.from("multi_company_access")');
    expect(regola).toContain('.eq("status", "active")');
    expect(regola).toContain("scadenza === null || scadenza === undefined || new Date(scadenza) > new Date()");
  });
});

describe("chi usa verifyCompanyAccess", () => {
  const trovati = chiamanti();

  it("le funzioni la prendono da _shared/companyAuth.ts, o ne hanno una che passa da canAccessCompany", () => {
    expect(trovati.length).toBeGreaterThanOrEqual(15);
    const copieLocali = trovati.filter(({ testo }) => !/from ["']\.\.\/_shared\/companyAuth\.ts["']/.test(testo));
    for (const { file, testo } of copieLocali) {
      // Oggi solo google-calendar-sync: la sua copia delega a canAccessCompany.
      expect(testo, file).toMatch(/async function verifyCompanyAccess\([^)]*\)[^{]*\{\s*(\/\/[^\n]*\n\s*)*return canAccessCompany\(/);
    }
  });

  it("canAccessCompany conta anche lei solo la riga attiva e non scaduta", () => {
    const effective = leggi("supabase/functions/_shared/effectiveCompany.ts");
    const multi = effective.slice(effective.indexOf("async function hasActiveMultiCompanyAccess("));
    expect(multi).toContain('.eq("status", "active")');
    expect(multi).toContain("return !exp || exp > nowIso;");
  });
});
