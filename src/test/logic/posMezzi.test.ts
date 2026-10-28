import { describe, expect, it } from "vitest";
import {
  normalizzaMezzoFonte,
  normalizzaSceltaMezzo,
  erroriSceltaMezzo,
  chiaveFonteMezzo,
  etichettaFonteMezzo,
  supportaMezziPos,
} from "../../../supabase/functions/_shared/posMezzi";
import {
  normalizzaTecnicaPos,
  tecnicaPosRiutilizzabile,
  invalidaRiesameTecnico,
} from "../../../supabase/functions/_shared/posTecnica";
import {
  normalizzaPos,
  posVuoto,
  lavorazioneVuota,
  vociMancanti,
} from "../../../supabase/functions/_shared/posModello";
const id = "11111111-1111-4111-8111-111111111111";
const fonte = () =>
  normalizzaMezzoFonte({
    mezzo_id: id,
    fonte_tipo: "assegnazione",
    fonte_id: "22222222-2222-4222-8222-222222222222",
    order_id: id,
    nome: "TEST Trapano",
    stato: "in_servizio",
    gestione: "singola",
    quantita: "1",
    dal: "2026-11-01",
    al: "2026-11-30",
    impronta: "a".repeat(64),
  });
const scelta = () =>
  normalizzaSceltaMezzo({
    modalita: "inventario",
    fonte: fonte(),
    utilizzo_dal: "2026-11-02",
    utilizzo_al: "2026-11-20",
    quantita_usata: 1,
    confermata: true,
  });
const errori = (v = scelta()) =>
  erroriSceltaMezzo(v, "2026-11-01", "2026-11-30", id);
describe("Identità attrezzature POS", () => {
  it("conserva quantità decimali come stringa della fonte ed esclude costi, note e profili", () => {
    const f = normalizzaMezzoFonte({
      ...fonte(),
      quantita: "123.4500",
      valore_acquisto: 999,
      file_path: "privato",
      assegnato_hr_profilo_id: "persona",
      note: "riservato",
    });
    expect(f.quantita).toBe("123.4500");
    expect(JSON.stringify(f)).not.toMatch(/999|privato|persona|riservato/);
    expect(
      normalizzaSceltaMezzo({ confermata: "true", quantita_usata: Infinity }),
    ).toMatchObject({ confermata: false, quantita_usata: null });
  });
  it("non unisce omonimi o due assegnazioni dello stesso mezzo", () => {
    const a = fonte(),
      b = { ...a, mezzo_id: "33333333-3333-4333-8333-333333333333" },
      c = { ...a, fonte_id: b.mezzo_id };
    expect(new Set([a, b, c].map(chiaveFonteMezzo)).size).toBe(3);
    expect(etichettaFonteMezzo(a)).toContain(a.mezzo_id);
    expect(etichettaFonteMezzo(b)).toContain(b.mezzo_id);
  });
  it("le date vuote richiedono compilazione senza essere indicate come fuori periodo", () => {
    const esito = errori({ ...scelta(), utilizzo_dal: "", utilizzo_al: "" });
    expect(esito.join()).toContain("intervallo d’uso valido");
    expect(esito.join()).not.toContain("fuori dal periodo");
  });
  it("accetta l’uso coperto con identità confermata e commessa corretta", () =>
    expect(errori()).toEqual([]));
  it("non consente quantità frazionarie per un’attrezzatura singola", () => {
    expect(errori({ ...scelta(), quantita_usata: 0.5 }).join()).toContain(
      "deve essere uno",
    );
    expect(errori({ ...scelta(), quantita_usata: NaN }).join()).toContain(
      "quantità effettivamente",
    );
  });
  it("consente quantità decimali allocate, senza superare la disponibilità registrata", () => {
    const v = scelta();
    v.fonte = {
      ...fonte(),
      fonte_tipo: "allocazione",
      gestione: "quantita",
      quantita: "2.5",
    };
    v.quantita_usata = 2.5;
    expect(errori(v)).toEqual([]);
    v.quantita_usata = 2.6;
    expect(errori(v).join()).toContain("superiore");
  });
  it("rifiuta date impossibili, inversioni, uso oltre assegnazione o POS", () => {
    for (const patch of [
      { utilizzo_dal: "2026-11-31" },
      { utilizzo_al: "2026-11-01" },
      { utilizzo_al: "2026-12-01" },
    ])
      expect(errori({ ...scelta(), ...patch }).length).toBeGreaterThan(0);
    expect(
      errori({ ...scelta(), fonte: { ...fonte(), dal: "2026-11-10" } }).join(),
    ).toContain("non copre");
  });
  it("rifiuta altre commesse, stato fermo, conferma assente e impronte non valide", () => {
    for (const v of [
      { ...scelta(), confermata: false },
      { ...scelta(), fonte: { ...fonte(), order_id: "altro" } },
      { ...scelta(), fonte: { ...fonte(), stato: "fuori_servizio" } },
      { ...scelta(), fonte: { ...fonte(), impronta: "mancante" } },
    ])
      expect(errori(v).length).toBeGreaterThan(0);
  });
  it("la collocazione corrente non inventa un periodo storico", () => {
    const v = scelta();
    v.fonte = { ...fonte(), fonte_tipo: "corrente", dal: null, al: null };
    expect(etichettaFonteMezzo(v.fonte)).toContain("senza storico");
    expect(v.fonte.dal).toBeNull();
    expect(errori(v)).toEqual([]);
  });
  it("richiede motivazione e rimozione esplicita della fonte per l’attrezzatura non censita", () => {
    const v = { ...scelta(), modalita: "non_censita" as const };
    expect(errori(v).length).toBe(2);
    expect(
      errori({
        ...v,
        fonte: null,
        motivazione: "TEST Fornita dal subappaltatore, titolare nella scheda",
      }),
    ).toEqual([]);
  });
  it("riuso e standard cancellano identità, impiego e conferma del cantiere precedente", () => {
    const t = normalizzaTecnicaPos({
      attrezzature: [{ id: "a", anagrafica: scelta() }],
    });
    expect(t.attrezzature[0].anagrafica?.fonte?.mezzo_id).toBe(id);
    expect(tecnicaPosRiutilizzabile(t).attrezzature[0].anagrafica).toEqual(
      normalizzaSceltaMezzo(null),
    );
  });
  it("le modifiche di identità o periodo annullano il riesame tecnico", () => {
    const p = posVuoto();
    p.versione_tecnica = 1;
    p.versione_mezzi = 1;
    p.lavorazioni = [
      {
        ...lavorazioneVuota("l"),
        tecnica: normalizzaTecnicaPos({
          riesaminata: true,
          attrezzature: [{ id: "a", anagrafica: scelta() }],
        }),
      },
    ];
    const dopo = normalizzaPos(p);
    dopo.lavorazioni[0].tecnica!.attrezzature[0].anagrafica!.utilizzo_al =
      "2026-11-21";
    invalidaRiesameTecnico(p, dopo);
    expect(dopo.lavorazioni[0].tecnica!.riesaminata).toBe(false);
  });
  it("il protocollo è esplicito e una nuova attrezzatura senza identità compare fra le mancanze", () => {
    expect(
      supportaMezziPos({ versione_client: 2, versione_tecnica_client: 1 }),
    ).toBe(false);
    expect(
      supportaMezziPos({
        versione_client: 2,
        versione_tecnica_client: 1,
        versione_mezzi_client: 1,
      }),
    ).toBe(true);
    const p = posVuoto();
    p.versione_mezzi = 1;
    p.lavorazioni = [
      {
        ...lavorazioneVuota("l"),
        tecnica: normalizzaTecnicaPos({
          attrezzature: [{ id: "a", nome: "TEST" }],
        }),
      },
    ];
    expect(JSON.stringify(vociMancanti(p))).toContain(
      "identifica l’attrezzatura",
    );
    delete p.versione_mezzi;
    expect(JSON.stringify(vociMancanti(p))).not.toContain(
      "identifica l’attrezzatura",
    );
  });
});
