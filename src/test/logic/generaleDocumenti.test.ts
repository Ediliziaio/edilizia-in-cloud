import { describe, expect, it } from "vitest";
import {
  VOCI_DI_PARTENZA,
  aggiungiGiorni,
  calcolaChecklist,
  etichettaAmbito,
  giorniTra,
  nomeVoceValido,
  normalizzaNomeFile,
  nuovaChiavePersonale,
  riconosce,
  riepilogoVoceFiglie,
  scadenzaProposta,
  testoCasella,
  testoConteggi,
  vociDelModello,
  type AllegatoCommessa,
  type RigaVoceAzienda,
  type SegnoDocumento,
  type VoceDocumento,
} from "@/lib/orders/generali/documenti";

/**
 * Commesse generali, modulo «Documenti» (tappa 6): la checklist dei documenti che servono.
 * I file restano nell'archivio della commessa (order_attachments); una voce è presente se sulla
 * commessa giusta c'è un file segnato per lei o un file il cui nome la riconosce.
 */

const OGGI = "2026-10-30";
const GEN = "gen";

const allegato = (id: string, order_id: string, file_name: string, created_at = "2026-10-01T10:00:00Z"): AllegatoCommessa => ({
  id, order_id, file_name, file_url: `orders/${order_id}/${id}`, file_type: "application/pdf", created_at,
});
const segno = (p: Partial<SegnoDocumento> & Pick<SegnoDocumento, "order_id" | "voce" | "tipo">): SegnoDocumento => ({
  id: `s-${p.order_id}-${p.voce}-${p.attachment_id ?? "x"}`, attachment_id: null, scadenza: null, ...p,
});
const riga = (p: Partial<RigaVoceAzienda> & Pick<RigaVoceAzienda, "modello" | "chiave">): RigaVoceAzienda => ({
  id: `r-${p.chiave}`, nome: null, ambito: null, obbligatoria: null, con_scadenza: null, tolta: false, posizione: 0, ...p,
});
const voce = (voci: VoceDocumento[], id: string) => voci.find((v) => v.id === id)!;

describe("l'elenco di partenza", () => {
  it("l'appalto chiede le voci del contratto, sulla generale salvo la notifica preliminare", () => {
    const voci = vociDelModello("appalto");
    expect(voci.map((v) => v.id)).toEqual([
      "contratto_firmato", "atti_aggiuntivi", "cauzione_definitiva", "garanzia_anticipazione",
      "polizza_car", "psc", "notifica_preliminare", "nomina_cse", "durc",
    ]);
    expect(voci.filter((v) => v.ambito === "figlia").map((v) => v.id)).toEqual(["notifica_preliminare"]);
    expect(voce(voci, "durc")).toMatchObject({ obbligatoria: true, conScadenza: true, validitaGiorni: 120 });
    expect(voce(voci, "polizza_car").conScadenza).toBe(true);
  });

  it("lo sviluppo ha le voci di ogni unità, con la fideiussione 122/2005 solo dove si è incassato", () => {
    const voci = vociDelModello("sviluppo");
    expect(voci.filter((v) => v.ambito === "figlia").map((v) => v.id)).toEqual(["preliminare", "fideiussione_122", "rogito", "ape", "accatastamento"]);
    expect(voce(voci, "fideiussione_122")).toMatchObject({ soloConIncassi: true, obbligatoria: true, conScadenza: true });
    expect(voci.map((v) => v.id)).toEqual(expect.arrayContaining([
      "atto_acquisto", "visure_catastali", "titolo_edilizio", "progetto_computo", "business_plan",
      "contratti_finanziamento", "polizza_decennale", "agibilita",
    ]));
  });

  it("la compravendita è più snella dello sviluppo e non chiede la fideiussione 122/2005", () => {
    const sviluppo = VOCI_DI_PARTENZA.sviluppo.map((v) => v.chiave);
    const compravendita = VOCI_DI_PARTENZA.compravendita.map((v) => v.chiave);
    expect(compravendita.length).toBeLessThan(sviluppo.length);
    expect(compravendita.every((k) => sviluppo.includes(k))).toBe(true);
    expect(compravendita).not.toContain("fideiussione_122");
    expect(voce(vociDelModello("compravendita"), "titolo_edilizio").nome).toBe("Titolo edilizio (CILA, SCIA)");
  });

  it("le chiavi sono quelle che il database accetta e non si ripetono nel modello", () => {
    for (const voci of Object.values(VOCI_DI_PARTENZA)) {
      const chiavi = voci.map((v) => v.chiave);
      expect(new Set(chiavi).size).toBe(chiavi.length);
      for (const k of chiavi) {
        expect(k).toMatch(/^[a-z0-9_-]{1,60}$/);
        expect(k.startsWith("az-")).toBe(false);
      }
    }
  });

  it("le parole dell'ambito seguono il modello", () => {
    expect(etichettaAmbito("appalto", "generale")).toBe("Sul contratto");
    expect(etichettaAmbito("appalto", "figlia")).toBe("Su ogni ordine di lavoro");
    expect(etichettaAmbito("sviluppo", "generale")).toBe("Sull'operazione");
    expect(etichettaAmbito("sviluppo", "figlia")).toBe("Su ogni unità");
  });
});

describe("le scelte dell'azienda", () => {
  it("una riga cambia solo i campi scritti, gli altri restano quelli di partenza", () => {
    const voci = vociDelModello("appalto", [riga({ modello: "appalto", chiave: "durc", obbligatoria: false })]);
    expect(voce(voci, "durc")).toMatchObject({ obbligatoria: false, conScadenza: true, ambito: "generale", nome: "DURC", cambiata: true });
    expect(voce(voci, "psc").cambiata).toBe(false);
  });

  it("una voce tolta resta nell'elenco (per rimetterla) ma non entra nella checklist", () => {
    const voci = vociDelModello("appalto", [riga({ modello: "appalto", chiave: "psc", tolta: true })]);
    expect(voce(voci, "psc").tolta).toBe(true);
    const c = calcolaChecklist({ voci, generaleId: GEN, figlie: [], allegati: [], segni: [], oggi: OGGI });
    expect(c.generale.map((x) => x.voce.id)).not.toContain("psc");
  });

  it("le voci dell'azienda vengono dopo quelle di partenza, in ordine, e solo nel loro modello", () => {
    const righe = [
      riga({ modello: "appalto", chiave: "az-b", nome: "Certificato antincendio", ambito: "generale", obbligatoria: true, posizione: 2 }),
      riga({ modello: "appalto", chiave: "az-a", nome: "Verbale di consegna", ambito: "figlia", obbligatoria: false, posizione: 1 }),
      riga({ modello: "sviluppo", chiave: "az-c", nome: "Regolamento di condominio", ambito: "generale", obbligatoria: true }),
    ];
    const voci = vociDelModello("appalto", righe);
    expect(voci.slice(-2).map((v) => [v.id, v.personale, v.ambito])).toEqual([["az-a", true, "figlia"], ["az-b", true, "generale"]]);
    expect(voci.map((v) => v.id)).not.toContain("az-c");
  });

  it("un nome rinominato vale, uno vuoto no; una chiave nuova ha la forma giusta", () => {
    expect(voce(vociDelModello("appalto", [riga({ modello: "appalto", chiave: "durc", nome: "  DURC impresa " })]), "durc").nome).toBe("DURC impresa");
    expect(voce(vociDelModello("appalto", [riga({ modello: "appalto", chiave: "durc", nome: " " })]), "durc").nome).toBe("DURC");
    expect(nomeVoceValido("  Verbale   di consegna ")).toBe("Verbale di consegna");
    expect(nomeVoceValido("   ")).toBeNull();
    expect(nomeVoceValido("x".repeat(121))).toBeNull();
    expect(nuovaChiavePersonale()).toMatch(/^az-[a-z0-9]{10}$/);
  });
});

describe("riconoscere un file dal nome", () => {
  const appalto = vociDelModello("appalto");
  const sviluppo = vociDelModello("sviluppo");
  const prima = (voci: VoceDocumento[], nome: string) => voci.find((v) => riconosce(v, nome))?.id ?? null;

  it("il nome si legge senza accenti, maiuscole, estensione e separatori", () => {
    expect(normalizzaNomeFile("Agibilità_Edificio-A.PDF")).toBe("agibilita edificio a");
    expect(normalizzaNomeFile("Proposta d'acquisto.docx")).toBe("proposta d acquisto");
  });

  it.each([
    ["Contratto d'appalto firmato.pdf", "contratto_firmato"],
    ["CONTRATTO_SUBAPPALTO_Rossi.pdf", null],
    ["Atto aggiuntivo n.2.pdf", "atti_aggiuntivi"],
    ["Cauzione definitiva Allianz.pdf", "cauzione_definitiva"],
    ["Fideiussione anticipazione 20%.pdf", "garanzia_anticipazione"],
    ["Polizza CAR 2027.pdf", "polizza_car"],
    ["PSC rev 3.pdf", "psc"],
    ["Notifica preliminare ASL.pdf", "notifica_preliminare"],
    ["Nomina CSE ing. Bianchi.pdf", "nomina_cse"],
    ["DURC_ottobre.pdf", "durc"],
    ["Carta d'identità.jpg", null],
    ["foto cantiere 12.jpg", null],
  ])("appalto: «%s» → %s", (nome, attesa) => {
    expect(prima(appalto, nome)).toBe(attesa);
  });

  it.each([
    ["Rogito acquisto terreno.pdf", "atto_acquisto"],
    ["Visura catastale fg 12.pdf", "visure_catastali"],
    ["DOCFA unità A1.pdf", "accatastamento"],
    ["Permesso di costruire 45-2026.pdf", "titolo_edilizio"],
    ["SCIA variante.pdf", "titolo_edilizio"],
    ["Computo metrico estimativo.xlsx", "progetto_computo"],
    ["Business plan approvato CdA.xlsx", "business_plan"],
    ["Contratto di mutuo fondiario.pdf", "contratti_finanziamento"],
    ["Polizza decennale postuma.pdf", "polizza_decennale"],
    ["SCA agibilità.pdf", "agibilita"],
    ["Compromesso Rossi A1.pdf", "preliminare"],
    ["Fideiussione 122-2005 Rossi.pdf", "fideiussione_122"],
    ["Rogito vendita A1.pdf", "rogito"],
    ["APE A1.pdf", "ape"],
    ["Apertura conto.pdf", null],
    ["Scansione 12.pdf", null],
    ["Scadenzario lavori.xlsx", null],
  ])("sviluppo: «%s» → %s", (nome, attesa) => {
    expect(prima(sviluppo, nome)).toBe(attesa);
  });

  it("una voce dell'azienda si riconosce da tutte le parole del suo nome", () => {
    const [mia] = vociDelModello("appalto", [riga({ modello: "appalto", chiave: "az-x", nome: "Certificato prevenzione incendi", ambito: "generale" })]).slice(-1);
    expect(riconosce(mia, "Certificato_prevenzione_incendi_2027.pdf")).toBe(true);
    expect(riconosce(mia, "Certificato regolare esecuzione.pdf")).toBe(false);
  });
});

describe("la checklist di una generale", () => {
  const voci = vociDelModello("sviluppo");
  const figlie = [
    { id: "a1", incassato: 30000 },
    { id: "a2", incassato: 0 },
    { id: "a3", incassato: null },
  ];
  const calcola = (allegati: AllegatoCommessa[], segni: SegnoDocumento[] = [], v = voci) =>
    calcolaChecklist({ voci: v, generaleId: GEN, figlie, allegati, segni, oggi: OGGI });
  const casella = (c: ReturnType<typeof calcola>, voceId: string, orderId = GEN) =>
    (orderId === GEN ? c.generale : c.figlie.find((g) => g.voce.id === voceId)!.caselle).find((x) => x.voce.id === voceId && x.orderId === orderId)!;

  it("senza file manca tutto quello che è obbligatorio", () => {
    const c = calcola([]);
    expect(casella(c, "atto_acquisto").stato).toBe("mancante");
    expect(casella(c, "contratti_finanziamento")).toMatchObject({ stato: "mancante", obbligatoria: false });
    expect(c.conteggi.presenti).toBe(0);
    expect(c.conteggi.mancanti).toBe(c.conteggi.richiesti);
  });

  it("un file caricato sulla generale col nome giusto spunta la voce della generale, non quella delle unità", () => {
    const c = calcola([allegato("f1", GEN, "Rogito acquisto terreno.pdf"), allegato("f2", GEN, "APE generale.pdf")]);
    expect(casella(c, "atto_acquisto")).toMatchObject({ stato: "presente" });
    expect(casella(c, "atto_acquisto").documenti[0]).toMatchObject({ riconosciuto: true, segnoId: null });
    // L'APE è una voce delle unità: un file sulla generale non la spunta.
    expect(casella(c, "ape", "a1").stato).toBe("mancante");
  });

  it("un file sull'unità spunta la voce di quell'unità soltanto", () => {
    const c = calcola([allegato("f1", "a1", "APE A1.pdf")]);
    expect(casella(c, "ape", "a1").stato).toBe("presente");
    expect(casella(c, "ape", "a1").senzaData).toBe(true);
    expect(casella(c, "ape", "a2").stato).toBe("mancante");
    expect(c.conteggi.senzaData).toBe(1);
  });

  it("un file segnato per una voce conta lì, qualunque sia il nome, e non viene riconosciuto altrove", () => {
    const c = calcola(
      [allegato("f1", GEN, "Scansione 0042.pdf"), allegato("f2", GEN, "Visura catastale.pdf")],
      [segno({ order_id: GEN, voce: "business_plan", tipo: "documento", attachment_id: "f1" }), segno({ order_id: GEN, voce: "atto_acquisto", tipo: "documento", attachment_id: "f2" })],
    );
    expect(casella(c, "business_plan")).toMatchObject({ stato: "presente" });
    expect(casella(c, "atto_acquisto").documenti[0]).toMatchObject({ riconosciuto: false });
    expect(casella(c, "visure_catastali").stato).toBe("mancante");
  });

  it("«non è questo» toglie il file dalla voce, che lo lascia alla voce successiva che lo riconosce", () => {
    const c = calcola(
      [allegato("f1", GEN, "Contratto preliminare e mutuo.pdf")],
      [segno({ order_id: GEN, voce: "contratti_finanziamento", tipo: "escluso", attachment_id: "f1" })],
    );
    expect(casella(c, "contratti_finanziamento").stato).toBe("mancante");
  });

  it("le scadenze: la più lontana decide; dentro 30 giorni è in scadenza, passata è scaduta", () => {
    const fid = (scadenza: string, id = "f1") => segno({ id: `s-${id}`, order_id: "a1", voce: "fideiussione_122", tipo: "documento", attachment_id: id, scadenza });
    const file = [allegato("f1", "a1", "garanzia.pdf"), allegato("f2", "a1", "rinnovo.pdf")];
    expect(casella(calcola(file, [fid("2027-06-30")]), "fideiussione_122", "a1")).toMatchObject({ stato: "presente", giorni: 243 });
    expect(casella(calcola(file, [fid("2026-11-20")]), "fideiussione_122", "a1")).toMatchObject({ stato: "in_scadenza", giorni: 21 });
    expect(casella(calcola(file, [fid("2026-10-29")]), "fideiussione_122", "a1")).toMatchObject({ stato: "scaduto", giorni: -1 });
    expect(casella(calcola(file, [fid("2026-10-29"), fid("2027-10-29", "f2")]), "fideiussione_122", "a1")).toMatchObject({ stato: "presente", scadenza: "2027-10-29" });
  });

  it("la fideiussione 122/2005: serve dove l'unità ha incassato, non dove non ha incassato niente", () => {
    const c = calcola([]);
    expect(casella(c, "fideiussione_122", "a1")).toMatchObject({ stato: "mancante", obbligatoria: true });
    expect(casella(c, "fideiussione_122", "a2")).toMatchObject({ stato: "non_serve", nonServe: { motivo: "nessun_incasso", segnoId: null } });
    // Chi non vede gli importi: la voce c'è ma non conta tra i mancanti.
    expect(casella(c, "fideiussione_122", "a3")).toMatchObject({ stato: "mancante", obbligatoria: false });
  });

  it("«non serve» scelto su una commessa la toglie dai conti", () => {
    const prima = calcola([]).conteggi;
    const dopo = calcola([], [segno({ order_id: "a1", voce: "ape", tipo: "non_serve" })]);
    expect(casella(dopo, "ape", "a1")).toMatchObject({ stato: "non_serve", nonServe: { motivo: "scelta" } });
    expect(dopo.conteggi.richiesti).toBe(prima.richiesti - 1);
    expect(dopo.conteggi.mancanti).toBe(prima.mancanti - 1);
  });

  it("la scadenza conta solo per le voci che scadono", () => {
    const c = calcola(
      [allegato("f1", GEN, "x.pdf")],
      [segno({ order_id: GEN, voce: "business_plan", tipo: "documento", attachment_id: "f1", scadenza: "2020-01-01" })],
    );
    expect(casella(c, "business_plan")).toMatchObject({ stato: "presente", scadenza: null });
  });

  it("i conti: richiesti, presenti, mancanti, in scadenza e scaduti", () => {
    const v = vociDelModello("appalto");
    const c = calcolaChecklist({
      voci: v, generaleId: GEN, figlie: [{ id: "o1", incassato: 0 }], oggi: OGGI,
      allegati: [allegato("f1", GEN, "Contratto.pdf"), allegato("f2", GEN, "DURC.pdf"), allegato("f3", GEN, "Polizza CAR.pdf")],
      segni: [
        segno({ order_id: GEN, voce: "durc", tipo: "documento", attachment_id: "f2", scadenza: "2026-11-10" }),
        segno({ order_id: GEN, voce: "polizza_car", tipo: "documento", attachment_id: "f3", scadenza: "2026-10-01" }),
      ],
    });
    // Obbligatorie sul contratto: contratto, cauzione, CAR, PSC, CSE, DURC (la notifica sulle figlie è facoltativa).
    expect(c.conteggi).toEqual({ richiesti: 6, presenti: 2, mancanti: 3, inScadenza: 1, scaduti: 1, senzaData: 0 });
    expect(testoConteggi(c.conteggi)).toBe("3 documenti mancanti, 1 scaduto, 1 in scadenza");
  });

  it("su ogni unità: quante valgono, quante ci sono, quante chiedono di fare qualcosa", () => {
    const c = calcola([allegato("f1", "a1", "APE A1.pdf")]);
    expect(riepilogoVoceFiglie(c.figlie.find((g) => g.voce.id === "ape")!.caselle)).toEqual({ valgono: 3, presenti: 1, daFare: 2 });
    expect(riepilogoVoceFiglie(c.figlie.find((g) => g.voce.id === "fideiussione_122")!.caselle)).toEqual({ valgono: 2, presenti: 0, daFare: 1 });
  });
});

describe("parole e date", () => {
  it("il riepilogo dice prima cosa manca, al singolare e al plurale, e niente se è tutto a posto", () => {
    expect(testoConteggi({ mancanti: 3, scaduti: 0, inScadenza: 1 })).toBe("3 documenti mancanti, 1 in scadenza");
    expect(testoConteggi({ mancanti: 1, scaduti: 0, inScadenza: 0 })).toBe("1 documento mancante");
    expect(testoConteggi({ mancanti: 0, scaduti: 2, inScadenza: 0 })).toBe("2 documenti scaduti");
    expect(testoConteggi({ mancanti: 0, scaduti: 0, inScadenza: 1 })).toBe("1 documento in scadenza");
    expect(testoConteggi({ mancanti: 0, scaduti: 0, inScadenza: 0 })).toBeNull();
  });

  it("lo stato di una casella in poche parole", () => {
    const voci = vociDelModello("appalto");
    const c = calcolaChecklist({
      voci, generaleId: GEN, figlie: [], oggi: OGGI,
      allegati: [allegato("f1", GEN, "DURC.pdf"), allegato("f2", GEN, "car.pdf")],
      segni: [segno({ order_id: GEN, voce: "durc", tipo: "documento", attachment_id: "f1", scadenza: "2026-10-31" })],
    });
    const t = (id: string) => testoCasella(c.generale.find((x) => x.voce.id === id)!);
    expect(t("durc")).toBe("Scade domani");
    expect(t("polizza_car")).toBe("Manca la data di scadenza");
    expect(t("psc")).toBe("Manca");
    expect(t("atti_aggiuntivi")).toBe("Non caricato");
  });

  it("le date si contano a giorni interi, anche a cavallo dell'ora legale", () => {
    expect(giorniTra("2026-10-24", "2026-10-26")).toBe(2);
    expect(aggiungiGiorni("2026-10-30", 120)).toBe("2027-02-27");
    expect(scadenzaProposta(voce(vociDelModello("appalto"), "durc"), OGGI)).toBe("2027-02-27");
    expect(scadenzaProposta(voce(vociDelModello("appalto"), "psc"), OGGI)).toBeNull();
  });
});
