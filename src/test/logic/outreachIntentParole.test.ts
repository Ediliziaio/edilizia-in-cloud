import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { intentDaParoleChiave, rispostaColSoloNumero } from "../../../supabase/functions/_shared/outreach-intent-parole";
import { INTENT_SYSTEM_PROMPT } from "../../../supabase/functions/_shared/outreach-intent";

describe("intentDaParoleChiave", () => {
  it("un «no» secco è un opt-out (è la risposta alla frase d'uscita)", () => {
    expect(intentDaParoleChiave("Re: Serramenti", "No")).toBe("unsubscribe");
    expect(intentDaParoleChiave("Re: Serramenti", "no grazie.")).toBe("unsubscribe");
    expect(intentDaParoleChiave("", "STOP")).toBe("unsubscribe");
  });

  it("cancellatemi / non scrivetemi più / unsubscribe → opt-out", () => {
    expect(intentDaParoleChiave("", "Cancellatemi dalla vostra lista, grazie")).toBe("unsubscribe");
    expect(intentDaParoleChiave("", "Per favore non scrivetemi più")).toBe("unsubscribe");
    expect(intentDaParoleChiave("unsubscribe", "")).toBe("unsubscribe");
  });

  it("«non mi interessa» → non interessato (cooldown, non opt-out)", () => {
    expect(intentDaParoleChiave("", "Grazie ma non siamo interessati, abbiamo già un fornitore.")).toBe("not_interested");
    expect(intentDaParoleChiave("", "Al momento non ci serve.")).toBe("not_interested");
  });

  it("una risposta lunga e neutra resta all'AI", () => {
    expect(intentDaParoleChiave("", "Buongiorno, mi può mandare il listino aggiornato? Avremmo un cantiere a ottobre.")).toBe(null);
  });

  it("ignora la nostra citazione sotto la risposta", () => {
    const testo = "Sì, chiamatemi domani.\n\nIl giorno 11 set 2026 Filippo Milesi ha scritto:\n> Se non ti interessa, rispondi «no» e non ti scrivo più.";
    expect(intentDaParoleChiave("", testo)).toBe(null);
  });
});

// 24/09/2026: tre risposte a ThermoDMR fatte del solo numero erano finite fra
// «altro» — niente promemoria di chiamata, niente opportunità. I testi sono
// quelli arrivati davvero, con numeri e nomi cambiati.
describe("rispostaColSoloNumero: chi risponde col numero vuole essere chiamato", () => {
  it("il numero e il nome, poi la firma", () => {
    const testo = "3331234567\n\nGIUSEPPE\n\n \n\nCordiali saluti,\n\n \n\nROSSI IMPIANTI SRL a Socio Unico\n\nVia Roma, 16 – 25030 Brescia (Bs)\n\nTel. & fax. 030-1234567\n\nE-mail: info@rossiimpianti.it";
    expect(rispostaColSoloNumero(testo)).toBe(true);
  });

  it("«Ok» e il numero, con la citazione sulla stessa riga", () => {
    const testo = "Ok 351 7654321&nbsp;&nbsp;Il 22 Set 2026 07:08, Filippo Milesi &lt;info@thermodmr.eu&gt; ha scritto: Buongiorno Renato,ti scrivo perché cerchiamo imprese edili in provincia di Milano";
    expect(rispostaColSoloNumero(testo)).toBe(true);
  });

  it("il numero da solo, sopra la nostra email citata", () => {
    const testo = "3801234567\n\nIl Mer 23 Set 2026, 07:28 Filippo Milesi <info@thermodmr.eu> ha scritto:\n\n> Buongiorno Altin,\n>\n> ti scrivo perché cerchiamo imprese edili";
    expect(rispostaColSoloNumero(testo)).toBe(true);
  });

  it("anche con due parole attorno, il +39 o un fisso", () => {
    expect(rispostaColSoloNumero("Chiamami domani al 347 123 4567")).toBe(true);
    expect(rispostaColSoloNumero("Sì, mi chiami al +39 347 1234567 dopo le 17")).toBe(true);
    expect(rispostaColSoloNumero("030 9747378")).toBe(true);
  });

  it("non scatta su un rifiuto con la firma sotto", () => {
    expect(rispostaColSoloNumero("Non sono interessato\nMario Rossi\nCellulare: 333 1234567")).toBe(false);
    expect(rispostaColSoloNumero("No grazie 333 1234567")).toBe(false);
  });

  it("non scatta sui messaggi automatici col numero delle urgenze", () => {
    expect(rispostaColSoloNumero("Per urgenze chiamare il 333 1234567")).toBe(false);
    expect(rispostaColSoloNumero("Sono in ferie fino al 30/09, per urgenze 02 1234567")).toBe(false);
    expect(rispostaColSoloNumero("Ufficio chiuso, contattare lo 02 1234567")).toBe(false);
  });

  it("non scatta su una firma da sola, su una data o senza numero", () => {
    expect(rispostaColSoloNumero("Mario Rossi\nTel. 02 1234567\nwww.rossi.it")).toBe(false);
    expect(rispostaColSoloNumero("Ci sentiamo il 23/09/2026")).toBe(false);
    expect(rispostaColSoloNumero("Richiami pure\n\nInviato da iPhone")).toBe(false);
    expect(rispostaColSoloNumero("")).toBe(false);
  });

  it("chi scrive di più lo lascia all'AI", () => {
    const testo = "Buongiorno, il mio numero di telefono è il seguente, 333 1234567 Mattia, attendo una vostra chiamata così da avere la possibilità di fare due chiacchiere.";
    expect(rispostaColSoloNumero(testo)).toBe(false);
  });

  it("il gestore delle risposte la applica, anche sopra un «altro» o un'autorisposta dell'AI", () => {
    const gestore = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/outreach-reply-handler.ts"), "utf8");
    expect(gestore).toContain('&& rispostaColSoloNumero(r.text ?? "")');
    expect(gestore).toContain('intent === null || intent === "other" || intent === "auto_reply" || intent === "out_of_office"');
    // prima di decidere che è automatica: altrimenti uscirebbe dal giro senza chiamata
    expect(gestore.indexOf("rispostaColSoloNumero(r.text")).toBeLessThan(gestore.indexOf('if (intent === "auto_reply" || intent === "out_of_office") {'));
  });

  it("l'AI sa che il numero da solo è un «chiamami», e il centralino un'autorisposta", () => {
    expect(INTENT_SYSTEM_PROMPT).toContain("anche quando risponde solo col suo numero di telefono");
    expect(INTENT_SYSTEM_PROMPT).toContain("al numero di un centralino");
    expect(INTENT_SYSTEM_PROMPT).not.toContain("a un modulo del sito o a un numero,");
  });
});
