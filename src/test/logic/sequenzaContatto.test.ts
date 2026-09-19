import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  conLinkCliccabili,
  fusoDelFlusso,
  invioEmailDaRimandare,
  numeroWhatsApp,
  schedaAndataAvanti,
  senzaSpazioPrimaDellaVirgola,
} from "../../../supabase/functions/_shared/sequenzaContatto";

// 19/09/2026 — flusso «Download Risorse — PDF Vendita»: 4 email e i WhatsApp
// che Flo manda a mano dal telefono, con la sequenza che si ferma quando
// qualcuno prende in mano il contatto.
describe("sequenza email + WhatsApp a mano", () => {
  it("il numero come lo vuole wa.me", () => {
    expect(numeroWhatsApp("+39 334 888 1520")).toBe("393348881520");
    expect(numeroWhatsApp("3348881520")).toBe("393348881520");
    expect(numeroWhatsApp("0039 334 888 1520")).toBe("393348881520");
    expect(numeroWhatsApp("06 1234 5678")).toBe("0612345678");
    expect(numeroWhatsApp("")).toBe("");
    expect(numeroWhatsApp(null)).toBe("");
  });

  it("nelle notifiche gli indirizzi si toccano, la punteggiatura resta fuori", () => {
    expect(conLinkCliccabili("Chat: https://wa.me/393348881520.")).toBe(
      'Chat: <a href="https://wa.me/393348881520" style="color:#1d4ed8">https://wa.me/393348881520</a>.',
    );
    expect(conLinkCliccabili("Nessun link qui")).toBe("Nessun link qui");
    // Già ripulita per l'HTML: la & resta &amp; anche nel link.
    expect(conLinkCliccabili("https://x.it/?a=1&amp;b=2")).toContain('href="https://x.it/?a=1&amp;b=2"');
  });

  it("«Ciao ,» diventa «Ciao,» quando il nome manca", () => {
    expect(senzaSpazioPrimaDellaVirgola("Ciao ,")).toBe("Ciao,");
    expect(senzaSpazioPrimaDellaVirgola("Ciao Mario,")).toBe("Ciao Mario,");
  });

  it("la scheda spostata a mano ferma la sequenza, la creazione no", () => {
    const posizioni = new Map<string, number | null>([["ha-scaricato", 0], ["contattato", 1], ["perso", 6]]);
    const inizio = "2026-09-19T10:00:00Z";
    // Creata dal flusso nella prima fase: si va avanti.
    expect(schedaAndataAvanti([{ stage_id: "ha-scaricato", entered_at: "2026-09-19T10:00:05Z" }], posizioni, inizio)).toBe(false);
    // Spostata in «Contattato» dopo l'inizio: si ferma.
    expect(schedaAndataAvanti([{ stage_id: "contattato", entered_at: "2026-09-20T09:00:00Z" }], posizioni, inizio)).toBe(true);
    // Anche «Perso» vuol dire che qualcuno ha deciso.
    expect(schedaAndataAvanti([{ stage_id: "perso", entered_at: "2026-09-21T09:00:00Z" }], posizioni, inizio)).toBe(true);
    // Era già in «Contattato» prima della richiesta: la sequenza parte lo stesso.
    expect(schedaAndataAvanti([{ stage_id: "contattato", entered_at: "2026-09-10T09:00:00Z" }], posizioni, inizio)).toBe(false);
  });
});

// 19/09/2026 — Marketing Edile: nurturing → broadcast → riattivazione, per
// sempre. Si esce solo diventando clienti (o togliendosi dalla lista).
describe("una sequenza che non deve fermarsi", () => {
  it("un guasto passeggero del provider rimanda l'email di marketing", () => {
    for (const status of [0, 408, 429, 500, 502, 503, 504]) {
      expect(invioEmailDaRimandare(status, "marketing")).toBe(true);
    }
  });

  it("un indirizzo sbagliato o un permesso negato restano errori", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(invioEmailDaRimandare(status, "marketing")).toBe(false);
    }
  });

  it("le email di servizio non si rimandano: in ritardo sono peggio che niente", () => {
    expect(invioEmailDaRimandare(503, "transactional")).toBe(false);
  });

  it("«Fuso orario Account» e «Contatto» valgono come Roma", () => {
    expect(fusoDelFlusso("account")).toBe("Europe/Rome");
    expect(fusoDelFlusso("contact")).toBe("Europe/Rome");
    expect(fusoDelFlusso("")).toBe("Europe/Rome");
    expect(fusoDelFlusso(null)).toBe("Europe/Rome");
    expect(fusoDelFlusso("Europa/Roma")).toBe("Europe/Rome");
    expect(fusoDelFlusso("Europe/Rome")).toBe("Europe/Rome");
    expect(fusoDelFlusso("America/New_York")).toBe("America/New_York");
  });
});

describe("il motore usa davvero questi pezzi", () => {
  const motore = readFileSync(join(__dirname, "../../../supabase/functions/process-automation/index.ts"), "utf8");
  const invio = readFileSync(join(__dirname, "../../../supabase/functions/email-send/index.ts"), "utf8");

  it("«Interrompi su risposta» guarda anche la scheda spostata", () => {
    expect(motore).toContain("schedaAndataAvanti(righe, posizioni, iscr.created_at)");
    expect(motore).toContain("last_error: `fermata: ${motivo}`");
  });

  it("dalla casella collegata: link per uscire e nome del mittente", () => {
    expect(motore).toContain('html.includes("{{unsubscribe_url}}")');
    expect(motore).toContain("fromName: typeof cfg.from_name");
    expect(motore).toContain("from_name: p.fromName");
    expect(invio).toContain("if (nomeScelto) fromName = nomeScelto;");
  });

  it("l'email rimandata torna in coda, e la finestra oraria usa un fuso vero", () => {
    expect(motore).toContain("if (!result.ok && invioEmailDaRimandare(result.status, stream))");
    expect(motore).toContain("deferMinutes: MINUTI_RINVIO_EMAIL");
    expect(motore).toContain("const tz = fusoDelFlusso(flusso.timezone);");
  });

  it("chi si toglie dalla lista esce come «Fermato», non come errore", () => {
    expect(motore).toContain('fermaIscrizione: "il contatto si è tolto dalla lista email"');
    expect(motore).toContain("if (!result.success && result.fermaIscrizione)");
    expect(motore).toContain('rinviato || result.fermaIscrizione ? "skipped" : "error"');
    // La fermata viene PRIMA del ramo dei tentativi.
    expect(motore.indexOf("if (!result.success && result.fermaIscrizione)"))
      .toBeLessThan(motore.indexOf("// Retry logic"));
  });

  it("notifiche con link toccabili e numero per WhatsApp tra le variabili", () => {
    expect(motore).toContain("conLinkCliccabili(escapeNotif(l))");
    expect(motore).toContain("telefono_whatsapp: numeroWhatsApp(contact?.phone)");
    expect(motore).toContain("html = senzaSpazioPrimaDellaVirgola(html)");
  });
});
