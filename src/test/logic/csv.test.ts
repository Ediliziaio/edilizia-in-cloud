import { describe, it, expect } from "vitest";
import { costruisciCsv } from "@/lib/csv";

describe("costruisciCsv", () => {
  const colonne = [
    { label: "Titolo", valore: (r: { t: string; n: number | null }) => r.t },
    { label: "Ore", valore: (r: { t: string; n: number | null }) => r.n },
  ];

  it("usa il punto e virgola e le righe CRLF, come si aspetta Excel in italiano", () => {
    const csv = costruisciCsv([{ t: "Sopralluogo", n: 2 }], colonne);
    expect(csv).toBe("Titolo;Ore\r\nSopralluogo;2");
  });

  it("mette tra virgolette i valori con separatore, virgolette o a capo", () => {
    const csv = costruisciCsv([{ t: 'Posa "serramenti"; piano 2\nurgente', n: null }], colonne);
    expect(csv.split("\r\n")[1]).toBe('"Posa ""serramenti""; piano 2\nurgente";');
  });

  it("neutralizza le celle che Excel leggerebbe come formule", () => {
    const csv = costruisciCsv([{ t: "=1+1", n: 0 }], colonne);
    expect(csv.split("\r\n")[1]).toBe("'=1+1;0");
  });
});
