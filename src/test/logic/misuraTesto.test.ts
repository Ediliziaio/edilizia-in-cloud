/**
 * La misura dei testi del PDF: con le larghezze vere dei caratteri il documento
 * sa su quante righe va un testo, e quanto bianco resta in fondo alla pagina.
 */
import { describe, expect, it } from "vitest";
import { altezzaTesto, larghezzaTesto, righeDiTesto, testoDaHtml } from "@/components/preventivi/pdf/misuraTesto";

describe("misura dei testi del PDF", () => {
  it("le larghezze sono quelle delle metriche Adobe", () => {
    // «Helvetica» a corpo 10: H 722 + e 556 + l 222 + v 500 + e 556 + t 278 + i 222 + c 500 + a 556 = 4112 millesimi.
    expect(larghezzaTesto("Helvetica", "Helvetica", 10)).toBeCloseTo(41.12, 2);
    expect(larghezzaTesto(" ", "Helvetica-Bold", 1000)).toBe(278);
    // Un carattere sconosciuto vale mezzo em.
    expect(larghezzaTesto("✓", "Helvetica", 10)).toBe(5);
  });

  it("si va a capo fra le parole, come nel computo", () => {
    // La colonna delle lavorazioni del computo è larga 239 punti: questa riga va su due.
    expect(righeDiTesto("Trasporto e smaltimento delle macerie in discarica autorizzata", 239, "Helvetica", 9)).toBe(2);
    expect(righeDiTesto("Demolizione di pavimento, rivestimenti e massetto", 239, "Helvetica", 9)).toBe(1);
    // Gli a capo del testo contano; una parola più lunga della riga ne occupa più d'una.
    expect(righeDiTesto("uno\ndue", 500, "Helvetica", 9)).toBe(2);
    expect(righeDiTesto("x".repeat(200), 100, "Helvetica", 10)).toBeGreaterThan(1);
    expect(altezzaTesto("una riga", 500, "Helvetica", 10, 1.5)).toBe(15);
  });

  it("dall'HTML dell'editor al testo, un blocco per riga", () => {
    expect(testoDaHtml("<p>Uno <b>due</b>.</p><ul><li>a</li><li>b</li></ul>")).toBe("Uno due.\na\nb");
    expect(testoDaHtml(null)).toBe("");
  });
});
