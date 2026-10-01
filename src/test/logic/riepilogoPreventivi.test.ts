import { describe, expect, it } from "vitest";
import {
  ordinaPreventivi, riepilogoPreventivi, scadenzaPreventivo, valoreProposto, visioneCliente, type PreventivoRiga,
} from "@/lib/quotes/riepilogoPreventivi";

const q = (id: string, status: string, total: number, created: string, extra: Partial<PreventivoRiga> = {}): PreventivoRiga =>
  ({ id, status, total, created_at: created, ...extra });

describe("riepilogo preventivi", () => {
  const righe = [
    q("a", "bozza", 1000, "2026-09-01"),
    q("b", "accettata", 5000, "2026-09-02"),
    q("c", "rifiutata", 3000, "2026-09-03"),
    q("d", "inviata", 2000, "2026-09-04"),
  ];

  it("somma per gruppo", () => {
    expect(riepilogoPreventivi(righe)).toEqual({
      aperti: { n: 2, valore: 3000 }, accettati: { n: 1, valore: 5000 }, chiusi: { n: 1, valore: 3000 }, totale: 4,
    });
  });

  it("mette per primi gli aperti, poi accettati e chiusi", () => {
    expect(ordinaPreventivi(righe).map((x) => x.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("dice quando scade", () => {
    const adesso = new Date("2026-10-01T10:00:00Z");
    expect(scadenzaPreventivo(q("x", "inviata", 1, "2026-09-01", { expires_at: "2026-10-01T20:00:00Z" }), adesso)).toEqual({ testo: "Scade oggi", urgente: true });
    expect(scadenzaPreventivo(q("x", "inviata", 1, "2026-09-01", { expires_at: "2026-10-10T10:00:00Z" }), adesso)).toEqual({ testo: "Scade tra 9 giorni", urgente: false });
    expect(scadenzaPreventivo(q("x", "inviata", 1, "2026-09-01", { expires_at: "2026-09-29T10:00:00Z" }), adesso)?.testo).toBe("Scaduto da 2 giorni");
    expect(scadenzaPreventivo(q("x", "accettata", 1, "2026-09-01", { expires_at: "2026-09-29T10:00:00Z" }), adesso)).toBeNull();
    expect(scadenzaPreventivo(q("x", "bozza", 1, "2026-09-01"), adesso)).toBeNull();
  });

  it("dice se il cliente ha visto l'offerta", () => {
    expect(visioneCliente(q("x", "inviata", 1, "2026-09-01", { sent_at: "2026-09-02T10:00:00Z" }))).toBe("Inviato, non ancora aperto dal cliente");
    expect(visioneCliente(q("x", "inviata", 1, "2026-09-01", { sent_at: "2026-09-02T10:00:00Z", viewed_at: "2026-09-03T10:00:00Z" }))).toMatch(/^Aperto dal cliente il 03\/09/);
    expect(visioneCliente(q("x", "bozza", 1, "2026-09-01"))).toBeNull();
  });

  it("propone il valore dell'opportunità", () => {
    expect(valoreProposto(righe)).toEqual({ valore: 5000, da: "accettato" });
    expect(valoreProposto([q("a", "bozza", 1000, "2026-09-01"), q("d", "inviata", 2000, "2026-09-04")])).toEqual({ valore: 2000, da: "aperto" });
    expect(valoreProposto([q("c", "rifiutata", 3000, "2026-09-03")])).toBeNull();
    expect(valoreProposto([])).toBeNull();
  });
});
