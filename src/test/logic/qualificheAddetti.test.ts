import { describe, it, expect } from "vitest";
import {
  qualificaVuota,
  erroreQualifica,
  statoQualifica,
  ultimeQualifiche,
  type QualificaAddetto,
} from "@/lib/sicurezza/qualificheAddetti";
const dati = () => ({
  ...qualificaVuota(),
  titolo: "PLE",
  ambito: "PLE con stabilizzatori",
  ente: "Ente TEST",
  validita_dal: "2026-11-01",
  validita_al: "2027-10-31",
  conferma_lettura: true,
});
const r = (patch: Partial<QualificaAddetto> = {}): QualificaAddetto => ({
  id: "1",
  famiglia_id: "fam",
  versione: 1,
  precedente_id: null,
  stato: "riesaminata",
  dati: dati(),
  motivo: "",
  fonte_id: "doc",
  fonte_impronta: "a".repeat(64),
  fonte_corrente: true,
  registrato_da: "autore",
  registrato_il: "2026-11-01T09:00:00Z",
  ...patch,
});
describe("Qualifiche documentali nominative", () => {
  it("non considera il solo titolo una qualifica riesaminata", () => {
    expect(
      erroreQualifica({ ...qualificaVuota(), titolo: "PLE" }),
    ).toBeTruthy();
    expect(erroreQualifica({ ...dati(), conferma_lettura: false })).toContain(
      "conferma",
    );
  });
  it("accetta ambito e date espliciti senza inventare periodicità", () => {
    expect(erroreQualifica(dati())).toBeNull();
    expect(
      erroreQualifica({
        ...dati(),
        validita_al: "",
        motivazione_senza_scadenza:
          "L’originale non indica una scadenza, da riesaminare sul caso",
      }),
    ).toBeNull();
  });
  it.each(["2026-02-30", "2027-02-29", "2026-13-01", ""])(
    "rifiuta la decorrenza non valida %s",
    (v) => {
      expect(erroreQualifica({ ...dati(), validita_dal: v })).toBeTruthy();
    },
  );
  it("richiede una motivazione senza scadenza e ne impedisce una contraddittoria", () => {
    expect(erroreQualifica({ ...dati(), validita_al: "" })).toBeTruthy();
    expect(
      erroreQualifica({
        ...dati(),
        motivazione_senza_scadenza: "Senza scadenza",
      }),
    ).toBeTruthy();
  });
  it("distingue scadenza prima e durante il periodo richiesto", () => {
    expect(statoQualifica(r(), "2027-11-01")).toContain("Scaduta prima");
    expect(statoQualifica(r(), "2027-10-30", "2027-11-01")).toContain(
      "Scade durante",
    );
  });
  it("non promuove a idoneità una compatibilità di date", () => {
    expect(statoQualifica(r(), "2027-01-01")).toBe(
      "Date compatibili con il periodo: pertinenza da verificare",
    );
  });
  it("non ignora una fonte cambiata o una revoca anche con date future", () => {
    expect(
      statoQualifica(r({ fonte_corrente: false }), "2027-01-01"),
    ).toContain("da riesaminare");
    expect(statoQualifica(r({ stato: "revocata" }), "2027-01-01")).toBe(
      "Revocata",
    );
  });
  it("usa la versione della stessa famiglia senza unire omonimi o titoli", () => {
    const a = r(),
      b = r({ id: "2", versione: 2, stato: "revocata" }),
      c = r({ id: "3", famiglia_id: "altra" });
    expect(ultimeQualifiche([b, c, a])).toEqual([b, c]);
  });
  it("segnala decorrenza successiva e periodo invertito", () => {
    expect(statoQualifica(r(), "2026-10-31")).toContain(
      "Decorrenza successiva",
    );
    expect(statoQualifica(r(), "2027-02-01", "2027-01-01")).toBe(
      "Periodo da definire",
    );
  });
});
