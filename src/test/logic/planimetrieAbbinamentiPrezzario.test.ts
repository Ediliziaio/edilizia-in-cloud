/**
 * Gli abbinamenti lavorazione → voce del prezzario regionale (shared/planimetrie/abbinamentiPrezzario.ts).
 *
 * Il CI non vede il database: le voci abbinate sono estratte in `fixtures/prezzarioVociAbbinate.json`.
 * Per rifare l'estrazione (sola lettura) dopo aver cambiato un codice o con un'edizione nuova:
 *
 *   select f.regione, f.anno, v.codice, v.unita_misura, v.prezzo, v.descrizione
 *     from prezzario_voce v join prezzario_fonte f on f.id = v.fonte_id
 *    where f.stato = 'pubblicato' and f.regione = '<regione>' and f.anno = <anno>
 *      and v.codice in (<codici del file>);
 *
 * Un codice che non torna, o che torna due volte, è un abbinamento da rifare.
 */
import { describe, expect, it } from "vitest";
import { ABBINAMENTI_PREZZARIO, abbinamentiPerRegione, PROVINCE_TOSCANA, regioneDelPrezzario, unitaDelPrezzario } from "../../../shared/planimetrie/abbinamentiPrezzario";
import { FONTE_INDICATIVA, proponiPrezzo, REGOLE_LAVORAZIONI, type FontiPrezzi, type TipoLavorazione } from "@/lib/planimetrie/prezziProposti";
import { unitaCompatibili } from "@/lib/prezzario/confronto";
import riscontro from "../fixtures/prezzarioVociAbbinate.json";

/**
 * L'unità della riga che la pianta genera per ogni lavorazione abbinabile al prezzario
 * (studioImmobiliare). Le lavorazioni della nuova costruzione non hanno ancora abbinamenti.
 */
const UNITA_RIGA: Partial<Record<TipoLavorazione, string>> & Record<string, string> = {
  demolizione_tramezzo: "m²", demolizione_muratura: "m²", nuovo_tramezzo: "m²", nuova_muratura: "m²",
  macerie: "a corpo", ripristino: "m²", intonaco: "m²", tinteggiatura: "m²", battiscopa: "m",
  porta: "cad", finestra: "cad", portafinestra: "cad", varco: "cad", chiusura_vano: "m²", rimozione_serramento: "cad",
  pavimento: "m²", rivestimento: "m²", radiante_pannelli: "m²", radiante_tubo: "m", radiante_collettore: "cad",
};

/** Una riga della pianta di quel tipo, come la scrive lo studio. */
const RIGA: Partial<Record<TipoLavorazione, { id: string; descrizione: string }>> & Record<string, { id: string; descrizione: string }> = {
  demolizione_tramezzo: { id: "m1", descrizione: "Demolizione tramezzo" },
  demolizione_muratura: { id: "m1", descrizione: "Demolizione parete" },
  nuovo_tramezzo: { id: "m1", descrizione: "Nuovo tramezzo" },
  nuova_muratura: { id: "m1", descrizione: "Nuova muratura" },
  macerie: { id: "m1-macerie", descrizione: "Carico, trasporto e smaltimento delle macerie" },
  ripristino: { id: "m1-ripristino", descrizione: "Ripristino del pavimento" },
  intonaco: { id: "m1-intonaco", descrizione: "Intonaco sulle due facce della nuova parete" },
  tinteggiatura: { id: "m1-tinteggiatura", descrizione: "Tinteggiatura delle due facce della nuova parete" },
  battiscopa: { id: "m1-battiscopa", descrizione: "Battiscopa ai piedi della nuova parete" },
  porta: { id: "a1", descrizione: "Realizzazione porta" },
  finestra: { id: "a1", descrizione: "Realizzazione finestra" },
  portafinestra: { id: "a1", descrizione: "Realizzazione portafinestra" },
  varco: { id: "a1", descrizione: "Realizzazione varco" },
  chiusura_vano: { id: "a1", descrizione: "Chiusura porta" },
  rimozione_serramento: { id: "a1", descrizione: "Rimozione porta" },
  pavimento: { id: "l1-pavimento", descrizione: "Posa pavimento · Soggiorno" },
  rivestimento: { id: "l1-rivestimento", descrizione: "Rivestimento · Bagno" },
  radiante_pannelli: { id: "l1-radiante-pannelli", descrizione: "Pannelli radiante" },
  radiante_tubo: { id: "l1-radiante-tubo", descrizione: "Tubo radiante" },
  radiante_collettore: { id: "l1-radiante-collettore", descrizione: "Collettore per pavimento radiante" },
};

type VoceRiscontro = { regione: string; anno: number; codice: string; unita_misura: string; prezzo: number; descrizione: string; provincia?: string };
const voci = riscontro.voci as VoceRiscontro[];
/** La voce nel database; per un prezzario a province, quella di Firenze. */
const voceNelDb = (regione: string, anno: number, codice: string, provincia: string | undefined = abbinamentiPerRegione(regione)?.perProvincia ? "Firenze" : undefined) =>
  voci.filter((v) => v.regione === regione && v.anno === anno && v.codice === codice && v.provincia === provincia);
const nomeMostrato = (regione: string) => {
  const a = abbinamentiPerRegione(regione)!;
  return `${a.regione.replace(/^Trentino — /, "")} ${a.anno}${a.perProvincia ? " (Firenze)" : ""}`;
};

const abbinate = ABBINAMENTI_PREZZARIO.flatMap((a) => Object.entries(a.voci).map(([tipo, v]) => ({ a, tipo: tipo as TipoLavorazione, v })));

/** Le fonti come le carica `fontiPrezzi` per un'azienda di quella regione e senza listino. */
const fontiDa = (regione: string): FontiPrezzi => {
  const a = abbinamentiPerRegione(regione)!;
  const prezzario: FontiPrezzi["prezzario"] = {};
  for (const [tipo, v] of Object.entries(a.voci)) {
    const db = voceNelDb(a.regione, a.anno, v.codice)[0];
    prezzario[tipo as TipoLavorazione] = { codice: db.codice, descrizione: db.descrizione, unita: unitaDelPrezzario(db.unita_misura), prezzo: db.prezzo };
  }
  return { listino: [], prezzario, prezzarioNome: nomeMostrato(regione) };
};

describe("abbinamenti al prezzario regionale: ogni codice è verificato", () => {
  it.each(abbinate.map((x) => [`${x.a.regione} · ${x.tipo}`, x] as const))("%s", (_n, { a, tipo, v }) => {
    expect(tipo in REGOLE_LAVORAZIONI).toBe(true);
    // Il codice esiste, una volta sola, nella fonte di quella regione e di quell'anno.
    const db = voceNelDb(a.regione, a.anno, v.codice);
    expect(db).toHaveLength(1);
    // L'unità scritta è quella del prezzario, ed è quella della riga della pianta.
    expect(unitaCompatibili(unitaDelPrezzario(db[0].unita_misura), v.unita)).toBe(true);
    expect(unitaCompatibili(v.unita, UNITA_RIGA[tipo])).toBe(true);
    // La descrizione nel file è quella vera (i pezzi fra «…» sono tagli).
    for (const pezzo of v.descrizione.split("…").map((s) => s.trim().replace(/^—\s*/, "")).filter(Boolean)) {
      expect(db[0].descrizione).toContain(pezzo.replace(/[;,.]$/, ""));
    }
    // In Lombardia solo opere compiute (OC: materiale e posa), mai le risorse materiali (RM).
    if (a.regione === "Lombardia") expect(v.codice.startsWith("LOM261.OC.")).toBe(true);
  });

  it("ogni codice compare una sola volta nel file", () => {
    for (const a of ABBINAMENTI_PREZZARIO) {
      const codici = Object.values(a.voci).map((v) => v.codice);
      expect(new Set(codici).size).toBe(codici.length);
    }
  });

  it("almeno dieci lavorazioni coperte in Lombardia, e tutte le fonti pubblicate hanno abbinamenti", () => {
    expect(Object.keys(abbinamentiPerRegione("Lombardia")!.voci).length).toBeGreaterThanOrEqual(10);
    expect(abbinamentiPerRegione(" lombardia ")?.regione).toBe("Lombardia");
    expect(abbinamentiPerRegione("Atlantide")).toBeNull();
    // Le 21 regioni (Trentino in due) con un prezzario pubblicato il 24/11/2026.
    expect(ABBINAMENTI_PREZZARIO.map((a) => a.regione).sort()).toEqual(["Abruzzo", "Basilicata", "Calabria", "Campania",
      "Emilia-Romagna", "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", "Molise", "Piemonte", "Puglia",
      "Sardegna", "Sicilia", "Toscana", "Trentino — P.A. Bolzano", "Trentino — P.A. Trento", "Umbria", "Valle d'Aosta", "Veneto"]);
  });

  it("una lavorazione è o abbinata o esclusa col motivo, mai tutte e due", () => {
    for (const a of ABBINAMENTI_PREZZARIO) {
      for (const tipo of Object.keys(a.escluse ?? {})) {
        expect(tipo in REGOLE_LAVORAZIONI).toBe(true);
        expect(a.voci[tipo]).toBeUndefined();
      }
    }
  });

  it("Toscana: ogni codice c'è, uguale, in tutte e dieci le province", () => {
    const a = abbinamentiPerRegione("Toscana")!;
    expect(a.perProvincia).toBe(true);
    for (const v of Object.values(a.voci)) {
      for (const provincia of Object.values(PROVINCE_TOSCANA)) {
        const db = voceNelDb("Toscana", a.anno, v.codice, provincia);
        expect(db, `${v.codice} · ${provincia}`).toHaveLength(1);
        expect(unitaCompatibili(unitaDelPrezzario(db[0].unita_misura), v.unita)).toBe(true);
      }
    }
  });

  it("la regione del prezzario: il Trentino si sceglie per Provincia autonoma", () => {
    expect(regioneDelPrezzario("Trentino-Alto Adige", "TN")).toBe("Trentino — P.A. Trento");
    expect(regioneDelPrezzario("Trentino-Alto Adige", "bz")).toBe("Trentino — P.A. Bolzano");
    expect(regioneDelPrezzario("Trentino-Alto Adige", null)).toBeNull();
    expect(regioneDelPrezzario("Lombardia", "LO")).toBe("Lombardia");
    expect(regioneDelPrezzario(null, "LO")).toBeNull();
  });
});

describe("prezzo proposto dal prezzario della regione", () => {
  it.each(ABBINAMENTI_PREZZARIO.map((a) => a.regione))("%s: le lavorazioni abbinate prendono la voce, col codice nella fonte", (regione) => {
    const fonti = fontiDa(regione), a = abbinamentiPerRegione(regione)!;
    for (const [tipo, v] of Object.entries(a.voci) as [TipoLavorazione, (typeof a.voci)[string]][]) {
      const prezzo = proponiPrezzo({ ...RIGA[tipo], unita: UNITA_RIGA[tipo] as "m²" }, fonti);
      expect(prezzo).toEqual({ importo: fonti.prezzario[tipo]!.prezzo, unita: UNITA_RIGA[tipo], tariffa: v.codice,
        fonte: `Prezzario ${nomeMostrato(regione)} · ${v.codice}, da confermare`.slice(0, 300) });
      // Plausibile per fornitura e posa: nello stesso ordine di grandezza del prezzo indicativo
      // (sotto: un quarto, perché la demolizione a mano senza trasporto sta a 8–10 € in Lazio e Molise).
      const indicativo = REGOLE_LAVORAZIONI[tipo].indicativo;
      expect(prezzo!.importo).toBeGreaterThan(indicativo / 4);
      expect(prezzo!.importo).toBeLessThan(indicativo * 3);
    }
  });

  it("le lavorazioni senza abbinamento restano al prezzo indicativo", () => {
    const fonti = fontiDa("Lombardia");
    expect(proponiPrezzo({ ...RIGA.finestra, unita: "cad" }, fonti)?.fonte).toBe(FONTE_INDICATIVA);
    expect(proponiPrezzo({ ...RIGA.demolizione_muratura, unita: "m²" }, fonti)?.fonte).toBe(FONTE_INDICATIVA);
  });

  it("il listino dell'azienda vince sul prezzario", () => {
    const fonti = { ...fontiDa("Lombardia"), listino: [{ codice: "INT.1", descrizione: "Intonaco civile interno", unita: "mq", prezzo: 22 }] };
    expect(proponiPrezzo({ ...RIGA.intonaco, unita: "m²" }, fonti)).toMatchObject({ importo: 22, fonte: "Listino aziendale" });
  });

  it("una voce abbinata con l'unità sbagliata non quota la riga", () => {
    const fonti = fontiDa("Lombardia");
    const storta = { ...fonti, prezzario: { ...fonti.prezzario, battiscopa: { ...fonti.prezzario.battiscopa!, unita: "m²" } } };
    expect(proponiPrezzo({ ...RIGA.battiscopa, unita: "m" }, storta)?.fonte).toBe(FONTE_INDICATIVA);
  });

  it("il nome del file di unità: «1 m²» è m²", () => {
    expect(unitaDelPrezzario("1 m²")).toBe("m²");
    expect(unitaDelPrezzario("100 kg")).toBe("100 kg");
    expect(unitaDelPrezzario(null)).toBeNull();
  });
});
