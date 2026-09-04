/**
 * Ondata 0.3 — prova permanente: la liquidazione IVA legge le fatture vere,
 * e quando non può calcolare lo dice.
 *
 * La verifica al centesimo su un trimestre calcolato a mano vive in
 * supabase/tests/liquidazione_iva_verifica.sql: costruisce il caso, confronta
 * ogni numero e termina con ROLLBACK. Va eseguita a ogni rilascio che tocchi
 * la fatturazione (SQL Editor come service_role, oppure MCP execute_sql).
 *
 * Qui: le verifiche statiche girano sempre; la sonda dal vivo (opt-in, con
 * SUPABASE_URL + SUPABASE_ANON_KEY + EIC_TEST_EMAIL + EIC_TEST_PASSWORD)
 * controlla il comportamento che il briefing chiede — un periodo senza fatture
 * non risponde zero — senza scrivere una riga.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(resolve(RADICE, p), "utf8");

const migrazione = (() => {
  const dir = resolve(RADICE, "supabase/migrations");
  const nome = readdirSync(dir).find((f) => f.includes("liquidazione_iva_dati_veri"));
  if (!nome) throw new Error("migrazione liquidazione_iva_dati_veri non trovata");
  return readFileSync(resolve(dir, nome), "utf8");
})();

const edge = leggi("supabase/functions/calcola-liquidazione-iva/index.ts");
const verificaSql = leggi("supabase/tests/liquidazione_iva_verifica.sql");

describe("0.3 · la liquidazione legge le fatture, non i nomi dei conti", () => {
  it("le fonti sono documenti_fiscali e fatture_ricevute", () => {
    expect(migrazione).toContain("FROM public.documenti_fiscali d");
    expect(migrazione).toContain("FROM public.fatture_ricevute f");
  });

  it("prima_nota e la ricerca per somiglianza sul nome del conto sono sparite", () => {
    expect(edge).not.toContain('from("prima_nota")');
    expect(edge).not.toMatch(/conto\.ilike/);
    expect(edge).not.toMatch(/%2610%|%2620%|%2630%/);
    // prima_nota compare solo nel commento che racconta il difetto: quel che
    // conta è che nessuna query la legga più.
    expect(migrazione).not.toMatch(/FROM\s+(public\.)?prima_nota/i);
  });

  it("l'edge non calcola più da sé: chiede al database", () => {
    expect(edge).toContain('supabase.rpc("liquidazione_iva_periodo"');
    // niente somme in JavaScript: la regola sta in un posto solo
    expect(edge).not.toMatch(/\.reduce\(/);
  });

  it("bozze e documenti annullati non entrano nella liquidazione", () => {
    expect(migrazione).toMatch(/d\.stato NOT IN \('bozza', 'annullata'\)/);
    expect(migrazione).toMatch(/d\.deleted_at IS NULL/);
  });

  it("le note di credito riducono l'imposta invece di sommarla", () => {
    expect(migrazione).toMatch(/CASE WHEN nota_credito THEN -1 ELSE 1 END \* imposta/);
    // lato acquisti la nota di credito arriva dallo SdI come TD04
    expect(migrazione).toContain("'TD04'");
  });

  it("l'IVA in scissione dei pagamenti non è debito di chi emette", () => {
    expect(migrazione).toMatch(/FILTER \(WHERE esigibilita <> 'S'\)/);
    expect(migrazione).toMatch(/FILTER \(WHERE esigibilita =  'S'\)/);
  });

  it("un documento senza riepilogo IVA non sparisce dal calcolo", () => {
    // il ramo di fallback usa i totali del documento
    expect(migrazione).toMatch(/jsonb_array_length\(coalesce\(v\.riepilogo_iva, '\[\]'::jsonb\)\) = 0/);
    expect(migrazione).toMatch(/jsonb_array_length\(coalesce\(a\.riepilogo_iva, '\[\]'::jsonb\)\) = 0/);
  });

  it("un valore non numerico nel riepilogo vale zero, non fa esplodere il calcolo", () => {
    expect(migrazione).toContain("FUNCTION public.num_da_json");
    expect(migrazione).toMatch(/public\.num_da_json\(r\.value ->> 'imponibile'\)/);
  });

  it("il controllo di accesso è dentro la funzione, non solo nell'edge", () => {
    expect(migrazione).toMatch(/user_can_access_company\(p_company_id\) IS NOT TRUE/);
    expect(migrazione).toMatch(/ERRCODE = '42501'/);
  });

  it("periodi fuori range vengono rifiutati, non interpretati", () => {
    expect(migrazione).toMatch(/mese non valido/);
    expect(migrazione).toMatch(/trimestre non valido/);
    expect(migrazione).toMatch(/periodo non valido/);
  });
});

describe("0.3 · uno zero non si spaccia per una liquidazione", () => {
  it("senza documenti la funzione si dichiara non calcolabile, con un motivo", () => {
    expect(migrazione).toMatch(/IF v_n_vendite = 0 AND v_n_acquisti = 0 THEN/);
    expect(migrazione).toMatch(/'calcolabile', false/);
    expect(migrazione).toMatch(/'motivo', format\(/);
  });

  it("l'edge trasforma quel rifiuto in un 422, non in un 200 con saldo zero", () => {
    expect(edge).toMatch(/r\?\.calcolabile === false/);
    expect(edge).toMatch(/422/);
    // il vecchio comportamento: warning nei log e zeri restituiti come validi
    expect(edge).not.toMatch(/console\.warn/);
  });

  it("le ipotesi del calcolo sono dichiarate, non nascoste", () => {
    expect(migrazione).toMatch(/'ipotesi'/);
    expect(migrazione).toMatch(/detraibile/);
  });

  it("il CORS è passato esplicitamente, altrimenti il browser scarta il rifiuto", () => {
    // secureHeaders fissa l'Origin: senza corsOverride la risposta non arriva
    // ai domini .it e white-label — cioè proprio dove serve leggerla.
    expect(edge).toMatch(/422,\s*\n\s*corsH,/);
    expect(edge).toMatch(/\}, 200, corsH\);/);
  });
});

describe("0.3 · la verifica al centesimo esiste ed è ripetibile", () => {
  it("il trimestre di prova ha gli importi attesi e non lascia traccia", () => {
    expect(verificaSql).toContain("2480.00");   // IVA a debito
    expect(verificaSql).toContain("590.00");    // IVA detraibile
    expect(verificaSql).toContain("1890.00");   // saldo
    expect(verificaSql).toContain("440.00");    // split payment escluso
    expect(verificaSql.trimEnd().endsWith("ROLLBACK;")).toBe(true);
  });

  it("verifica anche il rifiuto dichiarato e i confini di accesso", () => {
    expect(verificaSql).toMatch(/trimestre vuoto/);
    expect(verificaSql).toMatch(/altro tenant/);
    expect(verificaSql).toMatch(/fuori range/);
  });

  it("si rifiuta di partire se l'anno di prova contiene dati veri", () => {
    expect(verificaSql).toMatch(/non è vuoto: il test misurerebbe anche dati altrui/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const URL_BASE = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const CHIAVE = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const EMAIL = process.env.EIC_TEST_EMAIL ?? "";
const PASSWORD = process.env.EIC_TEST_PASSWORD ?? "";
const ATTIVA = URL_BASE.startsWith("https://") && CHIAVE.length > 40 && Boolean(EMAIL && PASSWORD);

describe.runIf(ATTIVA)("0.3 · prova end-to-end contro l'ambiente vero", () => {
  const entra = async () => {
    const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: CHIAVE, "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const j = await r.json();
    if (!j.access_token) throw new Error("login fallito");
    return j.access_token as string;
  };

  it("un periodo senza fatture non risponde zero: dichiara il rifiuto", async () => {
    const tok = await entra();
    const h = { apikey: CHIAVE, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
    const azienda = (
      await (await fetch(`${URL_BASE}/rest/v1/profiles?select=company_id&limit=1`, { headers: h })).json()
    )[0]?.company_id;
    expect(azienda).toBeTruthy();

    // 2089: nessuna azienda ha documenti in un anno così lontano.
    const r = await fetch(`${URL_BASE}/functions/v1/calcola-liquidazione-iva`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ company_id: azienda, periodo: "trimestrale", anno: 2089, trimestre: 3 }),
    });
    expect(r.status, "un periodo vuoto deve dichiararsi, non rispondere 200 con zero").toBe(422);
    const j = await r.json();
    expect(j.calcolabile).toBe(false);
    expect(j.error).toMatch(/Nessun documento fiscale/);
  }, 60_000);

  it("la liquidazione di un'altra azienda non si legge", async () => {
    const tok = await entra();
    const r = await fetch(`${URL_BASE}/functions/v1/calcola-liquidazione-iva`, {
      method: "POST",
      headers: { apikey: CHIAVE, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: "00000000-0000-0000-0000-000000000001",
        periodo: "trimestrale", anno: 2089, trimestre: 1,
      }),
    });
    expect(r.status).toBe(403);
  }, 60_000);

  it("un trimestre inesistente è un errore, non un numero", async () => {
    const tok = await entra();
    const h = { apikey: CHIAVE, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
    const azienda = (
      await (await fetch(`${URL_BASE}/rest/v1/profiles?select=company_id&limit=1`, { headers: h })).json()
    )[0]?.company_id;
    const r = await fetch(`${URL_BASE}/functions/v1/calcola-liquidazione-iva`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ company_id: azienda, periodo: "trimestrale", anno: 2089, trimestre: 9 }),
    });
    expect(r.status).toBe(400);
  }, 60_000);
});

describe.runIf(!ATTIVA)("0.3 · prova end-to-end", () => {
  it("saltata: servono SUPABASE_URL, SUPABASE_ANON_KEY, EIC_TEST_EMAIL, EIC_TEST_PASSWORD", () => {
    expect(ATTIVA).toBe(false);
  });
});
