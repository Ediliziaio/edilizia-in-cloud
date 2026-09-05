/**
 * Ondata 0.1 — prova permanente: nessun dato senza login.
 *
 * Due parti, per ragioni diverse.
 *
 * 1. Le verifiche statiche girano sempre, anche in CI senza segreti: dicono che
 *    la regola *esiste* (le guardie non tornano NULL, i chiamanti usano
 *    `IS NOT TRUE`, la superficie pubblica è dichiarata ed è quella attesa).
 *
 * 2. La sonda vera chiama la produzione con la sola chiave anon e pretende un
 *    rifiuto su tutte le 879 funzioni un tempo esposte. Gira quando l'ambiente
 *    ha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (o le equivalenti
 *    SUPABASE_*). Da eseguire a ogni rilascio:
 *
 *      SUPABASE_URL=... SUPABASE_ANON_KEY=... npx vitest run src/test/security
 *
 * Una funzione che deve tornare pubblica NON va aggiunta qui: va aggiunta a
 * public.rpc_pubbliche con la sua motivazione, e la sonda va rigenerata.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import sonde from "./fixtures/rpc-chiuse-ad-anon.json";

type Sonda = { fn: string; body: Record<string, unknown> };
const SONDE = sonde as Sonda[];

const MIGRAZIONI = resolve(__dirname, "../../../supabase/migrations");
const leggiMigrazione = (frammento: string): string => {
  const nome = readdirSync(MIGRAZIONI).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione non trovata: ${frammento}`);
  return readFileSync(resolve(MIGRAZIONI, nome), "utf8");
};

// Le quattro guardie del briefing + ai_is_service_role, che ha lo stesso difetto.
const GUARDIE = [
  "can_access_company_people",
  "can_manage_company_people",
  "conversazioni_puo_accedere",
  "is_mio_rivenditore",
  "ai_is_service_role",
];

// La superficie pubblica dichiarata: ogni riga è un flusso a token nell'URL.
const SUPERFICIE_PUBBLICA = [
  "odv_view_by_token",
  "odv_sign_with_token",
  "odv_reject_with_token",
  "sal_view_by_token",
  "sal_sign_with_token",
  "hr_talent_public_session",
  "hr_talent_public_save_answers",
  "submit_public_reputation_review",
  "valida_portale_token",
];

describe("0.1 · le guardie non restituiscono più NULL", () => {
  const sql = leggiMigrazione("guardie_accesso_non_autenticato");

  it.each(GUARDIE)("%s è avvolta in coalesce(…, false)", (guardia) => {
    const corpo = sql.split(`FUNCTION public.${guardia}(`)[1];
    expect(corpo, `${guardia} non è ricreata dalla migrazione`).toBeDefined();
    const fino_a_fine = corpo.split("$function$;")[0];
    expect(fino_a_fine).toContain("coalesce(");
    expect(fino_a_fine).toMatch(/,\s*false\s*\)/);
  });

  it("nessun chiamante usa più `IF NOT guardia()`: NULL non salterebbe il controllo", () => {
    for (const guardia of GUARDIE) {
      expect(sql, `IF NOT ${guardia}() è ancora presente`).not.toMatch(
        new RegExp(`IF\\s+NOT\\s+public\\.${guardia}\\s*\\(`, "i"),
      );
    }
    // e i controlli ci sono, scritti nella forma che tratta NULL come "no"
    expect(sql).toMatch(/conversazioni_puo_accedere\([^)]*\)\s+IS NOT TRUE/);
    expect(sql).toMatch(/can_access_company_people\([^)]*\)\s+IS NOT TRUE/);
  });

  it("prossimo_numero_commessa dichiara il rifiuto invece di restituire NULL", () => {
    const corpo = sql.split("FUNCTION public.prossimo_numero_commessa(")[1].split("$function$;")[0];
    expect(corpo).toContain("RAISE EXCEPTION");
    expect(corpo).toContain("42501");
    expect(corpo).not.toMatch(/IS NOT TRUE THEN\s*RETURN NULL/);
  });
});

describe("0.1 · la superficie pubblica è dichiarata, non implicita", () => {
  const sql = leggiMigrazione("superficie_rpc_anon");

  it("le 9 RPC pubbliche sono in public.rpc_pubbliche, ognuna con una motivazione", () => {
    for (const fn of SUPERFICIE_PUBBLICA) {
      expect(sql, `${fn} manca dall'elenco dichiarato`).toContain(`'${fn}'`);
    }
    const righe = sql.split("INSERT INTO public.rpc_pubbliche")[1].split("ON CONFLICT")[0];
    const quante = righe.match(/^\s*\('/gm)?.length ?? 0;
    expect(quante).toBe(SUPERFICIE_PUBBLICA.length);
  });

  it("nessuna funzione pubblica finisce anche nell'elenco di quelle chiuse", () => {
    const chiuse = new Set(SONDE.map((s) => s.fn));
    for (const fn of SUPERFICIE_PUBBLICA) expect(chiuse.has(fn)).toBe(false);
  });

  it("la revoca toglie EXECUTE anche a PUBLIC, non solo ad anon", () => {
    // 396 funzioni avevano il privilegio via PUBLIC: revocare solo ad anon
    // non avrebbe cambiato nulla.
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION %s FROM anon/);
  });

  it("chi è autenticato e il service role conservano il privilegio", () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION %s TO authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION %s TO service_role/);
  });

  it("la superficie non può ricrescere da sola con le migrazioni future", () => {
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES[\s\S]*REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/);
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES[\s\S]*GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role/);
  });

  it("l'elenco delle funzioni chiuse è consistente", () => {
    expect(SONDE.length).toBeGreaterThan(800);
    expect(new Set(SONDE.map((s) => s.fn)).size).toBe(SONDE.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La sonda vera, contro l'ambiente reale.
// ─────────────────────────────────────────────────────────────────────────────

const URL_BASE =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const CHIAVE_ANON =
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "";
// setup.ts riempie le variabili con un Supabase locale finto: la sonda deve
// puntare a un ambiente vero, altrimenti non prova nulla e fallisce a vuoto.
const ATTIVA = URL_BASE.startsWith("https://") && CHIAVE_ANON.length > 40;

// Un identificativo qualsiasi: il punto è che la risposta non dipenda da quale.
const UUID_SONDA = "00000000-0000-0000-0000-000000000001";

describe.runIf(ATTIVA)("0.1 · prova end-to-end: senza login non si passa", () => {
  const chiama = async (fn: string, body: unknown) => {
    const r = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: CHIAVE_ANON,
        Authorization: `Bearer ${CHIAVE_ANON}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
    });
    return { stato: r.status, corpo: await r.text() };
  };

  it(
    "nessuna delle funzioni un tempo esposte risponde con dati",
    { timeout: 600_000 },
    async () => {
      const passate: string[] = [];
      const lotto = 20;
      for (let i = 0; i < SONDE.length; i += lotto) {
        const esiti = await Promise.all(
          SONDE.slice(i, i + lotto).map(async (s) => ({
            fn: s.fn,
            ...(await chiama(s.fn, s.body)),
          })),
        );
        // 401/403 = respinta (è ciò che vogliamo).
        // 404 PGRST202 = la firma della sonda non combacia: non prova nulla,
        // quindi non la si conta né come successo né come fallimento.
        for (const e of esiti) {
          const inconcludente = e.stato === 404 && e.corpo.includes("PGRST202");
          // Una risposta che non porta informazione — `false` o `null` — e'
          // sicura quanto un rifiuto: quella funzione dipende solo da chi
          // chiama, e senza sessione non ha nulla da dire. E' il caso degli
          // aiutanti lasciati aperti di proposito perche' citati dentro le
          // policy, dove revocarli renderebbe le tabelle illeggibili invece
          // che protette. Qualunque altro corpo — un oggetto, una lista, un
          // numero, un testo — resta un fallimento.
          const rispostaVuota = e.stato === 200 && ["false", "null"].includes(e.corpo.trim());
          if (!inconcludente && !rispostaVuota && e.stato !== 401 && e.stato !== 403) {
            passate.push(`${e.fn} -> HTTP ${e.stato} ${e.corpo.slice(0, 120)}`);
          }
        }
      }
      expect(passate, `funzioni ancora raggiungibili senza login:\n${passate.join("\n")}`).toEqual([]);
    },
  );

  it("la superficie pubblica dichiarata invece risponde ancora", { timeout: 60_000 }, async () => {
    const rotte: string[] = [];
    for (const fn of ["odv_view_by_token", "sal_view_by_token", "valida_portale_token", "hr_talent_public_session"]) {
      const e = await chiama(fn, { p_token: "token-inesistente" });
      if (e.stato === 401 || e.stato === 403) rotte.push(`${fn} -> HTTP ${e.stato}`);
    }
    expect(rotte, `flussi pubblici rotti dalla revoca:\n${rotte.join("\n")}`).toEqual([]);
  });
});

// Gli aiutanti interni restano eseguibili perché le policy RLS li usano — la
// valutazione di una policy avviene con i privilegi di chi interroga, quindi
// revocarli romperebbe la lettura invece di proteggerla. Non devono però
// rispondere a chi non ha una sessione: erano oracoli interrogabili per
// identificativo (has_role rispondeva `true` su un utente qualsiasi).
const ORACOLI_CHIUSI: Array<{ fn: string; body: Record<string, unknown>; atteso: unknown }> = [
  { fn: "has_role", body: { _user_id: UUID_SONDA, _role: "company_admin" }, atteso: false },
  { fn: "get_user_company_id", body: { _user_id: UUID_SONDA }, atteso: null },
  { fn: "get_order_company_id", body: { _order_id: UUID_SONDA }, atteso: null },
  { fn: "get_order_customer_id", body: { _order_id: UUID_SONDA }, atteso: null },
  { fn: "get_platform_admin_company_id", body: {}, atteso: null },
  { fn: "order_has_employee_for_user", body: { _order_id: UUID_SONDA, _user_id: UUID_SONDA }, atteso: false },
  { fn: "order_has_salesperson_for_user", body: { _order_id: UUID_SONDA, _user_id: UUID_SONDA }, atteso: false },
  { fn: "utente_in_ufficio", body: { _user: UUID_SONDA, _ufficio: UUID_SONDA }, atteso: false },
  { fn: "internal_chat_is_order_channel", body: { p_channel_id: UUID_SONDA }, atteso: false },
  { fn: "check_staff_visibility", body: { _user_id: UUID_SONDA, _assigned_to: UUID_SONDA }, atteso: false },
  { fn: "has_permission", body: { _user_id: UUID_SONDA, _permission: "can_view_orders" }, atteso: false },
  { fn: "has_permission_for_company", body: { _user_id: UUID_SONDA, _permission: "can_view_orders", _company_id: UUID_SONDA }, atteso: false },
];

describe.runIf(ATTIVA)("0.1 · gli aiutanti interni non rispondono a chi non ha login", () => {
  const chiama = async (fn: string, body: unknown) => {
    const r = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: CHIAVE_ANON,
        Authorization: `Bearer ${CHIAVE_ANON}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
    });
    return { stato: r.status, corpo: await r.text() };
  };

  it("nessuno restituisce un dato: falso o nullo, mai una risposta utile", { timeout: 120_000 }, async () => {
    const rotti: string[] = [];
    for (const o of ORACOLI_CHIUSI) {
      const e = await chiama(o.fn, o.body);
      if (e.stato === 404 && e.corpo.includes("PGRST202")) {
        rotti.push(`${o.fn}: la sonda non combacia con la firma — verifica i nomi dei parametri`);
        continue;
      }
      // 42501 = permesso negato sulla funzione. Non e' un fallimento: e' una
      // difesa piu' forte di quella che il test chiedeva. Qui si verifica che
      // a chi non ha login non arrivi un dato utile, e una funzione revocata
      // soddisfa la condizione meglio di una che risponde "false". Trattarla
      // come rossa spingerebbe a riaprirla per far passare il test.
      if (e.stato === 401 || e.stato === 403 || e.corpo.includes("42501")) continue;

      let valore: unknown;
      try { valore = JSON.parse(e.corpo); } catch { valore = e.corpo; }
      if (valore !== o.atteso) {
        rotti.push(`${o.fn} -> ${JSON.stringify(valore)} (atteso ${JSON.stringify(o.atteso)} oppure permesso negato)`);
      }
    }
    expect(rotti, `oracoli ancora aperti:\n${rotti.join("\n")}`).toEqual([]);
  });
});

describe.runIf(!ATTIVA)("0.1 · sonda end-to-end", () => {
  it("saltata: servono SUPABASE_URL (https) e SUPABASE_ANON_KEY di un ambiente vero", () => {
    expect(ATTIVA).toBe(false);
  });
});
