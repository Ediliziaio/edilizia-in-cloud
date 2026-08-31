import { describe, it, expect } from "vitest";
import { calcolaFermo, SOGLIE_GIORNI } from "@/lib/assistenzaSla";

const ADESSO = new Date("2026-08-30T12:00:00Z").getTime();
const giorniFa = (n: number) => new Date(ADESSO - n * 86_400_000).toISOString();

describe("anzianità delle assistenze", () => {
  it("conta dall'ultimo movimento, non dall'apertura", () => {
    const f = calcolaFermo(
      { status: "aperto", priority: "normale", created_at: giorniFa(90), last_message_at: giorniFa(2) },
      ADESSO,
    );
    expect(f?.giorni).toBe(2);
    expect(f?.livello).toBe("ok");
  });

  it("un ticket vecchio e mai toccato è critico", () => {
    const f = calcolaFermo({ status: "aperto", priority: "normale", created_at: giorniFa(40) }, ADESSO);
    expect(f?.giorni).toBe(40);
    expect(f?.livello).toBe("critico");
  });

  it("sull'urgente basta un giorno per accendere l'attenzione", () => {
    const f = calcolaFermo({ status: "aperto", priority: "urgente", updated_at: giorniFa(1) }, ADESSO);
    expect(f?.soglia).toBe(SOGLIE_GIORNI.urgente);
    expect(f?.livello).toBe("attenzione");
  });

  it("i ticket chiusi non hanno un'attesa da segnalare", () => {
    for (const stato of ["risolto", "chiuso", "annullato", "preventivo_rifiutato"]) {
      expect(calcolaFermo({ status: stato, created_at: giorniFa(100) }, ADESSO)).toBeNull();
    }
  });

  it("da_fatturare resta sotto osservazione: il lavoro è fatto ma i soldi no", () => {
    const f = calcolaFermo({ status: "da_fatturare", priority: "normale", updated_at: giorniFa(30) }, ADESSO);
    expect(f).not.toBeNull();
    expect(f?.livello).toBe("critico");
  });

  it("senza date non esplode", () => {
    expect(calcolaFermo({ status: "aperto" }, ADESSO)?.giorni).toBe(0);
  });
});
