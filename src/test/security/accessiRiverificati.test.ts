import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Ondata 5.5 — riverifica degli accessi, con una sonda invece che a occhio.
 *
 * Misurato su produzione, utente demo dell'azienda 778a2c76:
 *   fattura_pagamento_stato ....... 35 righe, 34 di un'altra azienda → 0 dopo
 *                                   (la propria continua a vedersi)
 *   unified_calendar_busy_slots ... 128 righe, 17 di un'azienda estranea → 0
 *                                   (le proprie 111 restano)
 *   v_quote_template_counts ....... 5 righe tutte altrui → 0 (il demo non ne ha)
 *   sconto_max_azienda(altra) ..... ora NULL
 *   sentinelle e destinatari ...... respinte a un utente qualunque, ancora
 *                                   eseguibili dal service role (6 controlli)
 *
 * E la prova del meccanismo: `set role anon` su public_appointment_slots —
 * lasciata pubblica di proposito — restituisce 41 righe di 4 aziende, perché
 * senza security_invoker l'RLS non si applica.
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const leggi = (frammento: string) => {
  const nome = readdirSync(dir).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione ${frammento} non trovata`);
  return readFileSync(resolve(dir, nome), "utf8");
};

const chiusure = leggi("chiusure_di_accesso_riverificando");
const viste = leggi("viste_senza_security_invoker");

describe("le viste rispettano le policy di chi le interroga", () => {
  it("le quattro viste toccate hanno security_invoker", () => {
    for (const v of [
      "fattura_pagamento_stato",
      "admin_company_features",
      "unified_calendar_busy_slots",
      "v_quote_template_counts",
    ]) {
      expect(`${chiusure}\n${viste}`).toMatch(
        new RegExp(`ALTER VIEW public\\.${v}\\s+SET \\(security_invoker = true\\)`));
    }
  });

  it("le tre che erano aperte ad anon non lo sono più", () => {
    for (const v of ["admin_company_features", "unified_calendar_busy_slots", "v_quote_template_counts"]) {
      expect(viste).toMatch(new RegExp(`REVOKE SELECT ON public\\.${v}\\s+FROM anon`));
    }
  });

  it("la vista pubblica delle prenotazioni resta pubblica, e il perché è scritto", () => {
    expect(viste).not.toMatch(/ALTER VIEW public\.public_appointment_slots/);
    expect(viste.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /è la superficie pubblica delle prenotazioni/);
  });

  it("è annotato che una sonda aveva sbagliato, non la vista", () => {
    expect(viste.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /era la sonda a sbagliare, non la vista/);
  });
});

describe("le mie funzioni chiedono di che azienda si tratta", () => {
  it("sconto_max_azienda non risponde più per un'azienda altrui", () => {
    const corpo = chiusure.slice(chiusure.indexOf("FUNCTION public.sconto_max_azienda"));
    expect(corpo).toMatch(/AND public\.user_can_access_company\(p_company_id\)/);
  });

  it("documento_stornato nemmeno", () => {
    const corpo = chiusure.slice(chiusure.indexOf("FUNCTION public.documento_stornato"));
    expect(corpo).toMatch(/AND public\.user_can_access_company\(nc\.company_id\)/);
  });
});

describe("i privilegi predefiniti non aprono più le funzioni interne", () => {
  it("le due funzioni interne sono revocate esplicitamente da authenticated", () => {
    expect(chiusure).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.sentinelle_effetti_cron\(\) FROM authenticated/);
    expect(chiusure).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.destinatari_allarmi_piattaforma\(\) FROM authenticated/);
  });

  it("la causa è scritta, perché vale per ogni funzione futura", () => {
    const testo = chiusure.replace(/\s*\n\s*--\s*/g, " ");
    expect(testo).toMatch(/ALTER DEFAULT PRIVILEGES/);
    expect(testo).toMatch(/perché il permesso è concesso al ruolo, non a PUBLIC/);
    expect(testo).toMatch(/serve un REVOKE esplicito da `authenticated`/);
  });
});
