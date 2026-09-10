import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * Collegare una casella IMAP: tre cose che non funzionavano.
 *
 * L'errore visibile era «Profilo senza azienda» in area super admin — il
 * profilo di un super admin ha `company_id` a NULL, e la funzione ci cercava
 * dentro l'azienda. Dietro c'erano altri due guasti che nessuno aveva mai
 * incontrato, perché il salvataggio si fermava prima: la cifratura con
 * pgsodium (estensione non più presente sul progetto) e il vincolo unico che
 * rendeva impossibile risalvare la stessa casella.
 */
describe("La casella IMAP si collega anche senza azienda nel profilo", () => {
  const dialog = leggi("src/components/integrations/ImapCustomDialog.tsx");
  const migrazione = leggi("supabase/migrations/20280914000000_imap_azienda_esplicita.sql");

  it("il dialog manda l'azienda del contesto, come fa Gmail con email-oauth-start", () => {
    expect(dialog).toContain("p_company_id: effectiveCompany?.id ?? null");
  });

  it("l'azienda ricevuta viene verificata, non creduta sulla parola", () => {
    expect(migrazione).toContain("public.user_can_access_company(p_company_id)");
  });

  it("un super admin senza azienda nel profilo finisce su quella di piattaforma", () => {
    // Serve anche per chi ha ancora il bundle vecchio in cache e non passa
    // l'azienda: altrimenti continuerebbe a vedere lo stesso errore.
    expect(migrazione).toContain("'00000000-0000-0000-0000-000000000001'::uuid");
    expect(migrazione).toContain("'super_admin'::public.app_role");
  });

  it("le password non passano più da pgsodium, che qui non esiste", () => {
    // Il nome resta nei commenti, a spiegare il perché: quello che non deve
    // esserci è una chiamata.
    const codice = migrazione
      .split("\n")
      .filter((r) => !r.trimStart().startsWith("--"))
      .join("\n");
    expect(codice).not.toContain("pgsodium");
    expect(migrazione).toContain("extensions.pgp_sym_encrypt");
    expect(migrazione).toContain("extensions.pgp_sym_decrypt");
  });

  it("la chiave vive nel Vault e non è scritta nella migrazione", () => {
    expect(migrazione).toContain("vault.create_secret");
    expect(migrazione).toContain("extensions.gen_random_bytes(32)");
    // Chi legge le password è solo il servizio: la chiave non si presta.
    expect(migrazione).toContain(
      "REVOKE ALL ON FUNCTION public.email_imap_chiave() FROM PUBLIC, anon, authenticated",
    );
  });

  it("salvare due volte la stessa casella aggiorna, non va in duplicate key", () => {
    const corpo = migrazione.slice(migrazione.indexOf("Riaggancio alla riga"));
    expect(corpo).toContain("lower(email_address) = lower(p_email_address)");
  });
});
