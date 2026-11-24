/**
 * Lavorazione della pianta → voce del prezzario pubblico della regione, per CODICE (24/11/2026).
 *
 * Perché per codice e non per parole: il 23/11 la ricerca per parole su Lombardia 2026 dava
 * forniture senza posa («Zoccolino di plastica» 2,30 €/m), voci d'altro genere («Pavimento di
 * piscine») e per quattro lavorazioni su dieci niente. Qui ogni voce è stata letta per intero e
 * scelta a mano: è quella lavorazione, fornitura e posa, nell'unità della riga della pianta.
 * Dove una voce così non c'è, la lavorazione manca, e resta il prezzo indicativo dichiarato.
 *
 * Unità delle righe (studioImmobiliare): pareti, intonaco, tinteggiatura, pavimento, rivestimento,
 * chiusura di vano e ripristino in m²; battiscopa in m; porte, finestre, varchi e rimozioni a cad;
 * macerie «a corpo». Lasciate fuori di proposito, in tutte le regioni:
 * - demolizione di muratura: il prezzario la dà a m³, la riga è a m²;
 * - finestra e portafinestra: a m², la riga è a cad;
 * - rimozione di serramenti: a m², la riga è a cad;
 * - macerie: a m³ o a t, la riga è «a corpo»;
 * - radiante: il «sistema radiante» comprende pannelli e tubo insieme, le righe sono separate;
 * - ripristino del pavimento nella traccia: nessuna voce di rappezzo localizzato.
 *
 * Una voce nuova: cercarla con SQL su `prezzario_voce` della fonte (regione + anno, stato
 * `pubblicato`), leggere la descrizione intera, copiarla qui. Il test
 * `planimetrieAbbinamentiPrezzario.test.ts` controlla nel database che il codice esista e che
 * l'unità sia quella scritta qui.
 */

export type UnitaAbbinamento = "m²" | "m" | "cad";

export interface VoceAbbinata {
  codice: string;
  unita: UnitaAbbinamento;
  /** La descrizione della voce, com'è nel prezzario (eventualmente accorciata con «…»). */
  descrizione: string;
  /** Perché questa e non un'altra, quando non è evidente. */
  nota?: string;
}

export interface AbbinamentiRegione {
  /** Come in `prezzario_fonte.regione`. */
  regione: string;
  /** L'anno della fonte: i codici valgono per quell'edizione. */
  anno: number;
  /** Chiavi: i `TipoLavorazione` di src/lib/planimetrie/prezziProposti.ts. */
  voci: Readonly<Record<string, VoceAbbinata>>;
}

export const ABBINAMENTI_PREZZARIO: readonly AbbinamentiRegione[] = [
  {
    regione: "Lombardia",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "LOM261.OC.EEA.Mc01.C0100.Za001.0010.b", unita: "m²",
        descrizione: "OPERA: Sistema di muratura, in blocchi forati; finitura: intonacato | rivestito; impiego: interno | tramezzi; spessore [cm] ≤ 11. LAVORO: Demolizione. Incluso: movimentazione con mezzo manuale/meccanico delle macerie nell'ambito del cantiere. Escluso: carico e trasporto … a discarica; oneri di smaltimento; piani di lavoro.",
        nota: "Il tramezzo tipico è in forati da 8 cm, intonacato: ≤ 11 cm. Le macerie fuori dal cantiere sono un'altra riga.",
      },
      nuovo_tramezzo: {
        codice: "LOM261.OC.EEA.Pa02.C0102.L0011.0290.-", unita: "m²",
        descrizione: "OPERA: Strato di muratura, in blocchi forati di ceramica terracotta/laterizio; funzione: divisorio; impiego: interno | tramezzi; spessore [cm] = 8. Incluso: malta di cemento. LAVORO: Posa. Incluso: formazione elementi di raccordo (spalle, voltini, spigoli, lesene). Escluso: piani di lavoro. SPECIFICHE TECNICHE: formato blocco [cm] = 24x8x24.",
        nota: "Il forato 8×24×24 comune; la voce 0280 (24×8×12, 48,59 €) è il formato piccolo, più caro.",
      },
      nuova_muratura: {
        codice: "LOM261.OC.EEA.Pa02.E0100.L0011.0260.a", unita: "m²",
        descrizione: "OPERA: Strato di muratura, in blocchi forati di ceramica terracotta/laterizio; geometria: tipo \"svizzero\"; funzione: portante; spessore [cm] = 25; foratura [%] < 55. Incluso: malta di cemento. LAVORO: Posa. Incluso: formazione di spalle, voltini, spigoli, lesene. Escluso: piani di lavoro.",
        nota: "Muratura portante da 25 cm: la riga non porta lo spessore, si prende il caso tipico.",
      },
      chiusura_vano: {
        codice: "LOM261.OC.EEA.Pa02.C0102.L0011.0295.-", unita: "m²",
        descrizione: "OPERA: Strato di muratura, in blocchi forati di ceramica terracotta/laterizio; funzione: divisorio; impiego: interno | tramezzi; spessore [cm] = 12. Incluso: malta di cemento. LAVORO: Posa. Incluso: formazione elementi di raccordo (spalle, voltini, spigoli, lesene). Escluso: piani di lavoro. SPECIFICHE TECNICHE: formato blocco [cm] = 24x12x24.",
        nota: "Il prezzario non ha una voce «chiusura di vano»: il vano si chiude in forati da 12, con i raccordi inclusi.",
      },
      intonaco: {
        codice: "LOM261.OC.EEA.Pa16.C0900.Za001.0510.-", unita: "m²",
        descrizione: "OPERA: Strato di intonacatura, completo; finitura: civile fine; impiego: interno | superfici verticali. LAVORO: Stesura con mezzo meccanico. Incluso: rinzaffo; intonaco rustico; arricciatura. Escluso: piani di lavoro.",
      },
      tinteggiatura: {
        codice: "LOM261.OC.EEA.Pa06.C1234.Ca012.0005.-", unita: "m²",
        descrizione: "OPERA: Strato di pitturazione, idropittura di resina sintetica acrilica; funzione: traspirante | lavabile; impiego: interno | murature intonacate; lavabilità [n.colpi spazzola] > 10000. LAVORO: Applicazione manuale. Escluso: assistenza muraria; piani di lavoro.",
      },
      battiscopa: {
        codice: "LOM261.OC.EEA.Pa02.C1240.L0005.0005.-", unita: "m",
        descrizione: "OPERA: Strato di zoccolatura di ceramica gres porcellanato; geometria: piano; impiego: battiscopa; altezza [cm] = 10 | lunghezza [cm] = 10. Incluso: malta/collante. LAVORO: Posa. Incluso: tagli; sfridi; pulizia finale. Escluso: assistenza muraria.",
        nota: "Voce OC (opera compiuta: materiale e posa). Le voci RM.06.15.20 sono il solo materiale: mai queste.",
      },
      pavimento: {
        codice: "LOM261.OC.EEA.Pa02.C1206.L0005.0260.-", unita: "m²",
        descrizione: "OPERA: Strato di pavimentazione, in piastrelle di ceramica gres porcellanato; finitura: colore chiaro | liscio; impiego: interno; lato x [cm] = 30 | lato y [cm] = 30 | spessore [cm] = 0,8 ÷ 1. Incluso: boiacca di puro cemento. LAVORO: Posa. Incluso: pulizia finale. Escluso: formazione sottofondo/letto di posa; …",
        nota: "Il massetto è escluso, come nella riga della pianta.",
      },
      rivestimento: {
        codice: "LOM261.OC.EEA.Pa02.C1220.L0005.0015.-", unita: "m²",
        descrizione: "OPERA: Strato di rivestimento, in piastrelle di ceramica gres porcellanato; finitura: liscio | colore chiaro; lato x [cm] = 30 | lato y [cm] = 30 | spessore [cm] = 0,8 ÷ 1. Incluso: pezzi speciali (jolly, pie d'oca, gusce); malta/collante; cemento bianco/colorato. LAVORO: Posa. …",
      },
      porta: {
        codice: "LOM261.OC.EEA.Pa02.C3310.Qa006.0005.-", unita: "cad",
        descrizione: "OPERA: Sistema porta, a battente di legno naturale abete; finitura: legno noce tanganika | lucido; geometria: tamburato | singola anta; impiego: interno; larghezza [cm] = 60 ÷ 90 | altezza [cm] = 210 ÷ 220. Incluso: viteria. LAVORO: Posa. Incluso: fissaggio controtelaio; pulizia; allontanamento materiali di risulta. Escluso: assistenza muraria.",
        nota: "La porta interna tamburata a un'anta più economica fra quelle a battente (le altre: MDF laccato 470 €, rovere 737 €).",
      },
    },
  },
  {
    regione: "Piemonte",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "PIE26_01.A02.A25.010", unita: "m²",
        descrizione: "Demolizione di tramezzi o tavolati interni o volte in mattoni forati, in qualunque piano di fabbricato, compresa la salita o discesa a terra dei materiali, lo sgombero, computando le superfici prima della demolizione … — Con spessore da cm 10 a cm 15 e per superfici di m² 0,50 e oltre, con trasporto in cantiere",
        nota: "Il tramezzo intonacato sta fra 10 e 15 cm; il trasporto a impianto (A25.030) è la riga delle macerie.",
      },
      nuovo_tramezzo: {
        codice: "PIE26_01.A06.A20.055", unita: "m²",
        descrizione: "Tramezzi in mattoni legati con malta cementizia — In mattoni forati dello spessore di cm 8 e per una superficie complessiva di almeno m² 1",
      },
      chiusura_vano: {
        codice: "PIE26_01.A06.A20.045", unita: "m²",
        descrizione: "Tramezzi in mattoni legati con malta cementizia — In mattoni forati dello spessore di cm 12 e per una superficie complessiva di almeno m² 1",
        nota: "Nessuna voce «chiusura di vano»: il vano si chiude in forati da 12.",
      },
    },
  },
  {
    regione: "Veneto",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "VEN26-01.05.14.a", unita: "m²",
        descrizione: "Tavolati in laterizio — Demolizione parziale o totale di tavolati in laterizio (tramezze) od assimilabili dello spessore complessivo uguale od inferiore a 20 cm, compresi gli intonaci e gli eventuali rivestimenti di qualsiasi tipo. … il conferimento con trasportoin discarica autorizzata del materiale di risulta,l'indennità di discarica",
        nota: "Comprende già trasporto e discarica: la riga delle macerie della stessa parete in parte si sovrappone.",
      },
      nuovo_tramezzo: {
        codice: "VEN26-01.12.09.a", unita: "m²",
        descrizione: "TRAMEZZA IN MATTONI FORATI di spessore cm 8 — Tramezzo di mattoni forati, in opera con malta bastarda.",
      },
      chiusura_vano: {
        codice: "VEN26-01.12.09.b", unita: "m²",
        descrizione: "TRAMEZZA IN MATTONI FORATI di spessore cm 12 — Tramezzo di mattoni forati, in opera con malta bastarda.",
        nota: "Nessuna voce «chiusura di vano»: il vano si chiude in forati da 12.",
      },
      intonaco: {
        codice: "VEN26-01.18.02.a", unita: "m²",
        descrizione: "INTONACO CIVILE su superfici interne — Intonaco civile, in opera su pareti e soffitti, di spessore fino a mm 15, in malta di cemento dosata a q 3 a due mani con ultimo strato in malta di cemento dosata a q 6 tirato a frattazzo fino, compresi paraspigoli zincati, esclusa la rete porta intonaco.",
      },
      tinteggiatura: {
        codice: "VEN26-01.28.01.a", unita: "m²",
        descrizione: "DIPINTURA DI EDIFICI DI CIVILE ABITAZIONE Bianche per interni — Dipintura con idropittura murale lavabile per interno/esterno. Nel prezzo si intendono compresi e compensati gli oneri per la fornitura della pittura … Per 2 mani a pennello o a rullo.",
      },
      battiscopa: {
        codice: "VEN26-01.14.08.00", unita: "m",
        descrizione: "FORNITURA E POSA IN OPERA DI BATTISCOPA CERAMICO PRESSATO SMALTATO — Fornitura e posa in opera di battiscopa costituito da piastrelle ceramiche monocottura di prima scelta, pressate a secco, smaltate, comunemente denominate grés ceramico …",
      },
      pavimento: {
        codice: "VEN26-01.14.43.b", unita: "m²",
        descrizione: "Dimensioni 30 x 30 cm, naturale — Pavimento in gres porcellanato colorato in massa in piastrelle rettificate, ottenute per pressatura, per zone ad intenso calpestio, rispondenti alla norma UNI EN 14411, classe assorbimento acqua BIa UGL, posto in opera con idoneo collante, previa preparazione del piano superiore del massetto di sottofondo da pagarsi a parte …",
        nota: "Il gres porcellanato posato a colla più semplice del capitolo; il massetto è a parte, come nella riga della pianta.",
      },
      porta: {
        codice: "VEN26-01.23.02.a", unita: "cad",
        descrizione: "PORTE TAMBURATE LISCE IMPIALLACCIATE tanganica: ad un battente fino a mq 1,60 — Fornitura e posa in opera di porte interne tamburate lisce impiallacciate, composte dai seguenti elementi principali: - falso telaio in legno di abete …",
      },
    },
  },
  {
    regione: "Emilia-Romagna",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "B01.004.015.b", unita: "m²",
        descrizione: "DEMOLIZIONI DI MURATURE — Demolizione di muratura di qualsiasi genere, anche voltata, di spessore fino ad una testa, eseguita a mano, compresa la cernita ed accantonamento del materiale di recupero da riutilizzare: — muratura in mattoni forati",
        nota: "«Fino a una testa» è lo spessore del tramezzo; trasporto e discarica sono la riga delle macerie.",
      },
      nuovo_tramezzo: {
        codice: "A05.013.005.a", unita: "m²",
        descrizione: "TRAMEZZATURE IN BLOCCHI IN LATERIZIO ALLEGGERITO — Tramezzatura di laterizio alleggerito in pasta in blocchi di lunghezza 50 cm … in opera a qualsiasi altezza, compresi oneri e magisteri per l'esecuzione di ammorsature e quanto altro si renda necessario a realizzare l'opera a perfetta regola d'arte: — spessore 8 cm",
      },
      chiusura_vano: {
        codice: "A05.013.005.c", unita: "m²",
        descrizione: "TRAMEZZATURE IN BLOCCHI IN LATERIZIO ALLEGGERITO — Tramezzatura di laterizio alleggerito in pasta in blocchi di lunghezza 50 cm … — spessore 12 cm",
        nota: "Nessuna voce «chiusura di vano»: il vano si chiude con la tramezzatura da 12.",
      },
      intonaco: {
        codice: "A08.004.005.c", unita: "m²",
        descrizione: "INTONACI CIVILI — per interni su pareti verticali: — con malta bastarda di calce grassa, sabbia e cemento",
        nota: "Nel prezzario caricato il testo della voce madre è ridotto all'intestazione.",
      },
      tinteggiatura: {
        codice: "A20.010.005.b", unita: "m²",
        descrizione: "TINTEGGIATURE CON IDROPITTURE — su superfici interne: — vinilacrilica traspirante",
        nota: "Il testo caricato non dice il numero di mani; il prezzo (8,71 €) è quello di una tinteggiatura completa.",
      },
      battiscopa: {
        codice: "A16.022.020.a", unita: "m",
        descrizione: "ZOCCOLINI — Zoccolino di legno impiallacciato, con superficie preverniciata, dimensioni 75 x 10 mm, posto in opera mediante inchiodatura: — rovere",
      },
      pavimento: {
        codice: "A15.016.120.b", unita: "m²",
        descrizione: "PAVIMENTI IN GRES — Pavimento in gres porcellanato colorato in massa in piastrelle, ottenute per pressatura, per spazi ad intenso calpestio, rispondenti alla norma UNI EN 14411, tinta unita compatta, posto in opera con idoneo collante, previa preparazione del piano superiore del massetto di sottofondo da pagarsi a parte … — 20 x 20 cm, classe assorbimento acqua BIb H, spessore 8 mm",
      },
    },
  },
];
// Piemonte, lasciati fuori dopo averli letti: battiscopa (A12.B60 e seguenti sono la sola posa),
// tinteggiatura (A20.E30.005 è una sola ripresa); pavimento in gres, rivestimento e porta
// interna tamburata: nel capitolo 01 nessuna voce di fornitura e posa (cercato il 24/11).
// Veneto, fuori: rivestimento (nessuna voce di gres per pareti con posa trovata).
// Emilia-Romagna, fuori: porta interna (A.25.21/22 sono porte in metallo per uso pubblico,
// 718–940 €), rivestimento (A16.013.* nel testo caricato non dice se la posa è compresa).

/** «1 m²» del prezzario lombardo è «m²»: l'unità senza la quantità davanti. */
export const unitaDelPrezzario = (u: string | null | undefined) => (u ?? "").trim().replace(/^1\s+/, "") || null;

/** Gli abbinamenti di una regione, o null se non ce ne sono. */
export function abbinamentiPerRegione(regione: string | null | undefined): AbbinamentiRegione | null {
  const r = (regione ?? "").trim().toLowerCase();
  return r ? ABBINAMENTI_PREZZARIO.find((a) => a.regione.toLowerCase() === r) ?? null : null;
}
