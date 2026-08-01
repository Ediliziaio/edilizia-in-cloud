import { describe, it, expect } from "vitest";
import {
  SILVIO_TOOLS,
  DOMAIN_STAFF_PERMISSION,
  getToolsForChannel,
} from "../../../supabase/functions/_shared/silvioTools";

/**
 * Guardrail del registry Silvio (213+ tool operativi).
 *
 * Nascono da bug VERI trovati il 2026-07-31 testando il sistema su Demo:
 *  - `fatture_da_registrare` aveva la chiave del record diversa da
 *    schema.function.name → il motore risolve con SILVIO_TOOLS[nome visto dal
 *    modello], quindi il lookup falliva e il tool era MORTO dalla nascita;
 *  - tool economici eseguibili senza conferma;
 *  - domini senza gate sui permessi granulari.
 * Erano tutti controlli fatti a mano: qui diventano automatici, così una
 * regressione si vede prima del deploy invece che in produzione.
 */

const RISK_VALIDI = ["safe", "yellow", "red"];

/** Tool che SCRIVONO (creano/modificano), riconosciuti dal verbo iniziale. */
const VERBI_SCRITTURA =
  /^(crea|registra|invia|genera|approva|avanza|compone|aggiorna|importa|carica|fissa|completa|blocca|prepara|apply|undo|batch|richiedi|archivia|prenota|convoca|assegna|sposta|lancia|pianifica|ottimizza|resolve|chiudi|link|register)_/;

describe("registry Silvio — integrità strutturale", () => {
  const tools = Object.entries(SILVIO_TOOLS);

  it("la chiave del registry combacia con schema.function.name", () => {
    // Invariante critica: il motore fa SILVIO_TOOLS[toolName] usando il nome
    // che il modello ha letto nello schema. Se differiscono, il tool non è
    // invocabile e fallisce sempre con "tool non trovato".
    const disallineati = tools
      .filter(([chiave, t]) => t.schema?.function?.name !== chiave)
      .map(([chiave, t]) => `${chiave} → ${t.schema?.function?.name}`);
    expect(disallineati).toEqual([]);
  });

  it("ogni tool ha un executor invocabile", () => {
    const senzaExecutor = tools.filter(([, t]) => typeof t.executor !== "function").map(([n]) => n);
    expect(senzaExecutor).toEqual([]);
  });

  it("ogni tool dichiara un dominio (serve per permessi e UI)", () => {
    const senzaDominio = tools.filter(([, t]) => !t.domain).map(([n]) => n);
    expect(senzaDominio).toEqual([]);
  });

  it("il riskLevel, se presente, è uno dei valori ammessi", () => {
    const invalidi = tools
      .filter(([, t]) => t.riskLevel && !RISK_VALIDI.includes(t.riskLevel))
      .map(([n, t]) => `${n}=${t.riskLevel}`);
    expect(invalidi).toEqual([]);
  });

  it("i parametri obbligatori esistono tra le properties dello schema", () => {
    // Un `required` che punta a un parametro inesistente manda il modello a
    // sbattere: prova a riempirlo, non lo trova, e la chiamata fallisce.
    const rotti: string[] = [];
    for (const [nome, t] of tools) {
      const params = t.schema?.function?.parameters ?? {};
      const props = Object.keys(params.properties ?? {});
      for (const req of params.required ?? []) {
        if (!props.includes(req)) rotti.push(`${nome}.${req}`);
      }
    }
    expect(rotti).toEqual([]);
  });

  it("nessun tool è reso invisibile o inutilizzabile da liste vuote", () => {
    // allowedRoles: [] significherebbe "nessuno può usarlo",
    // allowedChannels: [] "non appare su nessun canale": quasi sempre un errore.
    const inutilizzabili = tools
      .filter(([, t]) => t.allowedRoles?.length === 0 || t.allowedChannels?.length === 0)
      .map(([n]) => n);
    expect(inutilizzabili).toEqual([]);
  });
});

describe("policy SOLDI — riepilogo e conferma sulle attività economiche", () => {
  // Decisione dell'imprenditore (2026-07-31): incassi, pagamenti, bonifici e
  // fatture non si eseguono mai in automatico. Qui la policy diventa un test.
  const DOMINI_DENARO = ["finance", "fattura", "banking"];

  // Eccezioni motivate, non dimenticanze:
  const SENZA_CONFERMA_OK: Record<string, string> = {
    genera_report_cfo_settimanale: "sola lettura: produce un report, non muove denaro",
    avanza_fatt_zero_touch:
      "step di stato della pipeline zero-touch invocata da cron: chiedere conferma bloccherebbe l'automazione (ed è già ristretto a super_admin)",
  };

  it("ogni tool che scrive nei domini del denaro richiede conferma", () => {
    const scoperti = Object.entries(SILVIO_TOOLS)
      .filter(
        ([nome, t]) =>
          DOMINI_DENARO.includes(t.domain ?? "") &&
          VERBI_SCRITTURA.test(nome) &&
          (t.riskLevel ?? "safe") === "safe" &&
          !SENZA_CONFERMA_OK[nome],
      )
      .map(([n]) => n);
    expect(scoperti).toEqual([]);
  });

  it("le eccezioni documentate esistono ancora (se rinominate, va aggiornato il motivo)", () => {
    const fantasma = Object.keys(SENZA_CONFERMA_OK).filter((n) => !SILVIO_TOOLS[n]);
    expect(fantasma).toEqual([]);
  });
});

describe("permessi granulari per dominio", () => {
  // Il gate can_view_* è applicato in esecuzione (executeToolWithRouting):
  // un dominio senza mappatura significa che uno staff con quell'area
  // disabilitata userebbe comunque quei tool.
  const SENZA_GATE_OK = ["ai", "meta", "knowledge", "generative"];

  it("ogni dominio in uso ha il suo permesso, tranne quelli esentati di proposito", () => {
    const dominiInUso = [...new Set(Object.values(SILVIO_TOOLS).map((t) => t.domain).filter(Boolean))] as string[];
    const scoperti = dominiInUso.filter(
      (d) => !DOMAIN_STAFF_PERMISSION[d as keyof typeof DOMAIN_STAFF_PERMISSION] && !SENZA_GATE_OK.includes(d),
    );
    expect(scoperti).toEqual([]);
  });

  it("negare un permesso riduce davvero i tool visibili allo staff", () => {
    const pieno = getToolsForChannel({ channel: "internal_chat", role: "company_staff", personaKey: "silvio" });
    const ridotto = getToolsForChannel({
      channel: "internal_chat",
      role: "company_staff",
      personaKey: "silvio",
      staffPermissions: { can_view_orders: false },
    });
    expect(ridotto.length).toBeLessThan(pieno.length);
  });

  it("fail-closed: un ruolo non previsto non vede i tool riservati agli admin", () => {
    const operaio = getToolsForChannel({ channel: "internal_chat", role: "employee", personaKey: "silvio" });
    const nomi = operaio.map((t) => t.schema.function.name);
    expect(nomi).not.toContain("registra_pagamento_fornitore");
    expect(nomi).not.toContain("registra_pagamento_commessa");
  });
});

describe("anti prompt-injection — contenuti scritti da terzi", () => {
  // silvio-chat marca come "dato non fidato" i risultati dei tool che
  // restituiscono testo scritto da esterni: regola per dominio `email` più il
  // flag `untrustedOutput` per i casi fuori dominio. Attenzione: contano i tool
  // che LEGGONO contenuti altrui, non quelli che ne inviano (rispondi_a_email
  // spedisce un testo redatto da Silvio, non restituisce posta ricevuta).
  const LETTORI_DI_TERZI = [
    "lista_email_thread",
    "cerca_email",
    "posta_da_lavorare",
    "cerca_email_intelligente",
    "richieste_preventivo",
    "fatture_da_registrare", // dati estratti dai PDF dei fornitori
  ];

  it("i tool che leggono contenuti di terzi risultano non fidati", () => {
    const nonCoperti = LETTORI_DI_TERZI.filter((nome) => {
      const t = SILVIO_TOOLS[nome];
      // assente = rinominato/rimosso: va aggiornata la lista, quindi fallisce
      return !t || (t.domain !== "email" && !t.untrustedOutput);
    });
    expect(nonCoperti).toEqual([]);
  });

  it("tutti i tool del dominio email sono coperti dalla regola per dominio", () => {
    const email = Object.entries(SILVIO_TOOLS).filter(([, t]) => t.domain === "email");
    expect(email.length).toBeGreaterThan(0);
  });
});
