import { describe, expect, it } from "vitest";
import {
  type ConfermaAttesa,
  confermaValePer,
  leggiStatoSessione,
  statoDaSalvare,
} from "../../../supabase/functions/_shared/botOperativoConferme";

const ADESSO = new Date("2026-09-27T10:00:00Z");
const minutiFa = (m: number) => new Date(ADESSO.getTime() - m * 60_000).toISOString();

describe("domanda in attesa nella sessione", () => {
  it("si legge se è recente, sparisce se è vecchia", () => {
    const recente = leggiStatoSessione({ bot_conferma: { azione: "carica_ddt", proposta_id: null, chiesta_il: minutiFa(5) } }, ADESSO);
    expect(recente.conferma?.azione).toBe("carica_ddt");
    const vecchia = leggiStatoSessione({ bot_conferma: { azione: "carica_ddt", proposta_id: null, chiesta_il: minutiFa(31) } }, ADESSO);
    expect(vecchia.conferma).toBeNull();
    expect(leggiStatoSessione(null, ADESSO)).toEqual({ conferma: null, domini: [] });
  });
  it("le aree caricate valgono 30 minuti", () => {
    expect(leggiStatoSessione({ bot_aree: { domini: ["warehouse"], il: minutiFa(10) } }, ADESSO).domini).toEqual(["warehouse"]);
    expect(leggiStatoSessione({ bot_aree: { domini: ["warehouse"], il: minutiFa(40) } }, ADESSO).domini).toEqual([]);
  });
});

describe("il Sì sblocca solo l'azione chiesta", () => {
  const attesa: ConfermaAttesa = { azione: "carica_ddt", proposta_id: null, chiesta_il: minutiFa(1) };
  it("sblocca lo strumento chiesto", () => {
    expect(confermaValePer(attesa, "carica_ddt", true)).toBe(true);
  });
  it("non sblocca un altro strumento", () => {
    expect(confermaValePer(attesa, "crea_rapportino", true)).toBe(false);
  });
  it("senza Sì non sblocca niente", () => {
    expect(confermaValePer(attesa, "carica_ddt", false)).toBe(false);
  });
  it("domanda senza azione indicata o nessuna domanda: vale il Sì (comportamento di prima)", () => {
    expect(confermaValePer({ ...attesa, azione: null }, "crea_rapportino", true)).toBe(true);
    expect(confermaValePer(null, "crea_rapportino", true)).toBe(true);
  });
});

describe("salvataggio nella sessione", () => {
  it("tiene gli altri campi e scrive solo quello che cambia", () => {
    const s = statoDaSalvare({ altro: 1 }, { conferma: { azione: "x", proposta_id: null, chiesta_il: minutiFa(0) } }, ADESSO);
    expect(s.altro).toBe(1);
    expect((s.bot_conferma as { azione: string }).azione).toBe("x");
    const tolta = statoDaSalvare(s, { conferma: null }, ADESSO);
    expect(tolta.bot_conferma).toBeUndefined();
    const aree = statoDaSalvare({}, { domini: ["crm"] }, ADESSO);
    expect(aree.bot_aree).toEqual({ domini: ["crm"], il: ADESSO.toISOString() });
  });
});
