import { describe, expect, it } from "vitest";
import { payloadAnagrafica, problemiNuovoCliente, snapshotDaForm } from "@/lib/fatturazione/clienteAnagrafica";
import { datiClienteMancanti } from "@/lib/fatturazione/clienteSnapshot";

const indirizzo = { indirizzo_via: "Via Roma 1", indirizzo_cap: "31100", indirizzo_comune: "Treviso", indirizzo_provincia: "tv" };

describe("nuovo cliente dall'editor", () => {
  it("privato completo: nessun problema, snapshot pronta per l'invio", () => {
    const form = { tipo: "B2C" as const, nome: " Mario ", cognome: "Rossi", codiceFiscale: "rssmra80a01h501u", ...indirizzo };
    expect(problemiNuovoCliente(form)).toEqual([]);
    const snap = snapshotDaForm(form);
    expect(snap).toMatchObject({ nome: "Mario", cognome: "Rossi", ragione_sociale: "Mario Rossi", codice_fiscale: "RSSMRA80A01H501U", indirizzo_provincia: "TV" });
    expect(datiClienteMancanti(snap)).toEqual([]);
  });

  it("privato: dice cosa manca", () => {
    expect(problemiNuovoCliente({ tipo: "B2C", nome: "Mario" })).toEqual(
      expect.arrayContaining(["il cognome", "il codice fiscale", "l'indirizzo", "il comune", "il CAP (5 cifre)"]),
    );
  });

  it("azienda: partita IVA con spazi accettata e ripulita; sbagliata rifiutata", () => {
    const ok = { tipo: "B2B" as const, ragioneSociale: "Rossi Srl", partitaIva: " 01234 567897 ", ...indirizzo };
    expect(problemiNuovoCliente(ok)).toEqual([]);
    expect(snapshotDaForm(ok).partita_iva).toBe("01234567897");
    expect(problemiNuovoCliente({ ...ok, partitaIva: "01234567890" }).join(" ")).toMatch(/partita IVA/);
  });

  it("azienda senza P.IVA né CF, ente PA senza codice a 6 caratteri", () => {
    expect(problemiNuovoCliente({ tipo: "B2B", ragioneSociale: "X", ...indirizzo })).toContain("la partita IVA o il codice fiscale");
    expect(problemiNuovoCliente({ tipo: "PA", ragioneSociale: "Comune", codiceFiscale: "80007010261", codiceSdi: "ABC", ...indirizzo })).toContain("il codice univoco ufficio (6 caratteri)");
  });

  it("estero: il CAP non è obbligatorio", () => {
    expect(problemiNuovoCliente({ tipo: "B2B", ragioneSociale: "Gmbh", partitaIva: "", codiceFiscale: "DE123", indirizzo_nazione: "de", indirizzo_via: "Str 1", indirizzo_comune: "Berlin" })
      .some((x) => /CAP/.test(x))).toBe(false);
  });

  it("riga di anagrafica: privato con nome e cognome, tipo soggetto fisico, niente stringhe vuote", () => {
    const riga = payloadAnagrafica(snapshotDaForm({ tipo: "B2C", nome: "Mario", cognome: "Rossi", codiceFiscale: "RSSMRA80A01H501U", ...indirizzo }));
    expect(riga).toMatchObject({ tipo_soggetto: "fisico", tipo_cliente: "B2C", nome: "Mario", cognome: "Rossi", partita_iva: null, codice_sdi: null, pec: null });
    expect(Object.values(riga)).not.toContain("");
  });
});
