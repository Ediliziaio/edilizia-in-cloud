// La catena fattura → DDT → ordine → commessa, senza AI (§7.5–7.8, casi del §7.18).
// Ogni caso costruisce un XML FatturaPA vero (con prefissi di namespace, come lo
// mandano alcuni gestionali) e i documenti già registrati nel gestionale.
import { describe, expect, it } from "vitest";
import { leggiRiferimentiFattura, ddtNelleDescrizioni } from "../../../shared/acquisti/riferimentiFattura.ts";
import {
  costruisciCatena,
  type CommessaNota,
  type DdtNoto,
  type FatturaPerCatena,
  type OrdineNoto,
} from "../../../shared/acquisti/catena.ts";
import { abbinaRigheFattura, confrontaRiga, prezzoRigaDdt, statoRigaOrdine, type RigaDocumento } from "../../../shared/acquisti/righe.ts";

const AZ = "az-1";
const ALTRA = "az-2";
const FORN = "forn-1";
const FORN2 = "forn-2";

type Riga = { n: number; descr: string; q?: number; um?: string; pu?: number; tot: number; cod?: string; tipo?: string };

function xml(p: {
  ddt?: Array<{ numero: string; data: string; righe?: number[] }>;
  ordini?: Array<{ id: string; data?: string; righe?: number[]; cup?: string }>;
  contratti?: Array<{ id: string; righe?: number[] }>;
  righe: Riga[];
  causale?: string;
}): string {
  const rl = (rs?: number[]) => (rs ?? []).map((n) => `<p:RiferimentoNumeroLinea>${n}</p:RiferimentoNumeroLinea>`).join("");
  return `<?xml version="1.0"?><p:FatturaElettronica xmlns:p="x"><FatturaElettronicaHeader/><FatturaElettronicaBody>
  <DatiGenerali>
    <DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-10-31</Data><Numero>77</Numero>${p.causale ? `<Causale>${p.causale}</Causale>` : ""}</DatiGeneraliDocumento>
    ${(p.ordini ?? []).map((o) => `<DatiOrdineAcquisto>${rl(o.righe)}<IdDocumento>${o.id}</IdDocumento>${o.data ? `<Data>${o.data}</Data>` : ""}${o.cup ? `<CodiceCUP>${o.cup}</CodiceCUP>` : ""}</DatiOrdineAcquisto>`).join("")}
    ${(p.contratti ?? []).map((o) => `<DatiContratto>${rl(o.righe)}<IdDocumento>${o.id}</IdDocumento></DatiContratto>`).join("")}
    ${(p.ddt ?? []).map((d) => `<DatiDDT><NumeroDDT>${d.numero}</NumeroDDT><DataDDT>${d.data}</DataDDT>${rl(d.righe)}</DatiDDT>`).join("")}
  </DatiGenerali>
  <DatiBeniServizi>${p.righe
    .map(
      (r) =>
        `<DettaglioLinee><NumeroLinea>${r.n}</NumeroLinea>${r.tipo ? `<TipoCessionePrestazione>${r.tipo}</TipoCessionePrestazione>` : ""}${r.cod ? `<CodiceArticolo><CodiceTipo>FORN</CodiceTipo><CodiceValore>${r.cod}</CodiceValore></CodiceArticolo>` : ""}<Descrizione>${r.descr}</Descrizione>${r.q != null ? `<Quantita>${r.q.toFixed(2)}</Quantita>` : ""}${r.um ? `<UnitaMisura>${r.um}</UnitaMisura>` : ""}<PrezzoUnitario>${(r.pu ?? r.tot).toFixed(4)}</PrezzoUnitario><PrezzoTotale>${r.tot.toFixed(2)}</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>`,
    )
    .join("")}</DatiBeniServizi></FatturaElettronicaBody></p:FatturaElettronica>`;
}

function fattura(x: string, over: Partial<FatturaPerCatena> = {}): FatturaPerCatena {
  const riferimenti = leggiRiferimentiFattura(x);
  return { id: "f-1", companyId: AZ, fornitoreId: FORN, data: "2026-10-31", riferimenti, ddtNelTesto: ddtNelleDescrizioni(riferimenti.righe), ...over };
}

const commesse: CommessaNota[] = [
  { id: "c-A", companyId: AZ, codice: "25000068", indirizzoCantiere: "Via Roma 12, Milano" },
  { id: "c-B", companyId: AZ, codice: "CANT-2026-07", indirizzoCantiere: "Via Verdi 4, Monza", cup: ["D13D21000450001"] },
  { id: "c-C", companyId: AZ, codice: "26C01", indirizzoCantiere: "Via Roma 12, Milano" },
  { id: "c-X", companyId: ALTRA, codice: "99999999", indirizzoCantiere: "Via Roma 12, Milano" },
];
const ordini: OrdineNoto[] = [
  { id: "o-1", companyId: AZ, fornitoreId: FORN, numero: "ODA-2026-0039", data: "2026-10-01", commessaId: "c-A", magazzinoId: null },
  { id: "o-2", companyId: AZ, fornitoreId: FORN, numero: "ODA-2026-0040", data: "2026-10-02", commessaId: "c-B", magazzinoId: null },
  { id: "o-3", companyId: AZ, fornitoreId: FORN2, numero: "ODA-2026-0041", data: "2026-10-03", commessaId: "c-A", magazzinoId: null },
  { id: "o-4", companyId: AZ, fornitoreId: FORN, numero: "ODA-2026-0042", data: "2026-10-03", commessaId: null, magazzinoId: "mag-1" },
  { id: "o-x", companyId: ALTRA, fornitoreId: FORN, numero: "ODA-2026-0043", data: "2026-10-03", commessaId: "c-X", magazzinoId: null },
];
const ddt: DdtNoto[] = [
  { id: "d-1068", companyId: AZ, fornitoreId: FORN, numero: "1068", data: "2026-09-08", ordiniIds: ["o-1"], commessaId: null, magazzinoId: null },
  { id: "d-1070", companyId: AZ, fornitoreId: FORN, numero: "1070", data: "2026-09-10", ordiniIds: [], commessaId: "c-B", magazzinoId: null },
  { id: "d-1068-25", companyId: AZ, fornitoreId: FORN, numero: "1068", data: "2025-09-08", ordiniIds: [], commessaId: "c-B", magazzinoId: null },
  { id: "d-1068-f2", companyId: AZ, fornitoreId: FORN2, numero: "1068", data: "2026-09-08", ordiniIds: [], commessaId: "c-B", magazzinoId: null },
  { id: "d-1068-x", companyId: ALTRA, fornitoreId: FORN, numero: "1068", data: "2026-09-08", ordiniIds: ["o-x"], commessaId: "c-X", magazzinoId: null },
  { id: "d-500", companyId: AZ, fornitoreId: FORN, numero: "500", data: "2026-09-20", ordiniIds: ["o-4"], commessaId: null, magazzinoId: "mag-1" },
  { id: "d-501", companyId: AZ, fornitoreId: FORN, numero: "501", data: "2026-09-21", ordiniIds: ["o-2"], commessaId: null, magazzinoId: null },
];
const noti = { ddt, ordini, contratti: [{ id: "k-1", companyId: AZ, fornitoreId: FORN, numero: "CTR-12/2026", data: "2026-01-10", commessaId: "c-B" }], commesse };

const UNA_RIGA: Riga[] = [{ n: 1, descr: "Cemento 32,5 R", q: 10, um: "SAC", pu: 8, tot: 80 }];

describe("§7.18 — collegamenti senza AI", () => {
  it("riferimento esatto all'ordine → automatico sulla commessa dell'ordine, col percorso", () => {
    const c = costruisciCatena(fattura(xml({ ordini: [{ id: "ODA-2026-0039", data: "2026-10-01" }], righe: UNA_RIGA })), noti);
    expect(c.ordini[0].decisione).toMatchObject({ esito: "automatico", sceltoId: "o-1" });
    expect(c.esito).toBe("automatico");
    expect(c.allocazioni).toMatchObject([{ destinazione: { tipo: "commessa", id: "c-A" }, importo: 80 }]);
    expect(c.allocazioni[0].percorsi[0]).toMatchObject({ fonte: "ordine", passi: ["ordine ODA-2026-0039"] });
  });

  it("l'ordine scritto dal fornitore come «39/2026» si riconosce lo stesso", () => {
    const c = costruisciCatena(fattura(xml({ ordini: [{ id: "ODA 39/2026" }], righe: UNA_RIGA })), noti);
    expect(c.ordini[0].decisione.sceltoId).toBe("o-1");
  });

  it("solo DDT → DDT → ordine → commessa (catena indiretta, percorso conservato)", () => {
    const c = costruisciCatena(fattura(xml({ ddt: [{ numero: "001068/26", data: "2026-09-07" }], righe: UNA_RIGA })), noti);
    expect(c.ddt[0].decisione).toMatchObject({ esito: "automatico", sceltoId: "d-1068" });
    expect(c.esito).toBe("automatico");
    expect(c.allocazioni[0].destinazione).toEqual({ tipo: "commessa", id: "c-A" });
    expect(c.allocazioni[0].percorsi[0]).toMatchObject({ fonte: "ddt_ordine", passi: ["DDT 1068 del 2026-09-08", "ordine ODA-2026-0039"] });
  });

  it("DDT scritto solo nella descrizione della riga", () => {
    const c = costruisciCatena(fattura(xml({ righe: [{ n: 1, descr: "Rif. DDT n. 1070 del 10/09/2026 - Sabbia", tot: 120 }] })), noti);
    expect(c.ddt[0].decisione.sceltoId).toBe("d-1070");
    expect(c.allocazioni[0].destinazione).toEqual({ tipo: "commessa", id: "c-B" });
  });

  it("solo codice commessa → automatico (parola intera, non dentro un numero più lungo)", () => {
    const c = costruisciCatena(fattura(xml({ causale: "Fornitura cantiere comm. 25000068", righe: UNA_RIGA })), noti);
    expect(c.esito).toBe("automatico");
    expect(c.allocazioni[0].destinazione.id).toBe("c-A");
    const dentro = costruisciCatena(fattura(xml({ causale: "Rif. 1250000689", righe: UNA_RIGA })), noti);
    expect(dentro.esito).toBe("nessuno");
  });

  it("CUP → commessa", () => {
    const c = costruisciCatena(fattura(xml({ ordini: [{ id: "5105", cup: "D13D21000450001" }], righe: UNA_RIGA })), noti);
    expect(c.allocazioni[0].destinazione.id).toBe("c-B");
  });

  it("indirizzo con più commesse possibili → scelta, mai automatico", () => {
    const c = costruisciCatena(fattura(xml({ causale: "Consegna in Via Roma 12 Milano", righe: UNA_RIGA })), noti);
    expect(c.esito).toBe("scelta");
    expect(c.righe[0].decisione.candidati.map((x) => x.id).sort()).toEqual(["commessa:c-A", "commessa:c-C"]);
  });

  it("indirizzo di una sola commessa → proposta da confermare", () => {
    const c = costruisciCatena(fattura(xml({ causale: "Consegna Via Verdi 4 Monza", righe: UNA_RIGA })), noti);
    expect(c.esito).toBe("proposta");
  });

  it("l'ordine dice una commessa, l'indirizzo un'altra → conflitto, nessuna scelta", () => {
    const c = costruisciCatena(fattura(xml({ ordini: [{ id: "ODA-2026-0039" }], causale: "Consegna Via Verdi 4 Monza", righe: UNA_RIGA })), noti);
    expect(c.esito).toBe("conflitto");
    expect(c.allocazioni.every((a) => a.destinazione.tipo === "da_attribuire")).toBe(true);
  });

  it("l'indirizzo che conferma l'ordine non crea conflitto anche se un'altra commessa ha lo stesso indirizzo", () => {
    const c = costruisciCatena(fattura(xml({ ordini: [{ id: "ODA-2026-0039" }], causale: "Via Roma 12 Milano", righe: UNA_RIGA })), noti);
    expect(c.esito).toBe("automatico");
  });

  it("riferimenti discordanti: ordine su una commessa, DDT su un'altra → conflitto", () => {
    const c = costruisciCatena(fattura(xml({ ordini: [{ id: "ODA-2026-0039" }], ddt: [{ numero: "1070", data: "2026-09-10" }], righe: UNA_RIGA })), noti);
    expect(c.esito).toBe("conflitto");
  });

  it("numero d'ordine di un ALTRO fornitore → conflitto sull'ordine, niente commessa", () => {
    const c = costruisciCatena(fattura(xml({ ordini: [{ id: "ODA-2026-0041" }], righe: UNA_RIGA })), noti);
    expect(c.ordini[0].decisione.esito).toBe("conflitto");
    expect(c.esito).toBe("nessuno");
  });

  it("stesso numero di DDT da fornitori o anni diversi: solo il DDT dello stesso fornitore e dell'anno giusto", () => {
    const c = costruisciCatena(fattura(xml({ ddt: [{ numero: "1068", data: "2026-09-07" }], righe: UNA_RIGA })), noti);
    expect(c.ddt[0].decisione.candidati.map((x) => x.id)).toEqual(["d-1068"]);
    const vecchio = costruisciCatena(fattura(xml({ ddt: [{ numero: "1068", data: "2025-09-07" }], righe: UNA_RIGA })), noti);
    expect(vecchio.ddt[0].decisione.sceltoId).toBe("d-1068-25");
  });

  it("DDT con data lontana → proposta, non automatico", () => {
    const c = costruisciCatena(fattura(xml({ ddt: [{ numero: "1070", data: "2026-11-30" }], righe: UNA_RIGA })), noti);
    expect(c.ddt[0].decisione.esito).toBe("proposta");
  });

  it("più ordini, DDT e commesse nella stessa fattura → ripartita riga per riga", () => {
    const righe: Riga[] = [
      { n: 1, descr: "Mattoni", tot: 300 },
      { n: 2, descr: "Sabbia", tot: 100 },
      { n: 3, descr: "Trasporto", tot: 40, tipo: "AC" },
    ];
    const c = costruisciCatena(
      fattura(xml({ ordini: [{ id: "ODA-2026-0039", righe: [1] }, { id: "ODA-2026-0040", righe: [2] }], ddt: [{ numero: "1068", data: "2026-09-08", righe: [1] }], righe })),
      noti,
    );
    expect(c.esito).toBe("automatico");
    const per = Object.fromEntries(c.allocazioni.map((a) => [`${a.destinazione.id}|${a.criterio}`, a.importo]));
    expect(per).toEqual({ "c-A|riga": 300, "c-B|riga": 100, "c-A|proporzionale_accessori": 30, "c-B|proporzionale_accessori": 10 });
    expect(c.allocazioni.reduce((s, a) => s + a.importo, 0)).toBe(440);
  });

  it("magazzino: l'ordine a magazzino manda il costo al magazzino, non alla commessa (niente doppio conteggio col prelievo)", () => {
    const c = costruisciCatena(fattura(xml({ ddt: [{ numero: "500", data: "2026-09-20" }], righe: UNA_RIGA })), noti);
    expect(c.allocazioni[0].destinazione).toEqual({ tipo: "magazzino", id: "mag-1" });
  });

  it("documento arrivato prima degli altri: nessun DDT/ordine ancora registrato → nessuno coi dati mancanti", () => {
    const c = costruisciCatena(fattura(xml({ ddt: [{ numero: "2001", data: "2026-10-30" }], righe: UNA_RIGA })), noti);
    expect(c.ddt[0].decisione).toMatchObject({ esito: "nessuno", mancanti: ["DDT registrato nel gestionale"] });
    expect(c.esito).toBe("nessuno");
    // Quando il DDT arriva, la stessa funzione sulla stessa fattura lo trova: non dipende dall'ordine di arrivo.
    const dopo = costruisciCatena(fattura(xml({ ddt: [{ numero: "2001", data: "2026-10-30" }], righe: UNA_RIGA })), {
      ...noti,
      ddt: [...ddt, { id: "d-2001", companyId: AZ, fornitoreId: FORN, numero: "2001", data: "2026-10-30", ordiniIds: ["o-2"], commessaId: null, magazzinoId: null }],
    });
    expect(dopo.allocazioni[0].destinazione.id).toBe("c-B");
  });

  it("isolamento fra aziende: documenti di un'altra azienda non sono nemmeno candidati", () => {
    const c = costruisciCatena(fattura(xml({ ordini: [{ id: "ODA-2026-0043" }], causale: "comm. 99999999", righe: UNA_RIGA })), noti);
    expect(c.ordini[0].decisione.candidati).toEqual([]);
    expect(c.esito).toBe("nessuno");
  });

  it("senza fornitore riconosciuto: i DDT non si cercano", () => {
    const c = costruisciCatena(fattura(xml({ ddt: [{ numero: "1068", data: "2026-09-08" }], righe: UNA_RIGA }), { fornitoreId: null }), noti);
    expect(c.ddt[0].decisione).toMatchObject({ esito: "nessuno", mancanti: ["fornitore della fattura"] });
  });

  it("riferimenti vuoti («NO.ORD.», «.») non abbinano niente", () => {
    const c = costruisciCatena(fattura(xml({ ordini: [{ id: "NO.ORD." }, { id: "." }], righe: UNA_RIGA })), noti);
    expect(c.ordini.every((o) => o.decisione.esito === "nessuno")).toBe(true);
  });

  it("nessuna memoria per fornitore: due fatture uguali senza riferimenti restano da attribuire", () => {
    const c = costruisciCatena(fattura(xml({ righe: UNA_RIGA })), noti);
    expect(c.esito).toBe("nessuno");
    expect(c.allocazioni[0].destinazione.tipo).toBe("da_attribuire");
  });

  it("contratto → commessa", () => {
    const c = costruisciCatena(fattura(xml({ contratti: [{ id: "CTR-12/2026" }], righe: UNA_RIGA })), noti);
    expect(c.allocazioni[0].destinazione.id).toBe("c-B");
  });
});

describe("§7.7 — righe: quantità, prezzi, unità", () => {
  const r = (over: Partial<RigaDocumento> = {}): RigaDocumento => ({ id: "r1", documentoId: "d", codice: "CEM325", descrizione: "Cemento 32,5 R", quantita: 10, unita: "SACCO", prezzoUnitario: 8, ...over });

  it("abbinamento per codice del fornitore tramite equivalenza confermata", () => {
    const f = leggiRiferimentiFattura(xml({ righe: [{ n: 1, descr: "CEMENTO TIPO II", cod: "F-998", q: 10, um: "SAC", pu: 8, tot: 80 }] })).righe;
    const out = abbinaRigheFattura(f, () => [r(), r({ id: "r2", codice: "SAB01", descrizione: "Sabbia" })], { equivalenze: [{ codiceFornitore: "F998", codiceNostro: "CEM325" }] });
    expect(out[0].decisione).toMatchObject({ esito: "automatico", sceltoId: "r1" });
  });

  it("codice diverso esclude anche con descrizione uguale", () => {
    const f = leggiRiferimentiFattura(xml({ righe: [{ n: 1, descr: "Cemento 32,5 R", cod: "ZZZ9", q: 10, tot: 80 }] })).righe;
    expect(abbinaRigheFattura(f, () => [r()])[0].decisione.esito).toBe("nessuno");
  });

  it("una riga di DDT si fattura una volta sola", () => {
    const f = leggiRiferimentiFattura(xml({ righe: [{ n: 1, descr: "Cemento 32,5 R", q: 10, um: "SAC", tot: 80 }, { n: 2, descr: "Cemento 32,5 R", q: 10, um: "SAC", tot: 80 }] })).righe;
    const out = abbinaRigheFattura(f, () => [r({ codice: null })]);
    expect(out.map((o) => o.decisione.esito)).toEqual(["automatico", "nessuno"]);
  });

  it("senza una quantità confrontabile la riga non si chiude da sola: unità mancante o non convertibile", () => {
    const senzaUnita = leggiRiferimentiFattura(xml({ righe: [{ n: 1, descr: "Cemento 32,5 R", q: 10, tot: 80 }] })).righe;
    expect(abbinaRigheFattura(senzaUnita, () => [r({ codice: null })])[0].decisione).toMatchObject({ esito: "proposta", mancanti: expect.arrayContaining(["quantità confrontabile"]) });
    const metri = leggiRiferimentiFattura(xml({ righe: [{ n: 1, descr: "Cemento 32,5 R", cod: "CEM325", q: 250, um: "M", tot: 80 }] })).righe;
    expect(abbinaRigheFattura(metri, () => [r({ quantita: 1, unita: "PZ" })])[0].decisione.esito).toBe("proposta");
  });

  it("differenze: quantità, prezzo, unità non convertibile; tolleranza sul prezzo", () => {
    const [f] = leggiRiferimentiFattura(xml({ righe: [{ n: 1, descr: "x", q: 12, um: "SAC", pu: 8.5, tot: 102 }] })).righe;
    expect(confrontaRiga(f, r()).map((d) => d.tipo).sort()).toEqual(["prezzo", "quantita"]);
    expect(confrontaRiga(f, r({ quantita: 12, prezzoUnitario: 8.49 }), { tolleranze: { prezzoPerc: 1 } })).toEqual([]);
    expect(confrontaRiga(f, r({ unita: "KG" })).map((d) => d.tipo)).toContain("unita");
  });

  it("conversione autorizzata: 1 bancale = 60 sacchi", () => {
    const [f] = leggiRiferimentiFattura(xml({ righe: [{ n: 1, descr: "x", q: 1, um: "PAL", pu: 480, tot: 480 }] })).righe;
    expect(confrontaRiga(f, r({ quantita: 60 }), { conversioni: [{ da: "BANCALE", a: "SACCO", fattore: 60 }] })).toEqual([]);
  });

  it("bolla senza prezzi: il prezzo viene dall'ordine", () => {
    expect(prezzoRigaDdt({ prezzoUnitario: null }, 7.9)).toEqual({ prezzo: 7.9, fonte: "ordine" });
    expect(prezzoRigaDdt({ prezzoUnitario: null }, null)).toEqual({ prezzo: null, fonte: null });
    const [f] = leggiRiferimentiFattura(xml({ righe: [{ n: 1, descr: "x", q: 10, um: "SAC", pu: 8, tot: 80 }] })).righe;
    expect(confrontaRiga(f, r({ prezzoUnitario: null }), { prezzoOrdine: 8 })).toEqual([]);
    expect(confrontaRiga(f, r({ prezzoUnitario: null })).map((d) => d.tipo)).toEqual(["prezzo_mancante"]);
  });

  it("ordinato/consegnato/fatturato: parziali, resi, note di credito, fattura prima della consegna", () => {
    expect(statoRigaOrdine({ ordinato: 100, consegne: [{ quantita: 40 }, { quantita: 30 }], fatture: [{ quantita: 40 }] })).toMatchObject({
      consegnato: 70,
      daConsegnare: 30,
      daFatturare: 30,
      stato: "parziale",
    });
    expect(statoRigaOrdine({ ordinato: 100, consegne: [{ quantita: 100 }], resi: [{ quantita: 10 }], fatture: [{ quantita: 100 }], noteCredito: [{ quantita: 10 }] })).toMatchObject({
      consegnatoNetto: 90,
      fatturatoNetto: 90,
      daFatturare: 0,
      fatturatoNonConsegnato: 0,
    });
    expect(statoRigaOrdine({ ordinato: 50, fatture: [{ quantita: 50 }] })).toMatchObject({ fatturatoNonConsegnato: 50, stato: "parziale" });
    expect(statoRigaOrdine({ ordinato: 50, consegne: [{ quantita: 50 }], fatture: [{ quantita: 50 }] }).stato).toBe("chiusa");
    expect(statoRigaOrdine({ ordinato: 50, consegne: [{ quantita: 51 }], tolleranzaPerc: 5 }).stato).toBe("consegnata");
    expect(statoRigaOrdine({ ordinato: 50, consegne: [{ quantita: 60 }], tolleranzaPerc: 5 }).stato).toBe("eccedenza");
  });
});

describe("lettura dei riferimenti dall'XML", () => {
  it("DatiDDT con RiferimentoNumeroLinea, ordini, CUP nelle righe, lotto di fatture", () => {
    const corpo = xml({ ddt: [{ numero: "9.363", data: "2026-10-16", righe: [1, 2] }], ordini: [{ id: "1139", data: "2026-10-08", righe: [2] }], righe: [{ n: 1, descr: "CUP H85E12000710002 posa", tot: 10 }, { n: 2, descr: "b", tot: 5 }] });
    const r = leggiRiferimentiFattura(corpo);
    expect(r.ddt).toMatchObject([{ testo: "9.363", data: "2026-10-16", righe: [1, 2], numero: { chiave: "9363" } }]);
    expect(r.ordini[0]).toMatchObject({ testo: "1139", righe: [2], data: "2026-10-08" });
    expect(r.cup).toEqual(["H85E12000710002"]);
    const lotto = corpo.replace("</p:FatturaElettronica>", "") + "<FatturaElettronicaBody><DatiGenerali><DatiDDT><NumeroDDT>55</NumeroDDT><DataDDT>2026-10-01</DataDDT></DatiDDT></DatiGenerali></FatturaElettronicaBody></p:FatturaElettronica>";
    expect(leggiRiferimentiFattura(lotto, 1).ddt.map((d) => d.testo)).toEqual(["55"]);
  });
});
