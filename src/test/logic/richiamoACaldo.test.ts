/**
 * Richiamo a caldo: le regole che non possono sparire con una riscrittura.
 *
 * Il copione del richiamo lead non è solo testo di marketing: contiene due
 * obblighi. Dichiarare che a parlare è un assistente automatico, e lasciare la
 * scheda al collega PRIMA di passargli la telefonata — altrimenti l'operatore
 * riceve una chiamata di cui non sa nulla, che è esattamente il problema che
 * questa funzione esiste per risolvere.
 *
 * Se qualcuno riscrive il prompt e li perde per strada, questi test lo fermano.
 */
import { describe, it, expect } from "vitest";
import { VOICE_AGENT_TEMPLATES } from "@/lib/voice-agent-templates";

const richiamo = VOICE_AGENT_TEMPLATES.find((t) => t.id === "qualificatore_lead");

describe("copione del richiamo a caldo", () => {
  it("il template esiste ed è una chiamata in uscita", () => {
    expect(richiamo, "template qualificatore_lead sparito").toBeDefined();
    expect(richiamo!.direzione).toBe("outbound");
  });

  it("si presenta come assistente automatico nella prima frase", () => {
    // Chi risponde deve sapere subito con cosa sta parlando: è un obbligo di
    // trasparenza, e all'atto pratico rende la chiamata più efficace.
    const primo = richiamo!.primoMessaggio.toLowerCase();
    expect(primo).toMatch(/assistente (virtuale|automatico)/);
  });

  it("vieta di fingersi una persona se glielo chiedono", () => {
    expect(richiamo!.systemPrompt.toLowerCase()).toContain("non fingere mai di essere umano");
  });

  it("cerca un collega libero prima di promettere il passaggio", () => {
    // È lo strumento che fa tre cose insieme: dice se qualcuno c'è davvero,
    // lo segna occupato e gli fa comparire la scheda a schermo. Senza, l'agente
    // trasferirebbe nel vuoto e l'operatore risponderebbe alla cieca.
    const prompt = richiamo!.systemPrompt.toLowerCase();
    expect(prompt).toContain("passa_a_operatore");
    expect(prompt).toMatch(/prima di passare la chiamata/);
    expect(richiamo!.strumenti).toContain("passa_a_operatore");
  });

  it("se non c'è nessuno libero non promette il passaggio", () => {
    // La trappola: il modello, lasciato solo, dice "glielo passo" comunque.
    const prompt = richiamo!.systemPrompt.toLowerCase();
    expect(prompt).toMatch(/non dire che glielo passi/);
  });

  it("annuncia il passaggio a voce invece di trasferire in silenzio", () => {
    expect(richiamo!.systemPrompt.toLowerCase()).toMatch(/le passo un collega/);
  });
});
