/**
 * «Email ricevuta da un contatto» (20/09/2026): l'innesco che mancava alle
 * automazioni. Le risposte alle email entravano nella posta e in
 * Conversazioni, ma nessuno veniva avvisato.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  anteprimaMessaggio,
  emailDaSegnalare,
  emettiEmailRicevuta,
  indirizzoPerIlike,
  type EmailRicevutaDati,
} from "../../../supabase/functions/_shared/emailRicevutaEvento";

const ROOT = join(__dirname, "../../..");
const ADESSO = new Date("2026-09-20T10:00:00Z");
const unOraFa = "2026-09-20T09:00:00Z";

describe("emailDaSegnalare", () => {
  const base = { cartella: "inbox", ricevutaIl: unOraFa, mittente: "mario@impresarossi.it", casella: "info@ediliziaincloud.com", adesso: ADESSO };

  it("una risposta appena arrivata da una persona", () => {
    expect(emailDaSegnalare(base)).toBe(true);
  });

  it("la posta inviata e le altre cartelle no", () => {
    expect(emailDaSegnalare({ ...base, cartella: "sent" })).toBe(false);
  });

  it("la posta vecchia di una casella appena collegata no", () => {
    expect(emailDaSegnalare({ ...base, ricevutaIl: "2026-09-17T09:00:00Z" })).toBe(false);
    expect(emailDaSegnalare({ ...base, ricevutaIl: "2026-09-18T10:30:00Z" })).toBe(true); // 47 ore e mezza
  });

  it("una data nel futuro o illeggibile no", () => {
    expect(emailDaSegnalare({ ...base, ricevutaIl: "2026-09-21T10:00:00Z" })).toBe(false);
    expect(emailDaSegnalare({ ...base, ricevutaIl: "boh" })).toBe(false);
    expect(emailDaSegnalare({ ...base, ricevutaIl: null })).toBe(false);
  });

  it("i mittenti automatici no", () => {
    for (const m of ["MAILER-DAEMON@googlemail.com", "postmaster@outlook.com", "no-reply@stripe.com", "noreply@github.com", "bounce-123@mail.example.com", "notifiche@banca.it"]) {
      expect(emailDaSegnalare({ ...base, mittente: m })).toBe(false);
    }
  });

  it("la casella che scrive a se stessa no, un indirizzo vuoto nemmeno", () => {
    expect(emailDaSegnalare({ ...base, mittente: "INFO@ediliziaincloud.com" })).toBe(false);
    expect(emailDaSegnalare({ ...base, mittente: "" })).toBe(false);
    expect(emailDaSegnalare({ ...base, mittente: "(sconosciuto)" })).toBe(false);
  });
});

describe("anteprimaMessaggio", () => {
  it("tiene la riga nuova e lascia fuori l'email citata", () => {
    const testo = "Giovedì alle 18:30 va bene.\nGrazie\n\nIl giorno ven 18 set 2026 alle ore 08:31 Flo <info@ediliziaincloud.com> ha scritto:\n> Ciao Mario,\n> Quando ti chiamo?";
    expect(anteprimaMessaggio(testo, null)).toBe("Giovedì alle 18:30 va bene.\nGrazie");
  });

  it("riconosce anche le citazioni in inglese e i messaggi inoltrati", () => {
    expect(anteprimaMessaggio("Ok, sentiamoci.\nOn Fri, Sep 18, 2026 at 8:31 AM Flo wrote:\n> ciao", null)).toBe("Ok, sentiamoci.");
    expect(anteprimaMessaggio("Vedi sotto\n-----Original Message-----\nFrom: x@y.it", null)).toBe("Vedi sotto");
  });

  it("senza testo semplice legge l'HTML, senza la citazione", () => {
    const html = "<div>Il numero è <b>12</b>.</div><div><br></div><blockquote>Ciao Mario, rispondi con un numero</blockquote>";
    expect(anteprimaMessaggio("", html)).toBe("Il numero è 12 .");
  });

  it("taglia i messaggi lunghi su una parola intera", () => {
    const lungo = Array.from({ length: 200 }, (_, i) => `parola${i}`).join(" ");
    const a = anteprimaMessaggio(lungo, null, 100);
    expect(a.length).toBeLessThanOrEqual(101);
    expect(a.endsWith("…")).toBe(true);
    // Il taglio cade fra due parole: quello che resta è l'inizio del testo,
    // e subito dopo nel testo c'è uno spazio.
    const tenuto = a.slice(0, -1);
    expect(lungo.startsWith(tenuto)).toBe(true);
    expect(lungo[tenuto.length]).toBe(" ");
  });

  it("niente testo, niente anteprima", () => {
    expect(anteprimaMessaggio(null, null)).toBe("");
  });
});

describe("indirizzoPerIlike", () => {
  it("i caratteri jolly dell'indirizzo restano caratteri", () => {
    expect(indirizzoPerIlike(" mario_rossi%1@impresa.it ")).toBe("mario\\_rossi\\%1@impresa.it");
  });
});

describe("emettiEmailRicevuta", () => {
  /** Un finto client: risponde alla ricerca del contatto e registra gli inserimenti. */
  function finto(contattoTrovato: string | null) {
    const inseriti: Array<Record<string, unknown>> = [];
    const ricerche: string[] = [];
    const admin = {
      from(tabella: string) {
        if (tabella === "marketing_contacts") {
          const q = {
            select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => q,
            ilike: (_c: string, v: string) => { ricerche.push(v); return q; },
            maybeSingle: async () => ({ data: contattoTrovato ? { id: contattoTrovato } : null }),
          };
          return q;
        }
        return {
          insert: async (riga: Record<string, unknown>): Promise<{ error: { message: string } | null }> => {
            inseriti.push(riga);
            return { error: null };
          },
        };
      },
    };
    return { admin, inseriti, ricerche };
  }
  const dati: EmailRicevutaDati = {
    companyId: "00000000-0000-0000-0000-000000000001", fromEmail: "Mario@ImpresaRossi.it", subject: "Re: Quando ti chiamo?",
    testo: "Giovedì alle 18:30.\n> Ciao Mario", html: null, ricevutaIl: new Date().toISOString(), casella: "info@ediliziaincloud.com", emailInboxId: "e1",
  };

  it("contatto del CRM: scrive l'evento con il testo pulito", async () => {
    const f = finto("c1");
    expect(await emettiEmailRicevuta(f.admin, dati)).toBe(true);
    expect(f.ricerche).toEqual(["Mario@ImpresaRossi.it"]);
    expect(f.inseriti).toHaveLength(1);
    expect(f.inseriti[0]).toMatchObject({
      trigger_event: "email_received", entity_id: "c1", entity_type: "contact",
      payload: { from: "mario@impresarossi.it", subject: "Re: Quando ti chiamo?", message: "Giovedì alle 18:30.", channel: "email", email_inbox_id: "e1" },
    });
  });

  it("uno sconosciuto non fa scattare niente", async () => {
    const f = finto(null);
    expect(await emettiEmailRicevuta(f.admin, dati)).toBe(false);
    expect(f.inseriti).toHaveLength(0);
  });

  it("col contatto già noto (indirizzo di risposta) non lo cerca", async () => {
    const f = finto(null);
    expect(await emettiEmailRicevuta(f.admin, { ...dati, contactId: "c9" })).toBe(true);
    expect(f.ricerche).toHaveLength(0);
    expect(f.inseriti[0]).toMatchObject({ entity_id: "c9" });
  });

  it("la posta vecchia non scrive eventi, e un errore non si propaga", async () => {
    const f = finto("c1");
    expect(await emettiEmailRicevuta(f.admin, { ...dati, ricevutaIl: "2026-01-01T00:00:00Z" })).toBe(false);
    const rotto = { from() { throw new Error("giù"); } };
    expect(await emettiEmailRicevuta(rotto, dati)).toBe(false);
  });
});

describe("le due strade della posta emettono l'evento", () => {
  const leggi = (p: string) => readFileSync(join(ROOT, p), "utf8");

  it("la posta delle caselle collegate, solo per le email nuove", () => {
    const poller = leggi("supabase/functions/email-poll-inbox/index.ts");
    expect(poller).toContain('import { emettiEmailRicevuta } from "../_shared/emailRicevutaEvento.ts";');
    expect(poller).toContain("await emettiEmailRicevuta(supa, {");
    // Dopo l'inserimento, non nel ramo che aggiorna un'email già salvata.
    expect(poller.indexOf("await emettiEmailRicevuta(supa, {")).toBeGreaterThan(poller.indexOf(".insert(insertPayload)"));
  });

  it("l'indirizzo di risposta delle email marketing, col contatto certo", () => {
    const inbound = leggi("supabase/functions/email-inbound-reply/index.ts");
    expect(inbound).toContain("await emettiEmailRicevuta(admin, {");
    expect(inbound).toContain("contactId: route.contact_id,");
  });

  it("il motore e il builder conoscono l'innesco", () => {
    expect(leggi("supabase/functions/process-automation/index.ts")).toContain('email_ricevuta: "email_received",');
    expect(leggi("src/lib/flow-node-catalog.ts")).toContain("id: 'email_ricevuta',");
    expect(leggi("src/components/flow-builder/nodes/nodeIcons.ts")).toContain("email_ricevuta: Mail,");
  });
});
