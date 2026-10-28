import { describe, it, expect } from "vitest";
import {
  preparaRiscontri,
  motivoQualifica,
  cambiaRiscontro,
  erroreRiesame,
  requisitoPerAddetti,
  type QuadroAddetti,
  type PersonaRequisiti,
  type QualificaContesto,
  type DatiRiesameAddetti,
} from "@/lib/sicurezza/requisitiAddetti";
import { qualificaVuota } from "@/lib/sicurezza/qualificheAddetti";
const persona = (
  id = "h1",
  tipo: "hr" | "esterno" = "hr",
): PersonaRequisiti => ({
  id,
  tipo,
  nome: "TEST",
  cognome: "Omonimo",
  mansione: "TEST",
  attivo: true,
  periodi: [
    {
      fonte: "commessa",
      fonte_id: "a1",
      fase_id: null,
      dal: "2026-11-10",
      al: "2026-11-15",
      senza_date: true,
    },
  ],
});
const qualifica = (
  id = "q1",
  persona_id = "h1",
  persona_tipo: "hr" | "esterno" = "hr",
): QualificaContesto => ({
  id,
  persona_id,
  persona_tipo,
  famiglia_id: id,
  versione: 1,
  stato: "riesaminata",
  fonte_corrente: true,
  fonte_impronta: "a".repeat(64),
  contesto_originale: { order_id: null, fase_id: null, dal: null, al: null },
  dati: {
    ...qualificaVuota(),
    titolo: "TEST PLE",
    ambito: "TEST piattaforma",
    ente: "Ente TEST",
    validita_dal: "2026-11-01",
    validita_al: "2027-10-31",
    conferma_lettura: true,
  },
});
const quadro = (): QuadroAddetti => ({
  company_id: "c",
  order_id: "o",
  dal: "2026-11-10",
  al: "2026-11-15",
  fase_id: "f",
  impronta: "a".repeat(64),
  persone: [persona(), persona("e1", "esterno")],
  qualifiche: [qualifica(), qualifica("q2", "e1", "esterno")],
  da_collegare: [],
});
const requisiti = [
  { profilo_id: "p1", requisito_id: "r1" },
  { profilo_id: "p1", requisito_id: "r2" },
];
const dati = (): DatiRiesameAddetti => ({
  attivita: "TEST posa",
  responsabile: "TEST referente",
  ruolo_responsabile: "TEST ruolo",
  requisiti,
  righe: preparaRiscontri(quadro(), requisiti),
  requisiti_definiti: false,
  conferma_assegnazioni: false,
  attrezzatura: null,
});
describe("Requisiti nominativi nel contesto", () => {
  it("prepara tutte le combinazioni senza unire omonimi o abbinare attestati dal titolo", () => {
    const r = preparaRiscontri(quadro(), requisiti);
    expect(r).toHaveLength(4);
    expect(
      r.every(
        (x) =>
          x.esito === "da_verificare" &&
          !x.confermata &&
          x.qualifica_id === null,
      ),
    ).toBe(true);
    expect(
      new Set(r.map((x) => x.persona_tipo + ":" + x.persona_id)).size,
    ).toBe(2);
  });
  it("limita la matrice senza troncamenti silenziosi", () => {
    const q = quadro();
    q.persone = Array.from({ length: 100 }, (_, i) => persona(String(i)));
    expect(() =>
      preparaRiscontri(
        q,
        Array.from({ length: 6 }, (_, i) => ({
          profilo_id: "p",
          requisito_id: String(i),
        })),
      ),
    ).toThrow("500");
    expect(() => preparaRiscontri(q, [])).toThrow();
  });
  it("rifiuta requisiti duplicati", () =>
    expect(() =>
      preparaRiscontri(quadro(), [requisiti[0], requisiti[0]]),
    ).toThrow("duplicati"));
  it("non tratta un criterio aziendale del catalogo come requisito di un addetto", () => {
    expect(
      requisitoPerAddetti({
        id: "x",
        titolo: "DURC",
        catalogo_id: "durc",
        catalogo_versione: 1,
        riferimento: "",
        indicazioni: "",
      }),
    ).toBe(false);
    expect(
      requisitoPerAddetti({
        id: "x",
        titolo: "TEST criterio specifico",
        catalogo_id: null,
        catalogo_versione: null,
        riferimento: "",
        indicazioni: "",
      }),
    ).toBe(true);
  });
  it("non usa la qualifica di un omonimo", () => {
    expect(
      motivoQualifica(
        quadro(),
        persona(),
        qualifica("q", "e1", "esterno"),
        true,
      ),
    ).toContain("altro addetto");
  });
  it.each(["revocata", "fonte"])(
    "non considera utilizzabile una evidenza %s",
    (v) => {
      const q = qualifica();
      if (v === "revocata") q.stato = "revocata";
      else q.fonte_corrente = false;
      expect(motivoQualifica(quadro(), persona(), q, true)).toBeTruthy();
    },
  );
  it("controlla l’intero periodo assegnato, non solo il primo giorno", () => {
    const q = qualifica();
    q.dati.validita_al = "2026-11-12";
    expect(motivoQualifica(quadro(), persona(), q, true)).toContain("periodo");
  });
  it("considera il periodo effettivo dell’addetto nella finestra selezionata", () => {
    const p = persona();
    p.periodi[0] = { ...p.periodi[0], dal: "2026-11-12", al: "2026-11-13" };
    const q = qualifica();
    q.dati.validita_dal = "2026-11-12";
    q.dati.validita_al = "2026-11-13";
    expect(motivoQualifica(quadro(), p, q, true)).toBeNull();
  });
  it("una fonte senza date richiede dichiarazione esplicita del periodo", () => {
    expect(motivoQualifica(quadro(), persona(), qualifica(), false)).toContain(
      "confermare",
    );
  });
  it("impedisce il riuso di un originale vincolato a un altro cantiere", () => {
    const q = qualifica();
    q.contesto_originale.order_id = "altro";
    expect(motivoQualifica(quadro(), persona(), q, true)).toContain(
      "altro cantiere",
    );
  });
  it("distingue il vincolo di fase dal periodo generale", () => {
    const q = qualifica();
    q.contesto_originale.fase_id = "altra";
    expect(motivoQualifica(quadro(), persona(), q, true)).toBeTruthy();
    const p = persona();
    p.periodi[0].fase_id = "altra";
    const c = quadro();
    c.fase_id = null;
    expect(motivoQualifica(c, p, q, true)).toBeNull();
  });
  it("le modifiche azzerano la conferma e gli esiti aperti rimuovono l’evidenza precedente", () => {
    const r = {
      ...preparaRiscontri(quadro(), requisiti)[0],
      esito: "riesaminata" as const,
      qualifica_id: "q1",
      confermata: true,
      motivazione: "TEST",
    };
    expect(cambiaRiscontro(r, { motivazione: "Modificata" }).confermata).toBe(
      false,
    );
    expect(cambiaRiscontro(r, { esito: "non_applicabile" })).toMatchObject({
      qualifica_id: null,
      confermata: false,
    });
  });
  it("può registrare requisiti ancora da verificare senza affermare la copertura", () => {
    expect(erroreRiesame(quadro(), dati())).toBeNull();
  });
  it("rifiuta omissioni e duplicati di righe", () => {
    const d = dati();
    d.righe.pop();
    expect(erroreRiesame(quadro(), d)).toContain("ogni addetto");
    const d2 = dati();
    d2.righe[1] = d2.righe[0];
    expect(erroreRiesame(quadro(), d2)).toBeTruthy();
  });
  it("richiede una motivazione e una conferma per il riscontro positivo", () => {
    const d = dati();
    d.righe[0] = { ...d.righe[0], esito: "riesaminata", qualifica_id: "q1" };
    expect(erroreRiesame(quadro(), d)).toBeTruthy();
    d.conferma_assegnazioni = true;
    d.righe[0].motivazione = "TEST pertinenza";
    d.righe[0].confermata = true;
    expect(erroreRiesame(quadro(), d)).toBeNull();
  });
  it("una non applicabilità non conserva prove di un vecchio riscontro", () => {
    const d = dati();
    d.righe[0] = {
      ...d.righe[0],
      esito: "non_applicabile",
      confermata: true,
      motivazione: "TEST altro ruolo",
      qualifica_id: "q1",
    };
    expect(erroreRiesame(quadro(), d)).toBeTruthy();
  });
});
