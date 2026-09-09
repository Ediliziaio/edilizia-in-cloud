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

/**
 * La pagina di prenotazione legge una VISTA, non la tabella: sulla tabella le
 * colonne dell'aggancio (external_*) rivelavano l'indirizzo dell'account
 * collegato a chiunque avesse la chiave pubblica, e la policy «per slug» valeva
 * solo per gli anonimi — chi era loggato leggeva «Calendario non trovato».
 */
describe("Il calendario pubblico si legge dalla vista, non dalla tabella", () => {
  const pagina = readFileSync(resolve(process.cwd(), "src/pages/public/PublicBooking.tsx"), "utf8");
  const migrazione = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20280913000001_calendari_prenotabili_vista_pubblica.sql"),
    "utf8",
  );
  const chiusura = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20280913000002_marketing_calendars_niente_lettura_anon.sql"),
    "utf8",
  );

  it("la pagina non tocca più marketing_calendars", () => {
    expect(pagina).toContain('from("public_booking_calendars" as never)');
    expect(pagina).not.toContain('from("marketing_calendars")');
  });

  it("la vista non espone le colonne dell'aggancio", () => {
    const selezione = migrazione.slice(migrazione.indexOf("SELECT"), migrazione.indexOf("FROM public.marketing_calendars"));
    for (const colonna of ["external_provider", "external_connection_id", "external_calendar_id", "external_calendar_name"]) {
      expect(selezione).not.toContain(colonna);
    }
    expect(migrazione).toContain("GRANT SELECT ON public.public_booking_calendars TO anon, authenticated");
  });

  it("agli anonimi la tabella è chiusa", () => {
    expect(chiusura).toContain("REVOKE SELECT ON public.marketing_calendars FROM anon");
  });
});
