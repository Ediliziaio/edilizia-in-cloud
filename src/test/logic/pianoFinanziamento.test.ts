/**
 * Il piano di finanziamento dello step Economia dei Serramenti (06/10/2026): come si compone quello che finisce
 * nel preventivo. Nessun conto nuovo: si usano `findMigliorRiga`, `getDurateUniche` e `calcolaPianoFinanziamento`.
 */
import { describe, expect, it } from "vitest";
import type { RigaFinanziamento } from "@/hooks/useTabelleFinanziamento";
import { findMigliorRiga } from "@/hooks/useTabelleFinanziamento";
import { calcolaPianoFinanziamento } from "@/lib/serramenti/ecobonus";
import {
  ANTICIPI_VELOCI, durateConRata, fasceTabella, importoFinanziatoDa, motivoPianoIndietro, PIANO_MANUALE_DI_SERIE, pianiManuali, pianiManualiDaSalvati,
  pianiUguali, pianoDaTabella,
} from "@/lib/serramenti/pianoFinanziamento";
import type { SrPianoFinanziamento } from "@/types/serramenti";

const riga = (durata: number, fascia: number, rata: number, extra: Partial<RigaFinanziamento> = {}): RigaFinanziamento => ({
  id: `r-${durata}-${fascia}`, tabella_id: "t1", subtariffa: null as string | null, importo_erogato: fascia, spese_istruttoria: null as number | null,
  importo_totale_credito: null as number | null, numero_rate: durata, durata_mesi: durata, prima_rata_giorni: null as number | null,
  importo_rata: rata, spese_incasso_rata: null as number | null, interessi_cliente: null as number | null,
  importo_totale_dovuto: null as number | null, tan: 5.9, taeg: 6.45, icc: null as number | null, ...extra,
});
const RIGHE = [
  riga(60, 5000, 100), riga(24, 8000, 366.72), riga(60, 8000, 160), riga(24, 5000, 229.2), riga(60, 12000, 240), riga(24, 12000, 550.08),
];

describe("importoFinanziatoDa", () => {
  it("è il totale meno l'anticipo, non arrotondato", () => {
    expect(importoFinanziatoDa(11_000, 30)).toBe(7_700);
    expect(importoFinanziatoDa(12_901.23, 33)).toBeCloseTo(12_901.23 - (12_901.23 * 33) / 100, 8);
  });
  it("mai negativo", () => {
    expect(importoFinanziatoDa(11_000, 120)).toBe(0);
    expect(importoFinanziatoDa(0, 30)).toBe(0);
  });
});

describe("ANTICIPI_VELOCI", () => {
  it("0, 10, 20, 30, 40", () => {
    expect([...ANTICIPI_VELOCI]).toEqual([0, 10, 20, 30, 40]);
  });
});

describe("durateConRata", () => {
  it("una riga per durata, in ordine, con la riga che userebbe il preventivo (fascia ≥ importo)", () => {
    const durate = durateConRata(RIGHE, 7_700);
    expect(durate.map((d) => d.durataMesi)).toEqual([24, 60]);
    expect(durate.map((d) => d.riga.id)).toEqual(["r-24-8000", "r-60-8000"]);
    expect(durate.map((d) => d.riga.importo_rata)).toEqual([366.72, 160]);
  });

  it("è la stessa riga che dà findMigliorRiga, per qualunque importo dentro le fasce", () => {
    for (const importo of [1_000, 5_000, 5_001, 8_000, 11_999, 12_000]) {
      const durate = durateConRata(RIGHE, importo);
      expect(durate).toHaveLength(2);
      for (const d of durate) {
        expect(d.riga).toBe(findMigliorRiga(RIGHE, importo, d.durataMesi));
      }
    }
  });

  // Prima (fino al 06/10/2026) oltre l'ultima fascia valeva la rata dell'ultima: con 45.000 su fasce fino a 30.000 era
  // la rata dei 30.000, un terzo in meno, e finiva nel PDF. Questo test fissava quel comportamento: ora è «nessuna rata».
  it("oltre l'ultima fascia NESSUNA durata ha una rata (non la rata dell'ultima fascia); senza righe nessuna durata", () => {
    expect(durateConRata(RIGHE, 12_000.01)).toEqual([]);
    expect(durateConRata(RIGHE, 99_999)).toEqual([]);
    expect(durateConRata([], 5_000)).toEqual([]);
  });

  it("le durate con fasce diverse: ognuna ha la rata solo fin dove arriva la sua ultima fascia", () => {
    const righe = [riga(24, 10_000, 450), riga(24, 20_000, 900), riga(60, 10_000, 200), riga(60, 20_000, 400), riga(60, 30_000, 600)];
    expect(durateConRata(righe, 15_000).map((d) => [d.durataMesi, d.riga.importo_rata])).toEqual([[24, 900], [60, 400]]);
    expect(durateConRata(righe, 25_000).map((d) => [d.durataMesi, d.riga.importo_rata])).toEqual([[60, 600]]);
    expect(durateConRata(righe, 31_000)).toEqual([]);
  });
});

describe("findMigliorRiga oltre l'ultima fascia (il controllo del 06/10/2026)", () => {
  // Fasce 10 / 20 / 30 mila, 60 rate: la rata cresce con la fascia. L'importo vero da finanziare è 45.000.
  const FASCE = [riga(60, 10_000, 200), riga(60, 20_000, 400), riga(60, 30_000, 600)];

  it("dentro le fasce: la prima fascia che copre l'importo (importo = fascia compreso)", () => {
    expect(findMigliorRiga(FASCE, 9_999, 60)?.importo_rata).toBe(200);
    expect(findMigliorRiga(FASCE, 10_000, 60)?.importo_rata).toBe(200);
    expect(findMigliorRiga(FASCE, 10_000.01, 60)?.importo_rata).toBe(400);
    expect(findMigliorRiga(FASCE, 30_000, 60)?.importo_rata).toBe(600);
  });

  it("oltre l'ultima fascia: null, NON la rata di 600 (che per 45.000 era un terzo in meno)", () => {
    expect(findMigliorRiga(FASCE, 45_000, 60)).toBeNull();
    expect(findMigliorRiga(FASCE, 30_000.01, 60)).toBeNull();
  });

  it("una durata che non c'è: la più vicina in eccesso, con le sue fasce", () => {
    const righe = [...FASCE, riga(84, 10_000, 150), riga(84, 20_000, 300)];
    // 72 non c'è: si usa 84 (in eccesso), che arriva a 20.000
    expect(findMigliorRiga(righe, 15_000, 72)?.id).toBe("r-84-20000");
    // ... e a 84 mesi 25.000 sono già fuori fascia
    expect(findMigliorRiga(righe, 25_000, 72)).toBeNull();
  });

  it("una durata più lunga di tutte quelle in tabella: vale la più lunga, con le sue fasce (non una riga a caso)", () => {
    const righe = [riga(24, 10_000, 450), riga(24, 20_000, 900), riga(60, 10_000, 200), riga(60, 20_000, 400), riga(60, 30_000, 600)];
    // 120 non c'è e nessuna è in eccesso: si usa 60, e per 15.000 la fascia giusta è 20.000 (non l'ultima riga in elenco)
    expect(findMigliorRiga(righe, 15_000, 120)?.id).toBe("r-60-20000");
    expect(findMigliorRiga(righe, 35_000, 120)).toBeNull();
  });

  it("senza righe: null", () => {
    expect(findMigliorRiga([], 5_000, 60)).toBeNull();
  });
});

describe("fasceTabella", () => {
  it("l'ultima fascia della tabella e le durate che per questo importo non hanno una rata", () => {
    const righe = [riga(24, 10_000, 450), riga(24, 20_000, 900), riga(60, 10_000, 200), riga(60, 20_000, 400), riga(60, 30_000, 600)];
    expect(fasceTabella(righe, 15_000)).toEqual({ fasciaMassima: 30_000, durateFuoriFascia: [] });
    expect(fasceTabella(righe, 25_000)).toEqual({ fasciaMassima: 30_000, durateFuoriFascia: [24] });
    expect(fasceTabella(righe, 45_000)).toEqual({ fasciaMassima: 30_000, durateFuoriFascia: [24, 60] });
  });

  it("senza righe non c'è nessuna fascia (e nessuna durata «fuori»: la tabella è vuota, non troppo piccola)", () => {
    expect(fasceTabella([], 5_000)).toEqual({ fasciaMassima: null, durateFuoriFascia: [] });
  });
});

describe("pianoDaTabella", () => {
  it("TAN e rata sono della riga; anticipo e finanziato del preventivo", () => {
    expect(pianoDaTabella({ nomeTabella: "Prestito Casa", riga: RIGHE[2], totale: 11_000, anticipoPct: 30 })).toEqual({
      nome: "Prestito Casa", mesi: 60, tasso: 5.9, rata_mese: 160, anticipo: 3_300, finanziato: 7_700,
    });
  });
  it("senza nome della tabella vale «Finanziamento»; un TAN mancante vale zero", () => {
    const piano = pianoDaTabella({ nomeTabella: null, riga: riga(24, 8000, 340, { tan: null }), totale: 10_000, anticipoPct: 0 });
    expect(piano).toMatchObject({ nome: "Finanziamento", tasso: 0, anticipo: 0, finanziato: 10_000 });
  });
});

describe("pianiManuali", () => {
  it("sono i due piani di sempre, Estesa e Standard, con la rata di calcolaPianoFinanziamento", () => {
    const piani = pianiManuali({ totale: 11_000, anticipoPct: 30, piani: PIANO_MANUALE_DI_SERIE });
    const atteso = calcolaPianoFinanziamento({
      importo_totale: 11_000, anticipo_pct: 30,
      piani: [{ nome: "Estesa", durata_mesi: 120, tasso_annuo_pct: 5.5 }, { nome: "Standard", durata_mesi: 60, tasso_annuo_pct: 0 }],
    });
    expect(piani.map((p) => p.nome)).toEqual(["Estesa", "Standard"]);
    expect(piani.map((p) => p.rata_mese)).toEqual(atteso.piani.map((p) => p.rata_mese));
    expect(piani[1]).toEqual({ nome: "Standard", mesi: 60, tasso: 0, rata_mese: 128.33, anticipo: 3_300, finanziato: 7_700 });
  });
});

describe("pianiManualiDaSalvati", () => {
  it("senza due piani scritti valgono i valori di serie (120 mesi al 5,5% e 60 mesi a tasso zero)", () => {
    expect(pianiManualiDaSalvati(undefined)).toEqual(PIANO_MANUALE_DI_SERIE);
    expect(pianiManualiDaSalvati([])).toEqual(PIANO_MANUALE_DI_SERIE);
    expect(pianiManualiDaSalvati([{ nome: "Prestito", mesi: 48, tasso: 5.9, rata_mese: 1, anticipo: 1, finanziato: 1 }])).toEqual(PIANO_MANUALE_DI_SERIE);
  });
  it("con due piani scritti si leggono i loro mesi e TAN", () => {
    const scritti = pianiManuali({ totale: 11_000, anticipoPct: 30, piani: { estesa: { mesi: 96, tasso: 4.2 }, standard: { mesi: 48, tasso: 1 } } });
    expect(pianiManualiDaSalvati(scritti)).toEqual({ estesa: { mesi: 96, tasso: 4.2 }, standard: { mesi: 48, tasso: 1 } });
  });
});

describe("pianiUguali", () => {
  const a: SrPianoFinanziamento[] = [{ nome: "Prestito", mesi: 48, tasso: 5.9, rata_mese: 201.6, anticipo: 3_300, finanziato: 7_700 }];
  it("stessi mesi e stessi soldi al centesimo: il nome non conta", () => {
    expect(pianiUguali(a, [{ ...a[0], nome: "Altro nome" }])).toBe(true);
    expect(pianiUguali(a, [{ ...a[0], rata_mese: 201.6000001 }])).toBe(true);
  });
  it("una cifra o un mese diverso, o un piano in più, sono un'altra cosa", () => {
    expect(pianiUguali(a, [{ ...a[0], rata_mese: 201.7 }])).toBe(false);
    expect(pianiUguali(a, [{ ...a[0], mesi: 60 }])).toBe(false);
    expect(pianiUguali(a, [{ ...a[0], finanziato: 7_701 }])).toBe(false);
    expect(pianiUguali(a, [...a, ...a])).toBe(false);
  });
  it("vuoto è uguale a vuoto, anche se manca la lista", () => {
    expect(pianiUguali([], [])).toBe(true);
    expect(pianiUguali(undefined, [])).toBe(true);
    expect(pianiUguali(null, a)).toBe(false);
  });
});

describe("motivoPianoIndietro: perché un piano scritto non corrisponde ai dati di adesso", () => {
  // Il piano di un preventivo da 11.000 € con anticipo 30%: 3.300 di anticipo, 7.700 da finanziare.
  const piano: SrPianoFinanziamento = { nome: "Prestito", mesi: 48, tasso: 5.9, rata_mese: 201.6, anticipo: 3_300, finanziato: 7_700 };

  it("tutto com'era: né il totale né l'anticipo sono cambiati", () => {
    expect(motivoPianoIndietro(piano, 11_000, 30)).toEqual({ totale: false, anticipo: false });
  });

  it("il totale è cambiato (stesso anticipo in percentuale): è il totale", () => {
    expect(motivoPianoIndietro(piano, 9_900, 30)).toEqual({ totale: true, anticipo: false });
    expect(motivoPianoIndietro(piano, 13_200, 30)).toEqual({ totale: true, anticipo: false });
  });

  it("l'anticipo è cambiato (stesso totale): è l'anticipo", () => {
    expect(motivoPianoIndietro(piano, 11_000, 35)).toEqual({ totale: false, anticipo: true });
    expect(motivoPianoIndietro(piano, 11_000, 0)).toEqual({ totale: false, anticipo: true });
  });

  it("cambiati tutti e due", () => {
    expect(motivoPianoIndietro(piano, 9_900, 35)).toEqual({ totale: true, anticipo: true });
  });

  it("le cifre arrotondate al centesimo non sono un cambiamento (anticipo e finanziato si arrotondano ognuno per conto suo)", () => {
    for (const [totale, pct] of [[12_901.23, 33], [7_777.77, 33.33], [10_000.01, 7.5], [99.99, 33]] as const) {
      const p = pianoDaTabella({ nomeTabella: "Prestito", riga: riga(48, 8_000, 201.6), totale, anticipoPct: pct });
      expect(motivoPianoIndietro(p, totale, pct), `${totale} al ${pct}%`).toEqual({ totale: false, anticipo: false });
    }
  });

  it("una differenza piccola ma vera si vede: un euro sul totale, un euro sull'anticipo, cinque centesimi; un centesimo no", () => {
    expect(motivoPianoIndietro(piano, 10_999, 30).totale).toBe(true);
    expect(motivoPianoIndietro(piano, 11_000.05, 30).totale).toBe(true);
    expect(motivoPianoIndietro(piano, 11_000.01, 30).totale).toBe(false);
    expect(motivoPianoIndietro({ ...piano, anticipo: 3_301, finanziato: 7_699 }, 11_000, 30).anticipo).toBe(true);
    expect(motivoPianoIndietro({ ...piano, anticipo: 3_300.05, finanziato: 7_699.95 }, 11_000, 30).anticipo).toBe(true);
    expect(motivoPianoIndietro({ ...piano, anticipo: 3_300.01, finanziato: 7_699.99 }, 11_000, 30).anticipo).toBe(false);
  });

  it("un piano senza anticipo (tutto finanziato) torna con anticipo 0; con un anticipo scritto adesso è l'anticipo", () => {
    const tutto: SrPianoFinanziamento = { ...piano, anticipo: 0, finanziato: 11_000 };
    expect(motivoPianoIndietro(tutto, 11_000, 0)).toEqual({ totale: false, anticipo: false });
    expect(motivoPianoIndietro(tutto, 11_000, 30)).toEqual({ totale: false, anticipo: true });
  });

  it("un piano illeggibile non rompe niente: i valori che mancano valgono zero", () => {
    const rotto = { nome: "x", mesi: 12, tasso: 0, rata_mese: 0 } as unknown as SrPianoFinanziamento;
    expect(motivoPianoIndietro(rotto, 11_000, 30)).toEqual({ totale: true, anticipo: false });
  });
});
