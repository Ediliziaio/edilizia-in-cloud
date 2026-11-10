/**
 * L'assistente dei lead non deve inventare appuntamenti leggendo la chat
 * vecchia (10/11/2026).
 *
 * Il caso, visto in prova sul numero vero: un contatto scrive «ciao, vorrei
 * fissare un appuntamento» e si sente rispondere «vedo che hai già un
 * appuntamento fissato per lunedì 28 settembre alle 13:00». Quell'appuntamento
 * era di un mese e mezzo prima ed era stato annullato: nella chat c'era la
 * conferma, l'annullamento no — non passa da WhatsApp. Nessuno strumento era
 * stato chiamato: il modello l'aveva dedotto dalla storia.
 *
 * Adesso l'appuntamento vero si legge dal calendario a ogni giro e finisce nel
 * contesto del prompt, con l'istruzione esplicita di ignorare quelli nominati
 * nella chat.
 */
import { describe, expect, it } from "vitest";
import { adessoRoma, appuntamentoDaFare, dataRomaOggi } from "../../../supabase/functions/lead-agente-whatsapp/appuntamentoCorrente";
import { promptAgenteLead } from "../../../supabase/functions/_shared/promptAgenteLead";

const ORA = { data: "2026-11-10", ora: "18:30" };
const cal = (nome: string) => ({ name: nome });

describe("appuntamentoDaFare", () => {
  it("un appuntamento di settembre non è «già fissato»", () => {
    expect(appuntamentoDaFare([{ appointment_date: "2026-09-28", appointment_time: "13:00:00" }], ORA)).toBeNull();
  });

  it("quello di oggi a un'ora già passata è finito, non è da fare", () => {
    expect(appuntamentoDaFare([{ appointment_date: "2026-11-10", appointment_time: "09:00:00" }], ORA)).toBeNull();
  });

  it("quello di oggi più tardi vale, e dice dove", () => {
    const a = appuntamentoDaFare(
      [{ appointment_date: "2026-11-10", appointment_time: "19:00:00", marketing_calendars: cal("Calendario Giusy") }],
      ORA,
    );
    expect(a).toEqual({ quando: "martedì 10 novembre 2026 alle 19:00", dove: "Calendario Giusy" });
  });

  it("fra più appuntamenti futuri prende il primo", () => {
    const a = appuntamentoDaFare([
      { appointment_date: "2026-11-24", appointment_time: "10:00:00" },
      { appointment_date: "2026-11-11", appointment_time: "14:30:00" },
    ], ORA);
    expect(a?.quando).toBe("mercoledì 11 novembre 2026 alle 14:30");
  });

  it("senza appuntamenti, niente", () => {
    expect(appuntamentoDaFare([], ORA)).toBeNull();
  });

  it("le righe con una data non valida non diventano un appuntamento", () => {
    expect(appuntamentoDaFare([{ appointment_date: "", appointment_time: null }], ORA)).toBeNull();
  });
});

describe("il prompt dice la verità sugli appuntamenti", () => {
  const BASE = {
    promptAzienda: "Sei Giusy.",
    nomeAzienda: "Il Bagno Group",
    adesso: new Date("2026-11-10T17:30:00Z"),
    contatto: { nome: "Florin", cognome: null as string | null },
    qualificazione: {},
    faseAttuale: null as string | null,
    calendarioNome: "Calendario Giusy",
  };

  it("senza appuntamento glielo dice, e gli vieta di fidarsi della chat vecchia", () => {
    const p = promptAgenteLead(BASE);
    expect(p).toContain("NON ha nessun appuntamento fissato");
    expect(p).toContain("Non dirgli che ne ha uno");
  });

  it("con un appuntamento dice quello vero e marchia gli altri come passati", () => {
    const p = promptAgenteLead({ ...BASE, appuntamento: { quando: "mercoledì 11 novembre 2026 alle 14:30", dove: "Calendario Giusy" } });
    expect(p).toContain("mercoledì 11 novembre 2026 alle 14:30");
    expect(p).toContain("Calendario Giusy");
    expect(p).toContain("sono passati o annullati");
  });
});

describe("l'ora di Roma", () => {
  it("dataRomaOggi e adessoRoma parlano dello stesso giorno", () => {
    const d = new Date("2026-11-10T17:30:00Z");
    expect(adessoRoma(d).data).toBe(dataRomaOggi(d));
    expect(adessoRoma(d).ora).toBe("18:30");
  });
});
