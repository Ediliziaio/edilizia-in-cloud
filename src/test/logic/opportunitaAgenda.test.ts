/**
 * Appuntamenti e attività sulla scheda opportunità (24/09/2026): due icone,
 * due numerini — «gli appuntamenti sono una cosa, le attività sono altre» —
 * quello delle attività rosso se una è scaduta, e date dette come le direbbe
 * una persona.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  altriAppuntamenti, badgeAppuntamenti, badgeAttivita, giorno, leggiAgenda, oggiRoma, quandoAppuntamento, scadenzaAttivita,
} from "@/lib/opportunitaAgenda";

const OGGI = "2026-09-24"; // giovedì

describe("due numerini, uno per cosa", () => {
  it("il calendario conta solo gli appuntamenti", () => {
    expect(badgeAppuntamenti({ appuntamenti: 1, attivita: 2, scadute: 1 })).toBe(1);
    expect(badgeAppuntamenti({ appuntamenti: 0, attivita: 2, scadute: 0 })).toBeNull();
  });

  it("le attività contano solo le attività, rosse se una è scaduta", () => {
    expect(badgeAttivita({ appuntamenti: 1, attivita: 2, scadute: 1 })).toEqual({ numero: 2, urgente: true });
    expect(badgeAttivita({ appuntamenti: 3, attivita: 1, scadute: 0 })).toEqual({ numero: 1, urgente: false });
    expect(badgeAttivita({ appuntamenti: 3, attivita: 0, scadute: 0 })).toEqual({ numero: null, urgente: false });
  });

  it("una scheda senza conteggio vale zero, e i valori strani non passano", () => {
    expect(leggiAgenda(undefined)).toEqual({ appuntamenti: 0, attivita: 0, scadute: 0 });
    expect(leggiAgenda({ appuntamenti: "2", attivita: -1, scadute: null })).toEqual({ appuntamenti: 2, attivita: 0, scadute: 0 });
  });
});

describe("date dette come le direbbe una persona", () => {
  it("oggi, domani, ieri, poi il giorno della settimana", () => {
    expect(giorno("2026-09-24", OGGI)).toBe("oggi");
    expect(giorno("2026-09-25", OGGI)).toBe("domani");
    expect(giorno("2026-09-23", OGGI)).toBe("ieri");
    expect(giorno("2026-09-29", OGGI)).toBe("mar 29 set");
  });

  it("l'appuntamento con l'orario, e la fine se c'è", () => {
    expect(quandoAppuntamento({ appointment_date: "2026-09-24", appointment_time: "15:30:00", appointment_end_time: "16:30:00" }, OGGI))
      .toBe("oggi, 15:30–16:30");
    expect(quandoAppuntamento({ appointment_date: "2026-09-29", appointment_time: "09:00:00" }, OGGI)).toBe("mar 29 set, 09:00");
    expect(quandoAppuntamento({ appointment_date: "2026-09-25", appointment_time: null }, OGGI)).toBe("domani");
  });

  it("la scadenza di un'attività, scaduta solo dal giorno dopo", () => {
    expect(scadenzaAttivita("2026-09-20", OGGI)).toEqual({ testo: "scaduta da 4 giorni", scaduta: true });
    expect(scadenzaAttivita("2026-09-23", OGGI)).toEqual({ testo: "scaduta ieri", scaduta: true });
    expect(scadenzaAttivita("2026-09-24", OGGI)).toEqual({ testo: "scade oggi", scaduta: false });
    expect(scadenzaAttivita("2026-09-25", OGGI)).toEqual({ testo: "scade domani", scaduta: false });
    expect(scadenzaAttivita("2026-10-02", OGGI)).toEqual({ testo: "entro ven 2 ott", scaduta: false });
    expect(scadenzaAttivita(null, OGGI)).toEqual({ testo: "senza scadenza", scaduta: false });
  });

  it("il giorno è quello italiano, anche a mezzanotte UTC", () => {
    // 23:30 UTC del 23/09 a Roma è già il 24.
    expect(oggiRoma(new Date("2026-09-23T23:30:00Z"))).toBe("2026-09-24");
  });

  it("gli appuntamenti rimasti fuori dal riquadro", () => {
    expect(altriAppuntamenti(4, 3)).toBe("+1 altro");
    expect(altriAppuntamenti(6, 3)).toBe("+3 altri");
    expect(altriAppuntamenti(2, 2)).toBe("");
  });
});

describe("il conteggio viene dal database, con la scheda", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20280924190000_scheda_opportunita_agenda.sql"), "utf8");

  it("appuntamenti in programma del contatto, attività non completate dell'opportunità o del contatto", () => {
    expect(sql).toContain("'agenda', (");
    expect(sql).toContain("and t.status <> 'completata'");
    expect(sql).toContain("(t.opportunity_id = o.id");
    expect(sql).toContain("or (t.opportunity_id is null and t.contact_id = o.contact_id))");
    expect(sql).toContain("'scadute', count(*) filter (where t.due_date < (now() at time zone 'Europe/Rome')::date)");
  });
});
