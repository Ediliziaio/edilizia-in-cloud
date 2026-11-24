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
 * macerie «a corpo». Le lavorazioni cercate e lasciate fuori in una regione stanno in `escluse`, col
 * motivo. Lasciate fuori di proposito, in tutte le regioni:
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
  /**
   * La regione pubblica un prezzario per provincia (Toscana: «Prezzario Toscana 2026 – Firenze»):
   * i codici sono gli stessi, i prezzi no. Si usa la fonte della provincia dell'azienda.
   */
  perProvincia?: boolean;
  /** Chiavi: i `TipoLavorazione` di src/lib/planimetrie/prezziProposti.ts. */
  voci: Readonly<Record<string, VoceAbbinata>>;
  /** Lavorazioni cercate e lasciate fuori, con il motivo. */
  escluse?: Readonly<Record<string, string>>;
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
  {
    regione: "Puglia",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "PUG2026/01.E02.011.003", unita: "m²",
        descrizione: "Demolizione di muratura di qualsiasi genere, anche voltata, di spessore fino ad una testa, eseguita a mano, compresa la cernita ed accantonamento del materiale di recupero da riutilizzare — muratura in mattoni forati",
        nota: "Muratura in forati fino a una testa, a mano. Trasporto e conferimento a discarica esclusi (non citati nella voce).",
      },
      nuovo_tramezzo: {
        codice: "PUG2026/01.E06.045.001", unita: "m²",
        descrizione: "Muratura in mattoni posti in foglio e malta, retta o curva ed a qualsiasi altezza, compresi oneri e magisteri per l'esecuzione di ammorsature e quanto altro si renda necessario a realizzare l'opera a perfetta regola d'arte: con foratelle a dieci fori (8 x 25 x 25 cm) — con malta bastarda",
        nota: "Tramezzo in foratelle da 8 cm, fornitura e posa.",
      },
      nuova_muratura: {
        codice: "PUG2026/01.E06.032.001", unita: "m²",
        descrizione: "MURATURA IN ELEVAZIONE REALIZZATA CON BLOCCHI DI LATERIZIO ALLEGGERITO in pasta di cui alla norma … MASCHIO-FEMMINA forati e rettificati con percentuale di foratura ≤ 55%, per COSTRUZIONI DI MURATURE DI TAMPONAMENTO O PORTANTI IN ZONA SISMICA 4, IN OPERA CON MALTA SPECIALE O SCHIUMA POLIURETANICA: — spessore 25 cm",
        nota: "Blocchi in laterizio alveolato 25 cm, a m².",
      },
      chiusura_vano: {
        codice: "PUG2026/01.E06.047.001", unita: "m²",
        descrizione: "Muratura in mattoni posti in foglio e malta, retta o curva ed a qualsiasi altezza, compresi oneri e magisteri per l'esecuzione di ammorsature e quanto altro si renda necessario a realizzare l'opera a perfetta regola d'arte: con foratelle a 15 fori (12 x 25 x 25 cm) — con malta bastarda",
        nota: "Nessuna voce di tamponamento vano porta: tramezzo in foratelle da 12 cm.",
      },
      intonaco: {
        codice: "PUG2026/01.E16.021.005", unita: "m²",
        descrizione: "Intonaco civile formato da un primo strato di rinzaffo, da un secondo strato tirato in piano con … rifinito con sovrastante strato di colla della stessa malta passato al crivello fino, lisciata con frattazzo metallico alla pezza: per interni su pareti verticali — con malta bastarda di calce grassa, sabbia e cemento",
        nota: "Intonaco civile a tre strati, interni, pareti verticali.",
      },
      tinteggiatura: {
        codice: "PUG2026/01.E16.079.001", unita: "m²",
        descrizione: "Tinteggiatura con idropittura murale opaca liscia, a basso contenuto di solventi, a base di resine sintetiche in emulsione acquosa, pigmenti e cariche selezionate, in grado di aumentare la luminosità negli ambienti interni, applicata in due mani a pennello, a rullo o a spruzzo, esclusa preparazione delle superfici — bianca",
        nota: "Idropittura a resine sintetiche (lavabile), interni, due mani; preparazione esclusa. Scartata la tempera (non lavabile) e la pittura ai silicati.",
      },
      battiscopa: {
        codice: "PUG2026/01.E13.005.003", unita: "m",
        descrizione: "Zoccolino di gres porcellanato smaltato, resistente agli sbalzi termici, effetto rustico, cemento, pietra naturale, marmo, posto in opera con idoneo collante, compresi tagli, sfridi, pulitura finale e sigillatura dei giunti — 8 x 33,3 cm, spessore 8 mm",
        nota: "Gres fornito e posato, formato comune; la variante .001 è per esterni.",
      },
      pavimento: {
        codice: "PUG2026/01.E12.091.007", unita: "m²",
        descrizione: "Pavimento in gres porcellanato smaltato in piastrelle, resistente agli sbalzi termici, al gelo e … collante, previa preparazione del piano superiore del massetto di sottofondo da pagarsi a parte, compresi tagli, sfridi, pulitura finale e sigillatura dei giunti: effetto cemento — 60 x 60 cm, rettificato, spessore 9 mm",
        nota: "Residenziale, 60x60, massetto da pagarsi a parte.",
      },
      rivestimento: {
        codice: "PUG2026/01.E15.001.001", unita: "m²",
        descrizione: "Rivestimento in ceramica monocottura di pasta bianca in piastrelle ottenute per pressatura, ad uso … acqua gruppo BIII GL a norma UNI EN 14411, in opera con idoneo collante, compresi tagli, sfridi e stuccature dei giunti, esclusi pezzi speciali: 25 x 38 cm — effetto cemento superficie omogenea naturale, spessore 8,5 mm",
        nota: "Ceramica residenziale in opera, superficie liscia (non decorata né mosaico).",
      },
      porta: {
        codice: "PUG2026/01.E17.117.001", unita: "cad",
        descrizione: "Porta interna in legno con anta mobile tamburata e con bordi impiallicciati, completa di telaio … spessore di 8/11 mm, coprifili ad incastro in multistrato e tutta la ferramenta necessaria per il fissaggio, movimento e chiusura, delle dimensioni standard di 210 x 60 ÷ 90 cm: con anta cieca liscia — laccata bianca",
        nota: "Anta tamburata cieca, battente, completa di telaio e ferramenta; la voce del capitolo serramenti in opera non cita la posa a parole ma è prezzo di opera compiuta (non è nel capitolo PR materiali).",
      },
    },
  },
  {
    regione: "Campania",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "CAM26_R02.020.020.B", unita: "m²",
        descrizione: "Demolizione di muratura di spessore fino ad una testa eseguita totalmente a mano — Demolizione di muratura di qualsiasi genere, anche voltata, di spessore fino ad una testa, eseguita totalmente a mano, compresa la cernita e accantonamento del materiale di recupero da riutilizzare. Muratura in mattoni forati",
        nota: "Forati fino a una testa, a mano; trasporto a discarica escluso. Alternativa CAM26_R02.020.030.A (tramezzatura fino a 10 cm, 5,34 €/mq) comprende solo carico e trasporto entro 50 m in cantiere.",
      },
      nuovo_tramezzo: {
        codice: "CAM26_E08.020.010.A", unita: "m²",
        descrizione: "Tramezzature di mattoni forati — Tramezzatura di mattoni forati di laterizio eseguita con malta … e di cordicelle per l'allineamento dei mattoni, la posa in opera dei mattoni a strati orizzontali ''filari'', la formazione dei giunti, riseghe, mazzette, spigoli, architravi e piattabande sui vani porte. Spessore 8 cm",
        nota: "Tramezzo in forati 8 cm.",
      },
      nuova_muratura: {
        codice: "CAM26_E08.020.025.C", unita: "m²",
        descrizione: "Murature monostrato di tamponamento — Muratura monostrato di tamponamento, senza funzione portante, … caratteristica a compressione non inferiore a 5,0 N/mmq. Compresi e compensati nel prezzo, la formazione dei giunti, riseghe, mazzette, spigoli, architravi e piattabande sui vani porta e finestre. Spessore 25 cm",
        nota: "Blocchi in laterizio semipieni 25 cm, a mq (la muratura di mattoni forati CAM26_E08.020.020.B è a mc, scartata).",
      },
      chiusura_vano: {
        codice: "CAM26_E08.020.010.C", unita: "m²",
        descrizione: "Tramezzature di mattoni forati — Tramezzatura di mattoni forati di laterizio eseguita con malta … di cordicelle per l'allineamento dei mattoni, la posa in opera dei mattoni a strati orizzontali ''filari'', la formazione dei giunti, riseghe, mazzette, spigoli, architravi e piattabande sui vani porte,. Spessore 12 cm",
        nota: "Nessuna voce specifica di tamponamento vano: tramezzo in forati da 12 cm.",
      },
      intonaco: {
        codice: "CAM26_E16.020.030.B", unita: "m²",
        descrizione: "Intonaco civile liscio a tre strati, costituito da un primo strato di rinzaffo, da un secondo … spessore complessivo non inferiore a 15 mm, eseguito con predisposte guide (comprese nel prezzo) su pareti o soffitti piani o curvi, interno o esterno. Su pareti interne con malta bastarda di calce, sabbia e cemento",
        nota: "Intonaco civile tre strati, pareti interne, malta bastarda.",
      },
      tinteggiatura: {
        codice: "CAM26_E21.020.030.B", unita: "m²",
        descrizione: "Tinteggiatura con pittura lavabile di resine sintetiche emulsionabili (idropittura), data a pennello o a rullo su pareti o soffitti, con tre mani a perfetta copertura, esclusa la preparazione degli stessi da conteggiarsi a parte. A base di resine acriliche",
        nota: "Idropittura lavabile; il prezzario la dà solo a tre mani (nessuna variante a due mani). Variante viniliche CAM26_E21.020.030.A 7,51 €/mq.",
      },
      battiscopa: {
        codice: "CAM26_E15.080.050.A", unita: "m",
        descrizione: "Zoccolino battiscopa in gres porcellanato di dimensioni 7,5x15 cm, di prima scelta, posto in opera con idoneo collante, compresi la suggellatura dei giunti con cemento bianco o colorato, i tagli a misura, gli sfridi, la pulitura finale. Tinta unita",
        nota: "Gres fornito e posato.",
      },
      pavimento: {
        codice: "CAM26_E13.030.020.Q", unita: "m²",
        descrizione: "Pavimento di piastrelle di gres fine porcellato — Pavimento in piastrelle di gres fine … compresi le suggellature degli incastri a muro, i tagli, gli sfridi, i pezzi speciali, l'eventuale formazione dei giunti di dilatazione, il lavaggio con acido, la pulitura finale. Dimensioni 40x40 cm spessore 8 - 10 mm",
        nota: "Posa a collante su massetto esistente (massetto escluso). Le varianti «su sottofondo di malta cementizia» comprendono l'allettamento e sono scartate; a collante non c'è un 60x60 non antiscivolo.",
      },
      rivestimento: {
        codice: "CAM26_E15.020.020.A", unita: "m²",
        descrizione: "Rivestimenti in piastrelle di ceramica in pasta bianca — Rivestimento di pareti in piastrelle di … geometrica, compresi la suggellatura dei giunti con cemento bianco o colorato, i pezzi speciali (angoli, spigoli, terminali, zoccoli), i tagli a misura, gli sfridi, la pulitura finale. Dimensioni 20x20 cm, lucide",
        nota: "Ceramica pasta bianca in opera a collante.",
      },
      porta: {
        codice: "CAM26_E18.020.010.A", unita: "cad",
        descrizione: "Porta interna in legno con anta mobile tamburata cieca liscia — Porta interna in legno con anta … fissaggio, con esclusione delle maniglie e degli eventuali vetri, movimento e chiusura, delle dimensioni standard di 210 x 60-70-80-90 cm. Con anta cieca liscia. Noce tanganika, mogano, ciliegio, larice, pino, douglas",
        nota: "Tamburata cieca un'anta, maniglie escluse. Variante laccata bianca CAM26_E18.020.010.B 455,00 € (esclude anche il controtelaio).",
      },
    },
  },
  {
    regione: "Calabria",
    anno: 2025,
    voci: {
      demolizione_tramezzo: {
        codice: "CAL25_03.A03.004.003", unita: "m²",
        descrizione: "Rimozione di tramezzo in muratura — di mattoni forati di qualsiasi tipo",
        nota: "Unica voce a m² per abbattere un tramezzo in forati (capitolo 03, recupero); si chiama «rimozione» ma è la demolizione del tramezzo, non lo smontaggio di un elemento. Trasporto non citato. Le altre voci (02.A03.006) sono tagli a forza per aprire vani, scartate.",
      },
      nuovo_tramezzo: {
        codice: "CAL25_01.C01.013.002", unita: "m²",
        descrizione: "Muratura in elevazione di tramezzi con blocchi in laterizio normale (foratelle), spessore 8 cm — eseguita con malta bastarda (M5)",
        nota: "Foratelle 8 cm.",
      },
      nuova_muratura: {
        codice: "CAL25_01.C01.009.002", unita: "m²",
        descrizione: "Muratura in elevazione di pareti con blocchi in laterizio normale spessore 25 cm — eseguita con malta bastarda (M5)",
        nota: "Blocchi in laterizio 25 cm, a m².",
      },
      chiusura_vano: {
        codice: "CAL25_01.C01.011.002", unita: "m²",
        descrizione: "Muratura in elevazione di tramezzi con blocchi in laterizio normale, spessore 12 cm — eseguita con malta bastarda (M5)",
        nota: "Nessuna voce di tamponamento vano: tramezzo in laterizio da 12 cm.",
      },
      intonaco: {
        codice: "CAL25_01.E01.001.002", unita: "m²",
        descrizione: "Intonaco civile per interni su pareti verticali eseguito a mano, formato da un primo strato di rinzaffo e da un secondo strato tirato in piano con regolo e fratazzo tra predisposte guide, compreso velo — con malta bastarda",
        nota: "Rinzaffo + arriccio + velo = intonaco civile completo, interni, pareti verticali.",
      },
      porta: {
        codice: "CAL25_01.E09.005.001", unita: "cad",
        descrizione: "Porta interna in legno con anta mobile tamburata cieca liscia — Porta interna in legno con anta … fissaggio, con esclusione delle maniglie e degli eventuali vetri, movimento e chiusura, delle dimensioni standard di 210 x 60-70-80-90 cm. Con anta cieca liscia. Noce tanganika, mogano, ciliegio, larice, pino, douglas",
        nota: "Tamburata cieca un'anta, maniglie escluse. Variante laccata bianca CAL25_01.E09.005.002 446,18 €.",
      },
    },
    escluse: {
      tinteggiatura: "L'unica idropittura lavabile per interni (CAL25_01.F04.004.004, 7,85 €/m², «con idropittura lavabile previa mano di fissativo») non dice quante mani: non si può verificare il requisito delle due mani.",
      battiscopa: "Il prezzario ha solo la posa (CAL25_01.E02.015.004 e CAL25_01.E03.016.*, «Posa in opera di zoccolino»): nessuna voce di fornitura e posa.",
      pavimento: "Solo posa in opera (CAL25_01.E02.003.*, «Posa in opera di pavimento in ceramica, gres…»): il materiale è a parte, nessuna voce di fornitura e posa.",
      rivestimento: "Solo posa in opera (CAL25_01.E03.014.*, «Posa in opera di rivestimento interno in piastrelle…»): nessuna voce di fornitura e posa.",
    },
  },
  {
    regione: "Basilicata",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "B.02.003.02", unita: "m²",
        descrizione: "Demolizione di tramezzi in mattoni pieni o forati, compresi relativi intonaci di qualsiasi tipo e … Direzione lavori, compreso il carico su automezzo ed esclusi i ponteggi, trasporto e conferimento a discarica o ad impianto di trattamento dei materiali di risulta: — tramezzi di spessore 6-10 cm. di spessore finito;",
        nota: "Tramezzo 6-10 cm con intonaci, carico su automezzo compreso; trasporto e discarica esclusi. Variante 12-15 cm: B.02.003.01 14,38 €/mq.",
      },
      nuovo_tramezzo: {
        codice: "B.04.019.03", unita: "m²",
        descrizione: "tramezzatura di mattoni posti in foglio con malta cementizia, retta o curva ed a qualsiasi altezza o profondit├á, compreso eventuali architravi in c.a. o piattabande, il taglio e la suggellatura degli incastri a muro e quanto altro occorra per dare il lavoro compiuto a regola d'arte: — con mattoni forati dello spessore cm 8;",
        nota: "Forati 8 cm. Descrizione copiata così com'è nel DB (accenti corrotti «├á»).",
      },
      nuova_muratura: {
        codice: "B.04.022.05", unita: "m²",
        descrizione: "Muratura in elevazione con blocchi di laterizio a massa alleggerita marcati CE in conformit├á alla … posato con i fori orizzontali, compreso ogni onere e magistero, la fornitura dei laterizi, il trasporto, il tiro in alto e quanto altro necessario per fornire l'opera eseguita a perfetta regola d'arte. — cm 25x25x25;",
        nota: "Blocco 25x25x25: la serie va da 25x10x25 (.01) a 25x35x25 (.07), la cifra centrale è lo spessore del muro, quindi 25 cm.",
      },
      chiusura_vano: {
        codice: "B.04.019.05", unita: "m²",
        descrizione: "tramezzatura di mattoni posti in foglio con malta cementizia, retta o curva ed a qualsiasi altezza o profondit├á, compreso eventuali architravi in c.a. o piattabande, il taglio e la suggellatura degli incastri a muro e quanto altro occorra per dare il lavoro compiuto a regola d'arte: — con mattoni forati dello spessore di cm 12;",
        nota: "Nessuna voce di tamponamento vano: tramezzatura in forati da 12 cm.",
      },
      intonaco: {
        codice: "B.13.012.04", unita: "m²",
        descrizione: "Intonaco civile su pareti interne, piane verticali, costituito da un primo strato di rinzaffo, da … di 3 cm: — con rustico di malta bastarda a q.li 3,5 di calce eminentemente idraulica e q.li 1 di cemento e finitura con malta bastarda di sabbia fina a q.li 3,5 di calce eminentemente idraulica e q.li 1 di cemento",
        nota: "Intonaco civile tre strati, pareti interne verticali, malta bastarda.",
      },
      tinteggiatura: {
        codice: "B.21.012.01", unita: "m²",
        descrizione: "Tinteggiatura con idropittura lavabile su intonaco civile, o rasatura a gesso, di pareti o soffitti … o rullo in tre mani. Nel prezzo ├¿ compresa la preparazione del supporto e la imprimitura ad uno strato di isolante dato a pennello,├¿ esclusa l'applicazione della pittura di fondo da computarsi a parte. — bianca",
        nota: "Unica voce che dice «lavabile»: tre mani, preparazione e isolante compresi. Alternativa a due mani: B.21.013.01 idropittura acrilica 11,71 €/mq (non dichiarata lavabile). La tempera B.21.008.01 è scartata (non lavabile).",
      },
      battiscopa: {
        codice: "B.14.131.01", unita: "m",
        descrizione: "Zoccolino battiscopa in gres fine porcellanato, posto in opera con idoneo collante, compreso lil … dei materiali, gli sfridi, i tagli a misura, la sigillatura dei giunti con sigillanti preconfezionati, la pulitura finale e ogni altro onere e magistero per dare il lavoro finito a perfetta regola d'arte. — vedi voce",
        nota: "Dice «posto in opera» e non «fornito», ma è opera finita: il prezzo cambia col materiale (ceramica B.14.132.01 11,08, gres 17,95), comprende sfridi e tiro in alto dei materiali, e nel prezzario non esiste una voce di sola posa dello zoccolino.",
      },
      pavimento: {
        codice: "B.14.020.01", unita: "m²",
        descrizione: "Pavimento in piastrelle di gres fine porcellanato, colorato in pasta con finitura uniforme o … dei materiali, i tagli, gli sfridi, la sigillatura dei giunti con fuganti preconfezionati, la pulitura finale, e ogni altro onere e magistero per dare il lavoro finito a perfetta regola d'arte: — dimensioni 30x30 cm",
        nota: "Fornito e posto, massetto a parte. Il 60x60 della stessa voce (B.14.020.02) costa 141,03 €/mq; in ceramica monocottura B.14.019.01 30x30 è 54,85 €/mq.",
      },
      rivestimento: {
        codice: "B.14.153.01", unita: "m²",
        descrizione: "Rivestimento in piastrelle di gres fine porcellanato, colorato in pasta con finitura uniforme o … dei materiali, i tagli, gli sfridi, la sigillatura dei giunti con fuganti preconfezionati, la pulitura finale, e ogni altro onere e magistero per dare il lavoro finito a perfetta regola d'arte: — Dimensioni 30x30 cm",
        nota: "Scelta perché dice esplicitamente «fornito e posto in opera». La ceramica monocottura B.14.123.01 (20x20, 53,71 €/mq) dice solo «posto in opera».",
      },
      porta: {
        codice: "B.18.014.01", unita: "cad",
        descrizione: "Porta interna in legno con anta mobile tamburata e con bordi impiallacciati, fornita e posta in … e tutta la ferramenta necessaria per il fissaggio, con esclusione delle maniglie e degli eventuali vetri, movimento e chiusura, delle dimensioni standard di 210 x 60-70-80-90 cm. Con anta cieca liscia — noce tanganika",
        nota: "Fornita e posta, anta cieca, maniglie escluse. Laccata bianca: B.18.014.02 371,73 €.",
      },
    },
  },
  {
    regione: "Marche",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "02.03.008*.001", unita: "m²",
        descrizione: "Demolizione di tramezzi. Demolizione di tramezzi di qualsiasi genere e tipo. Nella demolizione sono … Sono da computarsi a parte le eventuali opere di protezione ed il trasporto a discarica con i relativi oneri. E' inoltre compreso quanto altro occorre per dare il lavoro finito. Per uno spessore compreso tra cm 6-11.",
        nota: "Spessore 6-11 cm. Compreso carico su automezzo; trasporto a discarica e oneri ESCLUSI.",
      },
      nuovo_tramezzo: {
        codice: "03.02.046.002*_CAM", unita: "m²",
        descrizione: "Muratura in elevazione di tramezzi con blocchi in laterizio normale (foratelle) spessore 8 cm, … del servizio di progettazione di interventi edilizi, per l’affidamento dei lavori per interventi edilizi e per l’affidamento congiunto di progettazione e lavori per interventi edilizi.) eseguita con malta bastarda (M5)",
        nota: "Foratelle spessore 8 cm dichiarato. Scartata 03.02.022* (forati 3 fori a coltello, 29,87) perché lo spessore non è indicato.",
      },
      nuova_muratura: {
        codice: "03.02.044.002*_CAM", unita: "m²",
        descrizione: "Muratura in elevazione di pareti con blocchi in laterizio normale spessore 25 cm rispondente ai … del servizio di progettazione di interventi edilizi, per l’affidamento dei lavori per interventi edilizi e per l’affidamento congiunto di progettazione e lavori per interventi edilizi.) eseguita con malta bastarda (M5)",
        nota: "Blocchi in laterizio normale 25 cm, a m².",
      },
      chiusura_vano: {
        codice: "03.02.045.002*_CAM", unita: "m²",
        descrizione: "Muratura in elevazione di tramezzi con blocchi in laterizio normale, spessore 12 cm rispondente ai … del servizio di progettazione di interventi edilizi, per l’affidamento dei lavori per interventi edilizi e per l’affidamento congiunto di progettazione e lavori per interventi edilizi.) eseguita con malta bastarda (M5)",
        nota: "Tramezzo in laterizio da 12 cm. La voce di tamponatura vani (03.02.063*) è a doppia parete esterna, non adatta a un vano porta interno.",
      },
      intonaco: {
        codice: "06.01.007*.001", unita: "m²",
        descrizione: "INTONACO PER USO CIVILE COSTITUITO DA RINZAFFO, ABBOZZO E ULTIMO STRATO. Intonaco civile, con malta … e con pezza, eseguito su superfici piane o curve, verticali ed orizzontali. Sono comprese le impalcature su cavalletti e quanto altro occorre per dare l'opera finita. Per uno spessore di cm. 2,0. Eseguito all'interno.",
        nota: "Intonaco civile completo a tre strati, interno, 2 cm.",
      },
      tinteggiatura: {
        codice: "12.01.004.001", unita: "m²",
        descrizione: "Tinteggiatura con idropittura vinilica. Tinteggiatura con idropittura vinilica, pigmentata per … i ponteggi provvisori interni ove occorrenti; la pulitura degli ambienti ad opera ultimata. E' inoltre compreso quanto altro occorre per dare l'opera finita. A due strati su pareti e soffitti intonacati a civile.",
        nota: "Idropittura per interni, due strati più isolante, su intonaco civile. La voce non dice «lavabile»; l'unica che lo dice (12.01.024.005_CAM, 10,25) non indica il numero di mani.",
      },
      battiscopa: {
        codice: "06.06.004*.007", unita: "m",
        descrizione: "Fornitura e posa in opera di zoccolino battiscopa in gres, ceramica e simili. Fornitura e posa in … formazione quartabuoni, ripresa delle mantelline, stuccatura e pulizia accurata; il tutto per dare il titolo compiuto e finito a regola d'arte. In gres porcellanato, formato 10x20 cm circa, monocolore o marmorizzato.",
        nota: "Fornitura e posa, gres porcellanato. Alternativa più economica in ceramica bicottura 06.06.004*.001 a 20,38.",
      },
      pavimento: {
        codice: "06.04.008*.007", unita: "m²",
        descrizione: "Pavimento in gres porcellanato. Pavimento in gres porcellanato, per interni o per esterni, posato … Sono compresi: la pulitura, a posa ultimata, con segatura; la suggellatura dei giunti. E' inoltre compreso quanto altro occorre per dare l'opera finita. Piastrelle delle dimensioni di cm 30x30 con mastici adesivi.",
        nota: "Fornito e posato con adesivo, 30x30; massetto non compreso.",
      },
      rivestimento: {
        codice: "06.02.005*.003", unita: "m²",
        descrizione: "Rivestimento con piastrelle di gres porcellanato. Fornitura e posa in opera di rivestimento di … zoccoli; la pulitura anche con acido. E' inoltre compreso quanto altro occorre per dare l'opera finita. Piastrelle in gres porcellanato, dimensioni 30x30 cm, antigelivo, unicolore neutro (Con collante e mano di primer).",
        nota: "Fornitura e posa con collante, 30x30, intonaco escluso.",
      },
      porta: {
        codice: "09.01.008*.001", unita: "cad",
        descrizione: "Porte in legno rivestito in laminato . Porte in legno tamburate, tipo standard e fuori standard, … per dare l'opera finita. E' esclusa la fornitura e posa in opera del controtelaio, il trasporto e la posizione ai piani della porta stessa. Ad una anta, misure standard (dimensioni luce netta cm 75- 80-90 x 210).",
        nota: "Tamburata in laminato, una anta, fornita e posata; controtelaio escluso. Laccata bianca 09.01.006*.001 a 529,26.",
      },
    },
  },
  {
    regione: "Umbria",
    anno: 2025,
    voci: {
      demolizione_tramezzo: {
        codice: "2.3.80.1", unita: "m²",
        descrizione: "DEMOLIZIONE DI TRAMEZZI. Demolizione di tramezzi di qualsiasi genere e tipo. Nella demolizione sono … compresi: il carico, il trasporto e lo scarico a rifiuto, fino a qualsiasi distanza, del materiale di risulta. E' inoltre compreso quanto altro occorre per dare il lavoro finito. — Per uno spessore compreso tra cm 6-11.",
        nota: "Spessore 6-11 cm. Trasporto e scarico a rifiuto COMPRESI.",
      },
      nuovo_tramezzo: {
        codice: "3.2.364.1", unita: "m²",
        descrizione: "MURATURA IN MATTONI FORATI IN LATERIZIO A 6 FORI. Muratura di mattoni forati in laterizio a 6 fori uniti con malta a resistenza garantita minimo M5. E' compresa la formazione di sordini, spalle, piattabande. E' inoltre compreso quanto altro occorre per dare l'opera finita. — Posti a coltello.",
        nota: "Lo spessore non è scritto: forato a 6 fori posto a coltello = parete da ~8 cm (tramezzo classico). Nessuna voce del prezzario dichiara un tramezzo in laterizio da 8 cm.",
      },
      chiusura_vano: {
        codice: "3.2.364.2", unita: "m²",
        descrizione: "MURATURA IN MATTONI FORATI IN LATERIZIO A 6 FORI. Muratura di mattoni forati in laterizio a 6 fori uniti con malta a resistenza garantita minimo M5. E' compresa la formazione di sordini, spalle, piattabande. E' inoltre compreso quanto altro occorre per dare l'opera finita. — Posti in piano.",
        nota: "Forati a 6 fori posti in piano = parete da ~12 cm (spessore dedotto, non scritto). Nessuna voce di tamponamento vano in laterizio.",
      },
      intonaco: {
        codice: "6.1.270.1", unita: "m²",
        descrizione: "INTONACO PER USO CIVILE COSTITUITO DA RINZAFFO, ABBOZZO E ULTIMO STRATO. Intonaco civile formato da … il terzo strato di malta finissima, lisciata con fratazzo metallico o con pezza, eseguito su superfici piane o curve, verticali ed orizzontali. È compreso quanto occorre per dare l'opera finita. — Eseguito all'interno.",
        nota: "Intonaco civile completo a tre strati, interno.",
      },
      tinteggiatura: {
        codice: "12.1.40.1", unita: "m²",
        descrizione: "TINTEGGIATURA CON IDROPITTURA VINILICA. Tinteggiatura con idropittura vinilica, pigmentata per … a rullo. Sono compresi: le scale; i cavalletti; la pulitura degli ambienti ad opera ultimata. E' inoltre compreso quanto altro occorre per dare l'opera finita. — A due strati su pareti e soffitti intonacati a civile.",
        nota: "Idropittura per interni, due strati più isolante. La voce non dice «lavabile». Scartata 12.1.51.1.CAM (8,61): descrizione ridotta alla sola variante, senza voce madre.",
      },
      pavimento: {
        codice: "6.4.120.3", unita: "m²",
        descrizione: "PAVIMENTO IN GRES PORCELLANATO. Pavimento in gres porcellanato per interni o per esterni gruppo BI … con segatura; la suggellatura dei giunti. È inoltre compreso quanto altro occorre per dare l'opera finita. È escluso il massetto di sottofondo. — Piastrelle per interni od esterni, opache, delle dimensioni di cm 30x30.",
        nota: "Fornito e posato, 30x30, massetto escluso.",
      },
      rivestimento: {
        codice: "6.2.100.3", unita: "m²",
        descrizione: "RIVESTIMENTO CON PIASTRELLE DI GRES PORCELLANATO. Rivestimento di pareti con piastrelle di gres … o colorato; i pezzi speciali; i terminali; gli zoccoli; la pulitura anche con acido. È inoltre compreso quanto altro occorre per dare l'opera finita. — Piastrelle in tinta unita, opache delle dimensioni di cm 30x30.",
        nota: "Fornito e posato, 30x30, intonaco escluso.",
      },
      porta: {
        codice: "9.1.51.1", unita: "cad",
        descrizione: "PORTE IN LEGNO DI ABETE TAMBURATE CON FINITURA IN LAMINATO. Porte tamburate, tipo standard e fuori … bronzo; la serratura. E' inoltre compreso quanto altro occorre per dare l'opera finita. E' esclusa la fornitura e posa in opera del controtelaio. — Ad una anta, misure standard (dimensioni luce netta cm 75-80-90 x 210).",
        nota: "Tamburata in laminato, una anta, fornita e posata; controtelaio escluso.",
      },
    },
    escluse: {
      nuova_muratura: "Nessuna muratura in laterizio/blocchi da 25 cm a m²: c'è solo il blocco di argilla espansa da tamponatura facciavista (3.2.352.2) e murature a cassetta o a cassero isolate da 30 cm in su.",
      battiscopa: "Gli unici battiscopa forniti e posati sono in marmo bianco (6.3.30.*) e pietra di Trani (6.3.60.*); nessuno in gres, ceramica o legno.",
    },
  },
  {
    regione: "Abruzzo",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "ABR26_E.01.60.50.a", unita: "m²",
        descrizione: "DEMOLIZIONI DI MURATURE , TRAMEZZATURE ECC. — Demolizione di tramezzatura. Compreso il solo calo in basso. — spessore fino a 10 cm",
        nota: "Spessore fino a 10 cm. Compreso il solo calo in basso: carico, trasporto e discarica ESCLUSI. Per 10,1-15 cm c'è ABR26_E.01.60.50.b a 12,56.",
      },
      nuovo_tramezzo: {
        codice: "ABR26_E.05.20.100.a", unita: "m²",
        descrizione: "MURATURE E TRAMEZZATURE IN LATERIZIO — Tramezzatura di mattoni posti in foglio e malta, retta o curva ed a qualsiasi altezza, compresi oneri e magisteri per l'esecuzione di ammorsature e quanto altro si renda necessario a realizzare l'opera a perfetta regola d'arte Con foratelle 8x25x25 cm — Tramezzatura con foratelle 8x25x25 cm",
        nota: "Foratelle da 8 cm. Alternativa in laterizio alleggerito 8 cm: ABR26_E.05.20.135.a a 36,72.",
      },
      nuova_muratura: {
        codice: "ABR26_E.05.20.140.a", unita: "m²",
        descrizione: "MURATURE E TRAMEZZATURE IN LATERIZIO — Muratura monostrato in elevazione in laterizio alleggerito … blocchi 20x25 o similari, aventi giacitura dei fori verticali e percentuale di foratura pari al <55%, per murature di tamponamento, contropareti e divisori: — spessore 25 cm, trasmittanza (parete intonacata) 0,45 W/m2K",
        nota: "Blocchi in laterizio alleggerito da 25 cm, non portante (tamponamento/divisori), a m². La versione portante sismica è ABR26_E.05.20.150.a a 94,86.",
      },
      chiusura_vano: {
        codice: "ABR26_E.05.20.110.a", unita: "m²",
        descrizione: "MURATURE E TRAMEZZATURE IN LATERIZIO — Tramezzatura di mattoni posti in foglio e malta, retta o … per l'esecuzione di ammorsature e quanto altro si renda necessario a realizzare l'opera a perfetta regola d'arte. Con mattoni a dodici fori (12 -13x25x25 cm) — Tramezzatura di mattoni a dodici fori (12 - 13x25x25 cm)",
        nota: "Tramezzo in forati da 12-13 cm. Nessuna voce di tamponamento vano dedicata.",
      },
      intonaco: {
        codice: "ABR26_E.07.10.70.d", unita: "m²",
        descrizione: "INTONACI RUSTICI E CIVILI — Intonaco civile formato da un primo strato di rinzaffo, da un secondo … e guide, rifinito con sovrastante strato di colla di malta passato al crivello fino, lisciata con fratazzo metallico alla pezza, per spessore finale di circa 25 mm. Per interni su pareti verticali — con malta bastarda",
        nota: "Intonaco civile completo, interno, pareti verticali, malta bastarda.",
      },
      tinteggiatura: {
        codice: "ABR26_E.21.20.40.c", unita: "m²",
        descrizione: "TINTEGGIATURE — Tinteggiatura con idropittura di superfici a tre mani a coprire, esclusa la preparazione delle stesse. Su superfici interne — Su superfici interne: con idropittura lavabile",
        nota: "Idropittura lavabile per interni, tre mani; preparazione del supporto esclusa. Non c'è una voce lavabile a due mani.",
      },
      battiscopa: {
        codice: "ABR26_E.10.80.50.a", unita: "m",
        descrizione: "ZOCCOLINI — Zoccolino battiscopa in gres fine porcellanato posto in opera con idoneo collante: — tinta unita e granigliato naturale",
        nota: "Gres porcellanato posto in opera con collante. La voce non scrive «fornitura», ma nel prezzario la sola posa di materiale fornito ha voci a parte («forniti dall'Amministrazione», ABR26_E.09.10.20.*); il prezzo è da opera finita.",
      },
      pavimento: {
        codice: "ABR26_E.09.30.40.a", unita: "m²",
        descrizione: "Pavimento in piastrelle di gres fine porcellanato 1° scelta, ottenute per pressatura, a massa … su massetto compensato a parte, con giunti connessi a cemento bianco o colorato, compresi tagli, sfridi, pulitura finale e pezzi speciali. Dimensioni 30x30 cm, spessore non inferiore a 9 mm: — tinta unita naturale opaca",
        nota: "Gres porcellanato 30x30 posato a colla; massetto compensato a parte.",
      },
      rivestimento: {
        codice: "ABR26_E.10.20.10.a", unita: "m²",
        descrizione: "RIVESTIMENTI IN CERAMICA — Rivestimento di pareti interne con piastrelle di ceramica smaltata … opera con idoneo collante su sottofondi predisposti compensati a parte, compresa la stuccatura dei giunti con idonei stucchi impermeabilizzanti, la pulitura finale angoli e spigoli in PVC: — Da cm 20x20 o 20x25 in tinta",
        nota: "Ceramica monocottura 20x20/20x25 posata a colla su pareti interne; sottofondo escluso. Non c'è un rivestimento in gres porcellanato.",
      },
    },
    escluse: {
      porta: "Le porte interne tamburate in legno da falegnameria (ABR26_E.19.10.80/90/100/110) sono a m², non a cad. L'unica tamburata a cad (ABR26_E.19.20.10.a, 313,46, «porte in legno da industria») esclude maniglie e chiusura e non dice di essere posta in opera; quella a cad fornita e posata (ABR26_E.19.120.10.a, 612,49) è per edifici ospedalieri.",
    },
  },
  {
    regione: "Toscana",
    anno: 2026,
    perProvincia: true,
    voci: {
      demolizione_tramezzo: {
        codice: "TOS26_02.A03.004.008", unita: "m²",
        descrizione: "DI PARETI CON TAGLIO A FORZA — Uso: in tramezzi Materiale: mattoni pieni / forati Specifiche: per … esterni, mobili o fissi. Escluso: - carico; - trasporto; - scarico; - movimentazione dei materiali di risulta a spalla; - costi di accesso per il conferimento dei rifiuti a impianto autorizzato; - eventuali tributi.",
        nota: "Demolizione a forza di tramezzo in mattoni pieni/forati posti per costa (~8 cm). Carico, trasporto, scarico e conferimento a discarica ESCLUSI. Il prezzo è alto rispetto ad altre regioni (39,58 €/m² a Firenze); l'alternativa 03.A03.004.003 «rimozione di tramezzo, forati, spessore qualsiasi» (18,15) è della sezione restauro e comprende documentazione e sorveglianza tecnica, non adatta a un appartamento.",
      },
      nuovo_tramezzo: {
        codice: "TOS26_01.C01.013.002", unita: "m²",
        descrizione: "AD UNA TESTA - CON FORATELLE — Materiale: con malta bastarda (M5) — Oggetto: MURO / PARETE Tipo: … - calo e sollevamento in alto dei materiali; - formazione di riseghe, mazzette e collegamenti, spigoli, curvature; - ponti di servizio con altezza < 2,00 m e/o trabattelli a norma, anche esterni, mobili o fissi.",
        nota: "Parete non portante ad una testa in foratelle, malta bastarda. Lo spessore non è scritto nella voce: «foratella» nel prezzario è l'elemento da 8 cm (le voci a cassetta la usano come paramento da 8). L'unica voce con «(cm) 8,00» dichiarato (02.C01.013.001, 55,94) è per regolarizzazione/riprese, con malta NHL.",
      },
      nuova_muratura: {
        codice: "TOS26_01.C01.025.002", unita: "m²",
        descrizione: "AD UNA TESTA - IN BLOCCHI DI LATERIZIO ALLEGGERITO IN PASTA — Spessore (cm): 25 — Oggetto: MURO / … - calo e sollevamento in alto dei materiali; - formazione di riseghe, mazzette e collegamenti, spigoli, curvature; - ponti di servizio con altezza < 2,00 m e/o trabattelli a norma, anche esterni, mobili o fissi.",
        nota: "Blocchi di laterizio alleggerito in pasta, 25 cm, non portante, a m².",
      },
      chiusura_vano: {
        codice: "TOS26_02.C01.011.002", unita: "m²",
        descrizione: "DI TRAMEZZI - (CM) 12,00 — Materiale: malta bastarda (M5) — Lavorazione: REGOLARIZZAZIONE / … di riseghe, mazzette e collegamenti, spigoli, curvature; - ponti di servizio con altezza < 2,00 m e/o trabattelli a norma, anche esterni, mobili o fissi. Conforme: norma UNI 771-1 (larghezza – spessore – altezza).",
        nota: "Tramezzo da 12 cm nella sezione ristrutturazione, lavorazione «regolarizzazione / tamponatura / riprese»: è la chiusura di un vano interno. La «tamponatura di vani/aperture» 02.C01.034.* è a doppio paramento da 20-24 cm (esterna).",
      },
      intonaco: {
        codice: "TOS26_01.E01.001.002", unita: "m²",
        descrizione: "FINITO - PER INTERNI - SU SUPERFICI VERTICALI - A MANO — Materiale: con malta bastarda — Oggetto: … ganci al soffitto e riprese di zoccolature e serramenti; - oneri per i ponti di servizio con altezza < 2,00 m e/o trabatteli a norma, anche esterni, mobili o fissi, per opere di altezza < 4,00 m dal piano di calpestio.",
        nota: "Intonaco civile finito per interni su pareti verticali, a mano, malta bastarda.",
      },
      tinteggiatura: {
        codice: "TOS26_01.F04.004.004", unita: "m²",
        descrizione: "TINTEGGIATURA PER INTERNO — Materiale: con idropittura lavabile Specifiche: previa mano di … eventuale protezione di altre opere finite; - rimozione e la pulitura di tutte le superfici eventualmente intaccate; - ponti di servizio con altezza massima m 2,00 e/o trabattelli a norma, anche esterni, mobili o fissi.",
        nota: "Idropittura lavabile per interni previa mano di fissativo, preparazione compresa. Il numero di mani non è scritto nella voce (non è una voce «per ogni mano»: è il ciclo completo).",
      },
    },
    escluse: {
      battiscopa: "Solo voci di posa: 01.E02.015.004 (ceramica/gres, 9,26) e 01.E03.016.* dicono «Escluso: fornitura del materiale». Il materiale sta a parte nei prodotti (PR).",
      pavimento: "Solo voci di posa: 01.E02.003/004.* (piastrelle ceramica/gres/klinker con colla o malta) escludono la fornitura del materiale.",
      rivestimento: "Solo voci di posa: 01.E03.013/014.* (maiolica, monocottura/gres porcellanato) escludono la fornitura del materiale.",
      porta: "Nessuna voce di porta interna fornita e posta in opera: per gli infissi ci sono solo assistenze murarie alla posa (01.E04.*, fornitura esclusa) e i prodotti a parte.",
    },
  },
  {
    regione: "Trentino — P.A. Trento",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "B.02.10.0060.005", unita: "m²",
        descrizione: "Nei prezzi dei lavori compiuti di seguito esposti così come descritti dalle singole voci si … in centri autorizzati per la raccolta di rifiuti speciali non pericolosi, l'indennità dovuta per lo smaltimento (codici CER 17.01.07, 17.09.04) e quanto altro necessario per dare il lavoro finito a regola d'arte.",
        nota: "Tavolati in laterizio fino a 20 cm, intonaci compresi; con trasporto e smaltimento compresi.",
      },
      nuovo_tramezzo: {
        codice: "B.06.10.0015.005", unita: "m²",
        descrizione: "Nei prezzi dei lavori compiuti di seguito esposti così come descritti dalle singole voci si … della marcatura CE, e quanto altro necessario per dare il lavoro finito a regola d'arte. Non saranno computati i fori per porte a tutta altezza che interrompano completamente i settori successivi del tavolato stesso.",
        nota: "Tavolato in laterizi forati 8 cm, fornito e posato.",
      },
      chiusura_vano: {
        codice: "B.06.10.0020.005", unita: "m²",
        descrizione: "Nei prezzi dei lavori compiuti di seguito esposti così come descritti dalle singole voci si … della marcatura CE, e quanto altro necessario per dare il lavoro finito a regola d'arte. Non saranno computati i fori per porte a tutta altezza che interrompano completamente i settori successivi del tavolato stesso.",
        nota: "Nessuna voce di tamponamento vani a m²: tavolato in laterizi da 12 cm.",
      },
      intonaco: {
        codice: "B.15.10.0030.005", unita: "m²",
        descrizione: "Nei prezzi dei lavori compiuti di seguito esposti così come descritti dalle singole voci si … a qualsiasi distanza stradale del materiale, l'indennità dovuta per lo smaltimento (codici CER 17.01.07, 17.09.04), il rispetto della marcatura CE, e quanto altro necessario per dare il lavoro finito a regola d'arte.",
        nota: "Intonaco civile completo (grezzo + fino) per interni, 20 mm.",
      },
      tinteggiatura: {
        codice: "B.33.20.0010.005", unita: "m²",
        descrizione: "Nei prezzi dei lavori compiuti di seguito esposti così come descritti dalle singole voci si … per lo smaltimento (codici CER 15.01.01, 15.01.02, 15.01.06), il rispetto della marcatura CE, e quanto altro necessario per dare il lavoro finito secondo le migliori tecniche correnti. — applicazione a rullo e pennello",
        nota: "Due mani di pittura in dispersione acquosa, lavabile classe 3 UNI EN 13300, a rullo.",
      },
      battiscopa: {
        codice: "B.18.10.0040.005", unita: "m",
        descrizione: "Nei prezzi dei lavori compiuti di seguito esposti così come descritti dalle singole voci si … lo smaltimento (codici CER 17.01.07, 17.09.04), il rispetto della marcatura CE, e quanto altro necessario per dare il lavoro finito a regola d'arte. — finitura superficiale naturale e bordo superiore a becco di civetta",
        nota: "Battiscopa in gres porcellanato fornito e posato, abbinato al pavimento.",
      },
      pavimento: {
        codice: "B.18.10.0020.006", unita: "m²",
        descrizione: "Nei prezzi dei lavori compiuti di seguito esposti così come descritti dalle singole voci si … posa a giunto aperto, (fuga oltre i 2 mm), e/o per la posa con altra geometria (diagonale, scacchiera, spina di pesce, ecc) che verrà compensato a parte. — finitura superficiale naturale · dimensioni medie 30·60x60 cm",
        nota: "Gres porcellanato a tutto spessore, formato medio 30-60x60, posato a colla (massetto escluso).",
      },
      rivestimento: {
        codice: "B.18.40.0015.005", unita: "m²",
        descrizione: "Nei prezzi dei lavori compiuti di seguito esposti così come descritti dalle singole voci si … 17.09.04), il rispetto della marcatura CE, e quanto altro necessario per dare il lavoro finito a regola d'arte. Si intende escluso l’onere per la posa a giunto aperto, (fuga oltre i 2 mm) che verrà compensato a parte.",
        nota: "Rivestimento interno in monocottura smaltata, posato a colla.",
      },
      porta: {
        codice: "B.36.20.0005.005", unita: "cad",
        descrizione: "PREMESSE Nei prezzi dei lavori compiuti di seguito elencati, relativi a porte interne, si intendono … campionatura completa di accessori che l'Appaltatore dovrà presentare prima dell'inizio dei lavori e quanto altro necessario per dare il lavoro finito a regola d'arte. — noce tanganica: ad un battente fino a 1.60 m²",
        nota: "Porta tamburata liscia impiallacciata, un battente fino a 1,60 m², con falso telaio e ferramenta.",
      },
    },
    escluse: {
      nuova_muratura: "Le murature in blocchi/laterizio da 20 cm e oltre (B.04.60.*) sono solo a m³; a m² ci sono solo tavolati fino a 12 cm.",
    },
  },
  {
    regione: "Trentino — P.A. Bolzano",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "BOL26_54.02.02.01.E", unita: "m²",
        descrizione: "Rimozione di elementi costruttivi, con selezione e accatastamento a deposito entro l'ambito del … Esecuzione conforme disegno. Sono esclusi dal prezzo corrispettivi per diritti di discarica: — parete divisoria non portante in mattoni forati con strato d'intonaco su ambo i lati, spessore complessivo 15 cm",
        nota: "Il prezzario la chiama «rimozione», ma è la demolizione della parete divisoria in forati intonacata (15 cm complessivi). Trasporto in discarica entro 5 km compreso, diritti di discarica esclusi.",
      },
      nuovo_tramezzo: {
        codice: "BOL26_02.07.03.04.A", unita: "m²",
        descrizione: "Tramezza di mattoni forati a 8 fori, spessore 8 cm, compresi gli architravi (eseguiti fuori opera con foratoni, ferro d'armatura e malta cementizia) e i ponteggi interni fino a 3,50 m di altezza: — con malta idraulica della classe M2,5",
        nota: "Tramezza in forati 8 cm, opera finita.",
      },
      chiusura_vano: {
        codice: "BOL26_02.07.03.03.A", unita: "m²",
        descrizione: "Tramezza di mattoni forati a 8 fori, spessore 12 cm, compresi gli architravi (eseguiti fuori opera con foratoni, ferro d'armatura e malta cementizia) e i ponteggi interni fino a 3,50 m di altezza: — con malta idraulica della classe M2,5",
        nota: "Nessuna voce di tamponamento vani: tramezza in forati da 12 cm, stessa malta della voce da 8 cm. La variante con malta bastarda (02.07.03.03.B) costa 43,03, meno di quella da 8 cm: sembra un refuso del prezzario, non usata.",
      },
      tinteggiatura: {
        codice: "BOL26_04.01.03.09.A", unita: "m²",
        descrizione: "Pitturazione coprente con pittura lavabile in lattice, resistente allo sfregamento, applicata su superfici interne con una mano di fondo e una mano a finire: — tinta chiara",
        nota: "Pittura lavabile per interni, due mani (fondo + finitura). Le idropitture 04.01.03.05 hanno imprimitura con isolante + una sola mano di pittura.",
      },
      battiscopa: {
        codice: "BOL26_05.10.03.01.A", unita: "m",
        descrizione: "Zoccolino in piastrelle a superficie piana, fornito e posto in opera con adesivo cementizio, su intonaco; sigillato con cemento, pulito e lavato con cura a posa ultimata; compreso spigoli e angoli. Esecuzione conforme disegno. — Battiscopa in piastrelle - originale",
        nota: "Zoccolino in piastrelle fornito e posto in opera. Unica voce di battiscopa ceramico o in legno nel prezzario.",
      },
      pavimento: {
        codice: "BOL26_05.10.01.01.C", unita: "m²",
        descrizione: "Posa delle piastrelle , spessore min. 10 mm (grés e grés fine porcellanato), superficie piana, fornito e posto in opera con adesivo cementizio su massetto di sottofondo, sigillato con stucco cementizia, pulito a posa ultimata. Esecuzione conforme disegno. — 30x60",
        nota: "Il titolo dice «Posa», ma il testo dice «fornito e posto in opera» e il prezzo è in linea con la fornitura e posa di Trento (30x60: 77,02 qui contro 76,62). Posa a colla su massetto esistente, massetto escluso. Formato 30x60.",
      },
    },
    escluse: {
      nuova_muratura: "Le murature da 24-38 cm (02.07.01.*) sono solo a m3.",
      intonaco: "Nessun intonaco civile completo per interni su muratura nuova. C'è solo 02.19.07.06.B, che è per il restauro di vecchie murature in pietrame, e poi rasature, finiture per cappotto e intonaci a secco in cartongesso.",
      rivestimento: "Non c'è una voce per il rivestimento delle pareti. La 05.10.01.01 è per «superficie piana» su massetto, cioè per il pavimento.",
      porta: "L'unica porta interna (09.03.02.03.*) ha il pannello in panforte forato o truciolare pieno, non tamburato, e costa 1.083-1.360 €. Non è la porta tamburata standard.",
    },
  },
  {
    regione: "Friuli-Venezia Giulia",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "22.2.BG2.01.A", unita: "m²",
        descrizione: "DEMOLIZIONI, RIMOZIONI - LATERIZI, TERRECOTTE, REFRATTARI — Esecuzione della demolizione di … risulta alle pubbliche discariche, l'indennità di discarica, l'accatastamento del materiale recuperabile entro l'area di cantiere, pulitura dello stesso, e puntelli._x000D_ — Spessore complessivo fino a 12 cm compreso",
        nota: "Tramezzi fino a 12 cm, intonaci compresi. Trasporto in discarica e indennità comprese.",
      },
      nuovo_tramezzo: {
        codice: "22.2.FG2.01.C", unita: "m²",
        descrizione: "COSTRUZIONE MURATURE - LATERIZI, TERRECOTTE, REFRATTARI — Fornitura e posa in opera di mattoni … chiusure vani, impianti e tamponamenti, compreso ponteggi di lavoro, regoli, formazione di piattabande e architravi, riseghe, malta, tagli e sfridi._x000D_ — Mattoni forati s = 8 cm posti in opera con malta bastarda",
        nota: "Forati da 8 cm con malta bastarda.",
      },
      nuova_muratura: {
        codice: "21.1.FQ7.01.B", unita: "m²",
        descrizione: "COSTRUZIONE MURATURE - CALCESTRUZZI CON INERTI LEGGERI — Esecuzione di muratura portante in … (UNI EN 771), compreso malta bastarda (UNI EN 998-2), ponteggi di lavoro, puntelli, regoli, pezzi speciali, architravi, spallette, piattabande, tagli a misura, smussi, listelli, pulizia delle superfici. — Spessore 25 cm",
        nota: "Muratura da 25 cm a m² in blocchi semipieni di cemento alleggerito con argilla espansa. Le murature in laterizio da 25 cm (21.1.FG2.02/03) sono solo a m³.",
      },
      chiusura_vano: {
        codice: "22.2.FG2.01.E", unita: "m²",
        descrizione: "COSTRUZIONE MURATURE - LATERIZI, TERRECOTTE, REFRATTARI — Fornitura e posa in opera di mattoni … chiusure vani, impianti e tamponamenti, compreso ponteggi di lavoro, regoli, formazione di piattabande e architravi, riseghe, malta, tagli e sfridi._x000D_ — Mattoni forati s = 12 cm posti in opera con malta bastarda",
        nota: "Forati da 12 cm. La voce madre nomina esplicitamente le «chiusure vani».",
      },
      intonaco: {
        codice: "42.1.PQ3.01.A", unita: "m²",
        descrizione: "APPLICAZIONE DI INTONACI, MATERIALI DENSI NON APPLICABILI A PENNELLO - MALTE — Esecuzione di … lavoro, pulizia, trasporto in discarica dei materiali di risulta, l'indennità di discarica. — Drizzatura (2º strato) in malta bastarda e stabilitura (3º strato) in malta fine di grassello di calce e sabbie selezionate",
        nota: "Intonaco civile interno completo: rinzaffo, malta bastarda e stabilitura.",
      },
      tinteggiatura: {
        codice: "42.3.VV6.02.A", unita: "m²",
        descrizione: "APPLICAZIONE MATERIALI FLUIDI, VERNICIATURA, INTONACATURA A PENNELLO - TINTE A BASE DI EMULSIONI … acriliche in dispersione acquosa, cariche lamellari e pigmenti di qualsiasi tinta, compreso formazione e disfacimento dei piani di lavoro interni, teli in polietilene, nastrature protettive, materiali di consumo._x000D_",
        nota: "Idropittura lavabile acrilica per interni, due riprese.",
      },
      battiscopa: {
        codice: "43.9.RG5.01.A", unita: "m",
        descrizione: "POSA DI LASTRE O PANNELLI VERTICALI - GRES — Fornitura e posa in opera di zoccolino battiscopa con … di ceramica, gres, altezza 8-10 cm, posato a filo intonaco finito o mezzo incassato, compreso tagli, sfridi, materiali di consumo, attrezzature, assistenze murarie. — In piastrelle di gres lisce altezza 8-10 cm",
        nota: "Battiscopa in gres alto 8-10 cm, fornito e posato. Esiste anche in legno duro (43.9.RI1.01.*, 16,74-19,23 €/m).",
      },
      pavimento: {
        codice: "43.2.SG5.01.A", unita: "m²",
        descrizione: "POSA DI LASTRE O PANNELLI ORIZZONTALI - GRES — Esecuzione di pavimenti mediante fornitura e posa in … di sabbia e cemento, compresi collante, tagli, sfridi, incassi a muro, giunti a grandi riquadri, stuccatura delle fughe, la pulizia con segatura a posa ultimata, l'assistenza muraria._x000D_ — Finitura a vista grezza",
        nota: "Gres porcellanato fornito e posato a colla sul sottofondo esistente. Il sottofondo è una voce a parte (43.1.EQ4.01.*): massetto escluso.",
      },
      rivestimento: {
        codice: "42.2.RG4.01.A", unita: "m²",
        descrizione: "POSA DI LASTRE O PANNELLI VERTICALI - TERRAGLIE — Fornitura e posa in opera di rivestimento interno … con apposito sigillante idrorepellente, pezzi speciali, paraspigoli in PVC, pulizia della superficie piastrellata, trasporto in discarica del materiale di risulta. Escluso ponteggi._x000D_ — In ceramica (terraglie)",
        nota: "Rivestimento interno in ceramica posato a colla. In gres porcellanato grezzo costa 67,17 (42.2.RG4.01.C).",
      },
    },
    escluse: {
      porta: "Le porte interne in legno tamburate (32.2.XI1.01.A, 456,59) sono solo a m², non a cad. Le tamburate a cad (32.2.XH2.01.*) sono in lamiera d'acciaio, non porte da appartamento.",
    },
  },
  {
    regione: "Valle d'Aosta",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "S03.E10.011", unita: "m²",
        descrizione: "DEMOLIZIONI E RIMOZIONI — Demolizione di tramezzi di qualsiasi genere e tipo. Nella demolizione … fino a 2 metri. E’ inoltre compreso quanto altro occorre per dare il lavoro finito. Misurazione per l'effettiva superficie demolita, con misurazione vuoto per pieno fino a 2,5 m². — compreso tra i 6 e gli 11 cm",
        nota: "Tramezzi da 6 a 11 cm, intonaco e rivestimenti compresi. Il testo non nomina trasporto né discarica: da considerare senza trasporto.",
      },
      nuovo_tramezzo: {
        codice: "S17.M70.020", unita: "m²",
        descrizione: "MURATURE E TRAMEZZE — Tramezzatura di mattoni dello spessore di una testa, retta o curva ed a … il carico e lo scarico, il tiro in alto o basso, lo spostamento al piano anche se inclinato, e quanto altro si renda necessario a realizzare l'opera a perfetta regola d'arte. — Tramezzatura con foratelle (8x25x25 cm)",
        nota: "Tramezzo in foratelle da 8 cm, opera finita.",
      },
      nuova_muratura: {
        codice: "S17.B85.025", unita: "m²",
        descrizione: "MURATURE E TRAMEZZE — Muratura in blocchi forati in termolaterizi per opere in elevazione di tamponamento di modesto impegni statico (foratura massima 55%), senza incastri, tipo Poroton, Alveolater e similari, legati con idonea malta con caratteristiche equivalenti a quella dei blocchi — spessore 25 cm",
        nota: "Muratura da 25 cm a m² in blocchi forati di termolaterizio (tipo Poroton).",
      },
      chiusura_vano: {
        codice: "S17.M70.025", unita: "m²",
        descrizione: "MURATURE E TRAMEZZE — Tramezzatura di mattoni dello spessore di una testa, retta o curva ed a … e lo scarico, il tiro in alto o basso, lo spostamento al piano anche se inclinato, e quanto altro si renda necessario a realizzare l'opera a perfetta regola d'arte. — Tramezzatura con mattoni a 12 fori (12-13x25x25 cm)",
        nota: "Nessuna voce di tamponamento vani: tramezzo in forati da 12-13 cm. Nel prezzario costa meno di quello da 8 cm.",
      },
      intonaco: {
        codice: "S18.C10.005", unita: "m²",
        descrizione: "INTONACI — Intonaco civile per interni formato da un primo strato di rinzaffo, da un secondo … e guide, rifinito con il terzo strato di malta finissima, lisciata con frattazzo metallico o con pezza, eseguito su superfici piane o curve, verticali ed orizzontali. E’ compreso quanto occorre per dare l’opera finita",
        nota: "Intonaco civile interno a tre strati.",
      },
      tinteggiatura: {
        codice: "S27.P25.005", unita: "m²",
        descrizione: "OPERE DA DECORATORE — Pittura con idropittura vinilica, pigmentata per interni del tipo opaca, … a rullo. Sono compresi: le scale; i cavalletti; i ponteggi provvisori interni ove occorrenti; la pulitura degli ambienti ad opera ultimata. E’ inoltre compreso quanto altro occorre per dare l’opera finita. A due strati.",
        nota: "Idropittura per interni, isolante più due strati (fondo e finitura). Attenzione: è «vinilica opaca» e non è dichiarata lavabile, ma è l'unica idropittura per interni del prezzario. Le alternative sono pittura a tempera o pittura a solvente.",
      },
      battiscopa: {
        codice: "S21.Z20.000", unita: "m",
        descrizione: "PAVIMENTI E RIVESTIMENTI — Zoccolino battiscopa in gres porcellanato, non proveniente dal taglio delle mattonelle, delle dimensioni di circa 8x30 cm, fornito e posto in opera. E’ compreso quanto altro occorre per dare il lavoro finito.",
        nota: "Battiscopa in gres porcellanato: il testo dice esplicitamente «fornito e posto in opera». Prezzo basso, ma non è una voce di solo materiale.",
      },
      pavimento: {
        codice: "S21.B50.030", unita: "m²",
        descrizione: "PAVIMENTI E RIVESTIMENTI — Pavimento in gres porcellanato per interni o per esterni - gruppo BI - … Sono compresi: il letto di malta con legante idraulico; la pulitura, a posa ultimata, con segatura; la suggellatura dei giunti. E’ inoltre compreso quanto altro occorre per dare l’opera finita — opache dim. 30*30 cm",
        nota: "Gres porcellanato opaco 30x30, fornito e posato. Comprende il letto di posa in malta, non il massetto. È il formato più grande tra quelli non levigati.",
      },
      rivestimento: {
        codice: "S21.R60.020", unita: "m²",
        descrizione: "PAVIMENTI E RIVESTIMENTI — Rivestimento di pareti interne con piastrelle monocottura - pasta … dei giunti con cemento bianco o colorato; i pezzi speciali; i tagli speciali; gli sfridi; i terminali; gli zoccoli; la pulitura. E’ inoltre compreso quanto altro occorre per dare l’opera finita — dim. 20*20 cm",
        nota: "Rivestimento interno in monocottura a pasta bianca 20x20, fornito e posato.",
      },
    },
    escluse: {
      porta: "Nel prezzario non c'è nessuna voce di porta interna, né tamburata né in legno.",
    },
  },
  {
    regione: "Liguria",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "25.A05.A30.010", unita: "m²",
        descrizione: "Demolizione tramezze di mattoni, laterogesso, cemento cellulare espanso e simili, compreso l'eventuale intonaco presente - fino a 10 cm di spessore.",
        nota: "Uso il capitolo 25 (ristrutturazione), che ha le demolizioni; il capitolo 20 non le ha. Tramezze fino a 10 cm, intonaco compreso. Trasporto e smaltimento non citati: sono voci a parte (lo smaltimento è 25.A15.G10.011, a tonnellata).",
      },
      nuovo_tramezzo: {
        codice: "25.A52.A20.030", unita: "m²",
        descrizione: "Tramezze divisori e simili - in mattoni forati spessore 8 cm",
        nota: "Opera compiuta: i materiali stanno a parte nel capitolo PR. Nel capitolo 20 la stessa voce (20.A52.A20.030) costa 45,99.",
      },
      nuova_muratura: {
        codice: "25.A52.A30.025", unita: "m²",
        descrizione: "Muratura in blocchi prefabbricati in argilla espansa - spessorecm 25",
        nota: "Muratura da 25 cm a m² in blocchi di argilla espansa. Le murature in laterizio (25.A52.A10.*) sono solo a m³. In alternativa c'è il calcestruzzo vibrocompresso da 25 cm, 25.A52.A40.030 (101,38).",
      },
      chiusura_vano: {
        codice: "25.A52.A20.050", unita: "m²",
        descrizione: "Tramezze divisori e simili - In mattoni forati di spessore oltre 10 sino a 15 cm",
        nota: "Nessuna voce di tamponamento vani: tramezza in forati da oltre 10 fino a 15 cm, che comprende il 12 cm.",
      },
      tinteggiatura: {
        codice: "25.A90.B20.010", unita: "m²",
        descrizione: "Tinteggiatura di superfici murarie interne, - con idropittura lavabile a base di polimero acrilico in emulsione acquosa (prime due mani)",
        nota: "Idropittura lavabile acrilica per interni, prime due mani.",
      },
    },
    escluse: {
      intonaco: "Non c'è una voce dell'intonaco civile interno completo: è diviso per strati (25.A54.B30.*: aggrappante 7,40, fondo 20,62, finitura 11,41 €/m²).",
      battiscopa: "Solo posa (25.A66.Z10.025, 12,90 €/m) più il materiale a parte (PR.A20.A50.095): non c'è una voce di fornitura e posa.",
      pavimento: "Solo posa (25.A66.C10.040, 30 €/m²) più le piastrelle a parte (PR.A20.A50.*): non c'è una voce di fornitura e posa.",
      rivestimento: "Solo posa (25.A66.R10.010, 40,27 €/m²) più il materiale a parte: non c'è una voce di fornitura e posa.",
      porta: "Solo posa (25.A80.C10.010, 89,61 cad) più la porta a parte (PR.A23.E10.010, 456,67 cad, solo materiale): non c'è una voce di fornitura e posa.",
    },
  },
  {
    regione: "Lazio",
    anno: 2023,
    voci: {
      demolizione_tramezzo: {
        codice: "A 3.01.9.d", unita: "m²",
        descrizione: "DEMOLIZIONI — Demolizione di muratura di tamponamento e di tramezzi, compresi intonaci, … che rimarranno di proprietà dell'Amministrazione, escluso il trasporto a rifiuto in discarica autorizzata del materiale inutilizzabile: — laterizi forati, blocchi o pannelli di gesso spessore fino a 100 mm",
        nota: "Forati fino a 100 mm (tramezzo da 8). Senza trasporto a discarica (solo movimentazione in cantiere). Per 110-160 mm c'è A 3.01.9.c a 12,01.",
      },
      nuovo_tramezzo: {
        codice: "A 9.02.5.d.2", unita: "m²",
        descrizione: "Muratura di mattoni posti in foglio con malta, retta o curva ed a qualsiasi altezza, compresi oneri e magisteri per l’esecuzione di ammorsature e quanto altro si renda necessario a realizzare l’opera a perfetta regola d’arte: — con foratelle a dieci fori (8 x 25 x 25 cm): — con malta di cemento e sabbia",
        nota: "Foratelle 8x25x25 posate in foglio = tramezzo da 8 cm. Scartata G 1.03.1.b (52,51, 'per interventi limitati e circoscritti').",
      },
      nuova_muratura: {
        codice: "A 9.03.2.e", unita: "m²",
        descrizione: "MURATURA DI BLOCCHI DI CEMENTO — Muratura di blocchi forati in calcestruzzo tipo 42.5 R a superficie piana, eseguita a giunti ben serrati con malta bastarda, a qualsiasi altezza, compreso ogni onere e magistero per fornire l’opera eseguita a perfetta regola d’arte: — spessore 25 cm",
        nota: "Blocchi forati in cls 25 cm a m². L'unica laterizio da 25 cm (A 9.02.6.b.1, 122,61) si dichiara 'con valori di trasmittanza termica non adeguati alla normativa vigente': scartata.",
      },
      chiusura_vano: {
        codice: "G 1.03.2.b", unita: "m²",
        descrizione: "Chiusura di vani porta e similari (dimensione indicativa da cm 100x100 a cm 200x250) con murature … o forati, compresa esecuzione intonaco di finitura e rappezzi con raccordo all'esistente sui due lati, per singoli o più interventi ma limitati e circoscritti, comprese immorsature e piani di lavoro, in: — forato 12 cm",
        nota: "Voce specifica di chiusura vano porta; il prezzo comprende intonaco e rappezzi sui due lati, quindi è alto al m².",
      },
      intonaco: {
        codice: "A 12.01.4.a", unita: "m²",
        descrizione: "INTONACI — Intonaco pronto premiscelato in leganti speciali, costituito da un primo strato di fondo … con frattazzo metallico o alla pezza, eseguito su superfici piano o curve, verticali e quanto occorre per dare l’opera finita a regola d'arte, compreso l'uso del trabattello. Esclusi i ponteggi — con base di cemento",
        nota: "Intonaco completo fondo + finitura lisciata su pareti. L'unica voce chiamata 'intonaco civile' (A 12.01.3, 70,06) è per murature con problemi di planarità, spessore minimo 40 mm: scartata.",
      },
      tinteggiatura: {
        codice: "A 20.01.13.a.2", unita: "m²",
        descrizione: "Tinteggiatura con pittura lavabile di resina sintetica emulsionabile (idropittura) in tinte non forti a tre mani a coprire, esclusi i ponteggi esterni, la preparazione delle superfici con rasatura stuccatura e imprimitura: — su superfici interne: — con pitture vinilacriliche",
        nota: "Idropittura lavabile per interni a tre mani (nel Lazio non c'è la variante a due mani).",
      },
      battiscopa: {
        codice: "A 14.02.10.a", unita: "m",
        descrizione: "RIVESTIMENTI — Zoccolino battiscopa in grés fine porcellanato di prima scelta delle dimensioni di 8/10 x 20/30 cm posto in opera con malta bastarda compresa stuccatura, sigillatura e pulizia finale: — tinta unita naturale, granigliato naturale",
        nota: "Gres porcellanato fornito e posato.",
      },
      pavimento: {
        codice: "A 14.01.18.b.1", unita: "m²",
        descrizione: "Pavimento in piastrelle di grés fine porcellanato (prima scelta) poste in opera su letto di malta bastarda, previo spolvero di cemento tipo 32.5 con giunti connessi a cemento bianco o idoneo sigillante, compresi tagli, sfridi e pulitura finale: — dimensioni 30 x 30 cm: — tinta unita naturale",
        nota: "Gres porcellanato 30x30, posato su letto di malta (il massetto non c'è).",
      },
      rivestimento: {
        codice: "A 14.02.1.a.2", unita: "m²",
        descrizione: "Rivestimento di pareti interne con piastrelle di ceramica smaltata di prima scelta, poste in opera … l'allettamento con la stessa malta o con collante, la stuccatura dei giunti con cemento colorato o idoneo sigillante e la pulitura, esclusi i pezzi speciali: — monocottura in pasta bianca: — a tinta unita 20x20 cm",
        nota: "Ceramica monocottura 20x20 per pareti interne; intonaco rustico escluso.",
      },
    },
    escluse: {
      porta: "Le porte interne in legno del Lazio (A 16.01.x) sono tutte a mq; a cad c'è solo la porta in alluminio A 17.03.5.a (1.082,91), che non è tamburata.",
    },
  },
  {
    regione: "Sicilia",
    anno: 2024,
    voci: {
      nuovo_tramezzo: {
        codice: "SIC24_2.2.1.1", unita: "m²",
        descrizione: "Tramezzi con laterizi forati e malta cementizia a 300 kg di cemento per m³ di sabbia, compreso l\u0092onere per la formazione degli architravi per i vani porta e quanto altro occorre per dare il lavoro finito a perfetta regola d'arte. — spessore di 8 cm",
      },
      chiusura_vano: {
        codice: "SIC24_2.2.1.2", unita: "m²",
        descrizione: "Tramezzi con laterizi forati e malta cementizia a 300 kg di cemento per m³ di sabbia, compreso l\u0092onere per la formazione degli architravi per i vani porta e quanto altro occorre per dare il lavoro finito a perfetta regola d'arte. — spessore di 12 cm",
        nota: "Non c'è una voce di chiusura vani: tramezzo in forati da 12 cm.",
      },
      intonaco: {
        codice: "SIC24_9.1.1", unita: "m²",
        descrizione: "INTONACI PER ESTERNI ED INTERNI — Intonaco civile per interni dello spessore complessivo di 2,5 cm, … grassa per ogni metro cubo di sabbia da 2 cm, il tutto dato su pareti verticali od orizzontali, compreso l\u0092onere per spigoli e angoli, ed ogni altro onere e magistero per dare il lavoro finito a perfetta regola d\u0092arte.",
        nota: "Voce siciliana di intonaco civile per interni. Descrive rinzaffo e secondo strato senza nominare uno strato di finitura a parte.",
      },
      tinteggiatura: {
        codice: "SIC24_11.1.1", unita: "m²",
        descrizione: "COLORITURE E VERNICIATURE — COLORITURE PER INTERNI — Tinteggiatura per interni con pittura lavabile … applicata a pennello o a rullo in due mani, previa pulitura, spolveratura e successivo trattamento delle superfici con idoneo fondo isolante e quanto altro occorre per dare il lavoro compiuto a perfetta regola d'arte.",
      },
      battiscopa: {
        codice: "SIC24_5.2.4.1", unita: "m",
        descrizione: "RIVESTIMENTI — Fornitura e posa in opera di battiscopa per piastrelle di ceramica di 1ª scelta … regola d'arte, ad esclusione solo degli eventuali pezzi speciali da compensarsi a parte. Le caratteristiche tecniche debbono essere accertate e documentate dalla D.L. — battiscopa a becco civetta 8x30 cm s = 9 mm",
        nota: "Ceramica fornita e posata. Non usare i codici PR24_* della stessa fonte: sono solo materiale.",
      },
      pavimento: {
        codice: "SIC24_5.1.6", unita: "m²",
        descrizione: "PAVIMENTAZIONI E PARQUET — Fornitura, trasporto e posa in opera di pavimentazione in piastrelle in … sottofondo compensato a parte, e compreso l'onere per la boiaccatura, la stuccatura e la sigillatura dei giunti con prodotto idoneo ed ogni altro onere e magistero per dare il lavoro completo e a perfetta regola d'arte.",
        nota: "Pavimento ceramico (monocottura), massetto escluso. Il gres porcellanato (5.2.5.x) sta sotto RIVESTIMENTI: scartato perché ambiguo.",
      },
      rivestimento: {
        codice: "SIC24_5.2.1", unita: "m²",
        descrizione: "RIVESTIMENTI — Rivestimento di pareti con piastrelle di ceramica maiolicate di 1ª scelta, a tinta … compreso i pezzi speciali, l'allettamento, la stuccatura e la sigillatura dei giunti con idoneo prodotto, la completa pulitura ed ogni altro onere e magistero per dare il lavoro completo e a perfetta regola d'arte.",
      },
    },
    escluse: {
      demolizione_tramezzo: "L'unica voce, SIC24_21.1.4 (demolizione di tramezzi fino a 15 cm), è a 'm² x cm' (1,07): un'unità per cm di spessore, non a m².",
      nuova_muratura: "Le murature in forati sono a m³ (SIC24_2.1.4). A m² le murature singole partono da 30 cm (2.1.16, porizzato, 115,84); per ~25 cm ci sono solo murature a cassa vuota/camera d'aria.",
      porta: "La porta interna tamburata (SIC24_8.3.9, 416,68) è a m², non a cad.",
    },
  },
  {
    regione: "Sardegna",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "SAR26_PF.0012.0005.0007", unita: "m²",
        descrizione: "Demolizione di muratura in mattoni forati, anche voltata, di spessore fino a 8 cm, eseguita a mano … eseguita a regola d’arte secondo le normative esistenti. Con esclusione del trasporto del materiale di risulta ad impianto autorizzato e degli oneri relativi. Valutata per l’effettiva superficie di struttura demolita.",
        nota: "Forati fino a 8 cm. Carico su automezzo compreso, trasporto a impianto escluso. Per forati fino a 12 cm c'è 0008 a 29,17.",
      },
      nuovo_tramezzo: {
        codice: "SAR26_PF.0013.0003.0062", unita: "m²",
        descrizione: "MURATURA IN MATTONI LATERIZI FORATI, retta o curva, in opera con malta cementizia dosata a kg 400 di cemento tipo R 32.5 per m³ 1.00 di sabbia, compreso la formazione di stipiti, sguinci, architravi, lesene e spigoli, lo sfrido e il tiro in alto spessore 8 cm",
      },
      nuova_muratura: {
        codice: "SAR26_PF.0013.0003.0042", unita: "m²",
        descrizione: "MURATURA IN BLOCCO LATERIZIO AD INCASTRO VERTICALE con elevate caratteristiche meccaniche, … tipo R 32.5 per m³ 1.00 di sabbia, compreso l’imboccatura dei giunti, la formazione di spalle, sguinci, architravi, lesene e spigoli, lo sfrido e il tiro in alto spessore 25 cm con blocco di tamponamento 25x25x30",
        nota: "Blocco laterizio di tamponamento da 25 cm a m². Alternativa: muroblocco pesante da 25 cm, 0027, a 89,34.",
      },
      chiusura_vano: {
        codice: "SAR26_PF.0013.0003.0064", unita: "m²",
        descrizione: "MURATURA IN MATTONI LATERIZI FORATI, retta o curva, in opera con malta cementizia dosata a kg 400 di cemento tipo R 32.5 per m³ 1.00 di sabbia, compreso la formazione di stipiti, sguinci, architravi, lesene e spigoli,lo sfrido e il tiro in alto spessore 12 cm",
        nota: "Non c'è una voce di chiusura vani: forati da 12 cm.",
      },
      intonaco: {
        codice: "SAR26_PF.0013.0004.0028", unita: "m²",
        descrizione: "INTONACO CIVILE LISCIO PER INTERNI SU PARETI VERTICALI, formato da un primo strato di rinzaffo, da … delle pareti, compreso il ponteggio e il tiro in alto con malta bastarda composta da kg 200 di cemento tipo R 32.5, kg 200 di calce idrata e m³ 1.00 di sabbia, rifinito con sovrastante strato di colla della stessa malta",
        nota: "Malta bastarda; le altre varianti per malta (0027-0036) costano tutte circa 28 €.",
      },
      tinteggiatura: {
        codice: "SAR26_PF.0013.0005.0005", unita: "m²",
        descrizione: "TINTEGGIATURA DI PARETI E SOFFITTI INTERNI CON DUE MANI DI IDROPITTURA LAVABILE TRASPIRANTE E … chiare correnti di cartella, data in opera su superfici intonacate a civile o lisciate, previo preparazione del fondo con una mano di fissativo ancorante, compreso, l’onere del ponteggio, lo sfrido e il tiro in alto",
      },
      battiscopa: {
        codice: "SAR26_PF.0013.0013.0173", unita: "m",
        descrizione: "ZOCCOLETTO BATTISCOPA IN PIASTRELLE DI GRES, di altezza pari alla dimensione minima della piastrella, posato in opera con colla o malta, compresi tagli, sfridi e la pulizia finale dimensioni 7 1/2x15, spessore 8/9",
        nota: "Voce PF (opera finita, posata in opera; i soli materiali stanno nei codici SAR26_PR.*). Il prezzo è basso ma coerente con la piastrella di gres 7,5x15.",
      },
      pavimento: {
        codice: "SAR26_PF.0013.0013.0034", unita: "m²",
        descrizione: "PAVIMENTO CON PIASTRELLE DI GRES PORCELLANTO posto in opera a giunti aderenti, per allineamenti … cementizia dello spessore di cm 3, questo ESCLUSO; compresi tagli, sfridi, approvvigionamento al piano, la stuccatura dei giunti con cemento bianco o colorato con ossidi e la pulizia finale con segatura, formato 30x30",
        nota: "Gres porcellanato 30x30, sottofondo escluso. La sola piastrella (SAR26_PR.0013.0009.*) costa 21-36 €/m².",
      },
      rivestimento: {
        codice: "SAR26_PF.0013.0013.0153", unita: "m²",
        descrizione: "RIVESTIMENTO DI PARETI INTERNE CON PIASTRELLE DI GRES PORCELLANATO NATURALE COLORI CHIARI posate in opera con colla su intonaco frattazzato (questo escluso) compresi tagli, sfridi, la stuccatura dei giunti con cemento bianco o colorato e la pulitura anche con acidi con piastrelle 20x20",
      },
      porta: {
        codice: "SAR26_PF.0013.0006.0237", unita: "cad",
        descrizione: "PORTA INTERNA TAMBURATA AD ANTA CIECA cm 70-80x210 avente: anta mobile cieca con una specchiatura … della porta è riferita alla luce netta di passaggio. Data in opera completa di controtelaio in abete da fissare alle murature con zanche in acciaio zincato, compreso le opere murarie e la registrazione dell’infisso.",
        nota: "Comprende il controtelaio e le opere murarie. Esiste una copia SAR26_SL.0047.0001.0001 a 455,84 (capitolo SL): scelta la PF.",
      },
    },
  },
  {
    regione: "Molise",
    anno: 2026,
    voci: {
      demolizione_tramezzo: {
        codice: "MOL26_B01005b", unita: "m²",
        descrizione: "Demolizione di muratura di qualsiasi genere, anche voltata, di spessore fino ad una testa, eseguita a mano, compresa la cernita ed accantonamento del materiale di recupero da riutilizzare: — muratura in mattoni forati",
        nota: "Forati fino a una testa (~12 cm), a mano. Il trasporto non è citato, quindi resta fuori.",
      },
      nuovo_tramezzo: {
        codice: "MOL26_A05006e", unita: "m²",
        descrizione: "Muratura in mattoni posti in foglio (di quarto) e malta, retta o curva ed a qualsiasi altezza, compresi oneri e magisteri per l’esecuzione di ammorsature e quanto altro si renda necessario a realizzare l’opera a perfetta regola d’arte: — con foratelle a dieci fori delle dimensioni di 8 x 25 x 25 cm",
      },
      nuova_muratura: {
        codice: "MOL26_A05026e", unita: "m²",
        descrizione: "Muratura in blocchi forati in calcestruzzo, rispondenti ai CAM (Criteri Ambientali Minimi), 20 x 50 cm, a superficie piana, eseguita con malta bastarda, a qualsiasi altezza, compreso ogni onere e magistero per fornire l’opera eseguita a perfetta regola d’arte: — spessore 25 cm",
        nota: "Blocchi in cls da 25 cm. Le voci in laterizio da 25 cm per tamponamento (A05010b, A05012b) nel DB non hanno il testo della voce madre e non dicono il materiale. A05017a è una muratura portante sismica armata; A05048b è un blocco riempito di EPS.",
      },
      chiusura_vano: {
        codice: "MOL26_A05006g", unita: "m²",
        descrizione: "Muratura in mattoni posti in foglio (di quarto) e malta, retta o curva ed a qualsiasi altezza, compresi oneri e magisteri per l’esecuzione di ammorsature e quanto altro si renda necessario a realizzare l’opera a perfetta regola d’arte: — con mattoni forati pesanti (12 x 25 x 25 cm), del peso di 6,61 kg/cad",
        nota: "Non c'è una voce di chiusura vani: forati da 12 cm.",
      },
      intonaco: {
        codice: "MOL26_A08017b", unita: "m²",
        descrizione: "Intonaco civile costituito da primo strato di rinzaffo dello spessore medio di 5 mm con malta … finale con intonaco rasante di pura calce NHL 3.5, inerti di sabbia silicea o calcare dolomitico di granulometria 0,1 ÷ 1,4 mm, per uno spessore totale di 20 mm: — applicato a spruzzo, compreso eventuale paraspigoli",
        nota: "L'unica voce che si dichiara 'intonaco civile' completo (rinzaffo, corpo, rasatura) con testo intero; è a calce NHL. La voce tradizionale A08004c (25,07) nel DB è senza testo madre ('per interni su pareti verticali'): non si capisce se è civile.",
      },
      tinteggiatura: {
        codice: "MOL26_A17013a", unita: "m²",
        descrizione: "Tinteggiatura con idropittura per interni con proprietà anallergiche, a finitura opaca, altamente resistente al lavaggio, esente da solventi e sostanze organiche volatili, applicata in due mani a pennello, a rullo o a spruzzo su intonaco preventivamente preparato, da valutarsi a parte: — bianca",
        nota: "Idropittura lavabile per interni a due mani. Le voci A17011 (~7 €) nel DB sono senza testo madre.",
      },
      battiscopa: {
        codice: "MOL26_A14043e", unita: "m",
        descrizione: "Zoccolino di gres porcellanato colorato in massa, superficie naturale o bocciardata, posto in opera con idoneo collante, compresi tagli, sfridi, pulitura finale e sigillatura dei giunti: — effetto granigliato o tinta unita, 9,5 x 30 cm spessore 8,5 mm",
        nota: "Gres porcellanato fornito e posato.",
      },
      pavimento: {
        codice: "MOL26_A13041b", unita: "m²",
        descrizione: "Pavimento in gres porcellanato smaltato superficie effetto legno in piastrelle, per spazi privati … mm, posto in opera con idoneo collante, previa preparazione del piano superiore del massetto di sottofondo da pagarsi a parte, compresi tagli, sfridi, pulitura finale e sigillatura dei giunti: — 12,5 x 50 cm per interni",
        nota: "L'unico gres porcellanato dichiarato per spazi privati e interni; massetto a parte. Le altre voci sono per intenso calpestio (A13028, A13047) o per esterni (A13039).",
      },
    },
    escluse: {
      rivestimento: "Le voci di rivestimento ceramico (A14001-A14019) nel DB hanno solo la coda ('25 x 38 cm: — effetto cemento…') senza la voce madre: materiale e fornitura non si possono verificare. Le altre sono klinker industriale, pietra o tessere di vetro.",
      porta: "Le porte tamburate del Molise (A19002, A19004) sono portoncini d'ingresso a mq; non c'è una porta interna a cad.",
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

/** Il Trentino-Alto Adige ha due prezzari, uno per Provincia autonoma. */
const PROVINCE_AUTONOME: Readonly<Record<string, string>> = { TN: "Trentino — P.A. Trento", BZ: "Trentino — P.A. Bolzano" };

/** Nome della provincia nel nome della fonte toscana («Prezzario Toscana 2026 – Massa Carrara»). */
export const PROVINCE_TOSCANA: Readonly<Record<string, string>> = {
  AR: "Arezzo", FI: "Firenze", GR: "Grosseto", LI: "Livorno", LU: "Lucca",
  MS: "Massa Carrara", PI: "Pisa", PO: "Prato", PT: "Pistoia", SI: "Siena",
};

/**
 * La regione come la scrive `prezzario_fonte` per un'azienda di questa regione e provincia:
 * per il Trentino-Alto Adige conta la provincia (TN o BZ); senza, non si sceglie.
 */
export function regioneDelPrezzario(regione: string | null | undefined, provincia: string | null | undefined): string | null {
  const r = (regione ?? "").trim();
  if (!/^trentino/i.test(r)) return r || null;
  if (/trento/i.test(r)) return PROVINCE_AUTONOME.TN;
  if (/bolzano|alto adige|südtirol/i.test(r) && !/^trentino-alto adige$/i.test(r)) return PROVINCE_AUTONOME.BZ;
  return PROVINCE_AUTONOME[(provincia ?? "").trim().toUpperCase()] ?? null;
}

/** Gli abbinamenti di una regione, o null se non ce ne sono. */
export function abbinamentiPerRegione(regione: string | null | undefined): AbbinamentiRegione | null {
  const r = (regione ?? "").trim().toLowerCase();
  return r ? ABBINAMENTI_PREZZARIO.find((a) => a.regione.toLowerCase() === r) ?? null : null;
}
