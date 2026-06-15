import { describe, it, expect } from "vitest";
import { spamScore, capsRatio, countLinks } from "../../../supabase/functions/_shared/outreach-spam-score";

describe("outreach-spam-score", () => {
  it("una email cold pulita e personalizzata è 'ok'", () => {
    const r = spamScore(
      "Domanda veloce su {{company}}",
      "Ciao {{first_name}}, ho visto che {{company}} gestisce diversi cantieri. " +
        "Aiutiamo imprese edili come la vostra a tenere sotto controllo fatture e DDT senza fogli Excel. " +
        "Ha senso una breve chiacchierata la prossima settimana?",
    );
    expect(r.level).toBe("ok");
    expect(r.score).toBeLessThan(25);
  });

  it("penalizza spam words evidenti", () => {
    const r = spamScore("OFFERTA GRATIS", "Acquista ora, sconto garantito, soldi facili!!!");
    expect(r.level).toBe("rischio");
    expect(r.signals.some((s) => s.label.toLowerCase().includes("rischio"))).toBe(true);
  });

  it("conta i link http/https", () => {
    expect(countLinks("vedi https://a.com e http://b.com e https://c.com")).toBe(3);
    expect(countLinks("nessun link")).toBe(0);
  });

  it("segnala troppi link", () => {
    const r = spamScore("ciao", "uno https://a.com due https://b.com tre https://c.com personalizza {{nome}}");
    expect(r.signals.some((s) => s.label.includes("link"))).toBe(true);
  });

  it("capsRatio rileva eccesso di maiuscole", () => {
    expect(capsRatio("CIAO COME STAI OGGI")).toBeGreaterThan(0.5);
    expect(capsRatio("ciao come stai oggi")).toBe(0);
  });

  it("segnala assenza di personalizzazione su corpo lungo", () => {
    const r = spamScore(
      "ciao",
      "Salve, vi scrivo per presentare i nostri servizi alla vostra azienda nella speranza di collaborare presto insieme.",
    );
    expect(r.signals.some((s) => s.label.includes("personalizzazione"))).toBe(true);
  });

  it("lo score è limitato a 0-100", () => {
    const r = spamScore("GRATIS OFFERTA SCONTO PROMO REGALO", "CLICCA QUI ACQUISTA ORA!!! https://a.com https://b.com https://c.com GRATIS GARANTITO SOLDI");
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
