/**
 * La frase d'uscita aggiunta dal motore non deve far scartare l'email.
 *
 * Caso vero, ThermoDMR 14/09: testi scritti a 101-117 parole con la firma
 * (sotto le 120 del linter), il motore aggiungeva «Se non ti interessa,
 * rispondi «no» e non ti scrivo più.» e il linter contava anche quella:
 * 98 primi contatti scartati in due ore.
 */
import { describe, expect, it } from "vitest";
import { componiCorpo, FRASE_USCITA_DEFAULT, haFraseUscita } from "../../../supabase/functions/_shared/outreach-uscita";
import { lintEmail, puoPartire } from "../../../supabase/functions/_shared/outreach-linter";
import { htmlToPlainText } from "../../../supabase/functions/_shared/outreach-template";

const parole = (n: number) =>
  Array.from({ length: n }, (_, i) => (i % 9 === 8 ? `parola${i}.` : `parola${i}`)).join(" ");

const FIRMA = "Filippo Monti<br>ThermoDMR · +39 350 178 0908";

describe("componiCorpo", () => {
  it("un testo da 110 parole + firma passa anche con la frase d'uscita aggiunta", () => {
    const corpo = parole(110);
    const { html, htmlDaControllare } = componiCorpo({ corpo, aggiungiUscita: true, firma: FIRMA });

    // Nell'email la frase c'è, e insieme sfora le 120 parole…
    const testoInviato = htmlToPlainText(html);
    expect(haFraseUscita(testoInviato)).toBe(true);
    expect(testoInviato.split(/\s+/).filter(Boolean).length).toBeGreaterThan(120);
    expect(puoPartire(lintEmail("serramenti su misura", testoInviato))).toBe(false);

    // …ma il controllo guarda quello che ha scritto il brand: l'email parte.
    expect(puoPartire(lintEmail("serramenti su misura", htmlToPlainText(htmlDaControllare)))).toBe(true);
  });

  it("un testo davvero troppo lungo resta bloccato", () => {
    const { htmlDaControllare } = componiCorpo({ corpo: parole(130), aggiungiUscita: true, firma: FIRMA });
    const rilievi = lintEmail("serramenti su misura", htmlToPlainText(htmlDaControllare));
    expect(puoPartire(rilievi)).toBe(false);
    expect(rilievi.some((r) => r.regola === "lunghezza")).toBe(true);
  });

  it("l'ordine nell'email è: testo, frase d'uscita, firma", () => {
    const { html } = componiCorpo({ corpo: "Ciao Marco", aggiungiUscita: true, firma: "Filippo" });
    expect(html).toBe(`Ciao Marco<br><br>${FRASE_USCITA_DEFAULT}<br><br>Filippo`);
  });

  it("usa la frase del brand se c'è, e la mette al sicuro nell'HTML", () => {
    const { html } = componiCorpo({ corpo: "Ciao", aggiungiUscita: true, frase: "Rispondi no & basta <3" });
    expect(html).toBe("Ciao<br><br>Rispondi no &amp; basta &lt;3");
  });

  it("se il testo ha già la sua via d'uscita il motore non ne aggiunge un'altra", () => {
    const { html, htmlDaControllare } = componiCorpo({ corpo: "Ciao", aggiungiUscita: false, firma: "Filippo" });
    expect(html).toBe("Ciao<br><br>Filippo");
    expect(htmlDaControllare).toBe(html);
  });

  it("senza firma non lascia righe vuote in fondo", () => {
    const { html } = componiCorpo({ corpo: "Ciao", aggiungiUscita: false, firma: "  " });
    expect(html).toBe("Ciao");
  });
});
