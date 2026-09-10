import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * Le caselle collegate morivano in silenzio.
 *
 * Sul database di produzione due Gmail erano ferme da giugno a settembre —
 * `invalid_grant`, nessun avviso a nessuno, posta che non arrivava più — e
 * l'unico modo per rimetterle in piedi era cancellarle e rifarle a mano.
 * Per le caselle IMAP (Aruba, Register, Libero…) c'era il problema opposto:
 * una password sbagliata veniva ritentata ogni dieci minuti per sempre, che è
 * il modo più rapido per farsi bloccare l'account dal provider.
 */
describe("Una casella che smette di funzionare lo dice", () => {
  const migrazione = leggi(
    "supabase/migrations/20280914000001_caselle_email_avvisano_quando_muoiono.sql",
  );

  it("avvisa chi l'ha collegata, con il link alla pagina giusta", () => {
    expect(migrazione).toContain("INSERT INTO public.notifications");
    expect(migrazione).toContain("'/azienda/impostazioni/mio-profilo?tab=email'");
  });

  it("un avviso a settimana per casella, non uno ogni giro di polling", () => {
    expect(migrazione).toContain("interval '7 days'");
    // E solo quando lo stato cambia davvero: se era già ferma, chi l'ha
    // collegata lo sa.
    expect(migrazione).toContain("v_stato_prima = v_conn.status");
  });

  it("la password IMAP rifiutata ferma subito la casella", () => {
    // Se restasse in polling, Aruba o Register bloccherebbero l'account dopo
    // un po' di tentativi falliti.
    expect(migrazione).toMatch(/authenticationfailed[\s\S]{0,200}THEN 'expired'/i);
  });

  it("un errore di rete passeggero invece non la ferma", () => {
    // Restano i cinque tentativi prima di considerarla in errore: un timeout
    // non è una password sbagliata.
    expect(migrazione).toContain("consecutive_errors + 1 >= 5 THEN 'error'");
  });

  it("il primo sync riuscito la rimette in piedi da sola", () => {
    expect(migrazione).toContain("status = CASE WHEN status IN ('error', 'expired') THEN 'active' ELSE status END");
  });
});

describe("Rimettere in piedi una casella costa un clic", () => {
  const card = leggi("src/components/integrations/EmailOAuthConnectionsCard.tsx");
  const dialog = leggi("src/components/integrations/ImapCustomDialog.tsx");
  const invio = leggi("supabase/functions/email-send/index.ts");

  it("la card spiega il perché in italiano e offre il pulsante", () => {
    expect(card).toContain('c.status !== "active"');
    expect(card).toContain("Ricollega {c.email_address}");
    // Il testo grezzo del provider non finisce più in faccia all'utente.
    expect(card).not.toContain("Errore: {c.last_sync_error}");
  });

  it("per Gmail e Outlook riparte l'autorizzazione, per IMAP si rimette la password", () => {
    expect(card).toContain('startOAuth.mutate(c.provider as "gmail" | "outlook")');
    expect(card).toContain("setImapDaRicollegare({");
  });

  it("ricollegare aggiorna la casella, non ne crea una seconda", () => {
    expect(dialog).toContain("p_existing_id: daRicollegare?.id ?? null");
  });

  it("un invio respinto per credenziali aggiorna subito lo stato della casella", () => {
    // Prima restava «attiva» finché non se ne accorgeva il polling, e chi
    // aveva scritto l'email non capiva perché non fosse partita.
    expect(invio).toContain('rpc("email_oauth_mark_sync"');
  });
});

describe("Dal lato piattaforma le caselle ferme si vedono tutte insieme", () => {
  const migrazione = leggi(
    "supabase/migrations/20280914000003_connessioni_mostra_caselle_email.sql",
  );
  const pagina = leggi("src/pages/admin/ConnessioniPage.tsx");
  const crediti = leggi(
    "supabase/migrations/20280914000002_avviso_crediti_email_esauriti.sql",
  );
  const invioUnificato = leggi("supabase/functions/_shared/sendEmailUnified.ts");

  it("il cruscotto Connessioni conta anche le caselle email", () => {
    expect(migrazione).toContain("'caselle_email', v_caselle");
    expect(migrazione).toContain("'caselle_email_ferme'");
    // Resta riservato allo staff di piattaforma, come il resto della funzione.
    expect(migrazione).toContain("Accesso riservato allo staff di piattaforma");
  });

  it("dice da quanti giorni una casella è ferma, non solo che lo è", () => {
    // «expired» non dice niente; «ferma da 99 giorni» sì.
    expect(migrazione).toContain("AS giorni_ferma");
    expect(pagina).toContain("ferma da {c.giorni_ferma}");
  });

  it("un'email respinta per credito finito avvisa chi amministra l'azienda", () => {
    expect(crediti).toContain("'Email non inviate: credito esaurito'");
    expect(crediti).toContain("interval '24 hours'");
    expect(crediti).toContain("'/azienda/impostazioni/crediti'");
    expect(invioUnificato).toContain('rpc("avvisa_crediti_email_esauriti"');
  });
});
