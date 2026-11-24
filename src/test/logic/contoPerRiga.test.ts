import { describe, expect, it } from "vitest";
import { CATEGORIE_DI_BASE, chiaveRiga, contiDaCreare, contoPropostoRiga, etichettaCategoria, proposteDalleScelte, rigaTecnica } from "@/lib/fatturazione/contoPerRiga";

describe("conto di costo per riga", () => {
  it("propone il conto dalla descrizione della riga (fatture vere di calcestruzzo, ferro e minuteria)", () => {
    const p = (d: string) => contoPropostoRiga(d, CATEGORIE_DI_BASE);
    expect(p("126 CLS RCK35 S4 XC1XC2")).toBe("materie_prime");
    expect(p("POMPAGGIO AL MC AUTOPOMPA EF456GH")).toBe("noli_attrezzature");
    expect(p("DIR. CHIAMATA AUTOPOMPA")).toBe("noli_attrezzature");
    expect(p("Quota fissa Piazzamento Betonpompa")).toBe("noli_attrezzature");
    expect(p("TRASPORTO MEZZO ETERNOO")).toBe("trasporti");
    expect(p("TONDO ACCIAIO B450C M.12 D.16")).toBe("materie_prime");
    expect(p("CUBIERE PVC")).toBe("materiali_di_consumo");
    expect(p("SPRAY MULTIUSO WD-40 ml.500")).toBe("materiali_di_consumo");
    // Il disco da taglio si consuma: dal 24/11/2026 è materiale di consumo, non attrezzatura.
    expect(p("DISCO 115x1,5 FERRO-451476")).toBe("materiali_di_consumo");
    expect(p("TENAGLIA 250 KNIPEX-SLIM")).toBe("attrezzature");
    expect(p("Rif. documento 23007 del 4/08/2026")).toBeNull();
  });
  it("con le categorie proprie propone solo quelle che l'azienda ha", () => {
    expect(contoPropostoRiga("POMPAGGIO AL MC", ["materiali", "subappalti"])).toBeNull();
    expect(contoPropostoRiga("CLS RCK 37", ["materiali", "subappalti"])).toBe("materiali");
    expect(contoPropostoRiga("TRASPORTO", ["Trasporti", "materiali"])).toBe("Trasporti");
  });
  it("la chiave è il numero di riga dell'XML, altrimenti la posizione", () => {
    expect(chiaveRiga({ numero_linea: 7 }, 0)).toBe("7");
    expect(chiaveRiga({}, 2)).toBe("3");
    expect(etichettaCategoria("materiali_di_consumo")).toBe("Materiali di consumo");
  });
});

describe("un conto di costo nuovo, scritto dalla fattura (16/11/2026)", () => {
  it("il leasing è fra i conti di base e la contabilità lo sa leggere", () => {
    expect(CATEGORIE_DI_BASE).toContain("leasing");
  });
  it("il primo conto proprio si salva insieme a quelli di base: il menu non si svuota", () => {
    const righe = contiDaCreare("Leasing auto", []);
    expect(righe).toHaveLength(CATEGORIE_DI_BASE.length + 1);
    expect(righe).toContain("materiali");
    expect(righe[righe.length - 1]).toBe("Leasing auto");
  });
  it("chi ha già i suoi conti ne aggiunge uno solo, e mai un doppione", () => {
    expect(contiDaCreare("Leasing", ["Materiali", "Trasporti"])).toEqual(["Leasing"]);
    expect(contiDaCreare("  leasing ", ["Leasing"])).toEqual([]);
    expect(contiDaCreare("   ", ["Leasing"])).toEqual([]);
  });
});

describe("conto proposto: decide l'articolo, non i dettagli (24/11/2026)", () => {
  const p = (d: string) => contoPropostoRiga(d, CATEGORIE_DI_BASE);
  it("una fattura di ferramenta per serramentisti: sigillanti, schiume e viti sono consumo", () => {
    expect(p("SILICONE NEUTRO POSA SER TRASPARENTE ML.300")).toBe("materiali_di_consumo");
    expect(p("SCHIUMA POLIURETANICA POSA FLEX ML.750 PER PISTOLA")).toBe("materiali_di_consumo");
    expect(p("SIGILLANTE ACRILICO POSA ACRYL BIANCO ML.310")).toBe("materiali_di_consumo");
    // Prima: nessun conto, la vite dentro «turbovite» non si vedeva.
    expect(p("TURBOVITE POSA FIX T.RID. 7,5X122 TX30 ZINCATA")).toBe("materiali_di_consumo");
    expect(p("Spese Trasporto")).toBe("trasporti");
  });
  it("la riga ausiliaria del gestionale (dati AswT…) non ha mai un conto, anche se parla di trasporto", () => {
    const aux = "Riga ausiliaria contenente informazioni tecniche e aggiuntive del documento";
    expect(rigaTecnica(aux)).toBe(true);
    expect(p(aux)).toBeNull();
    expect(p("AswCarDoc: Fattura documento di trasporto (accompagnatoria) #CD03#")).toBeNull();
  });
  it("il trasporto in coda alla descrizione non fa della riga un trasporto", () => {
    expect(p("FOLLETTO VK7S PRONTA CONSEGNA")).toBeNull();
    expect(p("VALVOLA TBL (TRASPORTO LEGGERO) ALTRI PRODUTTORI")).toBeNull();
    expect(p("SIGILLANTE ACRILICO - Fattura documento di trasporto (accompagnatoria)")).toBe("materiali_di_consumo");
    expect(p("ADDEBITO TRASPORTO MOTRICE")).toBe("trasporti");
    expect(p("TRASPORTO MOTRICE C/GRU")).toBe("trasporti");
  });
  it("righe vere che finivano nel conto sbagliato", () => {
    expect(p("VITE MARTELLO M8X40")).toBe("materiali_di_consumo"); // era attrezzature
    expect(p("DEMO · Idropittura lavabile - secchio 14 l")).toBe("materie_prime"); // era attrezzature
    expect(p("DEMO · Battiscopa gres - barra 1 metro")).toBe("materie_prime"); // era attrezzature
    expect(p("DISTANZIATORI LIVELLANTI BASE ARCO RLS 1,5MM")).toBe("materiali_di_consumo"); // era attrezzature
    expect(p("TUBO FLESSIBILE PER SCARICO CONDENS")).toBe("materie_prime"); // era attrezzature
    expect(p("SPESA PER IL TRASPORTO DELL'ENERGIA ELETTRICA E LA GESTIONE DEL CONTATORE - QUOTA FISSA")).toBe("utenze"); // era trasporti
    expect(p("Spesa per trasporto e gestione contatore")).toBe("utenze");
    expect(p("CAMBIO CASSONE E TRASPORTO E/A CONFERIMENTO MACERIE MC.2")).toBe("servizi_generali"); // era trasporti
    expect(p("AVVIAMENTO N1 VRV A POMPA DI CALORE")).toBe("materiali"); // era noli
    expect(p("CANONE MENSILE PIATTAFORMA TAKEOFF")).toBe("servizi_generali"); // era noli
    expect(p("DISCO FRENO ANTERIORE")).toBe("manutenzioni"); // era attrezzature
    expect(p("PIAZZAMENTO POMPA BRACCIO FINO 32 MT")).toBe("noli_attrezzature");
    expect(p("DOPPIO METRO STABILA")).toBe("attrezzature");
    expect(p("CHIAVE COMBINATA SEMPLICE 17MM")).toBe("attrezzature");
  });
  it("le categorie proprie si riconoscono anche scritte in un altro modo", () => {
    expect(contoPropostoRiga("SIGILLANTE ACRILICO", ["Materiali di consumo", "Trasporti"])).toBe("Materiali di consumo");
    expect(contoPropostoRiga("VITE TRUCIOLARE", ["Consumabili", "Materiali edili"])).toBe("Consumabili");
    expect(contoPropostoRiga("SPESE DI SPEDIZIONE", ["Spedizioni"])).toBe("Spedizioni");
  });
});

describe("la scelta fatta a mano vale per le righe uguali (24/11/2026)", () => {
  const valido = (c: string) => CATEGORIE_DI_BASE.includes(c);
  const scelte = [
    // Una fattura di ferramenta classificata a mano.
    { fornitore: "FERRAMENTA", descrizione: "TURBOVITE POSA FIX T.RID. 7,5X122 TX30 ZINCATA", conto: "materiali_di_consumo" },
    { fornitore: "FERRAMENTA", descrizione: "Spese Trasporto", conto: "materiali_di_consumo" },
    { fornitore: "CALCESTRUZZI", descrizione: "126 CLS RCK35 S4 XC1XC2", conto: "materie_prime" },
    { fornitore: "ALTRO", descrizione: "Spese Trasporto", conto: "trasporti" },
  ];
  it("stesso fornitore e stessa descrizione (numeri a parte): torna la sua scelta, anche contro la regola", () => {
    const out = proposteDalleScelte({
      fornitore: "FERRAMENTA", scelte, disponibili: valido,
      righe: [
        { chiave: "1", descrizione: "TURBOVITE POSA FIX T.RID. 6X100 TX30 ZINCATA" },
        { chiave: "2", descrizione: "Spese Trasporto" },
        { chiave: "3", descrizione: "SIGILLANTE ACRILICO" },
      ],
    });
    expect(out).toEqual({ "1": "materiali_di_consumo", "2": "materiali_di_consumo" });
  });
  it("da un altro fornitore vale solo se l'azienda l'ha sempre classificata allo stesso modo", () => {
    const out = proposteDalleScelte({
      fornitore: "NUOVO", scelte, disponibili: valido,
      righe: [{ chiave: "1", descrizione: "CLS RCK 37 S4 XC1 XC2" }, { chiave: "2", descrizione: "Spese Trasporto" }],
    });
    expect(out).toEqual({ "1": "materie_prime" }); // «Spese Trasporto» ha avuto due conti diversi: decide la regola
  });
  it("una scelta su un conto che non c'è più non si propone, e la riga tecnica mai", () => {
    const out = proposteDalleScelte({
      fornitore: "X", disponibili: valido,
      scelte: [{ fornitore: "X", descrizione: "VITE", conto: "conto_cancellato" }, { fornitore: "X", descrizione: "Riga ausiliaria contenente informazioni tecniche", conto: "trasporti" }],
      righe: [{ chiave: "1", descrizione: "VITE" }, { chiave: "2", descrizione: "Riga ausiliaria contenente informazioni tecniche" }],
    });
    expect(out).toEqual({});
  });
});
