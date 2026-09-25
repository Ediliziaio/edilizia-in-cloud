/**
 * «Chiamami oggi alle 15» → quando chiamare (25/09/2026). Venerdì 25 settembre
 * 2026, 11:04 a Roma: l'ora in cui Danilo ha risposto «puoi chiamarmi dopo le 15».
 */
import { describe, expect, it } from "vitest";
import { hhmm, primoSlotLibero, richiestaDiChiamata, telefonoNelTesto } from "../../../supabase/functions/_shared/outreach-richiesta-chiamata";

const VEN_1104 = new Date("2026-09-25T09:04:00Z");
const r = (t: string, quando = VEN_1104) => richiestaDiChiamata(t, quando);
const fascia = (x: ReturnType<typeof r>) => x && `${hhmm(x.fascia.da)}-${hhmm(x.fascia.a)}`;

describe("richiestaDiChiamata", () => {
  it("il caso vero: «puoi chiamarmi dopo le 15» → oggi alle 15", () => {
    const x = r("Ciao Francesco puoi chiamarmi dopo le 15. Danilo Ercoli Tel. 3488088451");
    expect(x).toMatchObject({ giorno: "2026-09-25", ora: "15:00" });
  });

  it("giorno e ora detti", () => {
    expect(r("chiamami domani alle 10:30")).toMatchObject({ giorno: "2026-09-26", ora: "10:30" });
    expect(r("sentiamoci il 2 ottobre verso le 11")).toMatchObject({ giorno: "2026-10-02", ora: "11:00" });
    expect(r("Mi può telefonare lunedì alle 9.15?")).toMatchObject({ giorno: "2026-09-28", ora: "09:15" });
    expect(r("chiamatemi alle 3 e mezza")).toMatchObject({ giorno: "2026-09-25", ora: "15:30" });
  });

  it("solo la fascia: si cerca lo slot libero lì dentro", () => {
    const pom = r("Sì, chiamatemi oggi pomeriggio");
    expect(pom).toMatchObject({ giorno: "2026-09-25", ora: null });
    expect(fascia(pom)).toBe("14:00-18:30");
    expect(fascia(r("chiamami lunedì mattina"))).toBe("09:00-12:30");
    const tra = r("potete chiamarmi tra le 14 e le 16");
    expect(tra?.ora).toBeNull();
    expect(fascia(tra)).toBe("14:00-16:00");
  });

  it("nessuna ora: il resto della giornata, da mezz'ora dopo la risposta", () => {
    const x = r("Interessante, chiamatemi pure");
    expect(x).toMatchObject({ giorno: "2026-09-25", ora: null });
    expect(fascia(x)).toBe("11:45-18:30");
  });

  it("un'ora già passata vale per il giorno dopo; una fascia finita, il primo giorno utile", () => {
    const alle16 = new Date("2026-09-25T14:00:00Z");
    expect(r("chiamami alle 10", alle16)).toMatchObject({ giorno: "2026-09-26", ora: "10:00" });
    const alle20 = new Date("2026-09-25T18:00:00Z");
    const x = r("chiamami stasera", alle20);
    expect(x?.giorno).toBe("2026-09-26");
    expect(fascia(x)).toBe("18:00-19:30");
  });

  it("la domenica si passa al lunedì", () => {
    expect(r("chiamami dopodomani")?.giorno).toBe("2026-09-28");
  });

  it("i saluti non sono fasce orarie", () => {
    const x = r("Buonasera, chiamatemi domani");
    expect(x?.giorno).toBe("2026-09-26");
    expect(fascia(x)).toBe("09:00-18:30");
  });

  it.each([
    "Buongiorno, mi chiamo Mario Rossi e sono interessato",
    "Non chiamatemi, scrivetemi pure qui",
    "Richiamami più avanti, adesso siamo pieni",
    "Grazie, vi chiamo io la settimana prossima",
    "Va bene, mandatemi le condizioni",
  ])("«%s» non chiede una chiamata", (t) => expect(r(t)).toBeNull());

  it("la nostra email citata sotto non conta", () => {
    const t = "Va bene grazie\n\nIl giorno 25 set 2026 alle 10:08 Edoardo ha scritto:\n> Mi basta sapere a che ora posso chiamarti";
    expect(r(t)).toBeNull();
  });
});

describe("primoSlotLibero", () => {
  const f = { da: 14 * 60, a: 18 * 60 + 30 };
  it("salta gli impegni e trova il primo buco abbastanza lungo", () => {
    const occupati = [{ da: 14 * 60, a: 15 * 60 }, { da: 15 * 60 + 15, a: 16 * 60 }];
    expect(hhmm(primoSlotLibero(f, occupati, 15) as number)).toBe("15:00");
    expect(hhmm(primoSlotLibero(f, occupati, 30) as number)).toBe("16:00");
  });
  it("senza posto restituisce null (si fissa lo stesso, sovrapposto)", () => {
    expect(primoSlotLibero(f, [{ da: 13 * 60, a: 19 * 60 }], 15)).toBeNull();
  });
});

describe("telefonoNelTesto", () => {
  it("prende il cellulare scritto nella risposta, anche spezzato", () => {
    expect(telefonoNelTesto("puoi chiamarmi dopo le 15. Danilo Ercoli Tel. 3488088451")).toBe("+393488088451");
    expect(telefonoNelTesto("il mio numero è 348 808 8451")).toBe("+393488088451");
    expect(telefonoNelTesto("chiamami alle 15")).toBeNull();
    expect(telefonoNelTesto("ci vediamo il 25/09/2026")).toBeNull();
  });
});
