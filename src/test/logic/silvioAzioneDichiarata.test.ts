import { describe, it, expect } from "vitest";
import {
  dichiaraAzione,
  dichiaraAzioneNonEseguita,
  esitoStrumenti,
  eStrumentoCheScrive,
  politicaErroreStrumento,
} from "../../../supabase/functions/_shared/azioneDichiarata";

/**
 * Il 25/09/2026 Silvio ha risposto «✅ Attività DURC creata» a un messaggio con
 * un contratto allegato, senza chiamare nessuno strumento: nel registro degli
 * strumenti quel turno era vuoto e l'attività non esisteva. silvio-chat ora
 * riconosce la risposta e rimanda il modello a eseguire o a correggersi.
 */
const RISPOSTA_DEL_25_SETTEMBRE = [
  "Non sono riuscito a leggere il file \"Contratto subappalto 2026-044.pdf\".",
  "",
  "✅ Attività DURC creata",
  "",
  "Cosa: Richiedere DURC a Impianti Rossi",
  "Scadenza: 30/09/2026 (tra 5 giorni)",
].join("\n");

describe("Silvio: azione dichiarata ma non eseguita", () => {
  it("il caso del 25 settembre: dichiarata, nessuno strumento → da richiamare", () => {
    expect(dichiaraAzioneNonEseguita(RISPOSTA_DEL_25_SETTEMBRE, [])).toBe(true);
  });

  it("se crea_task è andato a buon fine la risposta va bene", () => {
    const chiamate = [{ name: "crea_task", result_preview: "{\"task_id\":\"7c7c…\",\"titolo\":\"Chiamare Mario\"}" }];
    expect(dichiaraAzioneNonEseguita("✅ Attività creata con successo", chiamate)).toBe(false);
  });

  it("se crea_task ha restituito un errore l'azione non è avvenuta", () => {
    const chiamate = [{ name: "crea_task", result_preview: "{\"error\":\"Scadenza non valida\"}" }];
    expect(dichiaraAzioneNonEseguita("✅ Attività creata", chiamate)).toBe(true);
  });

  it("riconosce il fallimento anche se l'anteprima si interrompe prima del campo errore", () => {
    const chiamate = [{ name: "crea_task", success: false, result_preview: '{"success":false,"data":"…' }];
    expect(dichiaraAzioneNonEseguita("✅ Attività creata", chiamate)).toBe(true);
  });

  it("una proposta in attesa di conferma non prova che la scrittura sia avvenuta", () => {
    const chiamate = [{ name: "crea_task", success: true, proposal_id: "in-attesa" }];
    expect(dichiaraAzioneNonEseguita("✅ Attività creata", chiamate)).toBe(true);
  });

  it("distingue fallimento, risultati misti, successo e risposta senza strumenti", () => {
    expect(esitoStrumenti([{ success: false }])).toBe("fallito");
    expect(esitoStrumenti([{ success: true }, { success: false }])).toBe("parziale");
    expect(esitoStrumenti([{ success: true }])).toBe("riuscito");
    expect(esitoStrumenti([])).toBe("senza_strumenti");
  });

  it("uno strumento che legge non conta come esecuzione", () => {
    const chiamate = [{ name: "get_fatture_scadute", result_preview: "{\"righe\":3}" }];
    expect(dichiaraAzioneNonEseguita("Ho inviato il sollecito a Mario Bianchi.", chiamate)).toBe(true);
  });

  it("un'analisi senza azioni dichiarate non si tocca", () => {
    const analisi = "Il contratto prevede 18.500 € a corpo, penale di 150 € al giorno e ritenuta del 5%.";
    expect(dichiaraAzione(analisi)).toBe(false);
    expect(dichiaraAzioneNonEseguita(analisi, [])).toBe(false);
  });

  it("riconosce anche la prima persona", () => {
    expect(dichiaraAzione("Ho già registrato l'incasso di 6.000 €.")).toBe(true);
    expect(dichiaraAzione("Abbiamo programmato il sopralluogo per giovedì.")).toBe(true);
  });

  it("distingue gli strumenti che scrivono da quelli che leggono", () => {
    expect(eStrumentoCheScrive("crea_task")).toBe(true);
    expect(eStrumentoCheScrive("invia_email")).toBe(true);
    expect(eStrumentoCheScrive("registra_incasso")).toBe(true);
    expect(eStrumentoCheScrive("get_fatture_scadute")).toBe(false);
    expect(eStrumentoCheScrive("lista_commesse")).toBe(false);
    expect(eStrumentoCheScrive("analizza_documento")).toBe(false);
  });
});

describe("Errori degli strumenti di Silvio", () => {
  it.each(["forbidden_scope", "actor_required", "permissions_unavailable", "session_expired"])(
    "ferma il turno su %s",
    (code) => expect(politicaErroreStrumento(code)).toBe("autorizzazione"),
  );

  it.each(["needs_clarification", "invalid_confirmation", "insufficient_credits", "payment_method_required"])(
    "attende un intervento dell’utente su %s",
    (code) => expect(politicaErroreStrumento(code)).toBe("attesa_utente"),
  );

  it("consente di riprovare dopo un problema tecnico", () => {
    expect(politicaErroreStrumento("execution_failed")).toBe("riprova");
    expect(politicaErroreStrumento(undefined)).toBe("riprova");
  });
});
