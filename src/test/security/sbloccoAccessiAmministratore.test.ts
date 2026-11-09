/**
 * Sblocco degli accessi: chi può premerlo, e su chi (09/11/2026).
 *
 * L'anti-forza-bruta blocca la coppia (email, indirizzo di provenienza) dopo N
 * password sbagliate. Nelle impostazioni «Quanto resta bloccato» offre lo 0 con
 * la dicitura «finché non lo sblocca un amministratore» — uno sblocco che
 * nell'app non esisteva: con quella scelta la finestra diventa di 24 ore e
 * l'unica via d'uscita era aspettare. Il 09/11/2026 ha tenuto fuori un
 * venditore di Innovasol dal PC dell'ufficio per mezza giornata, mentre il
 * titolare cambiava la password (che non c'entrava nulla).
 *
 * Qui si prova che lo sblocco nuovo è chiuso bene:
 *   · il conteggio (`stato_blocco_accesso`) lo esegue solo il service role;
 *   · l'elenco e lo sblocco li può chiamare chi è entrato, mai `anon`;
 *   · lo sblocco pretende il ruolo di amministratore E la stessa azienda, così
 *     nessuno sblocca la gente di un'altra;
 *   · la tabella dei punti di ripartenza non è leggibile dal browser;
 *   · lo sblocco NON cancella i tentativi e non inventa un accesso riuscito.
 * E che il riepilogo degli accessi non conta più i bloccati con
 * `profiles.locked_until`, che dal run-2 dell'audit nessuno scrive più.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RADICE = resolve(__dirname, "../../..");

const MIGRAZIONE = readFileSync(
  resolve(RADICE, "supabase/migrations/20290131120000_sblocco_accessi_amministratore.sql"),
  "utf8",
);
const PAGINA = readFileSync(
  resolve(RADICE, "src/pages/azienda/settings/SettingsSecurityDashboard.tsx"),
  "utf8",
);
const EDGE = readFileSync(
  resolve(RADICE, "supabase/functions/check-login-security/index.ts"),
  "utf8",
);

/** Il corpo di una funzione SQL, dal `create` al `$$;` che la chiude. */
function corpoFunzione(nome: string): string {
  const inizio = MIGRAZIONE.indexOf(`create or replace function public.${nome}`);
  expect(inizio, `la migrazione non crea ${nome}`).toBeGreaterThan(-1);
  const fine = MIGRAZIONE.indexOf("\n$$;", inizio);
  expect(fine, `non trovo la fine di ${nome}`).toBeGreaterThan(inizio);
  return MIGRAZIONE.slice(inizio, fine);
}

describe("sblocco degli accessi: i permessi", () => {
  it("il conteggio del blocco lo fa solo il service role", () => {
    expect(MIGRAZIONE).toMatch(
      /revoke all on function public\.stato_blocco_accesso\(text, inet\) from public, anon, authenticated;/,
    );
    expect(MIGRAZIONE).toMatch(
      /grant execute on function public\.stato_blocco_accesso\(text, inet\) to service_role;/,
    );
    // Non deve finire fra le funzioni che chiunque conosca l'URL può chiamare.
    expect(MIGRAZIONE).not.toMatch(/grant execute on function public\.stato_blocco_accesso[^;]*anon/);
  });

  it("elenco e sblocco sono chiusi ad anon", () => {
    for (const funzione of ["accessi_bloccati\\(\\)", "sblocca_accesso\\(text, text\\)"]) {
      expect(MIGRAZIONE).toMatch(new RegExp(`revoke all on function public\\.${funzione} from public, anon;`));
      expect(MIGRAZIONE).toMatch(new RegExp(`grant execute on function public\\.${funzione} to authenticated, service_role;`));
    }
  });

  it("la tabella dei punti di ripartenza non si legge dal browser", () => {
    expect(MIGRAZIONE).toMatch(/alter table public\.login_lock_resets enable row level security;/);
    expect(MIGRAZIONE).toMatch(/revoke all on public\.login_lock_resets from public, anon, authenticated;/);
    // RLS accesa e nessuna policy: la tabella resta chiusa a chi non è il service role.
    expect(MIGRAZIONE).not.toMatch(/create policy[^;]*login_lock_resets/i);
  });
});

describe("sblocco degli accessi: chi e su chi", () => {
  const sblocco = corpoFunzione("sblocca_accesso");

  it("pretende il ruolo di amministratore", () => {
    expect(sblocco).toMatch(/has_role\(auth\.uid\(\), 'company_admin'::app_role\)/);
    expect(sblocco).toMatch(/is_super_admin\(auth\.uid\(\)\)/);
    expect(sblocco).toMatch(/Solo un amministratore puo sbloccare un accesso/);
  });

  it("non lascia sbloccare la gente di un'altra azienda", () => {
    // L'azienda di chi chiama e quella dell'email da sbloccare devono coincidere.
    expect(sblocco).toMatch(/v_sua_azienda is null or v_sua_azienda <> v_mia_azienda/);
    expect(sblocco).toMatch(/non e di un utente della tua azienda/);
  });

  it("non cancella i tentativi e non inventa un accesso riuscito", () => {
    expect(sblocco).not.toMatch(/delete\s+from\s+public\.login_attempts/i);
    expect(sblocco).not.toMatch(/insert into public\.login_attempts/i);
    expect(sblocco).toMatch(/insert into public\.login_lock_resets/);
  });

  it("lascia traccia di chi ha sbloccato cosa", () => {
    expect(sblocco).toMatch(/insert into public\.user_audit_log/);
    expect(sblocco).toMatch(/'account_unlocked'/);
  });
});

describe("sblocco degli accessi: il conteggio sta in un posto solo", () => {
  const stato = corpoFunzione("stato_blocco_accesso");

  it("uno sblocco fa ripartire il conteggio da zero", () => {
    expect(stato).toMatch(/from public\.login_lock_resets r/);
    expect(stato).toMatch(/v_inizio := greatest\(v_inizio, coalesce\(v_ultimo_ok, v_inizio\), coalesce\(v_ultimo_reset, v_inizio\)\)/);
  });

  it("conta solo le password sbagliate vere, per coppia (email, indirizzo)", () => {
    expect(stato).toMatch(/la\.failure_reason = 'invalid_credentials'/);
    expect(stato).toMatch(/la\.ip_address = p_ip/);
  });

  it("dice quando si riapre guardando il tentativo che fa da soglia", () => {
    // Non «adesso + finestra»: quello allungava l'attesa dichiarata di ore.
    expect(stato).toMatch(/offset \(v_max - 1\) limit 1/);
    expect(stato).not.toMatch(/now\(\) \+ v_finestra/);
  });

  it("la edge function non rifà il conteggio per conto suo", () => {
    expect(EDGE).toMatch(/rpc\("stato_blocco_accesso"/);
    expect(EDGE).not.toMatch(/failure_reason", "invalid_credentials"/);
  });
});

describe("il riepilogo degli accessi dice il vero", () => {
  it("i bloccati non si contano più con profiles.locked_until", () => {
    expect(PAGINA).not.toMatch(/overview\.locked_count/);
    expect(PAGINA).not.toMatch(/overview\.locked_accounts/);
    expect(PAGINA).toMatch(/leggiAccessiBloccati/);
  });

  it("c'è il bottone per rimettere dentro chi è bloccato", () => {
    expect(PAGINA).toMatch(/sbloccaMutation/);
    expect(PAGINA).toMatch(/Sblocca/);
  });

  it("spiega che il blocco è sul computer, non sulla persona", () => {
    expect(PAGINA).toMatch(/sul computer, non sulla persona/);
  });
});
