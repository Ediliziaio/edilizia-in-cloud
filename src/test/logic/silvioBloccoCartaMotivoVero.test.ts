/**
 * Silvio fermo per carta, abbonamento o credito dice il motivo vero (11/11/2026), e
 * email-ai-estrai-allegato non eroga più AI senza carta.
 *
 * Tiene fermo che:
 *   · il blocco del router (AiRouterError col testo del gate, AiCompanyCreditError) diventa
 *     una frase col link a dove si risolve, non «⚠️ C'è stato un problema tecnico»;
 *   · il 402 payment_method_required di silvio-extract-pdf ferma Silvio con lo stesso motivo,
 *     invece di finire nel prompt come «ERRORE TECNICO»;
 *   · il browser apre la finestra della carta (o della ricarica) dall'esito 200 ok:false;
 *   · le frasi di blocco restano fuori dallo storico della conversazione;
 *   · email-ai-estrai-allegato controlla la carta prima di callOpenRouter.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { bloccoAiPerUtente } from "../../../supabase/functions/_shared/erroriAi";
import {
  bloccoSilvioDaCorpo,
  corpoErroreInvoke,
  erroreStrumentoBloccato,
  esitoBloccoSilvio,
  messaggioBloccoSilvio,
} from "../../../supabase/functions/_shared/silvioBloccoAi";
import { silvioHistoryContent } from "../../../supabase/functions/_shared/silvioAnswerQuality";
import { segnalaBloccoSilvio } from "@/lib/creditoEsaurito";
import { usePaymentGateStore } from "@/store/paymentGateStore";

// I testi veri di _shared/requirePaymentMethod.ts (il router usa anche la variante «…per usare l'AI.»).
const CARTA = "Registra una carta di pagamento aziendale per usare questo strumento (Impostazioni → Fatturazione).";
const ABBONAMENTO = "Abbonamento sospeso o scaduto: rinnova per riattivare questo strumento.";
const SALDO = "Credito insufficiente o bloccato: Saldo €0.00 insufficiente per stima €0.0685";
const PROVIDER = "Tutti i modelli falliti per task 'pdf_vision_extract' (2 tentativi) — ultimo errore: google/gemini-2.5-flash: OpenRouter 402: credito provider insufficiente";

const errore = (nome: string, messaggio: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(messaggio), { name: nome, ...extra });
const sorgente = (p: string) => readFileSync(p, "utf8");

describe("la frase di Silvio", () => {
  it("carta mancante: il motivo e dove si registra, per la risposta e per il documento", () => {
    const b = bloccoAiPerUtente(errore("AiRouterError", "Registra una carta di pagamento aziendale per usare l'AI."))!;
    const risposta = messaggioBloccoSilvio(b, { tipo: "risposta" });
    expect(risposta).toContain("Serve una carta di pagamento registrata per rispondere");
    expect(risposta).toContain("[Impostazioni → Abbonamento](/azienda/impostazioni/abbonamento)");
    expect(risposta).not.toMatch(/tecnico/i);
    const doc = messaggioBloccoSilvio(b, { tipo: "documento", nomeFile: "fattura.pdf" });
    expect(doc).toContain("per leggere il documento «fattura.pdf»");
  });

  it("abbonamento sospeso: va rinnovato, non serve una carta", () => {
    const b = bloccoAiPerUtente(errore("AiRouterError", ABBONAMENTO))!;
    const m = messaggioBloccoSilvio(b, { tipo: "risposta" });
    expect(m).toContain("L'abbonamento è sospeso o scaduto");
    expect(m).not.toContain("carta");
  });

  it("credito dell'azienda finito: ricarica dai Crediti; tetto mensile: alzarlo", () => {
    const saldo = bloccoAiPerUtente(errore("AiCompanyCreditError", SALDO, { reason: "insufficient_balance" }))!;
    expect(messaggioBloccoSilvio(saldo, { tipo: "risposta" })).toContain("Il credito AI dell'azienda è finito");
    expect(messaggioBloccoSilvio(saldo, { tipo: "risposta" })).toContain("/azienda/impostazioni/crediti");
    const tetto = bloccoAiPerUtente(errore("AiRouterError", "Budget AI mensile raggiunto"))!;
    expect(messaggioBloccoSilvio(tetto, { tipo: "risposta" })).toContain("tetto mensile");
  });

  it("credito del provider: non è colpa dell'azienda e non chiede ricariche", () => {
    const b = bloccoAiPerUtente(errore("AiRouterError", PROVIDER))!;
    const m = messaggioBloccoSilvio(b, { tipo: "risposta" });
    expect(m).toContain("non dipende dal vostro credito");
    expect(m).not.toMatch(/ricaric|carta/i);
  });

  it("le frasi di blocco non entrano nello storico", () => {
    for (const err of [
      errore("AiRouterError", CARTA),
      errore("AiRouterError", ABBONAMENTO),
      errore("AiCompanyCreditError", SALDO, { reason: "insufficient_balance" }),
      errore("AiRouterError", PROVIDER),
    ]) {
      const testo = messaggioBloccoSilvio(bloccoAiPerUtente(err)!, { tipo: "risposta" });
      expect(silvioHistoryContent(testo, { assistant: true })).toBeNull();
    }
    expect(silvioHistoryContent("Serve una carta di pagamento? Sì, per l'AI.", { assistant: false })).not.toBeNull();
  });

  it("uno strumento fermo restituisce il motivo da riferire, col codice", () => {
    const r = erroreStrumentoBloccato(bloccoAiPerUtente(errore("AiRouterError", CARTA))!, "analizzare l'immagine");
    expect(r.code).toBe("payment_method_required");
    expect(r.error).toContain("per analizzare l'immagine");
    expect(r.error).toContain("non è un errore tecnico");
  });
});

describe("il 402 di silvio-extract-pdf", () => {
  it("il corpo di FunctionsHttpError si legge e diventa blocco", async () => {
    const err = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: new Response(JSON.stringify({ error: CARTA, code: "payment_method_required" }), { status: 402 }),
    });
    const b = bloccoSilvioDaCorpo(await corpoErroreInvoke(err));
    expect(b?.body).toEqual({ error: CARTA, code: "payment_method_required" });
  });

  it("gli altri errori della lettura restano tali", async () => {
    expect(bloccoSilvioDaCorpo({ error: "Non sono riuscito a leggere il documento.", code: "lettura_non_riuscita" })).toBeNull();
    expect(bloccoSilvioDaCorpo({ error: "Download PDF non riuscito" })).toBeNull();
    expect(await corpoErroreInvoke(new Error("rete giù"))).toBeNull();
    const nonJson = Object.assign(new Error("x"), { context: new Response("<html>", { status: 500 }) });
    expect(await corpoErroreInvoke(nonJson)).toBeNull();
  });
});

describe("silvio-chat usa il motivo vero dove prima scriveva «tecnico»", () => {
  const s = sorgente("supabase/functions/silvio-chat/index.ts");
  it("router, PDF (risposta e eccezione) e catch finale passano dal blocco", () => {
    expect(s).toMatch(/const blocco = aiErr instanceof AiRequestGuardError \? null : bloccoSilvioDaErrore\(aiErr\)/);
    expect(s).toMatch(/userFriendlyMsg = blocco\s*\? messaggioBloccoSilvio\(blocco, \{ tipo: "risposta" \}\)/);
    expect(s).toContain("bloccoSilvioDaCorpo(await corpoErroreInvoke(pdfErr))");
    expect(s).toMatch(/catch \(pdfCatch\) \{\s*const bloccoPdf = bloccoSilvioDaErrore\(pdfCatch\)/);
    expect(s).toContain("jsonResponse(esitoBloccoSilvio(bloccoAllegato.blocco), 200, corsHeaders)");
    expect(s).toMatch(/const blocco = bloccoSilvioDaErrore\(err\);\s*if \(blocco\) return jsonResponse\(blocco\.body, blocco\.status, corsHeaders\)/);
  });
  it("lo strumento vision e l'esecuzione degli strumenti riconoscono il blocco", () => {
    expect(sorgente("supabase/functions/_shared/silvioTools.ts")).toContain('erroreStrumentoBloccato(blocco, "analizzare l\'immagine")');
    expect(sorgente("supabase/functions/_shared/silvioToolExecution.ts")).toContain('erroreStrumentoBloccato(blocco, "completare questa operazione")');
  });
});

describe("il browser apre la finestra giusta", () => {
  beforeEach(() => usePaymentGateStore.setState({ open: false, kind: "payment", dettaglio: null }));

  it("carta o abbonamento → finestra della carta", () => {
    const esito = esitoBloccoSilvio(bloccoAiPerUtente(errore("AiRouterError", ABBONAMENTO))!);
    expect(esito).toMatchObject({ ok: false, code: "payment_method_required" });
    expect(segnalaBloccoSilvio(esito)).toBe("payment");
    expect(usePaymentGateStore.getState()).toMatchObject({ open: true, kind: "payment" });
  });

  it("credito dell'azienda → ricarica AI, con error «credito_esaurito» come prima", () => {
    const esito = esitoBloccoSilvio(bloccoAiPerUtente(errore("AiCompanyCreditError", SALDO, { reason: "insufficient_balance" }))!);
    expect(esito.error).toBe("credito_esaurito");
    expect(segnalaBloccoSilvio(esito)).toBe("credits");
    expect(usePaymentGateStore.getState()).toMatchObject({ open: true, kind: "credits" });
    expect(usePaymentGateStore.getState().dettaglio?.portafoglio).toBe("ai");
  });

  it("il vecchio esito del credito all'ingresso funziona ancora; RBAC, provider ed errori non aprono niente", () => {
    expect(segnalaBloccoSilvio({ ok: false, error: "credito_esaurito", reason: "insufficient_balance" })).toBe("credits");
    usePaymentGateStore.setState({ open: false });
    expect(segnalaBloccoSilvio({ ok: false, error: "rbac_denied" })).toBeNull();
    expect(segnalaBloccoSilvio(esitoBloccoSilvio(bloccoAiPerUtente(errore("AiRouterError", PROVIDER))!))).toBeNull();
    expect(segnalaBloccoSilvio({ ok: false, error: `Tutti i modelli falliti — ${SALDO}` })).toBeNull();
    expect(segnalaBloccoSilvio({ ok: true })).toBeNull();
    expect(usePaymentGateStore.getState().open).toBe(false);
  });

  it("le due pagine di Silvio lo usano", () => {
    expect(sorgente("src/components/silvio/SilvioChatSheet.tsx")).toContain("segnalaBloccoSilvio(res.data)");
    expect(sorgente("src/pages/azienda/SilvioAIPage.tsx")).toContain("segnalaBloccoSilvio(res.data)");
  });
});

describe("email-ai-estrai-allegato: niente AI senza carta", () => {
  const s = sorgente("supabase/functions/email-ai-estrai-allegato/index.ts");
  it("controlla la carta prima della visione e risponde 402 col codice", () => {
    const controllo = s.indexOf("await checkPaymentMethod(supabase, att.company_id)");
    expect(controllo).toBeGreaterThan(0);
    expect(controllo).toBeLessThan(s.indexOf("await callOpenRouter("));
    expect(controllo).toBeLessThan(s.indexOf(".download(att.storage_path)"));
    expect(s).toMatch(/json\(\{ error: motivo, code: "payment_method_required" \}, 402, cors\)/);
    // Il dispatcher riprova fra un'ora e non abbandona la mail dopo 6 giri.
    expect(s).toMatch(/segnaTentativo\(supabase, att\.inbox_id, "credito", `carta: \$\{motivo\}`\)/);
  });
  it("il browser apre la finestra della carta (fetch diretto, fuori dal client supabase)", () => {
    expect(sorgente("src/lib/email-ai/hooks.ts")).toMatch(/if \(!res\.ok\) \{\s*segnalaBloccoDaRisposta\(res\.status, json\);/);
  });
});
