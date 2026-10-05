import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classificaErroreAI,
  creaLimitatore,
  erroreGrezzoDa,
} from "../../../supabase/functions/_shared/allarmeAIClassifica";
import {
  componiAvviso,
  componiRipristino,
  durataLeggibile,
  oraDiRoma,
  piuColpiti,
  righeAllarmeAperto,
  type RigaAllarme,
} from "../../../supabase/functions/_shared/allarmeAITesti";
import { sondaOpenRouter } from "../../../supabase/functions/_shared/allarmeAISonda";

/**
 * Il credito OpenRouter è finito il 02/10/2026 e nessuno l'ha saputo: quasi
 * ogni chiamata rispondeva 402, Silvio ripiegava su gpt-4o-mini, e l'unico
 * avviso esistente stava in una sola funzione, solo nella campanella.
 *
 * Qui si protegge ciò che deve essere vero perché il titolare lo sappia:
 *  - un 402 (e gli altri modi di «il credito è finito») viene riconosciuto, e
 *    il rumore normale (timeout, 429, 5xx, moderazione) NO — un falso allarme
 *    alle tre di notte fa perdere la fiducia nel prossimo;
 *  - l'avviso dice il MOTIVO e se è urgente già dall'oggetto;
 *  - la sonda distingue «credito finito» da «rete giù» (solo il primo apre un
 *    allarme, e solo una sonda riuscita ne chiude uno);
 *  - i punti in cui il provider risponde sono davvero agganciati.
 */

// Il corpo vero dell'errore, dal registro del router del 05/10/2026.
const CORPO_402 =
  '{"error":{"message":"This request requires more credits, or fewer max_tokens. You requested up to 1800 tokens, but can only afford 76. To increase, visit https://openrouter.ai/settings/credits and upgrade to a paid account","code":402,"metadata":{"limit_source":"openrouter_credits"}}}';

describe("Riconoscere «il credito è finito» e «la chiave non va»", () => {
  it("il 402 del 05/10 è credito esaurito su OpenRouter", () => {
    expect(classificaErroreAI({ messaggio: `OpenRouter 402: ${CORPO_402}` })).toEqual({
      provider: "openrouter",
      motivo: "credito_esaurito",
      stato: 402,
    });
  });

  it("anche gli altri testi con cui OpenRouter lo ha detto in passato", () => {
    for (const testo of [
      "OpenRouter 402: This request would exceed your available credits", // 23/08
      "OpenRouter 402: This request requires at least $0.50 in balance for files", // 01/09 (PDF)
      "OpenRouter 402: Insufficient credits. Add more using https://openrouter.ai/settings/credits",
    ]) {
      expect(classificaErroreAI({ messaggio: testo })?.motivo, testo).toBe("credito_esaurito");
    }
  });

  it("un id di modello «openai/…» non fa credere che sia andata a OpenAI", () => {
    const c = classificaErroreAI({ messaggio: `openai/gpt-4o-mini: OpenRouter 402: ${CORPO_402}` });
    expect(c?.provider).toBe("openrouter");
  });

  it("OpenAI diretto senza quota è credito esaurito su OpenAI; un 429 di velocità no", () => {
    expect(
      classificaErroreAI({ messaggio: 'OpenAI 429: {"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}' }),
    ).toEqual({ provider: "openai", motivo: "credito_esaurito", stato: 429 });
    expect(classificaErroreAI({ messaggio: 'OpenAI 429: {"error":{"code":"rate_limit_exceeded"}}' })).toBeNull();
  });

  it("Anthropic diretto: «credit balance is too low»", () => {
    expect(classificaErroreAI({ provider: "anthropic", stato: 400, messaggio: "Your credit balance is too low to access the Anthropic API" })?.motivo)
      .toBe("credito_esaurito");
  });

  it("il rumore normale NON è un allarme: timeout, 429, 5xx, modello inesistente, rete", () => {
    for (const testo of [
      "OpenRouter 429: rate limited upstream",
      "OpenRouter 500: internal error",
      "OpenRouter 502: Provider returned error",
      "OpenRouter 503: no available provider",
      "OpenRouter 404: Model not available: foo/bar",
      "OpenRouter timeout (>30s) — modello anthropic/claude-sonnet-4.5 non risponde",
      "OpenRouter network error: connection reset",
      "OpenRouter: no choices in response",
    ]) {
      expect(classificaErroreAI({ messaggio: testo }), testo).toBeNull();
    }
  });

  it("senza dire di quale provider si parla, non si inventa niente", () => {
    expect(classificaErroreAI({ messaggio: "Error: 402 qualcosa" })).toBeNull();
    expect(classificaErroreAI({ messaggio: "" })).toBeNull();
    expect(classificaErroreAI({})).toBeNull();
  });

  it("la chiave rifiutata: 401 sempre; 403 solo se il testo lo dice (un 403 può essere moderazione)", () => {
    expect(classificaErroreAI({ messaggio: "OpenRouter 401: No auth credentials found" })?.motivo).toBe("chiave_non_valida");
    expect(classificaErroreAI({ messaggio: "OpenRouter 401" })?.motivo).toBe("chiave_non_valida");
    expect(classificaErroreAI({ messaggio: 'OpenRouter 403: {"error":{"message":"Your API key has been disabled"}}' })?.motivo).toBe("chiave_non_valida");
    // il client dei provider lancia «OpenRouter 403» senza corpo: non si sa, quindi niente allarme
    expect(classificaErroreAI({ messaggio: "OpenRouter 403" })).toBeNull();
    expect(classificaErroreAI({ messaggio: 'OpenRouter 403: {"error":{"message":"Input flagged by moderation"}}' })).toBeNull();
  });

  it("il tetto della chiave è un'altra cosa dal credito del conto, e ha la precedenza", () => {
    expect(classificaErroreAI({ messaggio: "OpenRouter 403: Key limit exceeded (monthly limit)" })?.motivo).toBe("limite_chiave");
    expect(
      classificaErroreAI({ messaggio: 'OpenRouter 402: {"error":{"message":"Insufficient credits","metadata":{"limit_source":"key_limit"}}}' })?.motivo,
    ).toBe("limite_chiave");
    // limit_source del CONTO resta credito
    expect(classificaErroreAI({ messaggio: `OpenRouter 402: ${CORPO_402}` })?.motivo).toBe("credito_esaurito");
  });

  it("provider e status espliciti battono il testo", () => {
    expect(classificaErroreAI({ provider: "openrouter", stato: 402, messaggio: CORPO_402 })).toEqual({
      provider: "openrouter",
      motivo: "credito_esaurito",
      stato: 402,
    });
  });
});

describe("Da qualunque cosa sia stata lanciata", () => {
  it("un Error dei client dei provider porta lo status", () => {
    const e = Object.assign(new Error("OpenRouter 402: x"), { provider_status: 402 });
    expect(erroreGrezzoDa(e)).toEqual({ messaggio: "OpenRouter 402: x", stato: 402 });
  });
  it("una stringa, un Error qualsiasi, un oggetto, il nulla", () => {
    expect(erroreGrezzoDa("OpenRouter 402: x")).toEqual({ messaggio: "OpenRouter 402: x" });
    expect(erroreGrezzoDa(new Error("boom"))).toEqual({ messaggio: "boom", stato: null });
    expect(erroreGrezzoDa({ provider: "openai", status: 429, message: "m" })).toEqual({ messaggio: "m", stato: 429, provider: "openai" });
    expect(erroreGrezzoDa(null)).toEqual({});
    expect(erroreGrezzoDa(undefined)).toEqual({});
  });
});

describe("Cento errori uguali al secondo non sono cento scritture", () => {
  it("il primo passa subito, gli altri si contano e passano insieme dopo la finestra", () => {
    let ora = 1_000;
    const l = creaLimitatore(20_000, () => ora);
    expect(l.registra("openrouter:credito_esaurito")).toBe(1);
    ora += 1_000;
    expect(l.registra("openrouter:credito_esaurito")).toBe(0);
    expect(l.registra("openrouter:credito_esaurito")).toBe(0);
    expect(l.registra("openrouter:credito_esaurito")).toBe(0);
    ora += 20_000; // finestra scaduta
    expect(l.registra("openrouter:credito_esaurito")).toBe(4); // le 3 trattenute + questa
    expect(l.registra("openrouter:credito_esaurito")).toBe(0);
  });
  it("chiavi diverse non si disturbano", () => {
    const l = creaLimitatore(20_000, () => 5);
    expect(l.registra("openrouter:credito_esaurito")).toBe(1);
    expect(l.registra("openai:credito_esaurito")).toBe(1);
    expect(l.registra("openrouter:chiave_non_valida")).toBe(1);
  });
});

const riga = (extra: Partial<RigaAllarme> = {}): RigaAllarme => ({
  id: "a1",
  provider: "openrouter",
  motivo: "credito_esaurito",
  aperto_il: "2026-10-03T01:12:00.000Z", // le 03:12 a Roma
  ultima_vista: "2026-10-05T07:00:00.000Z",
  conteggio: 412,
  funzioni: { persona_silvio: 212, email_compose: 130, sonda: 12, lead_qualificazione: 70 },
  modelli: { "anthropic/claude-sonnet-4.5": 300, "openai/gpt-4o-mini": 112 },
  aziende: ["a", "b", "c"],
  ultimo_dettaglio: "402 This request requires more credits",
  notifiche_inviate: 1,
  ...extra,
});
const ADESSO = new Date("2026-10-05T07:12:00.000Z");

describe("Le parole dell'avviso: motivo e urgenza già dall'oggetto", () => {
  it("la durata si legge", () => {
    expect(durataLeggibile(20_000)).toBe("meno di un minuto");
    expect(durataLeggibile(12 * 60_000)).toBe("12 minuti");
    expect(durataLeggibile(60_000)).toBe("1 minuto");
    expect(durataLeggibile((3 * 60 + 12) * 60_000)).toBe("3 ore e 12 minuti");
    expect(durataLeggibile(2 * 24 * 3_600_000 + 6 * 3_600_000)).toBe("2 giorni e 6 ore");
    expect(durataLeggibile(24 * 3_600_000)).toBe("1 giorno");
  });

  it("l'ora è quella di Roma, non quella del server", () => {
    const s = oraDiRoma("2026-10-03T01:12:00.000Z");
    expect(s).toContain("03:12");
    expect(s).toMatch(/ott/);
  });

  it("i più colpiti, senza le righe finte della sonda", () => {
    expect(piuColpiti({ persona_silvio: 212, sonda: 99, email_compose: 130 })).toBe("persona_silvio (212), email_compose (130)");
    expect(piuColpiti(null)).toBe("");
  });

  it("credito esaurito: URGENTE, dice che l'AI è ferma, da quando, quanto e chi", () => {
    const a = componiAvviso(riga(), { adesso: ADESSO, sonda: { ok: false, stato: 402, dettaglio: "This request requires more credits" }, saldo: null });
    expect(a.oggetto).toBe("URGENTE — OpenRouter: credito esaurito, l'AI è ferma");
    expect(a.sommario).toContain("non ha più credito");
    expect(a.sommario).toContain("Silvio");
    const d = Object.fromEntries(a.dettagli);
    expect(d["Motivo"]).toBe("Credito esaurito");
    expect(d["Da quando"]).toContain("03:12");
    expect(d["Da quando"]).toContain("2 giorni");
    expect(d["Chiamate fallite"]).toBe("almeno 412");
    expect(d["Aziende colpite"]).toBe("3");
    expect(d["Funzioni colpite"]).toBe("persona_silvio (212), email_compose (130), lead_qualificazione (70)");
    expect(d["Prova di adesso"]).toContain("rifiutata (402)");
    // senza chiave management il saldo non si legge: lo si dice e si dice come averlo
    expect(d["Saldo"]).toContain("OPENROUTER_MANAGEMENT_KEY");
    expect(a.url).toBe("https://openrouter.ai/settings/credits");
    expect(a.urlLabel).toBe("Ricarica OpenRouter");
    expect(a.campanella.titolo).toBe("OpenRouter: credito esaurito, l'AI è ferma");
  });

  it("col saldo noto lo scrive, e non rimanda alla chiave management", () => {
    const a = componiAvviso(riga(), {
      adesso: ADESSO,
      saldo: { disponibile_usd: 0.03, usato_usd: 100, fonte: "conto" },
    });
    const d = Object.fromEntries(a.dettagli);
    expect(d["Saldo"]).toBe("0,03 $");
  });

  it("un promemoria si distingue dalla prima email", () => {
    const a = componiAvviso(riga({ notifiche_inviate: 3 }), { adesso: ADESSO });
    expect(a.oggetto).toMatch(/^PROMEMORIA — OpenRouter: credito ancora esaurito da 2 giorni/);
    expect(Object.fromEntries(a.dettagli)["Avviso numero"]).toBe("3");
  });

  it("credito in calo: NON è urgente, ma dice quanto resta e per quanti giorni", () => {
    const a = componiAvviso(riga({ motivo: "credito_basso", conteggio: 1, funzioni: {}, modelli: {}, aziende: [] }), {
      adesso: ADESSO,
      saldo: { disponibile_usd: 9.8, usato_usd: 90, fonte: "conto" },
      sogliaUsd: 20,
      consumoGiornalieroUsd: 3.2,
    });
    expect(a.oggetto).toBe("Credito OpenRouter in calo: restano 9,80 $ (circa 3 giorni)");
    expect(a.oggetto).not.toMatch(/URGENTE/);
    const d = Object.fromEntries(a.dettagli);
    expect(d["Soglia di avviso"]).toBe("20,00 $");
    expect(d["Basta ancora per"]).toBe("circa 3 giorni");
  });

  it("chiave rifiutata e tetto della chiave rimandano alle chiavi, non alla ricarica", () => {
    const k = componiAvviso(riga({ motivo: "chiave_non_valida" }), { adesso: ADESSO });
    expect(k.oggetto).toBe("URGENTE — OpenRouter rifiuta la chiave della piattaforma");
    expect(k.url).toBe("https://openrouter.ai/settings/keys");
    expect(Object.fromEntries(k.dettagli)["Cosa fare"]).toContain("OPENROUTER_API_KEY");
    const t = componiAvviso(riga({ motivo: "limite_chiave" }), { adesso: ADESSO });
    expect(t.oggetto).toBe("URGENTE — La chiave OpenRouter ha raggiunto il suo tetto di spesa");
    expect(t.sommario).toContain("ha credito");
  });

  it("OpenAI: dice che i render passano al ripiego e porta alla ricarica di OpenAI", () => {
    const a = componiAvviso(riga({ provider: "openai" }), { adesso: ADESSO });
    expect(a.oggetto).toBe("URGENTE — OpenAI: credito esaurito, l'AI è ferma");
    expect(a.sommario).toContain("render");
    expect(a.url).toContain("platform.openai.com");
    // la riga del saldo OpenRouter non c'entra con OpenAI
    expect(Object.fromEntries(a.dettagli)["Saldo"]).toBeUndefined();
  });

  it("il ripristino dice quanto è durato e quanto ha fatto", () => {
    const r = componiRipristino(riga({ chiuso_il: "2026-10-05T07:07:00.000Z" }), {
      adesso: ADESSO,
      sonda: { ok: true, stato: 200, dettaglio: null },
    });
    expect(r.oggetto).toBe("Risolto — OpenRouter risponde di nuovo");
    expect(r.sommario).toContain("2 giorni e 5 ore");
    expect(Object.fromEntries(r.dettagli)["Chiamate fallite"]).toBe("almeno 412");
    expect(Object.fromEntries(r.dettagli)["Prova di adesso"]).toContain("riuscita");
  });

  it("nel rapporto del mattino: da quando, quante chiamate, dove si ricarica", () => {
    const r = righeAllarmeAperto(riga(), ADESSO);
    expect(String(r.problema)).toContain("credito OpenRouter esaurito");
    expect(String(r.da)).toContain("2 giorni");
    expect(r.chiamate_fallite).toBe("almeno 412");
    expect(r.ricarica).toBe("https://openrouter.ai/settings/credits");
    expect(righeAllarmeAperto(riga({ motivo: "chiave_non_valida" }), ADESSO).chiavi).toBe("https://openrouter.ai/settings/keys");
  });

  it("nel rapporto del mattino «credito in calo» non conta «chiamate fallite»: sono letture del saldo", () => {
    const r = righeAllarmeAperto(riga({ motivo: "credito_basso", conteggio: 288 }), ADESSO);
    expect("chiamate_fallite" in r).toBe(false);
    expect(String(r.problema)).toContain("in calo");
  });
});

describe("La sonda: distingue «credito finito» da «rete giù»", () => {
  const risposta = (stato: number, corpo: unknown) =>
    () => Promise.resolve(new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status: stato, headers: { "content-type": "application/json" } }));

  it("manda una richiesta minima a Sonnet con un tetto di token realistico e chiede l'usage", async () => {
    let visto: { url: string; init: RequestInit } | null = null;
    const fetchFn = ((url: string, init: RequestInit) => {
      // Come il runtime vero: un valore d'intestazione con caratteri oltre Latin-1
      // (un trattino lungo) fa LANCIARE fetch. Con un fetch finto che non guarda,
      // la sonda sembrerebbe a posto e in produzione fallirebbe ogni volta.
      new Headers(init.headers as HeadersInit);
      visto = { url, init };
      return risposta(200, { choices: [{ message: { content: "ok" } }], usage: { cost: 0.00004 } })();
    }) as unknown as typeof fetch;
    const e = await sondaOpenRouter({ apiKey: "sk-test", fetchFn });
    expect(e.ok).toBe(true);
    expect(e.costoUsd).toBeCloseTo(0.00004, 8);
    expect(visto!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const corpo = JSON.parse(String(visto!.init.body));
    expect(corpo.model).toBe("anthropic/claude-sonnet-4.5");
    expect(corpo.max_tokens).toBe(4000);
    expect(corpo.usage).toEqual({ include: true });
    expect((visto!.init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
  });

  it("402 del credito: rifiutata, motivo credito_esaurito, con il testo vero", async () => {
    const e = await sondaOpenRouter({ apiKey: "k", fetchFn: risposta(402, CORPO_402) as unknown as typeof fetch });
    expect(e).toMatchObject({ ok: false, stato: 402, motivo: "credito_esaurito" });
    expect(e.dettaglio).toContain("requires more credits");
  });

  it("OpenRouter a volte risponde 200 con l'errore nel corpo", async () => {
    const e = await sondaOpenRouter({
      apiKey: "k",
      fetchFn: risposta(200, { error: { code: 402, message: "Insufficient credits" } }) as unknown as typeof fetch,
    });
    expect(e).toMatchObject({ ok: false, stato: 402, motivo: "credito_esaurito" });
  });

  it("401: chiave rifiutata", async () => {
    const e = await sondaOpenRouter({ apiKey: "k", fetchFn: risposta(401, { error: { message: "No auth credentials found" } }) as unknown as typeof fetch });
    expect(e).toMatchObject({ ok: false, stato: 401, motivo: "chiave_non_valida" });
  });

  it("429, 5xx e rete giù NON sono credito: nessun motivo, quindi nessun allarme", async () => {
    for (const f of [risposta(429, "rate limited"), risposta(503, "no provider")]) {
      const e = await sondaOpenRouter({ apiKey: "k", fetchFn: f as unknown as typeof fetch });
      expect(e.ok).toBe(false);
      expect(e.motivo).toBeNull();
    }
    const giu = await sondaOpenRouter({
      apiKey: "k",
      fetchFn: (() => Promise.reject(new Error("connection reset"))) as unknown as typeof fetch,
    });
    expect(giu).toMatchObject({ ok: false, stato: null, motivo: null });
    expect(giu.dettaglio).toContain("connection reset");
  });
});

// ── Il canarino ──────────────────────────────────────────────────────────────
const sorgente = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");

describe("Il canarino conosce il modo nuovo e non ricade più nel rapporto", () => {
  it("il canarino conosce il modo credito-ai PRIMA del rapporto di piattaforma, e rifiuta i modi sconosciuti", () => {
    const s = sorgente("supabase/functions/ops-canarino/index.ts");
    const iCredito = s.indexOf('modo === "credito-ai"');
    const iMattino = s.indexOf('modo === "mattino"');
    const iRifiuto = s.indexOf('if (modo !== "")');
    const iRapporto = s.indexOf("await statoPiattaforma(supabase);\n\n    const destinatari");
    expect(iCredito).toBeGreaterThan(0);
    expect(iCredito).toBeLessThan(iMattino);
    expect(iRifiuto).toBeGreaterThan(iMattino);
    expect(iRifiuto).toBeLessThan(iRapporto);
  });

  it("il rapporto del mattino mette gli allarmi AI aperti per primi", () => {
    const s = sorgente("supabase/functions/ops-canarino/stato.ts");
    expect(s).toMatch(/const SEZIONI[^=]*= \[\s*\{ key: "ai_allarmi_aperti"/);
  });
});

describe("La migrazione degli allarmi: ogni funzione nasce chiusa", () => {
  const sql = sorgente("supabase/migrations/20281005224500_allarmi_ai_credito.sql");
  const funzioni = [...sql.matchAll(/create or replace function public\.(ai_allarm\w+)\(/g)].map((m) => m[1]);

  it("ci sono le cinque funzioni", () => {
    expect(funzioni.sort()).toEqual(["ai_allarme_chiudi", "ai_allarme_intervallo", "ai_allarme_registra", "ai_allarme_rilascia", "ai_allarmi_da_notificare"]);
  });

  it("ciascuna ha REVOKE a PUBLIC/anon/authenticated e GRANT solo al service role", () => {
    for (const f of funzioni) {
      expect(sql, `revoke ${f}`).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated;`));
      expect(sql, `grant ${f}`).toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to service_role;`));
    }
    expect(sql).not.toMatch(/grant execute on function[^;]*to (anon|authenticated|public)/);
  });

  it("la tabella ha RLS e solo il super admin la legge", () => {
    expect(sql).toMatch(/alter table public\.ai_allarmi enable row level security;/);
    expect(sql).toMatch(/create policy ai_allarmi_super_admin_select on public\.ai_allarmi\s+for select to authenticated\s+using \(\(select public\.has_role\(\(select auth\.uid\(\)\), 'super_admin'/);
    expect(sql).toMatch(/revoke all on public\.ai_allarmi from anon, authenticated;/);
  });

  it("il cron e la sveglia immediata NON stanno qui: si accendono dopo il deploy del canarino", () => {
    expect(sql).not.toMatch(/cron\.schedule\(/);
    expect(sql).not.toMatch(/insert into public\.platform_settings/i);
  });
});
