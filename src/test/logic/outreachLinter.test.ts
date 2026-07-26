import { describe, it, expect } from "vitest";
import { lintEmail, puoPartire } from "../../../supabase/functions/_shared/outreach-linter";

const blocchi = (s: string, b: string, touch = 1) =>
  lintEmail(s, b, { touch }).filter((r) => r.gravita === "blocco").map((r) => r.regola);

describe("linter cold outreach italiano", () => {
  it("passa un'email pulita", () => {
    const body =
      "Ho visto che seguite cantieri in tutta la provincia di Brescia con dodici persone in organico. " +
      "Chi tiene i SAL, li fa a mano su Excel? Lo chiedo perché nelle imprese di quella misura è quasi " +
      "sempre così, e a fine lavori il margine reale salta fuori con tre mesi di ritardo. " +
      "Ha senso che ti mandi due righe su come lo risolvono altre imprese della zona?";
    const r = lintEmail("sal e margini", body);
    expect(puoPartire(r)).toBe(true);
  });

  it("blocca le parole vietate italiane", () => {
    expect(blocchi("prova", "Ti offro una consulenza gratuita, clicca qui subito.")).toContain("parola vietata");
  });

  it("ammette 'preventivo' una volta, blocca la seconda", () => {
    expect(blocchi("x", "Ti mando un preventivo.")).not.toContain("parola limitata");
    expect(blocchi("x", "Ti mando un preventivo. Il preventivo è pronto.")).toContain("parola limitata");
  });

  it("riconosce le frasi da testo generato", () => {
    expect(blocchi("x", "Spero che questa email ti trovi bene. Volevo parlarti di una cosa.")).toContain("suona generato");
    expect(blocchi("x", "Offriamo soluzioni innovative per il tuo cantiere.")).toContain("suona generato");
  });

  it("vieta i link nei primi tre touch e ne ammette uno dal quarto", () => {
    expect(blocchi("x", "Guarda qui https://esempio.it/x", 1)).toContain("link");
    expect(blocchi("x", "Guarda qui https://esempio.it/x", 4)).not.toContain("link");
    expect(blocchi("x", "Qui https://a.it e qui https://b.it", 4)).toContain("link");
  });

  it("blocca HTML e immagini", () => {
    expect(blocchi("x", "<p>ciao</p>")).toContain("html");
    expect(blocchi("x", 'testo <img src="logo.png">')).toContain("immagini");
  });

  it("blocca emoji e punteggiatura enfatica nell'oggetto", () => {
    expect(blocchi("offerta 🔥", "testo normale abbastanza lungo per non far scattare altro")).toContain("oggetto");
    expect(blocchi("guarda qui!", "testo normale abbastanza lungo per non far scattare altro")).toContain("oggetto");
  });

  it("blocca i caratteri a larghezza zero", () => {
    expect(blocchi("x", "testo con carattere invisibile​ dentro")).toContain("caratteri invisibili");
  });

  it("blocca le email troppo lunghe", () => {
    expect(blocchi("x", "parola ".repeat(130))).toContain("lunghezza");
  });

  it("segnala il ritmo piatto delle frasi tutte uguali", () => {
    const piatto = "Questo è un test di prova. Questo è un altro caso. Questo è il terzo esempio.";
    const r = lintEmail("x", piatto);
    expect(r.some((x) => x.regola === "ritmo")).toBe(true);
  });

  it("segnala i segnaposto non risolti senza bloccare", () => {
    const r = lintEmail("x", "Ciao {{nome}}, ho visto la tua impresa e volevo capire come gestite i cantieri oggi.");
    expect(r.some((x) => x.regola === "segnaposto" && x.gravita === "avviso")).toBe(true);
    expect(puoPartire(r)).toBe(true);
  });

  it("non confonde una parola che ne contiene un'altra", () => {
    // "sconto" non deve scattare dentro "sconto" assente ma "scontornare" sì-no:
    // il confine iniziale evita i falsi positivi a metà parola.
    expect(blocchi("x", "abbiamo discontinuato quel prodotto")).not.toContain("parola vietata");
  });
});
