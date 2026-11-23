import { describe, expect, it } from "vitest";
import { generaDistinta, type Scomposizione, type VoceComputo } from "@/lib/distinta/generaDistinta";
import { interpretaComputo, interpretaVoce, type EsitoVoce, type NaturaVoce } from "@/lib/distinta/interpretaVoce";
import { classificaServizio } from "@/lib/distinta/serviziComputo";
import { collegaMateriali } from "@/lib/distinta/collegaArticoli";
import { pianoAcquisti, type MaterialeEsistente } from "@/lib/distinta/pianoAcquisti";
import { confrontaRevisione } from "@/lib/distinta/revisioneComputo";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";

// Computo finto con i casi che fanno sbagliare un lettore di computi (23/11/2026):
// una riga per ogni natura di voce, più i ripetuti e l'ambigua.
const voce = (v: Partial<VoceComputo> & { id: string; descrizione_breve: string }): VoceComputo => ({
  unita_misura: "cad", quantita: 1, ...v,
});

const COMPUTO_FITTIZIO: VoceComputo[] = [
  voce({ id: "serramenti", numero_ordine: "1", capitolo_nome: "Serramenti",
    descrizione_breve: "Fornitura e posa in opera di serramento in PVC a due ante",
    descrizione_estesa: "Fornitura e posa in opera di serramento in PVC a due ante, su misura, dimensioni 120x140 cm, vetrocamera 4/16/4 basso emissivo, Uw 1,3 W/m2K, colore bianco, compreso controtelaio.",
    unita_misura: "cad", quantita: 6 }),
  voce({ id: "pavimento", numero_ordine: "2", capitolo_nome: "Pavimenti",
    descrizione_breve: "Fornitura e posa in opera di pavimento in gres porcellanato 60x60",
    descrizione_estesa: "Fornitura e posa in opera di pavimento in gres porcellanato rettificato 60x60 cm, spessore 9 mm, posato a colla su massetto esistente, compresi collante e stuccatura delle fughe.",
    unita_misura: "mq", quantita: 85 }),
  voce({ id: "demolizione", numero_ordine: "3", capitolo_nome: "Demolizioni",
    descrizione_breve: "Demolizione di pavimento esistente in ceramica compreso sottofondo",
    descrizione_estesa: "Demolizione di pavimento esistente in ceramica compreso sottofondo, carico, trasporto e smaltimento a discarica autorizzata del materiale di risulta.",
    unita_misura: "mq", quantita: 85 }),
  voce({ id: "manodopera", numero_ordine: "4", capitolo_nome: "Economie",
    descrizione_breve: "Operaio specializzato per lavori in economia", unita_misura: "h", quantita: 40 }),
  voce({ id: "piattaforma", numero_ordine: "5", capitolo_nome: "Noli",
    descrizione_breve: "Nolo di piattaforma aerea autocarrata altezza 20 m", descrizione_estesa: "Nolo di piattaforma aerea autocarrata altezza 20 m, a freddo, per ogni giorno.",
    unita_misura: "giorno", quantita: 5 }),
  voce({ id: "sicurezza", numero_ordine: "6", capitolo_nome: "Sicurezza",
    descrizione_breve: "Oneri di sicurezza", unita_misura: "a corpo", quantita: 1, a_corpo: true }),
  voce({ id: "committente", numero_ordine: "7", capitolo_nome: "Bagno",
    descrizione_breve: "Posa in opera di sanitari forniti dal committente", unita_misura: "cad", quantita: 4 }),
  voce({ id: "subappalto", numero_ordine: "8", capitolo_nome: "Impianto elettrico",
    descrizione_breve: "Realizzazione di impianto elettrico completo affidato a ditta specializzata",
    descrizione_estesa: "Realizzazione di impianto elettrico completo dell'unità immobiliare, affidato in subappalto a ditta specializzata, compresi materiali, certificazione e dichiarazione di conformità.",
    unita_misura: "a corpo", quantita: 1, a_corpo: true }),
  voce({ id: "battiscopa-1", numero_ordine: "9", capitolo_nome: "Pavimenti",
    descrizione_breve: "Fornitura di battiscopa in gres porcellanato h 8 cm", unita_misura: "m", quantita: 40 }),
  voce({ id: "battiscopa-2", numero_ordine: "10", capitolo_nome: "Pavimenti",
    descrizione_breve: "Fornitura di battiscopa in gres porcellanato h 8 cm", unita_misura: "ml", quantita: 22 }),
  voce({ id: "pittura", numero_ordine: "11", capitolo_nome: "Tinteggiature",
    descrizione_breve: "Fornitura di idropittura lavabile bianca per interni", unita_misura: "l", quantita: 60 }),
  voce({ id: "ambigua", numero_ordine: "12", capitolo_nome: "Varie",
    descrizione_breve: "Opere accessorie e assistenze varie", unita_misura: "", quantita: null }),
  voce({ id: "spese-generali", numero_ordine: "13", capitolo_nome: "Varie",
    descrizione_breve: "Spese generali e imprevisti", unita_misura: "a corpo", quantita: 1, a_corpo: true }),
];

const RISERVA = catalogoComeScomposizioni();
const distinta = generaDistinta({ voci: COMPUTO_FITTIZIO, scomposizioni: [], riserva: RISERVA });
const letto = interpretaComputo({ voci: COMPUTO_FITTIZIO, riserva: RISERVA, distinta });
const voceLetta = (id: string) => letto.voci.find((v) => v.voce_id === id)!;
const riga = (inizio: string) => distinta.righe.find((r) => r.descrizione.startsWith(inizio));

// Che cosa ci si aspetta da ogni riga: è anche il metro delle misure in fondo.
const ATTESO: Record<string, { nature: NaturaVoce[]; esito: EsitoVoce }> = {
  serramenti: { nature: ["materiale", "lavorazione"], esito: "materiali" },
  pavimento: { nature: ["lavorazione", "materiale"], esito: "materiali" },
  demolizione: { nature: ["lavorazione", "prestazione"], esito: "servizio" },
  manodopera: { nature: ["manodopera"], esito: "servizio" },
  piattaforma: { nature: ["nolo"], esito: "servizio" },
  sicurezza: { nature: ["economica", "ambigua"], esito: "da_chiarire" },
  committente: { nature: ["lavorazione", "fornitura_committente"], esito: "nessun_acquisto" },
  subappalto: { nature: ["subappalto"], esito: "servizio" },
  "battiscopa-1": { nature: ["materiale"], esito: "materiali" },
  "battiscopa-2": { nature: ["materiale"], esito: "materiali" },
  pittura: { nature: ["materiale"], esito: "materiali" },
  ambigua: { nature: ["economica", "ambigua"], esito: "da_chiarire" },
  "spese-generali": { nature: ["economica", "ambigua"], esito: "da_chiarire" },
};

describe("computo fittizio: natura di ogni voce", () => {
  it.each(Object.entries(ATTESO))("%s", (id, atteso) => {
    const v = voceLetta(id);
    expect([...v.nature].sort()).toEqual([...atteso.nature].sort());
    expect(v.esito).toBe(atteso.esito);
    expect(v.motivo.length).toBeGreaterThan(5);
  });
});

describe("computo fittizio: che cosa si compra e che cosa no", () => {
  it("nessun articolo da oneri di sicurezza, spese generali, noli, manodopera, subappalto, committente, voce ambigua", () => {
    const vietate = new Set(["sicurezza", "spese-generali", "piattaforma", "manodopera", "subappalto", "committente", "ambigua", "demolizione"]);
    const improprie = distinta.righe.filter((r) => r.origini.some((o) => o.tipo === "computo" && vietate.has(o.voce_id)));
    expect(improprie).toEqual([]);
  });

  it("le voci generiche non vanno all'AI come «da scomporre»: prima erano materiali inventati", () => {
    expect(distinta.senzaScomposizione.map((v) => v.id)).toEqual([]);
  });

  it("oneri di sicurezza a corpo: registrati, con la domanda giusta, senza acquisti", () => {
    const v = voceLetta("sicurezza");
    expect(v.daChiarire.join(" ")).toMatch(/apprestamenti/);
    expect(v.daChiarire.join(" ")).toMatch(/non si compra/);
  });

  it("oneri di sicurezza col dettaglio: la recinzione è un nolo da contrattare, non un onere generico", () => {
    const dettaglio = interpretaVoce(voce({ id: "rec", descrizione_breve: "Recinzione di cantiere con pannelli metallici, nolo per ogni mese",
      is_sicurezza: true, unita_misura: "m", quantita: 120, misure: [{ descrizione: "per 3 mesi", quantita: 120 }] }));
    expect(dettaglio.nature).toEqual(["nolo"]);
    expect(dettaglio.esito).toBe("servizio");
  });

  it("il nolo della piattaforma compare fra i servizi, con la durata e il richiamo alle attrezzature dell'azienda", () => {
    const s = classificaServizio(COMPUTO_FITTIZIO.find((v) => v.id === "piattaforma")!);
    expect(s?.tipo).toBe("nolo");
    expect(s?.nota).toMatch(/5 giorno/);
    expect(s?.nota).toMatch(/attrezzature dell'azienda/);
  });

  it("subappalto: riconosciuto come ditta esterna, non come «pratica tecnica»", () => {
    expect(classificaServizio(COMPUTO_FITTIZIO.find((v) => v.id === "subappalto")!)?.tipo).toBe("subappalto");
    expect(distinta.escluse.find((e) => e.voce_id === "subappalto")?.motivo).toMatch(/affidata a una ditta/);
  });

  it("demolizione con smaltimento: nessun materiale, ma lo smaltimento compare fra i servizi da contrattare", () => {
    expect(voceLetta("demolizione").nature).toContain("prestazione");
    const s = classificaServizio(COMPUTO_FITTIZIO.find((v) => v.id === "demolizione")!);
    expect(s).toMatchObject({ tipo: "prestazione" });
    expect(s?.nota).toMatch(/trasporto e conferimento vanno contrattati/);
  });

  it("una demolizione senza smaltimento non diventa un servizio; un rifacimento con smaltimento resta ai materiali", () => {
    expect(classificaServizio(voce({ id: "d", descrizione_breve: "Demolizione di tramezzi in laterizio", unita_misura: "mq", quantita: 30 }))).toBeNull();
    expect(classificaServizio(voce({ id: "r", descrizione_breve: "Rimozione e rifacimento di intonaco civile, compreso smaltimento del materiale di risulta", unita_misura: "mq", quantita: 30 }))).toBeNull();
    expect(classificaServizio(voce({ id: "s", descrizione_breve: "Smaltimento di macerie presso impianto autorizzato", unita_misura: "mc", quantita: 12 }))?.tipo).toBe("prestazione");
  });

  it("voce senza quantità né unità: da chiarire, non «esclusa» e basta", () => {
    expect(voceLetta("ambigua").esito).toBe("da_chiarire");
    expect(voceLetta("ambigua").daChiarire.join(" ")).toMatch(/quantità/i);
  });
});

describe("computo fittizio: quantità, unità, caratteristiche", () => {
  it("serramento su misura: 6 pezzi, con formato, vetro, trasmittanza e «su misura» accanto al nome", () => {
    const r = riga("Serramento in PVC")!;
    expect(r.quantita_calcolata).toBe(6);
    expect(r.unita_misura).toBe("cad");
    const note = r.note.join(" ");
    for (const pezzo of ["su misura", "120x140 cm", "vetrocamera 4/16/4 basso emissivo", "Uw 1,3 W/m2K", "colore bianco"]) expect(note).toContain(pezzo);
    expect(note).toMatch(/Posa e manodopera della voce escluse/);
    // Le caratteristiche non entrano nella chiave: le righe già confermate non si ripropongono.
    expect(r.specifiche).toBeNull();
  });

  it("pavimento: piastrelle con lo sfrido dichiarato, collante e stucco dalla resa della libreria (fonte visibile)", () => {
    const piastrelle = riga("Piastrelle in gres")!;
    expect(piastrelle.quantita_netta).toBe(85);
    expect(piastrelle.sfrido).toBe(10);
    expect(piastrelle.quantita_calcolata).toBe(93.5);
    for (const nome of ["Adesivo cementizio", "Stucco per fughe"]) {
      const r = riga(nome)!;
      expect(r.fonte).toBe("libreria_standard");
      expect(r.origini.every((o) => o.tipo === "computo" && o.voce_id === "pavimento")).toBe(true);
    }
    expect(voceLetta("pavimento").daChiarire.join(" ")).toMatch(/resa media/);
  });

  it("battiscopa ripetuto in due righe (m e ml): una riga sola da 62 m, con tutte e due le voci d'origine", () => {
    const r = distinta.righe.filter((x) => x.descrizione.startsWith("Battiscopa"));
    expect(r).toHaveLength(1);
    expect(r[0].quantita_calcolata).toBe(62);
    expect(r[0].unita_misura).toBe("m");
    expect(r[0].origini.map((o) => (o.tipo === "computo" ? o.voce_id : ""))).toEqual(["battiscopa-1", "battiscopa-2"]);
    expect(letto.sommeDaControllare).toEqual([]);
  });

  it("stesso nome, formato diverso: la somma si fa notare invece di passare in silenzio", () => {
    const voci = [
      voce({ id: "a", numero_ordine: "1", descrizione_breve: "Fornitura di finestra in PVC", descrizione_estesa: "Fornitura di finestra in PVC, dimensioni 120x140 cm.", quantita: 2 }),
      voce({ id: "b", numero_ordine: "2", descrizione_breve: "Fornitura di finestra in PVC", descrizione_estesa: "Fornitura di finestra in PVC, dimensioni 80x140 cm.", quantita: 3 }),
    ];
    const d = generaDistinta({ voci, scomposizioni: [] });
    const l = interpretaComputo({ voci, distinta: d });
    expect(d.righe).toHaveLength(1);
    expect(l.sommeDaControllare).toHaveLength(1);
    expect(l.sommeDaControllare[0].voci.map((v) => v.caratteristiche[0])).toEqual(["120x140 cm", "80x140 cm"]);
  });

  it("ogni riga risale alla voce del computo che l'ha generata", () => {
    const ids = new Set(COMPUTO_FITTIZIO.map((v) => v.id));
    for (const r of distinta.righe) {
      expect(r.origini.length).toBeGreaterThan(0);
      for (const o of r.origini) expect(o.tipo === "computo" && ids.has(o.voce_id)).toBe(true);
    }
  });
});

describe("computo fittizio: una ricetta dell'azienda vince sulle regole generiche", () => {
  it("«Oneri di sicurezza» con la ricetta dell'azienda (cartelli, recinzione) genera i suoi materiali", () => {
    const ricetta: Scomposizione = { id: "r", nome: "Sicurezza base", parole_chiave: ["oneri di sicurezza"], attiva: true,
      componenti: [{ descrizione: "Cartello di cantiere", unita_misura: "pz", quantita_per_unita: 2 }] };
    const v = COMPUTO_FITTIZIO.find((x) => x.id === "sicurezza")!;
    expect(interpretaVoce(v, [ricetta]).esito).toBe("materiali");
    expect(generaDistinta({ voci: [v], scomposizioni: [ricetta] }).righe.map((r) => r.descrizione)).toEqual(["Cartello di cantiere"]);
  });
});

describe("computo fittizio: fabbisogno netto, reimportazione, revisione", () => {
  const collegati = collegaMateriali(distinta.righe, { articoli: [], listini: [], giaUsati: [] });
  const battiscopa = collegati.find((m) => m.descrizione.startsWith("Battiscopa"))!;
  const pittura = collegati.find((m) => m.descrizione.startsWith("Idropittura"))!;

  it("battiscopa: 62 m necessari, 15 già ordinati, 20 a magazzino → 27 m da comprare; la giacenza non si conta due volte", () => {
    const [r] = pianoAcquisti([battiscopa], {
      magazzino: [{ id: "w1", name: "Battiscopa in gres porcellanato h 8 cm", unita_misura: "m", quantity_available: 20 }] as never,
      esistenti: [{ id: "oi1", chiave_materiale: battiscopa.chiave, stock_item_id: null }],
      coperture: [{ id: "r1", order_item_id: "oi1", quantity: 15, quantity_received: 0, unit_of_measure: "m", purchase_orders: { id: "po", oda_number: "ODA-7", status: "confermato" } }] as never,
      fasi: [], fornitori: [],
    });
    expect(r).toMatchObject({ necessario: 62, ordinato: 15, daMagazzino: 20, daComprare: 27 });
    expect(r.giacenze).toEqual([{ id: "w1", quantita: 20 }]);
  });

  it("un «battiscopa in legno» a magazzino non copre quello in gres", () => {
    const [r] = pianoAcquisti([battiscopa], { magazzino: [{ id: "w2", name: "Battiscopa in legno", unita_misura: "m", quantity_available: 100 }] as never, esistenti: [], coperture: [], fasi: [], fornitori: [] });
    expect(r.daComprare).toBe(62);
  });

  it("reimportare lo stesso computo dà le stesse chiavi: niente doppioni", () => {
    const seconda = generaDistinta({ voci: COMPUTO_FITTIZIO.map((v) => ({ ...v, id: `nuovo-${v.id}` })), scomposizioni: [], riserva: RISERVA });
    expect(seconda.righe.map((r) => r.chiave).sort()).toEqual(distinta.righe.map((r) => r.chiave).sort());
  });

  it("revisione: la pittura passa da 60 a 80 l e il battiscopa sparisce → segnalati, senza toccare gli articoli confermati", () => {
    const confermati: MaterialeEsistente[] = [battiscopa, pittura].map((m, i): MaterialeEsistente => ({ id: `oi${i}`, chiave_materiale: m.chiave, stock_item_id: null, name: m.descrizione,
      unita_misura: m.unita_misura, quantita_calcolata: m.quantita_calcolata, origini: m.origini }));
    const revisione = generaDistinta({ scomposizioni: [], riserva: RISERVA,
      voci: COMPUTO_FITTIZIO.filter((v) => !v.id.startsWith("battiscopa")).map((v) => (v.id === "pittura" ? { ...v, quantita: 80 } : v)) });
    const prima = JSON.stringify(confermati);
    expect(confrontaRevisione(revisione.righe, confermati).map((x) => [x.tipo, x.nome, x.prima, x.ora])).toEqual([
      ["non_piu_nel_computo", "Battiscopa in gres porcellanato h 8 cm", 62, null],
      ["quantita_cambiata", "Idropittura lavabile bianca per interni", 60, 80],
    ]);
    expect(JSON.stringify(confermati)).toBe(prima);
    // Senza modifiche: nessuna segnalazione.
    expect(confrontaRevisione(distinta.righe, confermati)).toEqual([]);
  });

  it("un articolo aggiunto a mano (non dal computo) non viene segnalato come «sparito»", () => {
    const aMano: MaterialeEsistente[] = [{ id: "x", chiave_materiale: "a-mano", stock_item_id: null, name: "Silicone", origini: [] }];
    expect(confrontaRevisione([], aMano)).toEqual([]);
  });
});

describe("computo fittizio: misure", () => {
  it("13 voci su 13 classificate come atteso, 0 articoli impropri, 0 doppioni", () => {
    const giuste = letto.voci.filter((v) => {
      const a = ATTESO[v.voce_id];
      return a && v.esito === a.esito && [...v.nature].sort().join() === [...a.nature].sort().join();
    }).length;
    const chiavi = distinta.righe.map((r) => r.chiave);
    const misure = {
      voci: letto.voci.length,
      classificateBene: giuste,
      articoliImpropri: distinta.righe.filter((r) => r.origini.some((o) => o.tipo === "computo" && ATTESO[o.voce_id]?.esito !== "materiali")).length,
      doppioni: chiavi.length - new Set(chiavi).size,
      materiali: distinta.righe.length,
      daChiarire: letto.daChiarire.length,
      chiamateAI: 0,
    };
    expect(misure).toEqual({ voci: 13, classificateBene: 13, articoliImpropri: 0, doppioni: 0, materiali: 6, daChiarire: 3, chiamateAI: 0 });
  });
});
