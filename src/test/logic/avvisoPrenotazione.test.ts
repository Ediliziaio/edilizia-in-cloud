import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * L'email che avvisa di una prenotazione dalla pagina pubblica.
 *
 * Era una riga sola di testo dentro un <p>: «prova prova ha prenotato
 * "Consulenza marketing edile" per giovedì 10 settembre 2026 alle 09:00 (email
 * … · tel …). Note: …». Sul telefono andava riletta due volte per capire chi,
 * quando e come richiamarlo, e l'oggetto diceva solo la data — in una lista di
 * posta non si capiva nemmeno di chi fosse.
 */
describe("L'avviso di prenotazione al titolare", () => {
  const funzione = leggi("supabase/functions/public-booking-crea/index.ts");
  const pezzi = leggi("supabase/functions/_shared/appuntamentiPubblici.ts");

  it("nell'oggetto c'è chi ha prenotato, non solo quando", () => {
    expect(funzione).toContain("subject: `Nuovo appuntamento: ${titolo} — ${dataBreve(data, ora)}`");
    // Forma corta: sul telefono si leggono i primi quaranta caratteri.
    expect(pezzi).toContain("export function dataBreve");
  });

  it("i contatti si toccano per chiamare o scrivere", () => {
    expect(pezzi).toContain('href="mailto:');
    expect(pezzi).toContain('href="tel:');
    expect(funzione).toContain("blocchettoContatti(email || null, telefono || null)");
  });

  it("le note restano leggibili, a capo compresi", () => {
    expect(pezzi).toContain("white-space:pre-wrap");
  });

  it("il pulsante porta al gestionale, non al sito da cui arriva la prenotazione", () => {
    // Con il calendario incorporato su marketingedile.com, `origine` è il
    // dominio del cliente: un link costruito da lì non porta da nessuna parte.
    expect(funzione).toContain("https://admin.ediliziaincloud.com/admin/marketing/calendario");
    expect(funzione).toContain("https://app.ediliziaincloud.com/azienda/marketing/calendario");
  });

  it("il file per il calendario solo a chi non ha un calendario collegato", () => {
    // Agli altri l'appuntamento è già arrivato: aprire l'allegato creerebbe un
    // doppione.
    expect(funzione).toContain("!(await giaSuCalendarioEsterno(admin, creato.id))");
  });

  it("rispondere all'avviso scrive a chi ha prenotato", () => {
    expect(funzione).toContain("replyTo: email || undefined");
  });
});

describe("Il mittente non si presenta due volte", () => {
  const mittente = leggi("supabase/functions/_shared/resolveSender.ts");

  it("«EdiliziaInCloud via EdiliziaInCloud» diventa «EdiliziaInCloud»", () => {
    // Il suffisso serve quando a scrivere è un'azienda cliente dal dominio di
    // EiC («Ke Bei Serramenti via EdiliziaInCloud»); quando il mittente è già
    // la piattaforma, ripeterlo fa solo brutta figura.
    expect(mittente).toContain("piattaformaNelSuffisso");
    expect(mittente).toContain("? senderName");
  });
});
