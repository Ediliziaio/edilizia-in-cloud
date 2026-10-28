import { describe, it, expect } from "vitest";
import {
  nuovoCriterioItp,
  datiItpPerRegistrazione,
  type DatiVerificaItp,
} from "@/lib/sicurezza/itp";
import {
  avvisiSoggetti,
  cambiaDestinatario,
  destinatarioCriterio,
  evidenzaDelTitolare,
  espandiCopertura,
  operaiNelContesto,
  riallineaSoggetti,
  type SoggettiItp,
} from "@/lib/sicurezza/soggettiItp";
import type { EvidenzaFascicolo } from "@/lib/sicurezza/fascicolo";
const s: SoggettiItp = {
  operai: [
    {
      id: "a",
      nome: "Mario",
      cognome: "A",
      mansione: "Posatore",
      attivo: true,
      updated_at: "t1",
      assegnazioni: [
        {
          id: "ass1",
          dal: "2026-11-01",
          al: "2026-11-30",
          area: null,
          attivita: "Posa",
          fase_id: "posa",
          updated_at: "t1",
        },
      ],
    },
    {
      id: "b",
      nome: "Mario",
      cognome: "B",
      mansione: "Posatore",
      attivo: true,
      updated_at: "t1",
      assegnazioni: [
        {
          id: "ass2",
          dal: "2026-11-01",
          al: "2026-11-30",
          area: null,
          attivita: "Posa",
          fase_id: null,
          updated_at: "t1",
        },
      ],
    },
    {
      id: "c",
      nome: "Mario",
      cognome: "C",
      mansione: "Muratore",
      attivo: true,
      updated_at: "t1",
      assegnazioni: [
        {
          id: "ass3",
          dal: "2026-11-01",
          al: "2026-11-30",
          area: null,
          attivita: "Demolizioni",
          fase_id: "demolizioni",
          updated_at: "t1",
        },
      ],
    },
  ],
  incarichi: [
    {
      id: "i1",
      ruolo: "preposto",
      nominativo: "Preposto A",
      dal: "2026-11-01",
      al: null,
      stato: "documentato",
      figura_id: null,
      subappaltatore_id: "sub",
      order_id: "ordine",
      updated_at: "t1",
    },
    {
      id: "i2",
      ruolo: "preposto",
      nominativo: "Preposto B",
      dal: "2026-11-01",
      al: "2026-11-30",
      stato: "proposto",
      figura_id: null,
      subappaltatore_id: "sub",
      order_id: "ordine",
      updated_at: "t1",
    },
    {
      id: "i3",
      ruolo: "cse",
      nominativo: "CSE",
      dal: "2026-11-01",
      al: null,
      stato: "documentato",
      figura_id: null,
      subappaltatore_id: null,
      order_id: "ordine",
      updated_at: "t1",
    },
  ],
};
const base = () => ({
  ...nuovoCriterioItp(),
  titolo: "Formazione",
  destinatario: "operaio" as const,
  operaio_id: "a",
  applicabilita: "applicabile" as const,
  esito: "conforme" as const,
  note: "Vecchia motivazione",
  evidenze: ["eA"],
});
describe("Copertura nominativa dei requisiti", () => {
  it("il gruppo comprende ogni assegnato nel periodo e nella fase, incluse assegnazioni senza fase specifica", () => {
    expect(operaiNelContesto(s, "2026-11-05", "posa").map((o) => o.id)).toEqual(
      ["a", "b"],
    );
    expect(operaiNelContesto(s, "2026-12-01", "posa")).toEqual([]);
    expect(operaiNelContesto(s, "2026-11-05").map((o) => o.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("estende il criterio senza copiare esiti, motivazioni o file della prima persona", () => {
    const cs = espandiCopertura(base(), s, "2026-11-05", "posa");
    expect(cs.map((c) => c.operaio_id)).toEqual(["a", "b"]);
    expect(new Set(cs.map((c) => c.gruppo_id)).size).toBe(1);
    expect(
      cs.every(
        (c) =>
          c.applicabilita === "da_chiarire" &&
          c.esito === "da_verificare" &&
          c.note === "" &&
          !c.evidenze.length,
      ),
    ).toBe(true);
    expect(new Set(cs.map((c) => c.id)).size).toBe(2);
  });
  it("per i ruoli non omette gli incarichi proposti, che rimangono da valutare", () => {
    const cs = espandiCopertura(
      {
        ...base(),
        destinatario: "incarico",
        operaio_id: undefined,
        ruolo: "preposto",
      },
      s,
      "2026-11-05",
      "posa",
    );
    expect(cs.map((c) => c.incarico_id)).toEqual(["i1", "i2"]);
    expect(cs.every((c) => !c.operaio_id)).toBe(true);
  });
  it("un elenco vuoto resta un criterio da chiarire senza creare una persona fittizia", () => {
    const cs = espandiCopertura(base(), s, "2027-01-01", "posa");
    expect(cs).toHaveLength(1);
    expect(cs[0].operaio_id).toBeUndefined();
    expect(cs[0].applicabilita).toBe("da_chiarire");
  });
  it("il cambio di destinatario revoca la vecchia associazione e i relativi esiti", () => {
    const c = cambiaDestinatario(
      { ...base(), gruppo_id: "g", copertura: "operai_assegnati" },
      "commessa",
    );
    expect(c).toMatchObject({
      destinatario: "commessa",
      applicabilita: "da_chiarire",
      esito: "da_verificare",
      evidenze: [],
    });
    expect(c.operaio_id).toBeUndefined();
    expect(c.gruppo_id).toBeUndefined();
  });
  it("non scambia certificati personali, nomine, documenti di impresa e di commessa", () => {
    const e = {
      operaio_id: "a",
      incarico_id: null,
      order_id: null,
      subappaltatore_id: "sub",
    } as EvidenzaFascicolo;
    expect(evidenzaDelTitolare(e, base(), "ordine", "sub")).toBe(true);
    expect(
      evidenzaDelTitolare(e, { ...base(), operaio_id: "b" }, "ordine", "sub"),
    ).toBe(false);
    expect(
      evidenzaDelTitolare(
        e,
        { ...base(), destinatario: "impresa", operaio_id: undefined },
        "ordine",
        "sub",
      ),
    ).toBe(false);
    expect(
      evidenzaDelTitolare(
        {
          ...e,
          operaio_id: null,
          incarico_id: "i3",
          order_id: "ordine",
          subappaltatore_id: null,
        },
        {
          ...base(),
          destinatario: "incarico",
          operaio_id: undefined,
          incarico_id: "i3",
        },
        "ordine",
        "sub",
      ),
    ).toBe(true);
  });
  it("la rilettura aggiorna i membri del gruppo e azzera i giudizi, mantenendo i criteri aziendali", () => {
    const cs = espandiCopertura(base(), s, "2026-11-05", "posa").map((c) => ({
      ...c,
      esito: "conforme" as const,
      evidenze: ["file"],
    }));
    const azienda = {
      ...nuovoCriterioItp(),
      titolo: "DURC",
      destinatario: "impresa" as const,
      esito: "conforme" as const,
    };
    const nuovi = riallineaSoggetti(
      [...cs, azienda],
      s,
      "2026-11-05",
      "demolizioni",
    );
    expect(nuovi.filter((c) => c.gruppo_id).map((c) => c.operaio_id)).toEqual([
      "b",
      "c",
    ]);
    expect(
      nuovi
        .filter((c) => c.gruppo_id)
        .every((c) => c.esito === "da_verificare" && !c.evidenze.length),
    ).toBe(true);
    expect(nuovi.find((c) => c.id === azienda.id)).toBe(azienda);
  });
  it("gli snapshot del titolare sono ricostruiti dal server e non si inviano come dati autorevoli", () => {
    const c = {
      ...base(),
      soggetto_snapshot: { tipo: "operaio" as const, dati: s.operai[0] },
    };
    const payload = datiItpPerRegistrazione({
      criteri: [c],
      soggetti_attesi: s,
    } as DatiVerificaItp);
    expect(payload.criteri[0].soggetto_snapshot).toBeUndefined();
    expect(payload.soggetti_attesi).toBe(s);
    expect(c.soggetto_snapshot).toBeTruthy();
    const azienda = datiItpPerRegistrazione({
      criteri: [{ ...nuovoCriterioItp(), titolo: "Impresa" }],
      soggetti_attesi: s,
    } as DatiVerificaItp);
    expect(azienda.soggetti_attesi).toBeUndefined();
  });
  it("il catalogo fornisce l’ambito ma non associa una persona per nome", () => {
    expect(
      destinatarioCriterio({
        ...nuovoCriterioItp(),
        catalogo_id: "formazione_lavoratori",
        catalogo_versione: 1,
      }),
    ).toBe("operaio");
    expect(
      destinatarioCriterio({
        ...nuovoCriterioItp(),
        catalogo_id: "nomina_cse",
        catalogo_versione: 1,
      }),
    ).toBe("incarico");
  });
  it("il confronto delle fonti segnala cambiamenti senza riscrivere i nomi registrati", () => {
    const ora = {
      ...s,
      operai: s.operai.map((o) => ({ ...o, nome: "Nuovo" })),
    };
    expect(avvisiSoggetti(s, ora)[0]).toContain("cambiati");
    expect(s.operai[0].nome).toBe("Mario");
  });
});
