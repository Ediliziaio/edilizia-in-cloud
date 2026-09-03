/**
 * Ondata 4 — l'attore dello storico viene da auth.uid(), mai dal client.
 *
 * La sonda dal vivo fa la cosa che conta: chiede al database di registrare
 * un'azione dichiarando di essere un altro utente, e pretende che il registro
 * scriva chi ha davvero la sessione. Scrive una riga di prova e la rimuove.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(__dirname, "../../../supabase/migrations");
const sql = (() => {
  const nome = readdirSync(DIR).find((f) => f.includes("attore_storico_da_auth_uid"));
  if (!nome) throw new Error("migrazione attore_storico_da_auth_uid non trovata");
  return readFileSync(resolve(DIR, nome), "utf8");
})();

describe("4 · l'attore non lo decide il client", () => {
  it("auth.uid() ha la precedenza sul parametro passato", () => {
    expect(sql).toMatch(/v_actor := coalesce\(auth\.uid\(\), p_actor_user_id\)/);
    // il parametro serve solo dove una sessione non c'è
    expect(sql).toMatch(/nessun client può firmare la cronologia/i);
  });

  it("non si inventa più un utente quando l'attore non c'è", () => {
    // era: coalesce(p_actor_user_id, '00000000-0000-0000-0000-000000000000')
    const registratore = sql.split("FUNCTION public.log_activity(")[1].split("$function$;")[0];
    expect(registratore).not.toMatch(/00000000-0000-0000-0000-000000000000/);
    expect(sql).toMatch(/ALTER COLUMN user_id DROP NOT NULL/);
  });

  it("i trigger non leggono più la variabile che PostgREST non imposta", () => {
    // request.jwt.claim.sub è la vecchia forma: sondata dal vivo durante una
    // richiesta autenticata risulta NON IMPOSTATA, mentre auth.uid() funziona.
    expect(sql).toMatch(/request\.jwt\.claim\.sub/);          // citata nella spiegazione
    expect(sql).toMatch(/'auth\.uid\(\)'\)/);                  // la sostituzione
    expect(sql).toMatch(/restano trigger che leggono request\.jwt\.claim\.sub/); // la verifica
  });

  it("anche il trigger legacy smette di scrivere zeri", () => {
    const legacy = sql.split("FUNCTION public.log_company_activity()")[1];
    expect(legacy).toMatch(/_user_id := auth\.uid\(\);/);
    expect(legacy).not.toMatch(/COALESCE\(auth\.uid\(\), '00000000/);
  });

  it("le righe storiche con l'utente zero diventano non attribuite", () => {
    expect(sql).toMatch(/UPDATE public\.company_activity_log\s+SET user_id = NULL\s+WHERE user_id = '00000000-0000-0000-0000-000000000000'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const URL_BASE = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const CHIAVE = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = process.env.EIC_TEST_EMAIL ?? "";
const PASSWORD = process.env.EIC_TEST_PASSWORD ?? "";
const ATTIVA = URL_BASE.startsWith("https://") && CHIAVE.length > 40 && Boolean(EMAIL && PASSWORD);

describe.runIf(ATTIVA)("4 · prova end-to-end sul registro attività", () => {
  it("chi dichiara di essere un altro viene registrato per quello che è", async () => {
    const login = await (
      await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: CHIAVE, "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      })
    ).json();
    const tok = login.access_token as string;
    const mioId = login.user?.id as string;
    expect(tok).toBeTruthy();
    expect(mioId).toBeTruthy();
    const h = { apikey: CHIAVE, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };

    const azienda = (
      await (await fetch(`${URL_BASE}/rest/v1/profiles?select=company_id&limit=1`, { headers: h })).json()
    )[0]?.company_id;
    expect(azienda).toBeTruthy();

    const ALTRO = "11111111-1111-1111-1111-111111111111";
    const marcatore = `prova.attore.${Date.now()}`;

    const idRiga = await (
      await fetch(`${URL_BASE}/rest/v1/rpc/log_activity`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          p_company_id: azienda,
          p_category: "modification",
          p_event_type: marcatore,
          p_actor_user_id: ALTRO,          // il client mente
          p_target_table: "zz_prova",
          p_target_id: "zz",
          p_target_label: "prova",
          p_description: "tentativo di firmare a nome di un altro",
        }),
      })
    ).json();
    expect(typeof idRiga).toBe("string");

    const riga = (
      await (
        await fetch(
          `${URL_BASE}/rest/v1/company_activity_log?id=eq.${idRiga}&select=actor_user_id,actor_name,user_id`,
          { headers: h },
        )
      ).json()
    )[0];

    expect(riga, "la riga di registro non è stata creata").toBeTruthy();
    expect(riga.actor_user_id, "il client ha potuto firmare a nome di un altro").toBe(mioId);
    expect(riga.actor_user_id).not.toBe(ALTRO);
    expect(riga.user_id).toBe(mioId);
    expect(riga.actor_name, "il nome dell'attore non è stato risolto").toBeTruthy();

    // pulizia: la riga di prova non deve restare nel registro dell'azienda
    await fetch(`${URL_BASE}/rest/v1/company_activity_log?id=eq.${idRiga}`, {
      method: "DELETE",
      headers: h,
    });
  }, 60_000);

  it("nel registro non ci sono più utenti-zero", async () => {
    const login = await (
      await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: CHIAVE, "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      })
    ).json();
    const h = { apikey: CHIAVE, Authorization: `Bearer ${login.access_token}` };
    const r = await fetch(
      `${URL_BASE}/rest/v1/company_activity_log?user_id=eq.00000000-0000-0000-0000-000000000000&select=id&limit=1`,
      { headers: h },
    );
    expect(await r.json()).toEqual([]);
  }, 30_000);
});

describe.runIf(!ATTIVA)("4 · prova end-to-end", () => {
  it("saltata: servono SUPABASE_URL, SUPABASE_ANON_KEY, EIC_TEST_EMAIL, EIC_TEST_PASSWORD", () => {
    expect(ATTIVA).toBe(false);
  });
});
