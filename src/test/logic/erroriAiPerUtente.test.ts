/**
 * Errori della lettura AI: cosa vede l'utente (30/10/2026).
 *
 * In 90 giorni tutti i 9 errori di lettura in produzione erano di credito. Qui si
 * tiene fermo che:
 *   · il saldo/budget dell'azienda dà 402 con lo stesso messaggio di sempre, e la
 *     finestra di ricarica dell'interfaccia (lib/creditoEsaurito) si apre;
 *   · il credito finito presso il provider NON apre quella finestra (prima poteva:
 *     «credito provider insufficiente» contiene le parole che l'interfaccia cerca);
 *   · gli altri errori non riconosciuti restano come prima (null).
 */
import { describe, expect, it } from "vitest";
import { erroreAiPerUtente, erroreDaCorpo, letturaNonRiuscita } from "../../../supabase/functions/_shared/erroriAi";
import { classificaBloccoPagamento } from "@/lib/creditoEsaurito";

/** Un errore con lo stesso nome di classe del router (il modulo riconosce per nome). */
const errore = (nome: string, messaggio: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(messaggio), { name: nome, ...extra });

const SALDO = "Credito insufficiente o bloccato: Saldo €0.00 insufficiente per stima €0.0685";
const PROVIDER_TUTTI_FALLITI =
  "Tutti i modelli falliti per task 'pdf_vision_extract' (2 tentativi) — ultimo errore: google/gemini-2.5-flash: OpenRouter 402: credito provider insufficiente; tentativi automatici sospesi";
const PROVIDER_FILE =
  'Tutti i modelli falliti per task \'pdf_vision_extract\' (2 tentativi) — ultimo errore: google/gemini-2.5-flash: OpenRouter 402: {"error":{"message":"This request requires at least $0.50 in balance for files"';
const PROVIDER_ALTRI_TOKEN =
  'Tutti i modelli falliti per task \'pdf_vision_extract\' (2 tentativi) — ultimo errore: google/gemini-2.5-flash: OpenRouter 402: {"error":{"message":"This request requires more credits, or fewer max_tokens. You requested up to 6000';

describe("credito dell'azienda", () => {
  it("402 con lo stesso messaggio di sempre e il codice che l'interfaccia conosce", () => {
    const e = erroreAiPerUtente(errore("AiCompanyCreditError", SALDO, { reason: "insufficient_balance" }));
    expect(e).toEqual({
      status: 402,
      body: { error: SALDO, code: "insufficient_credits", motivo: "insufficient_balance" },
    });
  });

  it("la finestra di ricarica si apre", () => {
    const e = erroreAiPerUtente(errore("AiCompanyCreditError", SALDO, { reason: "insufficient_balance" }))!;
    expect(classificaBloccoPagamento(e.status, e.body)).toBe("credits");
  });

  it("anche il budget del piano finito apre la ricarica, non la richiesta di una carta", () => {
    for (const messaggio of [
      "Budget AI esaurito. Effettua un top-up dalle impostazioni AI per continuare.",
      "Budget AI mensile esaurito (hard cap raggiunto). Upgrade piano o top-up necessario.",
      "Budget AI: soft cap raggiunto (92%). Upgrade piano per continuare.",
    ]) {
      const e = erroreAiPerUtente(errore("AiRouterError", messaggio))!;
      expect(e.status, messaggio).toBe(402);
      expect(e.body.code).toBe("insufficient_credits");
      expect(e.body.error).toBe(messaggio);
      expect(classificaBloccoPagamento(e.status, e.body), messaggio).toBe("credits");
    }
  });

  it("la carta mancante apre la richiesta della carta", () => {
    const e = erroreAiPerUtente(errore("AiRouterError", "Registra una carta di pagamento aziendale per usare l'AI."))!;
    expect(e.status).toBe(402);
    expect(e.body.code).toBe("payment_method_required");
    expect(classificaBloccoPagamento(e.status, e.body)).toBe("payment");
  });
});

describe("credito del provider (della piattaforma)", () => {
  it("prima il testo grezzo apriva la ricarica del cliente: il difetto da cui si parte", () => {
    // Il messaggio che oggi arriva all'utente con stato 500 contiene «credito … insufficiente».
    expect(classificaBloccoPagamento(500, { error: PROVIDER_TUTTI_FALLITI })).toBe("credits");
  });

  it.each([
    ["classe AiProviderCreditError", errore("AiProviderCreditError", "OpenRouter 402: credito provider insufficiente; tentativi automatici sospesi")],
    ["tutti i modelli falliti, credito provider", errore("AiRouterError", PROVIDER_TUTTI_FALLITI)],
    ["richiede almeno 0,50 $ per i file", errore("AiRouterError", PROVIDER_FILE)],
    ["richiede più crediti o meno token", errore("AiRouterError", PROVIDER_ALTRI_TOKEN)],
    ["un Error qualunque con OpenRouter 402", new Error("OpenRouter 402")],
  ])("%s → 503 senza chiedere una ricarica", (_nome, err) => {
    const e = erroreAiPerUtente(err)!;
    expect(e.status).toBe(503);
    expect(e.body.code).toBe("servizio_non_disponibile");
    expect(classificaBloccoPagamento(e.status, e.body)).toBeNull();
    expect(e.body.error).not.toMatch(/credit|saldo|ricaric|openrouter|\$/i);
  });

  it("il controllo del saldo che non risponde è un guasto nostro, non una ricarica", () => {
    const e = erroreAiPerUtente(errore("AiRouterError", "Credito insufficiente o bloccato: precheck_error"))!;
    expect(e.status).toBe(503);
    expect(classificaBloccoPagamento(e.status, e.body)).toBeNull();
  });
});

describe("altri esiti", () => {
  it("tutti i modelli falliti per altro → 502 con un messaggio umano", () => {
    const e = erroreAiPerUtente(errore("AiRouterError", "Tutti i modelli falliti per task 'pdf_vision_extract' (2 tentativi) — ultimo errore: timeout"))!;
    expect(e.status).toBe(502);
    expect(e.body.code).toBe("lettura_non_riuscita");
    expect(e.body.error).toMatch(/Non sono riuscito a leggere il documento/);
    expect(classificaBloccoPagamento(e.status, e.body)).toBeNull();
  });

  it("l'esito di una richiesta precedente incerto → 409", () => {
    const e = erroreAiPerUtente(errore("AiRequestGuardError", "AI request safety: provider_outcome_unknown"))!;
    expect(e.status).toBe(409);
    expect(e.body.code).toBe("esito_incerto");
    // gli altri codici di sicurezza restano com'erano
    expect(erroreAiPerUtente(errore("AiRequestGuardError", "AI request safety: missing_scope"))).toBeNull();
  });

  it("ciò che non riconosce torna null: la funzione risponde come prima", () => {
    expect(erroreAiPerUtente(new Error("boom"))).toBeNull();
    expect(erroreAiPerUtente("stringa qualunque")).toBeNull();
    expect(erroreAiPerUtente(undefined)).toBeNull();
    expect(erroreAiPerUtente(errore("AiRouterError", "AI Test Lab quota giornaliera raggiunta (50 chiamate/24h)."))).toBeNull();
  });
});

describe("erroreDaCorpo: rilanciare l'errore di un'altra funzione senza storpiarlo", () => {
  it("ricostruisce stato e corpo da ciò che la funzione ha risposto", () => {
    const casi = [
      errore("AiCompanyCreditError", SALDO, { reason: "insufficient_balance" }),
      errore("AiProviderCreditError", "OpenRouter 402: credito provider insufficiente"),
      errore("AiRouterError", "Tutti i modelli falliti per task 'x' (1 tentativi)"),
      errore("AiRequestGuardError", "AI request safety: provider_outcome_unknown"),
    ];
    for (const caso of casi) {
      const originale = erroreAiPerUtente(caso)!;
      expect(erroreDaCorpo(JSON.parse(JSON.stringify(originale.body)))).toEqual(originale);
    }
  });

  it("un corpo senza un nostro codice non è riconosciuto", () => {
    expect(erroreDaCorpo({ error: "boh" })).toBeNull();
    expect(erroreDaCorpo({ error: "boh", code: "altro" })).toBeNull();
    expect(erroreDaCorpo({ code: "insufficient_credits" })).toBeNull();
    expect(erroreDaCorpo(null)).toBeNull();
    expect(erroreDaCorpo("testo")).toBeNull();
  });
});

describe("letturaNonRiuscita: il modello ha risposto con qualcosa che non si legge", () => {
  it("502 con il suo codice e una frase per l'utente", () => {
    const e = letturaNonRiuscita();
    expect(e.status).toBe(502);
    expect(e.body.code).toBe("lettura_non_riuscita");
    expect(e.body.error).toMatch(/^Non sono riuscito a leggere il documento/);
  });
  it("non apre la finestra di ricarica", () => {
    const e = letturaNonRiuscita();
    expect(classificaBloccoPagamento(e.status, e.body)).toBeNull();
  });
  it("arriva identica a chi la rilancia da un'altra funzione", () => {
    const e = letturaNonRiuscita();
    expect(erroreDaCorpo(JSON.parse(JSON.stringify(e.body)))).toEqual(e);
  });
});

describe("le frasi per l'utente non promettono ciò che nessuno fa", () => {
  it("«servizio non disponibile» non dice che qualcuno è stato avvisato", () => {
    // Nel router non c'è nessun avviso quando il credito del provider finisce: dirlo sarebbe falso.
    const e = erroreAiPerUtente(errore("AiProviderCreditError", "OpenRouter 402: credito provider insufficiente"))!;
    expect(e.body.error).not.toMatch(/avvisat/i);
    expect(e.body.error).toMatch(/assistenza/i);
  });
});
