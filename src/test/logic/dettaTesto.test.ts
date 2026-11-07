/**
 * «Detta e ripulisci» (07/11/2026): le regole pure, lato app e lato funzione.
 * Il testo dettato si aggiunge e non sostituisce; il grezzo resta disponibile;
 * il controllo scarta un pulito che inventa numeri o riassume.
 */
import { describe, expect, it } from "vitest";
import { accodaTesto, messaggioErroreDetta, tornaAllaTrascrizione, CAMPO_AUDIO_MAX_SECONDI } from "@/lib/campo/dettaTesto";
import { campoValido, controllaTestoPulito, promptPulizia } from "../../../supabase/functions/detta-testo/pulizia";

describe("il testo dettato si aggiunge al campo", () => {
  it("in un campo vuoto diventa il testo del campo", () => {
    expect(accodaTesto("", " Posato il telaio. ")).toBe("Posato il telaio.");
  });
  it("in fondo a quello già scritto, a capo, senza toccarlo", () => {
    expect(accodaTesto("Montato il ponteggio.  \n", "Posato il telaio.")).toBe("Montato il ponteggio.\nPosato il telaio.");
  });
  it("una dettatura vuota non cambia niente", () => {
    expect(accodaTesto("Montato il ponteggio.", "   ")).toBe("Montato il ponteggio.");
  });
});

describe("«Usa la trascrizione originale»", () => {
  const prima = "Montato il ponteggio.";
  const pulito = "Posato il telaio al piano primo.";
  const grezzo = "allora ehm posato il telaio al piano primo";
  it("rimette il grezzo al posto del pulito appena aggiunto e lascia il resto", () => {
    expect(tornaAllaTrascrizione(accodaTesto(prima, pulito), pulito, grezzo)).toBe(`${prima}\n${grezzo}`);
  });
  it("non tocca niente se la persona ha già ritoccato il testo", () => {
    expect(tornaAllaTrascrizione(`${prima}\n${pulito} Domani si sigilla.`, pulito, grezzo)).toBeNull();
  });
});

describe("i messaggi per chi detta", () => {
  it("credito finito: niente gergo, si dice che non c'è addebito", () => {
    const e = messaggioErroreDetta(402, { code: "AI_COMPANY_CREDIT", error: "x" });
    expect(e.credito).toBe(true);
    expect(e.messaggio).toMatch(/crediti AI .* finiti: nessun addebito/);
  });
  it("carta mancante: il messaggio del server", () => {
    expect(messaggioErroreDetta(402, { code: "payment_method_required", error: "Registra una carta" })).toEqual({ messaggio: "Registra una carta", credito: true });
  });
  it("senza rete lo dice e invita a scrivere", () => {
    expect(messaggioErroreDetta(null, null).messaggio).toMatch(/Senza rete/);
  });
  it("un 500 non mostra il testo tecnico del server", () => {
    expect(messaggioErroreDetta(500, { error: "TypeError: x is undefined" }).messaggio).toMatch(/Trascrizione non riuscita/);
  });
  it("il limite è di 3 minuti", () => {
    expect(CAMPO_AUDIO_MAX_SECONDI).toBe(180);
  });
});

describe("il controllo del testo pulito (lato funzione)", () => {
  const grezzo = "allora ehm oggi cioè abbiamo fatto il massetto al piano terra venti sacchi di cemento e poi niente la guaina";
  it("accetta punteggiatura, intercalari tolti e numeri detti a parole messi in cifre", () => {
    const e = controllaTestoPulito("«Oggi abbiamo fatto il massetto al piano terra: 20 sacchi di cemento, poi la guaina.»", grezzo);
    expect(e).toEqual({ testo: "Oggi abbiamo fatto il massetto al piano terra: 20 sacchi di cemento, poi la guaina.", scartato: false });
  });
  it("scarta un numero che nella trascrizione non c'è", () => {
    expect(controllaTestoPulito("Fatto il massetto (35 mq) al piano terra.", "fatto il massetto al piano terra")).toMatchObject({ scartato: true, motivo: "numeri_aggiunti" });
  });
  it("tiene un numero già in cifre nella trascrizione, anche col punto delle migliaia", () => {
    expect(controllaTestoPulito("Scaricati 1.500 mattoni.", "ehm scaricati 1500 mattoni")).toMatchObject({ scartato: false });
  });
  it("scarta un riassunto che toglie informazioni", () => {
    expect(controllaTestoPulito("Massetto fatto.", grezzo)).toMatchObject({ scartato: true, motivo: "troppo_corto" });
  });
  it("scarta un testo gonfiato", () => {
    expect(controllaTestoPulito("x".repeat(400), "posato il telaio")).toMatchObject({ scartato: true, motivo: "troppo_lungo" });
  });
  it("scarta una risposta vuota o non testuale", () => {
    expect(controllaTestoPulito("  ", grezzo)).toMatchObject({ scartato: true });
    expect(controllaTestoPulito(null, grezzo)).toMatchObject({ scartato: true });
  });
  it("il prompt vieta fatti nuovi e riassunti, e conosce solo i campi previsti", () => {
    const p = promptPulizia("giornale", campoValido("giornale", "lavorazioni"));
    expect(p).toMatch(/lavorazioni eseguite/);
    expect(p).toMatch(/NON devi MAI/);
    expect(p).toMatch(/aggiungere fatti, numeri/);
    expect(p).toMatch(/riassumere/);
    expect(campoValido("rapportino", "constructor")).toBeNull();
    expect(campoValido("rapportino", "lavorazioni")).toBeNull();
  });
});

describe("«Compila parlando» paga solo con la carta", () => {
  it("parse-rapportino-ai controlla carta e abbonamento prima di Whisper", async () => {
    const { readFileSync } = await import("node:fs");
    const s = readFileSync("supabase/functions/parse-rapportino-ai/index.ts", "utf8");
    const gate = s.indexOf("await gateAiPayment(supabaseAdmin, companyId, corsHeaders)");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(s.indexOf("trascrizione = await transcribeAudio("));
    expect(gate).toBeLessThan(s.indexOf('.from("campo-audio")\n    .download('));
  });
});
