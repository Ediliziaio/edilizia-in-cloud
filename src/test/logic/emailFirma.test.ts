import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => ({}) }));

// Import dinamico: il controllo dei tipi dell'app non deve seguire i moduli Deno.
type Email = { subject: string; html: string; text: string; replyTo?: string };
type Modulo = Record<string, (...a: unknown[]) => Email>;
const percorso = "../../../supabase/functions/_shared/emailFirma";
const m = (await import(/* @vite-ignore */ percorso)) as Modulo;

const marchio = {
  branding: { companyName: "Rossi Serramenti", logoUrl: null as string | null, primaryColor: "#0F766E", secondaryColor: "#F97316", footerText: null as string | null, showPoweredBy: false, replyTo: "x@y.it" },
  telefono: "+39 333 1234567",
  email: "info@rossi.it",
};
const leggi = (p: string) => readFileSync(p, "utf8");

describe("Le email della firma", () => {
  it("invito: un solo bottone, riepilogo, testo dell'ufficio ripulito, risposte all'azienda", () => {
    const e = m.emailInvitoFirma(marchio, {
      nome: "Mario <b>Rossi</b>", documento: "Preventivo OFF-1", oggetto: "Bagno", importo: 1220,
      scadenza: "2026-11-21T10:00:00Z", link: "https://app.example.it/firma-fea/abc", messaggio: "Salve <script>alert(1)</script>\nA presto",
    });
    expect(e.subject).toBe("Preventivo OFF-1 da firmare — Rossi Serramenti");
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).not.toContain("<b>Rossi</b>");
    expect(e.html).toContain("Leggi e firma");
    expect(e.html).toContain("#0F766E");
    expect(e.html).toMatch(/1\.?220,00/);
    expect(e.html).toContain("info@rossi.it");
    expect(e.replyTo).toBe("info@rossi.it");
    expect(e.text).toContain("https://app.example.it/firma-fea/abc");
  });

  it("nessuna email parla di OTP e tutte danno del lei", () => {
    const tutte = [
      m.emailInvitoFirma(marchio, { nome: "Mario", documento: "Preventivo OFF-1", scadenza: new Date(), link: "https://x" }),
      m.emailCodiceFirma(marchio, { nome: "Mario", codice: "123456", link: "https://x" }),
      m.emailCopiaFirmata(marchio, { nome: "Mario", documento: "Preventivo OFF-1", firmatoIl: "2026-10-22T08:25:45Z", codiceVerifica: "54C8-FFE2-DE57", linkVerifica: "https://x/verifica-firma?codice=54C8-FFE2-DE57", conPdf: true }),
      m.emailCondizioniFirma(marchio, { nome: "Mario", accettataIl: "2026-10-22T08:25:45Z", testo: "1. Condizione", versione: "2026-10-22", hash: "abc" }),
      m.emailPreventivoPdf(marchio, { nome: "Mario", numero: "OFF-1" }),
    ];
    for (const e of tutte) {
      expect(`${e.subject} ${e.html} ${e.text}`, e.subject).not.toMatch(/OTP/);
      expect(`${e.html} ${e.text}`, e.subject).not.toMatch(/\b(il tuo|hai firmato|hai accettato|Ignora questa)\b/);
    }
  });

  it("codice: grande, con la durata e cosa fare se non l'ha chiesto", () => {
    const e = m.emailCodiceFirma(marchio, { nome: "Mario", codice: "592162", link: "https://x" });
    expect(e.subject).toBe("592162 è il suo codice per firmare — Rossi Serramenti");
    expect(e.html).toContain("5&nbsp;9&nbsp;2&nbsp;1&nbsp;6&nbsp;2");
    expect(e.html).toContain("10 minuti");
    expect(e.html).toContain("Non ha chiesto lei di firmare?");
  });

  it("copia firmata: oggetto col documento, codice di verifica e link per controllarlo", () => {
    const e = m.emailCopiaFirmata(marchio, { nome: "Mario", documento: "Preventivo OFF-1", firmatoIl: "2026-10-22T08:25:45Z", codiceVerifica: "54C8-FFE2-DE57", linkVerifica: "https://x/verifica-firma?codice=54C8-FFE2-DE57", conPdf: true });
    expect(e.subject).toBe("Preventivo OFF-1 firmato — Rossi Serramenti");
    expect(e.html).toContain("54C8-FFE2-DE57");
    expect(e.html).toContain("Verifica il documento");
  });

  it("all'invio parte solo l'invito: il codice lo manda la pagina quando chi firma lo chiede", () => {
    for (const f of ["send-quote-signature", "fea-richiedi-firma"]) {
      const sorgente = leggi(`supabase/functions/${f}/index.ts`);
      expect(sorgente, f).not.toContain("/functions/v1/fea-genera-otp");
      expect(sorgente, f).toContain("emailInvitoFirma(");
    }
    expect(leggi("supabase/functions/fea-genera-otp/index.ts")).toContain("emailCodiceFirma(");
    expect(leggi("supabase/functions/fea-completa-firma/index.ts")).toContain("emailCopiaFirmata(");
    expect(leggi("supabase/functions/fea-identifica/index.ts")).toContain("emailCondizioniFirma(");
  });
});
