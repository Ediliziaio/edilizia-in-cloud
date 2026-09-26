/**
 * Il proprio profilo: azienda, blocco, email e 2FA non si cambiano da soli
 * (25/09/2026).
 *
 * La policy «Users can update their own profile» lascia modificare ogni
 * colonna della propria riga. Provato in una transazione annullata: un utente
 * dello staff si spostava in un'altra azienda e ne vedeva i dati, un utente
 * bloccato si sbloccava, un cliente si riaccendeva il portale spento. Il
 * trigger trg_profilo_campi_protetti rifiuta queste modifiche quando arrivano
 * dall'app sulla propria riga; passano le funzioni SECURITY DEFINER, il
 * service role, il super admin e l'amministratore che modifica un altro utente.
 *
 * Tiene fermo:
 *   · il trigger guarda tutte le colonne che decidono l'accesso, e le guarda
 *     davvero (IS DISTINCT FROM fra il valore di prima e quello nuovo);
 *   · le eccezioni sono quelle e solo quelle;
 *   · scatta prima di trg_profilo_cliente_resta_bloccato;
 *   · la migrazione è rilanciabile e con lock_timeout;
 *   · nessuna pagina dell'app scrive quelle colonne sul proprio profilo
 *     (se ne serve una, va fatta con una RPC o una edge function).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRAZIONE = resolve(process.cwd(), "supabase/migrations/20280925183000_profilo_campi_protetti.sql");
const sql = readFileSync(MIGRAZIONE, "utf8");
// Le istruzioni, senza i commenti (che raccontano anche com'era prima).
const codice = sql.replace(/--.*$/gm, "");

const PROTETTE = [
  "company_id",
  "is_blocked",
  "blocked_at",
  "blocked_by",
  "block_reason",
  "portal_disabled",
  "deleted_at",
  "deleted_by",
  "email",
  "marketing_contact_id",
  "require_2fa",
];

describe("migrazione profilo_campi_protetti", () => {
  it("è rilanciabile e non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
    expect(codice).toMatch(/create or replace function public\.profilo_campi_protetti\(\)/);
    expect(codice).toMatch(/create or replace trigger trg_profilo_campi_protetti/);
    expect(codice).toMatch(/set search_path = ''/);
  });

  it("il trigger scatta sulle colonne d'accesso, prima di ogni altro BEFORE che le tocca", () => {
    const m = codice.match(/before update of ([\s\S]*?)\s+on public\.profiles/);
    expect(m).not.toBeNull();
    const colonne = m![1].split(",").map((c) => c.trim());
    expect([...colonne].sort()).toEqual([...PROTETTE].sort());
    // I trigger BEFORE vanno in ordine alfabetico: deve vedere la richiesta
    // dell'utente, non il blocco aggiunto da trg_profilo_cliente_resta_bloccato.
    expect("trg_profilo_campi_protetti" < "trg_profilo_cliente_resta_bloccato").toBe(true);
  });

  it("confronta davvero ogni colonna col valore di prima", () => {
    for (const c of PROTETTE.filter((c) => !["is_blocked", "portal_disabled", "email", "require_2fa"].includes(c))) {
      expect(codice).toContain(`new.${c} is distinct from old.${c}`);
    }
    expect(codice).toContain("coalesce(new.is_blocked, false) <> coalesce(old.is_blocked, false)");
    expect(codice).toContain("coalesce(new.portal_disabled, false) <> coalesce(old.portal_disabled, false)");
    // L'email si confronta senza maiuscole e spazi: cambiarle non è un'altra email.
    expect(codice).toContain("lower(btrim(new.email)) is distinct from lower(btrim(old.email))");
    // La 2FA si può accendere, non spegnere.
    expect(codice).toContain("(coalesce(old.require_2fa, false) and not coalesce(new.require_2fa, false))");
    expect(codice).toMatch(/raise exception '[^']+'\s+using errcode = '42501'/);
  });

  it("lascia passare solo chi ne ha il diritto", () => {
    const uscita = codice.match(/if current_user not in \('authenticated', 'anon'\)([\s\S]*?)then\s+return new;/);
    expect(uscita).not.toBeNull();
    const condizioni = uscita![1];
    // Solo la propria riga…
    expect(condizioni).toContain("or new.id is distinct from (select auth.uid())");
    // …e il super admin, e nient'altro.
    expect(condizioni).toContain("or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))");
    expect(condizioni.match(/\bor\b/g)).toHaveLength(2);
  });

  it("la funzione di trigger non è chiamabile da nessuno", () => {
    expect(codice).toContain("revoke all on function public.profilo_campi_protetti() from public, anon, authenticated;");
    expect(codice).not.toMatch(/grant\s+execute/i);
  });
});

describe("l'app non scrive le colonne d'accesso sul proprio profilo", () => {
  const file: string[] = [];
  const cammina = (cartella: string) => {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const percorso = resolve(cartella, voce.name);
      if (voce.isDirectory()) {
        if (voce.name !== "test" && voce.name !== "node_modules") cammina(percorso);
      } else if (/\.(ts|tsx)$/.test(voce.name)) {
        file.push(percorso);
      }
    }
  };
  cammina(resolve(process.cwd(), "src"));

  // Ogni .from("profiles").update({…}) seguito da .eq("id", user.id): la
  // modifica della propria riga, con le colonne protette che scrive.
  const propri: { file: string; protette: string[] }[] = [];
  for (const percorso of file) {
    const testo = readFileSync(percorso, "utf8");
    const re = /\.from\(\s*["']profiles["']\s*\)\s*\.update\(\s*\{([\s\S]*?)\}\s*(?:as [\w<>, ]+)?\)([\s\S]{0,200})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(testo))) {
      const [, oggetto, seguito] = m;
      if (!/\.eq\(\s*["']id["']\s*,\s*user!?\??\.id\s*\)/.test(seguito)) continue;
      propri.push({
        file: percorso.replace(`${process.cwd()}/`, ""),
        protette: PROTETTE.filter((c) => new RegExp(`\\b${c}\\s*:`).test(oggetto)),
      });
    }
  }

  it("nessuna modifica della propria riga tocca quelle colonne", () => {
    expect(propri.filter((p) => p.protette.length > 0)).toEqual([]);
  });

  it("la ricerca trova le pagine che modificano il proprio profilo (non è vuota per caso)", () => {
    const trovati = new Set(propri.map((p) => p.file));
    expect(trovati).toContain("src/pages/azienda/impostazioni/MioProfilo.tsx");
    expect(trovati).toContain("src/pages/cliente/CustomerProfile.tsx");
  });
});
