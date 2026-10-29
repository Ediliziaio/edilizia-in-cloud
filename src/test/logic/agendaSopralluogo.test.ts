import { describe, it, expect } from "vitest";
import {
  appuntamentoDelSopralluogo,
  avvisoOrario,
  calendarioDelTecnico,
  durataSopralluogo,
  type CalendarioAgenda,
} from "@/lib/surveys/agendaSopralluogo";
import {
  calcolaSlotLiberi,
  type EsitoSlot,
  type RegolaDisponibilita,
} from "@/lib/opportunita/slotCalendario";

const cal = (p: Partial<CalendarioAgenda>): CalendarioAgenda => ({
  id: "c1",
  name: "Rilievi",
  owner_id: "marco",
  duration_minutes: 60,
  slot_interval_min: null,
  buffer_before_min: 0,
  buffer_after_min: 0,
  min_notice_minutes: 0,
  max_per_day: null,
  ...p,
});

describe("calendarioDelTecnico", () => {
  it("prende il calendario del tecnico incaricato", () => {
    const scelto = calendarioDelTecnico(
      [cal({ id: "a", owner_id: "elena" }), cal({ id: "b", owner_id: "marco" })],
      "marco",
    );
    expect(scelto?.id).toBe("b");
  });

  it("con piu' calendari dello stesso tecnico sceglie sempre lo stesso (per nome)", () => {
    const calendari = [
      cal({ id: "b", name: "Zeta" }),
      cal({ id: "a", name: "Alfa" }),
    ];
    expect(calendarioDelTecnico(calendari, "marco")?.id).toBe("a");
    expect(calendarioDelTecnico([...calendari].reverse(), "marco")?.id).toBe("a");
  });

  it("senza tecnico, o senza un suo calendario, non c'e' agenda", () => {
    expect(calendarioDelTecnico([cal({})], null)).toBeNull();
    expect(calendarioDelTecnico([cal({ owner_id: "elena" })], "marco")).toBeNull();
    expect(calendarioDelTecnico(undefined, "marco")).toBeNull();
  });
});

describe("durataSopralluogo", () => {
  it("usa la durata del calendario", () => {
    expect(durataSopralluogo(cal({ duration_minutes: 45 }))).toBe(45);
  });
  it("ripiega su un'ora se il calendario non la dice", () => {
    expect(durataSopralluogo(cal({ duration_minutes: null }))).toBe(60);
    expect(durataSopralluogo(cal({ duration_minutes: 0 }))).toBe(60);
    expect(durataSopralluogo(null)).toBe(60);
  });
});

describe("avvisoOrario", () => {
  // Annotato col tipo esportato: senza, `fasce: []` e' un any[] implicito e il
  // cricchetto dei tipi lo conta come debito nuovo (TS7018).
  const esito = (
    slot: string[],
    motivoVuoto: null | "chiuso" | "tetto" | "pieno" = null,
  ): EsitoSlot => ({
    slot,
    fasce: [],
    motivoVuoto,
  });

  it("un calendario SENZA orari impostati non è «chiuso»: non si avvisa", () => {
    expect(
      avvisoOrario({
        ora: "03:00",
        calendario: cal({}),
        esito: esito([], "chiuso"),
        haRegole: false,
      }),
    ).toBeNull();
  });

  it("avvisa quando il giorno è chiuso davvero", () => {
    expect(
      avvisoOrario({ ora: "09:00", calendario: cal({}), esito: esito([], "chiuso"), haRegole: true }),
    ).toContain("chiuso");
  });

  it("avvisa quando si è raggiunto il tetto del giorno, col numero", () => {
    expect(
      avvisoOrario({
        ora: "09:00",
        calendario: cal({ max_per_day: 3 }),
        esito: esito([], "tetto"),
        haRegole: true,
      }),
    ).toContain("3");
  });

  it("avvisa quando l'ora scritta a mano non è fra quelle libere", () => {
    const a = avvisoOrario({
      ora: "11:30",
      calendario: cal({}),
      esito: esito(["09:00", "10:00"]),
      haRegole: true,
    });
    expect(a).toContain("11:30");
  });

  it("tace quando l'ora è una di quelle libere", () => {
    expect(
      avvisoOrario({ ora: "10:00", calendario: cal({}), esito: esito(["09:00", "10:00"]), haRegole: true }),
    ).toBeNull();
  });

  it("tace senza calendario o senza giorno", () => {
    expect(avvisoOrario({ ora: "10:00", calendario: null, esito: esito([]), haRegole: true })).toBeNull();
    expect(avvisoOrario({ ora: "10:00", calendario: cal({}), esito: null, haRegole: true })).toBeNull();
  });
});

describe("gli orari offerti seguono le impostazioni del calendario", () => {
  const lunedi = new Date(2026, 10, 2, 12, 0, 0); // lunedì 2 novembre 2026
  // Idem qui: `specific_date: null` senza tipo e' un any implicito (TS7018).
  const regole: RegolaDisponibilita[] = [
    { start_time: "09:00", end_time: "13:00", is_enabled: true, day_of_week: 1, specific_date: null },
  ];

  it("passo e durata sono indipendenti, e il margine dopo allarga l'occupato", () => {
    const c = cal({ duration_minutes: 60, slot_interval_min: 30, buffer_after_min: 30 });
    const esito = calcolaSlotLiberi({
      giorno: lunedi,
      regole,
      appuntamenti: [{ inizio: "10:00", fine: "11:00" }],
      occupatiEsterni: [],
      durataMin: durataSopralluogo(c),
      passoMin: c.slot_interval_min,
      bufferPrimaMin: c.buffer_before_min ?? 0,
      bufferDopoMin: c.buffer_after_min ?? 0,
      adesso: new Date(2026, 9, 1).getTime(),
    });
    // Passo 30 su 09:00–13:00 con durata 60: 09:00, 09:30, 10:00 … 12:00.
    // L'appuntamento 10:00–11:00 col margine di 30 min dopo si prende tutto
    // da 09:00 (che finirebbe alle 10:00, senza i 30 min di stacco) a 11:00.
    expect(esito.slot).toEqual(["11:30", "12:00"]);
  });

  it("il tetto al giorno chiude la giornata", () => {
    const esito = calcolaSlotLiberi({
      giorno: lunedi,
      regole,
      appuntamenti: [
        { inizio: "09:00", fine: "10:00" },
        { inizio: "11:00", fine: "12:00" },
      ],
      occupatiEsterni: [],
      durataMin: 60,
      maxAlGiorno: 2,
      adesso: new Date(2026, 9, 1).getTime(),
    });
    expect(esito.motivoVuoto).toBe("tetto");
  });

  it("il preavviso minimo toglie gli orari troppo vicini", () => {
    const esito = calcolaSlotLiberi({
      giorno: lunedi,
      regole,
      appuntamenti: [],
      occupatiEsterni: [],
      durataMin: 60,
      preavvisoMin: 120,
      adesso: new Date(2026, 10, 2, 9, 30).getTime(),
    });
    expect(esito.slot).toEqual(["12:00"]);
  });
});

describe("appuntamentoDelSopralluogo", () => {
  const base = {
    companyId: "az",
    calendario: cal({ duration_minutes: 90 }),
    technicianId: "marco",
    giorno: "2026-11-02",
    ora: "09:30",
    titolo: "Sopralluogo SR-0001",
  };

  it("fine = inizio + durata del calendario", () => {
    const r = appuntamentoDelSopralluogo(base);
    expect(r.appointment_time).toBe("09:30:00");
    expect(r.appointment_end_time).toBe("11:00:00");
  });

  it("è un sopralluogo confermato sul calendario e sul tecnico scelti", () => {
    const r = appuntamentoDelSopralluogo(base);
    expect(r.appointment_type).toBe("sopralluogo_tecnico");
    expect(r.status).toBe("confermato");
    expect(r.calendar_id).toBe("c1");
    expect(r.assigned_to).toBe("marco");
    expect(r.company_id).toBe("az");
  });

  it("porta in agenda l'indirizzo del cantiere, coordinate comprese", () => {
    const r = appuntamentoDelSopralluogo({
      ...base,
      indirizzo: {
        address_line: "Via Roma 1",
        address_city: "Monza",
        formatted_address: "Via Roma 1, Monza",
        lat: 45.58,
        lng: 9.27,
      },
    });
    expect(r.address_line).toBe("Via Roma 1");
    expect(r.address_city).toBe("Monza");
    expect(r.lat).toBe(45.58);
    expect(r.formatted_address).toBe("Via Roma 1, Monza");
  });

  it("i campi vuoti arrivano null, non stringa vuota", () => {
    const r = appuntamentoDelSopralluogo({ ...base, indirizzo: { address_line: "" }, note: "" });
    expect(r.address_line).toBeNull();
    expect(r.internal_notes).toBeNull();
    expect(r.contact_id).toBeNull();
  });
});
