import { beforeEach, describe, expect, it } from "vitest";
import {
  classificaBloccoPagamento,
  estraiDettaglioCredito,
  segnalaBloccoDaRisposta,
} from "@/lib/creditoEsaurito";
import { usePaymentGateStore } from "@/store/paymentGateStore";

// Le risposte qui sotto sono quelle vere delle edge function e delle RPC del
// portafoglio: ognuna dice "crediti finiti" in una forma diversa, e tutte
// devono aprire lo stesso dialog di ricarica. Se una smette di essere
// riconosciuta, l'utente torna a vedere un "Errore interno" muto.

describe("classificaBloccoPagamento", () => {
  it("riconosce il 402 con codice macchina (WhatsApp, render, SMS campagna)", () => {
    expect(classificaBloccoPagamento(402, { error: "insufficient_credits", message: "Crediti WhatsApp insufficienti" })).toBe("credits");
    expect(classificaBloccoPagamento(402, { error: "insufficient_credits" })).toBe("credits");
    expect(classificaBloccoPagamento(402, { error: "insufficient_credits", message: "Crediti SMS esauriti. Ricarica il wallet dal modulo SMS Marketing." })).toBe("credits");
  });

  it("riconosce il router AI, che risponde 500/502 con la frase nel messaggio", () => {
    expect(classificaBloccoPagamento(502, { error: "AI Router error: Credito insufficiente o bloccato: Saldo €0.00 insufficiente per stima €0.0500" })).toBe("credits");
    expect(classificaBloccoPagamento(500, { error: "Errore interno: Credito insufficiente o bloccato: Wallet AI non inizializzato per questa azienda" })).toBe("credits");
  });

  it("riconosce email, SMS Telnyx e voce, che parlano solo in italiano", () => {
    expect(classificaBloccoPagamento(402, { error: "Crediti email insufficienti", details: "saldo 0" })).toBe("credits");
    expect(classificaBloccoPagamento(402, { error: "Crediti insufficienti: Crediti email insufficienti" })).toBe("credits");
    expect(classificaBloccoPagamento(400, { error: "Crediti insufficienti. Necessari: €0.12, Disponibili: €0.00. Ricarica il wallet per inviare." })).toBe("credits");
    expect(classificaBloccoPagamento(402, { error: "Chiamate AI bloccate: credito esaurito." })).toBe("credits");
    expect(classificaBloccoPagamento(402, { error: "Crediti AI insufficienti (saldo 0.00 €, minimo 0.10 €)." })).toBe("credits");
  });

  it("riconosce la RPC del portafoglio (PostgREST 400) e il proxy Claude (errore annidato)", () => {
    expect(classificaBloccoPagamento(400, { code: "23514", message: "Crediti insufficienti: saldo 0.0000 EUR, servono 0.0500 EUR", details: null, hint: null })).toBe("credits");
    expect(classificaBloccoPagamento(402, { error: { code: "insufficient_credits", message: "Saldo AI insufficiente", type: "billing" } })).toBe("credits");
  });

  it("riconosce Silvio, che risponde 200 con ok:false", () => {
    expect(classificaBloccoPagamento(200, { ok: false, error: "credito_esaurito", reason: "insufficient_balance" })).toBe("credits");
  });

  it("distingue la carta mancante: e' un altro dialog", () => {
    expect(classificaBloccoPagamento(402, { error: "Serve un metodo di pagamento aziendale", code: "payment_method_required" })).toBe("payment");
    // Il 402 senza altro indizio resta "carta": e' il contratto storico del gate.
    expect(classificaBloccoPagamento(402, { error: "qualcosa" })).toBe("payment");
  });

  it("riconosce l'add-on WhatsApp mancante: e' un 402, ma non chiede la carta", () => {
    expect(classificaBloccoPagamento(402, {
      error: "WhatsApp Business non è attivo per questa azienda: va attivato l'add-on WhatsApp.",
      code: "whatsapp_addon_required",
    })).toBe("addon_whatsapp");
  });

  it("lascia stare gli altri errori", () => {
    expect(classificaBloccoPagamento(500, { error: "Errore interno: TypeError: x is not a function" })).toBeNull();
    expect(classificaBloccoPagamento(403, { error: "whatsapp_disabled" })).toBeNull();
    expect(classificaBloccoPagamento(500, { error: "insufficient permissions" })).toBeNull();
    // "credito" e "insufficiente" in due frasi diverse non parlano di soldi finiti.
    expect(classificaBloccoPagamento(400, { message: "Il credito del cliente è stato registrato. Documentazione insufficiente per la pratica" })).toBeNull();
    expect(classificaBloccoPagamento(500, null)).toBeNull();
    expect(classificaBloccoPagamento(500, "stringa qualunque")).toBeNull();
  });
});

describe("estraiDettaglioCredito", () => {
  it("prende borsellino, saldo e frase quando la risposta li dichiara", () => {
    const d = estraiDettaglioCredito({
      error: "insufficient_credits",
      credit_type: "whatsapp",
      balance_before: 0.0,
      message: "Crediti WhatsApp insufficienti per questo broadcast",
    });
    expect(d).toEqual({ portafoglio: "whatsapp", saldoEur: 0, messaggio: "Crediti WhatsApp insufficienti per questo broadcast" });
  });

  it("deduce il borsellino dal testo e non spaccia un codice per messaggio", () => {
    expect(estraiDettaglioCredito({ error: "AI Router error: Credito insufficiente o bloccato" }).portafoglio).toBe("ai");
    expect(estraiDettaglioCredito({ error: "insufficient_credits", message: "Crediti render insufficienti" }).portafoglio).toBe("render");
    expect(estraiDettaglioCredito({ ok: false, error: "credito_esaurito" })).toEqual({});
    expect(estraiDettaglioCredito({ error: "insufficient_credits", user_message: "Ricarica per continuare." }).messaggio).toBe("Ricarica per continuare.");
  });

  it("traduce ai_agents e legge il saldo anche come stringa", () => {
    expect(estraiDettaglioCredito({ service: "ai_agents", balance_eur: "0.4500" })).toEqual({ portafoglio: "ai", saldoEur: 0.45 });
  });
});

describe("segnalaBloccoDaRisposta", () => {
  beforeEach(() => usePaymentGateStore.setState({ open: false, kind: "payment", dettaglio: null, apertoAt: 0 }));

  it("apre il dialog crediti con il dettaglio", () => {
    expect(segnalaBloccoDaRisposta(402, { error: "insufficient_credits", credit_type: "email", balance_before: 0 })).toBe("credits");
    const s = usePaymentGateStore.getState();
    expect(s.open).toBe(true);
    expect(s.kind).toBe("credits");
    expect(s.dettaglio).toEqual({ portafoglio: "email", saldoEur: 0 });
    expect(s.apertoAt).toBeGreaterThan(0);
  });

  it("apre il dialog carta senza dettaglio", () => {
    expect(segnalaBloccoDaRisposta(402, { code: "payment_method_required", error: "Serve la carta" })).toBe("payment");
    expect(usePaymentGateStore.getState()).toMatchObject({ open: true, kind: "payment", dettaglio: null });
  });

  it("apre l'offerta dell'add-on WhatsApp senza dettaglio", () => {
    expect(segnalaBloccoDaRisposta(402, { code: "whatsapp_addon_required", error: "WhatsApp Business non è attivo" })).toBe("addon_whatsapp");
    expect(usePaymentGateStore.getState()).toMatchObject({ open: true, kind: "addon_whatsapp", dettaglio: null });
  });

  it("non tocca nulla sugli altri errori", () => {
    expect(segnalaBloccoDaRisposta(500, { error: "Errore interno" })).toBeNull();
    expect(usePaymentGateStore.getState().open).toBe(false);
  });
});
