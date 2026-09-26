/**
 * L'email unica del mattino (25/09/2026): oggetto che dice la giornata, cosa
 * fare in cima, niente icone, e una sezione che non si legge non ferma le altre.
 */
import { describe, expect, it } from "vitest";
import { componiMattino, oggettoMattino, type DatiMattino } from "../../../supabase/functions/_shared/mattino";

const base = (x: Partial<DatiMattino> = {}): DatiMattino => ({
  giorno: "venerdì 26 settembre",
  chiamate: [],
  appuntamenti: [],
  priorita: [],
  daSistemare: [],
  marketing: { html: "<p>marketing</p>" },
  outreachRighe: [
    { etichetta: "Urgenze", valore: "ThermoDMR: 10 in coda" },
    { etichetta: "Da chiamare oggi", valore: "1 · Rossi" },
    { etichetta: "Ieri in tutto", valore: "1.575 email inviate · 13 risposte" },
  ],
  outreachChiHaRisposto: ["Rossi Serramenti — interessato"],
  piattaforma: { html: "<p>piattaforma</p>" },
  urlMarketing: "https://app/marketing",
  urlOutreach: "https://app/posta",
  ...x,
});

describe("oggettoMattino", () => {
  it("dice la giornata, al singolare e al plurale, senza le voci a zero", () => {
    expect(oggettoMattino(base({
      chiamate: [{ chi: "Rossi", canale: "email", motivo: "interessato", quando: "ieri" }],
      appuntamenti: [{ ora: "10:00", tipo: "Chiamata conoscitiva", chi: "Bianchi" }, { ora: "16:30", tipo: "Videochiamata", chi: "Verdi" }],
      priorita: [],
      daSistemare: ["a", "b", "c"],
    }))).toBe("Oggi: 1 chiamata · 2 appuntamenti · 3 da sistemare");
  });
  it("quando non c'è niente lo dice, e la prova si riconosce", () => {
    expect(oggettoMattino(base())).toBe("Oggi: niente di urgente");
    expect(oggettoMattino(base({ prova: true }))).toBe("[Prova] Oggi: niente di urgente");
  });
});

describe("componiMattino", () => {
  it("in cima cosa fare, col numero da toccare; le righe già in cima non si ripetono", () => {
    const { html } = componiMattino(base({
      chiamate: [{ chi: "Rossi Serramenti", canale: "email", motivo: "interessato", quando: "ieri", telefono: "+39 348 123 4567", cosa: "chiamatemi domani" }],
      appuntamenti: [{ ora: "16:30", tipo: "Videochiamata", chi: "Valeriano Dodde", azienda: "La Restaura", telefono: "+393490644678", calendario: "Demo Edilizia in Cloud" }],
    }));
    expect(html.indexOf("Cosa fare oggi")).toBeLessThan(html.indexOf("Marketing clienti"));
    expect(html).toContain('href="tel:+393481234567"');
    expect(html).toContain("16:30");
    expect(html).toContain("La Restaura");
    expect(html).not.toContain("ThermoDMR: 10 in coda");
    expect(html).toContain("1.575 email inviate");
  });
  it("niente icone", () => {
    const { subject, html } = componiMattino(base({ daSistemare: ["la casella x non spedisce"] }));
    expect(/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(subject + html)).toBe(false);
  });
  it("un'area che non si legge lascia il motivo, e le altre partono lo stesso", () => {
    const { html } = componiMattino(base({ marketing: { html: null, errore: "mkt_rapporto_mattino: timeout" } }));
    expect(html).toContain("non si è potuta leggere: mkt_rapporto_mattino: timeout");
    expect(html).toContain("<p>piattaforma</p>");
  });
  it("se l'outreach non si legge non dice «nessuna chiamata»: dice perché", () => {
    const { html } = componiMattino(base({ outreachRighe: null, outreachErrore: "timeout" }));
    expect(html).not.toContain("Nessuna: nessuna risposta positiva");
    expect(html).toContain("non si è potuta leggere: timeout");
  });
  it("i codici HTML dentro le risposte si leggono come testo", () => {
    const { html } = componiMattino(base({ chiamate: [{ chi: "Cantoni", canale: "email", motivo: "interessato", quando: "martedì", cosa: "Ok 351 7881465&nbsp;&nbsp;Il 22 Set &lt;info@x.eu&gt; ha scritto" }] }));
    expect(html).not.toContain("&amp;nbsp;");
    expect(html).toContain("Ok 351 7881465 Il 22 Set &lt;info@x.eu&gt; ha scritto");
  });
  it("il testo che arriva dai dati non diventa HTML", () => {
    const { html } = componiMattino(base({ chiamate: [{ chi: "<script>x</script>", canale: "email", motivo: "interessato", quando: "ieri" }] }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
