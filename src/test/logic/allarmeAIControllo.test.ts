import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Il controllo del credito AI, con un database finto: la SEQUENZA decide se il
 * titolare lo sa in tempo o riceve venti email uguali.
 *
 * Il database finto replica le regole delle funzioni SQL (verificate a parte in
 * produzione con una prova a vuoto): un solo allarme aperto per
 * provider+motivo, presa in carico atomica, promemoria a 30 min / 2 h / 6 h,
 * «credito in calo» una volta al giorno, rilascio se l'email non parte.
 * Email e campanella sono finte: qui non parte niente.
 */

const { notifica, avvisa } = vi.hoisted(() => ({ notifica: vi.fn(), avvisa: vi.fn() }));
vi.mock("../../../supabase/functions/_shared/notificaInterna.ts", () => ({ notificaInterna: notifica }));
vi.mock("../../../supabase/functions/_shared/avvisaSuperAdmin.ts", () => ({ avvisaSuperAdmin: avvisa }));

import { controllaCreditoAI, provaAvvisoCreditoAI } from "../../../supabase/functions/ops-canarino/creditoAI";

const CORPO_402 =
  '{"error":{"message":"This request requires more credits, or fewer max_tokens. You requested up to 1800 tokens, but can only afford 76.","code":402,"metadata":{"limit_source":"openrouter_credits"}}}';

interface Allarme {
  id: string;
  provider: string;
  motivo: string;
  aperto_il: string;
  ultima_vista: string;
  conteggio: number;
  funzioni: Record<string, number>;
  modelli: Record<string, number>;
  aziende: string[];
  ultimo_dettaglio: string | null;
  ultima_notifica: string | null;
  ultima_notifica_prima: string | null;
  notifiche_inviate: number;
  chiuso_il: string | null;
  chiuso_nota: string | null;
}

const intervalloMs = (motivo: string, inviate: number) =>
  motivo === "credito_basso" ? 24 * 3_600_000
    : inviate <= 1 ? 30 * 60_000
    : inviate === 2 ? 2 * 3_600_000
    : 6 * 3_600_000;

type EsitoRpc = { data: unknown; error: { message: string } | null };

function database(iniziali: Partial<Allarme>[] = []) {
  let n = 0;
  const allarmi: Allarme[] = iniziali.map((a): Allarme => ({
    id: `a${++n}`,
    provider: "openrouter",
    motivo: "credito_esaurito",
    aperto_il: new Date(Date.now() - 3_600_000).toISOString(),
    ultima_vista: new Date().toISOString(),
    conteggio: 10,
    funzioni: {},
    modelli: {},
    aziende: [],
    ultimo_dettaglio: null,
    ultima_notifica: null,
    ultima_notifica_prima: null,
    notifiche_inviate: 0,
    chiuso_il: null,
    chiuso_nota: null,
    ...a,
  }));
  const metriche: Array<Record<string, unknown>> = [];
  const chiamate: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const aperti = () => allarmi.filter((a) => !a.chiuso_il);

  const rpc = async (nome: string, args: Record<string, unknown> = {}): Promise<EsitoRpc> => {
    chiamate.push({ nome, args });
    const adesso = new Date().toISOString();
    if (nome === "ai_allarme_registra") {
      let a = aperti().find((x) => x.provider === args.p_provider && x.motivo === args.p_motivo);
      if (!a) {
        a = {
          id: `a${++n}`, provider: String(args.p_provider), motivo: String(args.p_motivo), aperto_il: adesso, ultima_vista: adesso,
          conteggio: 0, funzioni: {}, modelli: {}, aziende: [], ultimo_dettaglio: null, ultima_notifica: null,
          ultima_notifica_prima: null, notifiche_inviate: 0, chiuso_il: null, chiuso_nota: null,
        };
        allarmi.push(a);
      }
      a.conteggio += Number(args.p_conteggio ?? 1);
      a.ultima_vista = adesso;
      a.ultimo_dettaglio = String(args.p_dettaglio ?? a.ultimo_dettaglio ?? "");
      if (args.p_funzione) a.funzioni[String(args.p_funzione)] = (a.funzioni[String(args.p_funzione)] ?? 0) + Number(args.p_conteggio ?? 1);
      return { data: { id: a.id }, error: null };
    }
    if (nome === "ai_allarmi_da_notificare") {
      const prese = aperti().filter((a) => !a.ultima_notifica || Date.now() - Date.parse(a.ultima_notifica) >= intervalloMs(a.motivo, a.notifiche_inviate));
      for (const a of prese) {
        a.ultima_notifica_prima = a.ultima_notifica;
        a.ultima_notifica = adesso;
        a.notifiche_inviate += 1;
      }
      return { data: prese.map((a) => ({ ...a })), error: null };
    }
    if (nome === "ai_allarme_rilascia") {
      const a = aperti().find((x) => x.id === args.p_id);
      if (a) {
        a.ultima_notifica = a.ultima_notifica_prima;
        a.ultima_notifica_prima = null;
        a.notifiche_inviate = Math.max(a.notifiche_inviate - 1, 0);
      }
      return { data: null, error: null };
    }
    if (nome === "ai_allarme_chiudi") {
      const a = aperti().find((x) => x.id === args.p_id);
      if (!a) return { data: null, error: null };
      a.chiuso_il = adesso;
      a.chiuso_nota = String(args.p_nota ?? "");
      return { data: { ...a }, error: null };
    }
    return { data: null, error: { message: `rpc sconosciuta: ${nome}` } };
  };

  const client = {
    rpc,
    from: (tabella: string) => ({
      select: (_cols: string, opzioni?: { head?: boolean }) => ({
        is: async (): Promise<EsitoRpc & { count?: number }> =>
          tabella === "ai_allarmi"
            ? opzioni?.head
              ? { count: aperti().length, data: null, error: null }
              : { data: aperti().map((a) => ({ ...a })), error: null }
            : { data: [], error: null },
      }),
      insert: async (riga: Record<string, unknown>): Promise<{ error: { message: string } | null }> => {
        metriche.push(riga);
        return { error: null };
      },
    }),
  };
  // deno-lint-ignore no-explicit-any
  return { client: client as any, allarmi, metriche, chiamate };
}

/** fetch finto: la sonda (chat/completions), il saldo (/credits) e la chiave (/key). */
function fetchFinto(opzioni: { sonda?: () => Response | Promise<Response>; credits?: { totale: number; usato: number } }) {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/chat/completions")) {
      if (!opzioni.sonda) throw new Error("sonda non prevista");
      return await opzioni.sonda();
    }
    if (String(url).endsWith("/credits")) {
      const c = opzioni.credits ?? { totale: 100, usato: 10 };
      return new Response(JSON.stringify({ data: { total_credits: c.totale, total_usage: c.usato } }), { status: 200 });
    }
    // /key: la chiave normale, senza tetto
    return new Response(JSON.stringify({ data: { usage: 12.34, limit: null, limit_remaining: null } }), { status: 200 });
  });
}

const sonda402 = () => new Response(CORPO_402, { status: 402, headers: { "content-type": "application/json" } });
const sondaOk = () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { cost: 0.00004 } }), { status: 200 });

function ambiente(env: Record<string, string>) {
  (globalThis as Record<string, unknown>).Deno = { env: { get: (k: string) => env[k] } };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T07:00:00.000Z"));
  notifica.mockReset().mockResolvedValue(true);
  avvisa.mockReset().mockResolvedValue({ destinatari: 1, push_inviate: 0, push_fallite: 0, email_inviate: 0 });
  ambiente({ OPENROUTER_API_KEY: "sk-test", APP_URL: "https://app.esempio.it" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).Deno;
});

const avanza = (minuti: number) => vi.setSystemTime(new Date(Date.now() + minuti * 60_000));

describe("Il credito è finito: il titolare lo sa subito, una volta, con il motivo", () => {
  it("la sonda lo vede, apre l'allarme e manda email e campanella nello stesso giro", async () => {
    const db = database();
    vi.stubGlobal("fetch", fetchFinto({ sonda: sonda402 }));

    const esito = await controllaCreditoAI(db.client);

    expect(esito.sonda).toMatchObject({ ok: false, stato: 402, motivo: "credito_esaurito" });
    const registra = db.chiamate.find((c) => c.nome === "ai_allarme_registra");
    expect(registra?.args).toMatchObject({ p_provider: "openrouter", p_motivo: "credito_esaurito", p_funzione: "sonda" });
    expect(notifica).toHaveBeenCalledTimes(1);
    const email = notifica.mock.calls[0][1];
    expect(email.oggetto).toBe("URGENTE — OpenRouter: credito esaurito, l'AI è ferma");
    expect(email.url).toBe("https://openrouter.ai/settings/credits");
    expect(Object.fromEntries(email.dettagli as Array<[string, string]>)["Motivo"]).toBe("Credito esaurito");
    expect(avvisa).toHaveBeenCalledTimes(1);
    expect(avvisa.mock.calls[0][1]).toMatchObject({ tipo: "ai_allarme", url: "/admin/ai?section=monitor", tag: "ai-allarme:openrouter:credito_esaurito" });
    expect(esito.avvisi_inviati).toBe(1);
    expect(esito.allarmi_aperti).toBe(1);
  });

  it("il giro dopo, cinque minuti più tardi, NON rimanda la stessa email", async () => {
    const db = database();
    vi.stubGlobal("fetch", fetchFinto({ sonda: sonda402 }));
    await controllaCreditoAI(db.client);
    avanza(5);
    const esito = await controllaCreditoAI(db.client);
    expect(notifica).toHaveBeenCalledTimes(1);
    expect(esito.avvisi_inviati).toBe(0);
    expect(db.allarmi.filter((a) => !a.chiuso_il)).toHaveLength(1);
  });

  it("i promemoria arrivano a 30 minuti, poi a 2 ore, poi ogni 6", async () => {
    const db = database();
    vi.stubGlobal("fetch", fetchFinto({ sonda: sonda402 }));
    await controllaCreditoAI(db.client); // 1ª: subito
    avanza(31);
    await controllaCreditoAI(db.client); // 2ª: PROMEMORIA
    expect(notifica).toHaveBeenCalledTimes(2);
    expect(notifica.mock.calls[1][1].oggetto).toMatch(/^PROMEMORIA — OpenRouter: credito ancora esaurito/);
    avanza(31);
    await controllaCreditoAI(db.client); // serve 1h59 dopo la seconda: non ancora
    expect(notifica).toHaveBeenCalledTimes(2);
    avanza(90);
    await controllaCreditoAI(db.client); // 3ª
    expect(notifica).toHaveBeenCalledTimes(3);
  });

  it("se l'email non parte, l'allarme torna com'era e il giro dopo riprova", async () => {
    const db = database();
    vi.stubGlobal("fetch", fetchFinto({ sonda: sonda402 }));
    notifica.mockResolvedValueOnce(false);
    const primo = await controllaCreditoAI(db.client);
    expect(primo.avvisi_falliti).toBe(1);
    expect(primo.avvisi_inviati).toBe(0);
    expect(db.chiamate.some((c) => c.nome === "ai_allarme_rilascia")).toBe(true);
    expect(db.allarmi[0].notifiche_inviate).toBe(0);

    avanza(5);
    const secondo = await controllaCreditoAI(db.client);
    expect(secondo.avvisi_inviati).toBe(1);
    expect(notifica).toHaveBeenCalledTimes(2);
    // è la PRIMA email, non un promemoria: l'oggetto è quello urgente
    expect(notifica.mock.calls[1][1].oggetto).toBe("URGENTE — OpenRouter: credito esaurito, l'AI è ferma");
  });

  it("senza la chiave OPENROUTER_API_KEY nei secrets è un allarme di chiave, non un silenzio", async () => {
    ambiente({ APP_URL: "https://app.esempio.it" });
    const db = database();
    vi.stubGlobal("fetch", fetchFinto({}));
    const esito = await controllaCreditoAI(db.client);
    expect(esito.sonda).toBeNull();
    expect(db.chiamate.find((c) => c.nome === "ai_allarme_registra")?.args).toMatchObject({ p_motivo: "chiave_non_valida" });
    expect(notifica.mock.calls[0][1].oggetto).toBe("URGENTE — OpenRouter rifiuta la chiave della piattaforma");
  });
});

describe("Chiudere un allarme richiede una prova, non il silenzio", () => {
  const aperto = (extra: Partial<Allarme> = {}): Partial<Allarme> => ({
    aperto_il: "2026-10-03T01:12:00.000Z",
    ultima_vista: new Date(Date.now() - 11 * 60_000).toISOString(),
    ultima_notifica: new Date(Date.now() - 40 * 60_000).toISOString(),
    notifiche_inviate: 1,
    conteggio: 412,
    ...extra,
  });

  it("sonda riuscita e nessun errore da 11 minuti: si chiude e arriva «Risolto»", async () => {
    const db = database([aperto()]);
    vi.stubGlobal("fetch", fetchFinto({ sonda: sondaOk }));
    const esito = await controllaCreditoAI(db.client);
    expect(esito.chiusi).toEqual(["openrouter:credito_esaurito"]);
    expect(db.allarmi[0].chiuso_il).not.toBeNull();
    expect(notifica).toHaveBeenCalledTimes(1);
    expect(notifica.mock.calls[0][1].oggetto).toBe("Risolto — OpenRouter risponde di nuovo");
    expect(esito.allarmi_aperti).toBe(0);
  });

  it("sonda riuscita ma una funzione ha segnalato errori 2 minuti fa: resta aperto (i guai veri non sono finiti)", async () => {
    const db = database([aperto({ ultima_vista: new Date(Date.now() - 2 * 60_000).toISOString() })]);
    vi.stubGlobal("fetch", fetchFinto({ sonda: sondaOk }));
    const esito = await controllaCreditoAI(db.client);
    expect(esito.chiusi).toEqual([]);
    expect(db.allarmi[0].chiuso_il).toBeNull();
  });

  it("rete giù: la sonda non riesce ma NON è credito — nessun allarme nuovo e niente si chiude", async () => {
    const db = database([aperto()]);
    vi.stubGlobal("fetch", fetchFinto({ sonda: () => Promise.reject(new Error("connection reset")) }));
    const esito = await controllaCreditoAI(db.client);
    expect(db.chiamate.some((c) => c.nome === "ai_allarme_registra")).toBe(false);
    expect(esito.chiusi).toEqual([]);
    expect(db.allarmi[0].chiuso_il).toBeNull();
    expect(esito.errori.join(" ")).toContain("connection reset");
  });

  it("un allarme che nessuno ha mai comunicato si chiude senza «Risolto»", async () => {
    const db = database([aperto({ notifiche_inviate: 0, ultima_notifica: null })]);
    vi.stubGlobal("fetch", fetchFinto({ sonda: sondaOk }));
    const esito = await controllaCreditoAI(db.client);
    expect(esito.chiusi).toHaveLength(1);
    expect(notifica).not.toHaveBeenCalled();
  });

  it("OpenRouter con la sonda che non riesce per altro (modello ritirato, rete): dopo 6 ore di silenzio si chiude, ma senza «Risolto»", async () => {
    const db = database([aperto({ ultima_vista: new Date(Date.now() - 7 * 3_600_000).toISOString(), ultima_notifica: new Date().toISOString() })]);
    vi.stubGlobal("fetch", fetchFinto({ sonda: () => new Response('{"error":{"message":"Model not available"}}', { status: 404 }) }));
    const esito = await controllaCreditoAI(db.client);
    expect(esito.chiusi).toEqual(["openrouter:credito_esaurito"]);
    expect(db.allarmi[0].chiuso_nota).toContain("senza una prova di ripristino");
    expect(notifica.mock.calls.some((c) => /^Risolto/.test(c[1].oggetto))).toBe(false);
  });

  it("col credito davvero finito e nessun traffico il silenzio non arriva mai a 6 ore: la sonda rinfresca l'allarme a ogni giro", async () => {
    const db = database([aperto({ ultima_vista: new Date(Date.now() - 5 * 3_600_000).toISOString(), ultima_notifica: new Date().toISOString() })]);
    vi.stubGlobal("fetch", fetchFinto({ sonda: sonda402 }));
    for (let i = 0; i < 80; i++) {
      avanza(5); // 6 ore e 40 minuti di soli giri della sonda
      await controllaCreditoAI(db.client);
    }
    expect(db.allarmi.filter((a) => !a.chiuso_il)).toHaveLength(1);
    expect(db.allarmi.filter((a) => a.chiuso_il)).toHaveLength(0);
  });

  it("OpenAI (che la sonda non copre): si chiude in silenzio dopo 6 ore senza errori, non prima", async () => {
    const db = database([aperto({ provider: "openai", ultima_vista: new Date(Date.now() - 5 * 3_600_000).toISOString() })]);
    vi.stubGlobal("fetch", fetchFinto({ sonda: sondaOk }));
    // dopo 5 ore di silenzio è ancora aperto (e, con l'ultima email di 40 minuti fa, arriva il promemoria)
    expect((await controllaCreditoAI(db.client)).chiusi).toEqual([]);
    avanza(61);
    const dopo = await controllaCreditoAI(db.client);
    expect(dopo.chiusi).toEqual(["openai:credito_esaurito"]);
    // chiuso in silenzio: nessun «Risolto», perché la sonda non può provare che OpenAI sia tornato
    expect(notifica.mock.calls.some((c) => /^Risolto/.test(c[1].oggetto))).toBe(false);
  });
});

describe("Credito in calo: si avvisa PRIMA che finisca, se si conosce il saldo", () => {
  beforeEach(() => {
    ambiente({ OPENROUTER_API_KEY: "sk-test", OPENROUTER_MANAGEMENT_KEY: "sk-mgmt", APP_URL: "https://app.esempio.it" });
  });

  it("saldo 9,80 $ sotto la soglia di 20: avviso normale (non urgente) col saldo nell'oggetto", async () => {
    const db = database();
    vi.stubGlobal("fetch", fetchFinto({ sonda: sondaOk, credits: { totale: 100, usato: 90.2 } }));
    const esito = await controllaCreditoAI(db.client);
    expect(esito.saldo_usd).toBe(9.8);
    expect(db.chiamate.find((c) => c.nome === "ai_allarme_registra")?.args).toMatchObject({ p_motivo: "credito_basso" });
    expect(notifica.mock.calls[0][1].oggetto).toBe("Credito OpenRouter in calo: restano 9,80 $");
    // la metrica porta il saldo: si potrà calcolare quanto si consuma
    expect(db.metriche[0]).toMatchObject({ metric_type: "ai_sonda", metadata: expect.objectContaining({ saldo_usd: 9.8, ok: true }) });
  });

  it("saldo sopra la soglia: nessun allarme; e un «in calo» aperto si chiude in silenzio", async () => {
    const db = database([{ motivo: "credito_basso", notifiche_inviate: 1, ultima_notifica: new Date().toISOString() }]);
    vi.stubGlobal("fetch", fetchFinto({ sonda: sondaOk, credits: { totale: 100, usato: 40 } }));
    const esito = await controllaCreditoAI(db.client);
    expect(esito.chiusi).toEqual(["openrouter:credito_basso"]);
    expect(notifica).not.toHaveBeenCalled();
  });

  it("un «in calo» che non si rinfresca più (saldo non più leggibile) si chiude in silenzio dopo 6 ore, non resta aperto a vita", async () => {
    ambiente({ OPENROUTER_API_KEY: "sk-test", APP_URL: "https://app.esempio.it" }); // niente chiave management: il saldo non si legge
    const db = database([{ motivo: "credito_basso", notifiche_inviate: 1, ultima_notifica: new Date().toISOString(), ultima_vista: new Date(Date.now() - 7 * 3_600_000).toISOString() }]);
    vi.stubGlobal("fetch", fetchFinto({ sonda: sondaOk }));
    const esito = await controllaCreditoAI(db.client);
    expect(esito.chiusi).toEqual(["openrouter:credito_basso"]);
    expect(notifica).not.toHaveBeenCalled();
  });

  it("col credito già esaurito non si aggiunge anche un «in calo»: sarebbe rumore", async () => {
    const db = database();
    vi.stubGlobal("fetch", fetchFinto({ sonda: sonda402, credits: { totale: 100, usato: 99.99 } }));
    await controllaCreditoAI(db.client);
    const motivi = db.chiamate.filter((c) => c.nome === "ai_allarme_registra").map((c) => c.args.p_motivo);
    expect(motivi).toEqual(["credito_esaurito"]);
  });
});

describe("Anteprima e prova non toccano niente", () => {
  it("l'anteprima racconta cosa partirebbe, senza registrare, prendere in carico, chiudere o spedire", async () => {
    const db = database([{ notifiche_inviate: 0 }]);
    vi.stubGlobal("fetch", fetchFinto({ sonda: sonda402 }));
    const esito = await controllaCreditoAI(db.client, { anteprima: true });
    expect(esito.anteprima?.[0].oggetto).toBe("URGENTE — OpenRouter: credito esaurito, l'AI è ferma");
    const scritture = db.chiamate.filter((c) => c.nome !== "ai_allarmi_aperti");
    expect(scritture).toEqual([]);
    expect(notifica).not.toHaveBeenCalled();
    expect(avvisa).not.toHaveBeenCalled();
    expect(db.metriche).toEqual([]);
  });

  it("la prova spedisce UNA email «[Prova]» con dati di esempio, senza campanella né allarmi", async () => {
    const db = database();
    const p = await provaAvvisoCreditoAI(db.client);
    expect(p.inviata).toBe(true);
    expect(p.oggetto).toBe("[Prova] URGENTE — OpenRouter: credito esaurito, l'AI è ferma");
    expect(notifica).toHaveBeenCalledTimes(1);
    expect(notifica.mock.calls[0][1].oggetto).toBe(p.oggetto);
    expect(avvisa).not.toHaveBeenCalled();
    expect(db.chiamate).toEqual([]);
  });
});
