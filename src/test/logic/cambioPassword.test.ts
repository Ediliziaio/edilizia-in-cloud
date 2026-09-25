/**
 * Cambio password: il motivo vero del rifiuto, e l'obbligo tolto a chi la
 * sceglie da sé (25/09/2026).
 *
 * Andrea Urban (Renova) il 23/09 ha cambiato la password dal link di
 * recupero; la pagina non toglieva l'obbligo, e l'app lo mandava a «Cambia
 * Password». Lì Supabase rifiutava la password nuova perché comparsa in furti
 * di dati, e la pagina diceva solo «Errore durante il cambio password»: dieci
 * tentativi in due minuti, e il 25/09 era ancora fuori. Stessa sorte, per il
 * solo obbligo, a Kevin Ortolan (Renova) e Roberta Rossetti (BeMade).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuthApiError, AuthSessionMissingError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { motivoPasswordRifiutata } from "@/lib/auth/cambioPassword";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const TOGLI_OBBLIGO = /supabase\.rpc\(\s*"staff_update_own_password_flag",\s*\{\s*_must_change: false\s*\}/;

describe("il motivo del rifiuto, in italiano", () => {
  it("password comparsa in furti di dati (il caso di Andrea)", () => {
    const errore = new AuthWeakPasswordError(
      "Password is known to be weak and easy to guess, please choose a different one.",
      422,
      ["pwned"],
    );
    const motivo = motivoPasswordRifiutata(errore);
    expect(motivo).toMatch(/troppo comune o è già comparsa in furti di dati/);
    expect(motivo).toMatch(/Scegline un'altra/);
  });

  it("anche senza codice, dalla sola frase di Supabase", () => {
    const errore = new AuthApiError("Password is known to be weak and easy to guess, please choose a different one.", 422, undefined);
    expect(motivoPasswordRifiutata(errore)).toMatch(/furti di dati/);
  });

  it("uguale a quella di prima", () => {
    const errore = new AuthApiError("New password should be different from the old password.", 422, "same_password");
    expect(motivoPasswordRifiutata(errore)).toBe("La nuova password è uguale a quella di adesso: scegline una diversa.");
  });

  it("troppo corta o senza i caratteri richiesti", () => {
    expect(motivoPasswordRifiutata(new AuthWeakPasswordError("Password should be at least 10 characters.", 422, ["length"])))
      .toBe("La password è troppo corta: scegline una più lunga.");
    expect(motivoPasswordRifiutata(new AuthWeakPasswordError("Password should contain…", 422, ["characters"])))
      .toMatch(/minuscole e maiuscole, numeri e simboli/);
  });

  it("troppi tentativi, accesso scaduto, e tutto il resto", () => {
    expect(motivoPasswordRifiutata(new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit")))
      .toMatch(/Troppi tentativi/);
    expect(motivoPasswordRifiutata(new AuthSessionMissingError())).toMatch(/L'accesso è scaduto/);
    expect(motivoPasswordRifiutata(new Error("boh"))).toBe("Non è stato possibile cambiare la password. Riprova tra poco.");
    expect(motivoPasswordRifiutata(null)).toBe("Non è stato possibile cambiare la password. Riprova tra poco.");
  });
});

describe("le pagine dove si cambia la propria password", () => {
  const pagine = {
    obbligatoria: leggi("src/pages/auth/ChangePassword.tsx"),
    recupero: leggi("src/pages/auth/ResetPassword.tsx"),
    profilo: leggi("src/pages/azienda/impostazioni/MioProfilo.tsx"),
  };

  it("tutte dicono il motivo vero del rifiuto", () => {
    for (const [nome, src] of Object.entries(pagine)) {
      expect(src, nome).toContain('import { motivoPasswordRifiutata } from "@/lib/auth/cambioPassword";');
      expect(src, nome).toMatch(/motivoPasswordRifiutata\((updateError|error|err)\)/);
    }
    expect(pagine.obbligatoria).not.toContain('toast.error("Errore durante il cambio password");\n        setIsLoading(false);\n        return;');
    expect(pagine.recupero).not.toContain("Impossibile aggiornare la password. Riprova.");
  });

  it("dopo il cambio riuscito tolgono l'obbligo di cambiarla ancora", () => {
    for (const [nome, src] of Object.entries(pagine)) {
      const cambio = src.indexOf("supabase.auth.updateUser(");
      const obbligo = src.search(TOGLI_OBBLIGO);
      expect(cambio, nome).toBeGreaterThan(-1);
      expect(obbligo, nome).toBeGreaterThan(cambio);
    }
  });

  it("nel recupero l'obbligo si toglie solo se la password è cambiata davvero", () => {
    const recupero = pagine.recupero;
    const ramoErrore = recupero.indexOf("if (error) {", recupero.indexOf("supabase.auth.updateUser("));
    const ramoRiuscito = recupero.indexOf("} else {", ramoErrore);
    expect(ramoErrore).toBeGreaterThan(-1);
    expect(recupero.search(TOGLI_OBBLIGO)).toBeGreaterThan(ramoRiuscito);
  });
});
