import { describe, expect, it } from "vitest";
import { fuoriFinestraInvio, parseOraMinuti } from "../../../supabase/functions/_shared/openwaFinestraInvio";

/**
 * La finestra di invio "umana" per WhatsApp Locale.
 *
 * 11/09/2026: il founder ha chiesto 7:30-19:00 lun-ven + sabato mattina, mai
 * domenica. Il codice esistente (openwa_quiet_start/end) leggeva solo ORE
 * INTERE e un booleano "weekend aperto/chiuso" che valeva sab+dom insieme —
 * non c'era modo di aprire il solo sabato mattina restando chiusi la
 * domenica, né di partire esattamente alle 7:30. Qui la logica diventa pura
 * e prende minuti dalla mezzanotte, testabile senza toccare l'orologio.
 */
describe("parseOraMinuti", () => {
  it("«7:30» → 450 minuti dalla mezzanotte", () => {
    expect(parseOraMinuti("7:30", 0)).toBe(7 * 60 + 30);
  });
  it("solo l'ora, retrocompatibile con i vecchi valori («8», «21»)", () => {
    expect(parseOraMinuti("8", 0)).toBe(8 * 60);
    expect(parseOraMinuti("21", 0)).toBe(21 * 60);
  });
  it("valore vuoto o sporco → il default, non un errore", () => {
    expect(parseOraMinuti("", 480)).toBe(480);
    expect(parseOraMinuti("non un orario", 480)).toBe(480);
  });
  it("i minuti restano dentro 0-59 anche con un valore assurdo", () => {
    expect(parseOraMinuti("7:99", 0)).toBe(7 * 60 + 59);
  });
});

describe("fuoriFinestraInvio", () => {
  const base = { startMinuti: 7 * 60 + 30, endMinuti: 19 * 60, weekendAperto: false, sabatoFinoMinuti: null as number | null };

  it("dentro la fascia, lun-ven → si può inviare", () => {
    expect(fuoriFinestraInvio({ ...base, minutiOra: 10 * 60, weekday: 3 })).toBe(false);
  });

  it("esattamente all'apertura → dentro; un minuto prima → fuori", () => {
    expect(fuoriFinestraInvio({ ...base, minutiOra: 7 * 60 + 30, weekday: 2 })).toBe(false);
    expect(fuoriFinestraInvio({ ...base, minutiOra: 7 * 60 + 29, weekday: 2 })).toBe(true);
  });

  it("esattamente alla chiusura → già fuori (l'ora di chiusura non si invia)", () => {
    expect(fuoriFinestraInvio({ ...base, minutiOra: 19 * 60, weekday: 2 })).toBe(true);
  });

  it("la domenica è sempre chiusa, anche dentro l'orario, anche col sabato aperto", () => {
    expect(fuoriFinestraInvio({ ...base, minutiOra: 10 * 60, weekday: 7 })).toBe(true);
    expect(fuoriFinestraInvio({ ...base, minutiOra: 10 * 60, weekday: 7, sabatoFinoMinuti: 13 * 60 })).toBe(true);
  });

  it("la domenica si apre SOLO col flag esplicito weekendAperto", () => {
    expect(fuoriFinestraInvio({ ...base, minutiOra: 10 * 60, weekday: 7, weekendAperto: true })).toBe(false);
  });

  it("sabato senza impostazioni extra resta chiuso (comportamento storico)", () => {
    expect(fuoriFinestraInvio({ ...base, minutiOra: 10 * 60, weekday: 6 })).toBe(true);
  });

  it("sabato con «fino alle 13» → aperto la mattina, chiuso il pomeriggio", () => {
    const conSabato = { ...base, sabatoFinoMinuti: 13 * 60 };
    expect(fuoriFinestraInvio({ ...conSabato, minutiOra: 9 * 60, weekday: 6 })).toBe(false);
    expect(fuoriFinestraInvio({ ...conSabato, minutiOra: 12 * 60 + 59, weekday: 6 })).toBe(false);
    expect(fuoriFinestraInvio({ ...conSabato, minutiOra: 13 * 60, weekday: 6 })).toBe(true);
  });

  it("sabato con «fino alle 13» rispetta comunque l'apertura generale (mai prima delle 7:30)", () => {
    expect(fuoriFinestraInvio({ ...base, sabatoFinoMinuti: 13 * 60, minutiOra: 7 * 60, weekday: 6 })).toBe(true);
  });

  it("weekendAperto=true apre tutto il sabato, ignorando sabatoFinoMinuti", () => {
    expect(fuoriFinestraInvio({ ...base, weekendAperto: true, sabatoFinoMinuti: 13 * 60, minutiOra: 16 * 60, weekday: 6 })).toBe(false);
  });

  it("fuori orario nei giorni feriali resta fuori indipendentemente dal weekend", () => {
    expect(fuoriFinestraInvio({ ...base, minutiOra: 20 * 60, weekday: 3 })).toBe(true);
    expect(fuoriFinestraInvio({ ...base, minutiOra: 6 * 60, weekday: 3 })).toBe(true);
  });
});
