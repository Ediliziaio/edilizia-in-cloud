/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aziendaPerDocumento, COLONNE_ANAGRAFICA, leggiAziendaDocumento } from "../../../supabase/functions/_shared/aziendaDocumento";

const leggi = (f: string) => readFileSync(`supabase/functions/${f}`, "utf8");

describe("intestazione dei documenti", () => {
  it("l'anagrafica vince, campo per campo; il resto viene dalla scheda azienda", () => {
    expect(aziendaPerDocumento(
      { ragione_sociale: "Verdi Srl", indirizzo_via: "Via Po", indirizzo_numero_civico: "3", indirizzo_comune: "Torino", indirizzo_cap: "10100", logo_url: "", colore_primario: "#112233" },
      { name: "Verdi", vat_number: "123", logo_url: "https://x/logo.png", phone: "011", legal_city: "Milano", email: "a@b.it" },
    )).toEqual({
      ragione_sociale: "Verdi Srl", partita_iva: "123", colore_primario: "#112233", logo_url: "https://x/logo.png",
      indirizzo: "Via Po 3", citta: "Torino", cap: "10100", telefono: "011", email: "a@b.it",
    });
  });

  it("senza anagrafica il documento esce con la scheda azienda; senza nessuna delle due no", () => {
    expect(aziendaPerDocumento(null, { name: "Rossi", legal_address: "Via Roma 1", legal_city: "Bari", legal_postal_code: "70100" }))
      .toMatchObject({ ragione_sociale: "Rossi", indirizzo: "Via Roma 1", citta: "Bari", cap: "70100" });
    expect(aziendaPerDocumento(null, null)).toBeNull();
  });

  it("una lettura dell'anagrafica fallita non blocca il documento", async () => {
    const risposta = (t: string) => (t === "companies" ? { data: { name: "Rossi" }, error: null as null } : { data: null as null, error: { message: "rotta" } });
    const db = { from: (t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => risposta(t) }) }) }) };
    expect(await leggiAziendaDocumento(db, "c")).toMatchObject({ ragione_sociale: "Rossi" });
  });

  it("si chiedono solo colonne che la tabella ha, e le tre funzioni passano di qui", () => {
    const vere = "ragione_sociale partita_iva colore_primario logo_url indirizzo_via indirizzo_numero_civico indirizzo_cap indirizzo_comune indirizzo_provincia telefono email".split(" ");
    for (const c of COLONNE_ANAGRAFICA.split(", ")) expect(vere).toContain(c);
    for (const f of ["generate-sal-pdf", "generate-giornale-pdf", "generate-cedolino-pdf"]) {
      const t = leggi(`${f}/index.ts`);
      expect(t).toContain("leggiAziendaDocumento(supabase, company_id)");
      expect(t).not.toContain('from("anagrafica_azienda")');
    }
  });
});

describe("errori di produzione del 02/11", () => {
  it("il percorso di un allegato IMAP non contiene l'ID grezzo del messaggio", () => {
    const t = leggi("email-poll-inbox/index.ts");
    expect(t).not.toMatch(/`\$\{companyId\}\/\$\{providerMessageId\}/);
    expect(t).toContain("percorsoAllegato(companyId, providerMessageId, a.filename)");
    expect(t).toContain("getBucket(ATTACH_BUCKET)");
  });

  it("l'anteprima della conversazione non spezza un'emoji", () => {
    expect(leggi("email-thread-resolver/index.ts")).toContain(".slice(0, 200).toWellFormed()");
  });

  it("il controllo della coda email legge la colonna vera", () => {
    const t = leggi("check-api-health/index.ts");
    expect(t).toContain('.select("scheduled_for, created_at")');
    expect(t).not.toContain("scheduled_at");
  });
});
