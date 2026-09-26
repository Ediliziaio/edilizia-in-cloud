/**
 * Mandare un preventivo al cliente richiede di poterlo modificare (26/09/2026).
 *
 * send-quote-signature scrive sul preventivo col service role e annulla le
 * firme in corso. Controllava solo che chi chiama lo VEDESSE: chi lo vede dalle
 * Commesse o coi Preventivi in sola lettura lo mandava in firma o via email.
 * Deciso da Florin: serve poterlo modificare, come per righe e schede tecniche.
 * La risposta la dà la policy di modifica di quotes (preventivo_modificabile,
 * SECURITY INVOKER + FOR KEY SHARE), e l'app nasconde i pulsanti.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("preventivo_modificabile: risponde la policy di modifica, non una copia", () => {
  const sql = (() => {
    const cartella = join(process.cwd(), "supabase/migrations");
    const file = readdirSync(cartella).find((f) => f.endsWith("_invio_preventivo_solo_chi_modifica.sql"));
    expect(file, "migrazione invio_preventivo_solo_chi_modifica").toBeTruthy();
    return readFileSync(join(cartella, file!), "utf8").replace(/--.*$/gm, "");
  })();

  it("gira coi permessi di chi chiama e legge la riga con un blocco", () => {
    expect(sql).toContain("create or replace function public.preventivo_modificabile(p_quote_id uuid)");
    expect(sql).toMatch(/volatile\s+security invoker\s+set search_path = public/);
    expect(sql).not.toContain("security definer");
    // Col blocco Postgres applica anche le USING delle policy di UPDATE (q_upd_preventivi).
    expect(sql).toContain("select exists (select 1 from public.quotes q where q.id = p_quote_id for key share);");
  });

  it("solo per chi è entrato, e senza aspettare i lock", () => {
    expect(sql).toContain("set local lock_timeout = '3s';");
    expect(sql).toContain("revoke all on function public.preventivo_modificabile(uuid) from public, anon;");
    expect(sql).toContain("grant execute on function public.preventivo_modificabile(uuid) to authenticated;");
  });
});

describe("send-quote-signature: vedere non basta, serve poter modificare", () => {
  const invio = leggi("supabase/functions/send-quote-signature/index.ts");
  const posizione = (testo: string) => {
    const i = invio.indexOf(testo);
    expect(i, testo).toBeGreaterThan(-1);
    return i;
  };
  const CONTROLLO = "if (!(await preventivoModificabile(comeChiChiama, quote.id))) {";

  it("col client di chi chiama, e un 403 che dice il motivo", () => {
    expect(invio).toContain('import { preventivoModificabile, preventivoVisibile } from "../_shared/preventivoVisibile.ts";');
    expect(invio).toContain(
      `${CONTROLLO}\n      return errorResponse("Per mandare il preventivo al cliente serve il permesso di modificare i preventivi.", 403, corsH);`,
    );
  });

  it("dopo il controllo di visibilità e prima di ogni scrittura, del PDF e dell'email", () => {
    const controllo = posizione(CONTROLLO);
    expect(posizione("if (!(await preventivoVisibile(comeChiChiama, quote.id))) {")).toBeLessThan(controllo);
    for (const dopo of [
      'if (mode === "solo_pdf")',
      '.from("signature_requests")',
      ".update(",
      "/functions/v1/generate-quote-pdf",
      "sendEmailUnified(",
    ]) {
      expect(controllo, dopo).toBeLessThan(posizione(dopo));
    }
  });
});

describe("dettaglio del preventivo: i pulsanti per mandarlo li vede chi può modificarlo", () => {
  const dettaglio = leggi("src/pages/azienda/marketing/QuoteDetail.tsx");

  it("un solo permesso, quello di modificare i preventivi", () => {
    expect(dettaglio).toContain("const puoInviare = permessi.canEditPreventivi;");
  });

  it("invio in firma, reinvio, PDF via email, WhatsApp e copia del link", () => {
    expect(dettaglio).toContain('{(quote.status === "bozza" || quote.status === "inviata") && puoInviare && (');
    expect(dettaglio).toContain("{quote.status === \"inviata\" && quote.signature_token && puoInviare && (");
    const invioPdf = dettaglio.indexOf("onClick={() => inviaPdfSemplice(quote.client_email, quote.validity_days)}");
    const guardia = dettaglio.lastIndexOf("{puoInviare && (", invioPdf);
    expect(guardia).toBeGreaterThan(-1);
    expect(invioPdf - guardia).toBeLessThan(250);
  });
});
