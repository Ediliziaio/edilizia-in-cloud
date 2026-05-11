/**
 * src/lib/serramenti/presets.ts — Template persuasivi settore serramenti.
 *
 * Copy scritto in ottica vendita pro:
 *  - Pain-Agitation-Solution (PAS) per le esigenze
 *  - You-language: parla al cliente, non di sé
 *  - Specificity: numeri concreti, % reali, anni, dB, €
 *  - Loss aversion: cosa stai perdendo se non agisci
 *  - Authority: norme tecniche (UNI 11673), garanzie scritte
 *  - Anti-vague: mai "qualità/esperienza", sempre prove concrete
 *
 * Ogni preset è una variante credibile da personalizzare con i dati
 * reali dell'azienda.
 */
import type { SrEsigenza, SrSoluzioneItem, SrTestimonianza } from "@/types/serramenti";

// ─── Esigenze (PAS — Pain → Agitation → Solution) ───────────────────────────

export const PRESET_ESIGENZE: SrEsigenza[] = [
  {
    titolo: "Spifferi e correnti d'aria",
    descrizione:
      "Già a ottobre devi tenere le tende chiuse perché entra freddo dalle finestre. Con telai a triplo battuta e perimetro sigillato a regola d'arte, l'aria fredda resta fuori. In casa torni a sentire il silenzio, non il vento.",
  },
  {
    titolo: "Condensa e muffa al mattino",
    descrizione:
      "Ogni mattina d'inverno asciughi i vetri con lo straccio e sotto le finestre è già spuntata la prima macchia di muffa. Vetri basso-emissivi e telai a taglio termico portano la condensa a zero: muri puliti, niente più tinteggiature ogni 2 anni.",
  },
  {
    titolo: "Estetica datata della casa",
    descrizione:
      "I serramenti vecchi tradiscono l'età della casa: si notano appena entri. Profili sottili e finiture scelte con te (anche su misura) ringiovaniscono la facciata di 15 anni senza dover toccare niente altro.",
  },
];

export const PRESET_ESIGENZE_ALT: SrEsigenza[] = [
  {
    titolo: "Bolletta del gas che cresce ogni anno",
    descrizione:
      "Tra il 2021 e il 2024 il prezzo del gas è quasi raddoppiato. I tuoi serramenti vecchi disperdono il 35-50% del calore. Con vetrocamera basso-emissiva e profili a taglio termico recuperi 300-500 € l'anno in bolletta — ogni anno, per i prossimi 30.",
  },
  {
    titolo: "Rumore dalla strada che ti sveglia",
    descrizione:
      "Se vivi su strada o vicino a una linea ferroviaria, il primo autobus è la tua sveglia. Vetrocamere acustiche fino a 42 dB di abbattimento: dentro casa parli a voce normale anche con la finestra socchiusa.",
  },
  {
    titolo: "Sicurezza di chi dorme sotto al tuo tetto",
    descrizione:
      "Il 60% dei furti in appartamento entra dalle finestre del piano terra o del primo piano. Ferramenta antieffrazione RC2, vetri stratificati di sicurezza, chiusure a 8 punti: anche in vacanza dormi sereno.",
  },
];

export const PRESET_ESIGENZE_FAMIGLIA: SrEsigenza[] = [
  {
    titolo: "Bambini al sicuro intorno alle finestre",
    descrizione:
      "Maniglie con chiave di sicurezza, ferramenta che blocca l'apertura oltre i 10 cm, vetri stratificati che non possono frantumarsi. Tuo figlio gioca vicino alla finestra e tu pensi ad altro.",
  },
  {
    titolo: "Caldo d'estate quando i bimbi dormono",
    descrizione:
      "Vetri selettivi che bloccano il 60% dei raggi solari estivi e tapparelle motorizzate con timer: la cameretta resta fresca senza condizionatore acceso tutta la notte.",
  },
  {
    titolo: "Manutenzione zero per anni",
    descrizione:
      "Profili in alluminio o PVC che non si scrostano, non si gonfiano d'acqua, non perdono colore. Una passata di panno umido due volte l'anno e sono come nuovi: il tempo lo dedichi a tua figlia, non alle finestre.",
  },
];

// ─── Soluzione (Specificity + Authority) ────────────────────────────────────

export const PRESET_SOLUZIONE: SrSoluzioneItem[] = [
  {
    titolo: "Serramenti misurati al millimetro sulla tua casa",
    descrizione:
      "Niente cataloghi standard adattati ad occhio. Veniamo a casa tua con il laser e produciamo serramenti unici per i tuoi fori: nessun raccordo posticcio, nessuna stuccatura per coprire i 2 cm di troppo. Il risultato si vede.",
  },
  {
    titolo: "Posa qualificata, scritta in contratto",
    descrizione:
      "Il 60% dei problemi sui serramenti nuovi nasce da una posa fatta male. Le nostre squadre posano secondo norma UNI 11673 con tripla sigillatura (nastri autoespandenti + membrana traspirante + finitura). Garanzia decennale sulla posa, nera su bianco già in offerta.",
  },
];

export const PRESET_SOLUZIONE_PREMIUM: SrSoluzioneItem[] = [
  {
    titolo: "Vetri ad altissime prestazioni",
    descrizione:
      "Vetrocamera basso-emissiva con gas argon e warm-edge in PVC. Uw fino a 0,8 W/m²K — le stesse prestazioni che oggi servono per una casa NZEB di classe A4. Abbattimento acustico fino a 42 dB.",
  },
  {
    titolo: "Profili a taglio termico vero",
    descrizione:
      "Alluminio con barriera termica da 32 mm o PVC 7 camere con anima in acciaio. Nessun ponte termico, nessuna condensa sul telaio nemmeno con -10°C fuori.",
  },
  {
    titolo: "Posa certificata UNI 11673 con foto del cantiere",
    descrizione:
      "Squadre interne formate sulla norma. Sigillatura primaria, secondaria, finitura a vista — documentate giorno per giorno con foto consegnate al cliente. Se domani vendi casa hai la prova in mano della posa eseguita a regola d'arte.",
  },
];

// ─── Perché noi (Authority + Social Proof + Loss Aversion) ──────────────────

export const PRESET_PERCHE_NOI: string[] = [
  "Un solo numero di telefono dalla prima consulenza al collaudo finale — e per i 10 anni successivi",
  "Squadre di posa interne, mai subappaltatori esterni: chi rileva è chi misura, chi misura è chi posa",
  "Garanzia decennale sulla posa scritta nel contratto — non a voce, non sulla parola",
  "Prezzo bloccato fino alla firma del contratto: niente sorprese in fattura",
  "Pratica Ecobonus 50% o 65% inclusa nel servizio — tu non muovi un dito, ci pensiamo noi",
];

export const PRESET_PERCHE_NOI_ALT: string[] = [
  "Oltre 1.200 finestre installate nella tua provincia negli ultimi 24 mesi",
  "Showroom aperto al pubblico: tocchi materiali, finiture e maniglie prima di scegliere",
  "Sopralluogo tecnico gratuito e senza impegno — anche se poi scegli un'altra azienda",
  "Tempi di consegna garantiti contrattualmente, con penale a nostro carico se sforiamo",
  "Pulizia del cantiere garantita: te ne accorgi solo quando i serramenti sono già su",
  "Assistenza entro 48 ore anche a 5 anni dall'installazione: ti regoliamo le maniglie senza farti pagare l'uscita",
];

export const PRESET_PERCHE_NOI_TRUST: string[] = [
  "Azienda iscritta alla Camera di Commercio dal [anno] — non un commerciale improvvisato",
  "Tecnico certificato installatore di serramenti (norma UNI 11673)",
  "Polizza RC dedicata da [importo] per coprire qualsiasi danno in cantiere",
  "Recensioni reali verificate su Google: [N] stelle medie su [N] recensioni",
  "Codice fiscale e P.IVA visibili in fattura: detrazione fiscale tranquilla e tracciabile",
];

// ─── Cosa è incluso (Reciprocity — tutto già dentro) ────────────────────────

export const PRESET_INCLUSO: string[] = [
  "Sopralluogo tecnico a casa tua con rilievo al millimetro — anche solo per confronto, gratuito e senza impegno",
  "Smontaggio dei vecchi serramenti, trasporto e smaltimento in discarica autorizzata (con bolla regolare)",
  "Posa eseguita da squadre interne specializzate — mai subappaltata",
  "Tripla sigillatura perimetrale (nastri autoespandenti + membrana traspirante + finitura): zero infiltrazioni anche dopo 10 anni",
  "Collaudo finale insieme + manuale di manutenzione consegnato a mano",
];

export const PRESET_INCLUSO_PLUS: string[] = [
  "Sopralluogo tecnico gratuito e senza impegno — anche su due case (es. prima casa + casa al mare)",
  "Smontaggio, trasporto e smaltimento dei vecchi serramenti in discarica autorizzata con bolla a tuo nome",
  "Fornitura serramenti su misura prodotti in Italia (no importati a basso costo)",
  "Posa certificata UNI 11673 con documentazione fotografica del cantiere consegnata al cliente",
  "Tripla sigillatura testata in laboratorio: tenuta all'aria classe 4, tenuta acqua 9A",
  "Pratica Ecobonus 50/65% completa: invio ENEA entro 90 giorni e archiviazione documenti a nostro carico",
  "Pulizia del cantiere e ritiro imballaggi a fine lavori (paghi quando esci dalla porta, non dopo)",
  "Garanzia decennale sulla posa + garanzia produttore sul serramento — entrambe scritte in contratto",
];

// ─── Prossimi passi (Commitment ladder — micro-yes consecutivi) ─────────────

export const PRESET_PROSSIMI_PASSI: string[] = [
  "Ti chiamiamo per fissare la consulenza tecnica a casa tua — quando e come è comodo per te",
  "Veniamo, misuriamo, ascoltiamo le tue esigenze (durata 60 minuti, senza impegno)",
  "Ti consegniamo il Piano dei Lavori con materiali, prezzo definitivo e tempi precisi",
  "Firmi solo se sei convinto al 100% — e blocchiamo il prezzo fino alla data di installazione",
];

export const PRESET_PROSSIMI_PASSI_PREMIUM: string[] = [
  "Sopralluogo tecnico gratuito a casa tua con rilievo dimensionale al millimetro (60 min)",
  "Visita in showroom per toccare materiali, finiture e maniglie reali — anche con tuo marito/moglie",
  "Stesura del Piano dei Lavori con tempi, prezzo netto bloccato e tutte le garanzie scritte",
  "Firma del contratto solo quando sei convinto: prezzo congelato fino al giorno della posa",
  "Produzione su misura + posa nei giorni concordati + collaudo finale insieme, casa pulita",
];

// ─── Recensioni (specificity + risultato concreto + autorità implicita) ─────

export const PRESET_RECENSIONI: SrTestimonianza[] = [
  {
    quote:
      "Avevamo chiesto un preventivo a 4 aziende: due ci hanno detto che non lo facevano, una ce lo avrebbe fatto in subappalto. Loro lo hanno fatto interamente in casa. Si vede dalla cura del dettaglio: nessuna sbavatura, nessun raccordo posticcio.",
    autore: "Andrea e Silvia M.",
    citta: "Gorgonzola (MI)",
    intervento: "Bifamiliare nuova costruzione, 22 serramenti alluminio-legno",
  },
  {
    quote:
      "Il cantiere è durato due settimane esatte, come avevano detto. Sono passati 4 anni: nessun problema, nessuna infiltrazione, nessuno spiffero. Quando ho avuto bisogno di una regolazione sono venuti in 3 giorni senza farmi pagare l'uscita.",
    autore: "Marco e Chiara G.",
    citta: "Cassano d'Adda (MI)",
    intervento: "Villa singola, sostituzione 28 serramenti PVC",
  },
  {
    quote:
      "Avevo ricevuto preventivi più bassi del 12%, ma volevo capire chi mi avrebbe seguito anche dopo. Da loro un solo numero di telefono per tutto il cantiere e per i 10 anni successivi. Ho dormito tranquillo. La differenza la senti dopo, non prima.",
    autore: "Roberto P.",
    citta: "Segrate (MI)",
    intervento: "Appartamento ristrutturato, 8 serramenti PVC + zanzariere",
  },
];

export const PRESET_RECENSIONI_EXTRA: SrTestimonianza[] = [
  {
    quote:
      "La differenza si è sentita dal primo giorno: zero spifferi, condensa scomparsa al 100%, e in inverno la caldaia parte un terzo del tempo rispetto a prima. La bolletta del gas è scesa del 35% — su 1.800 €/anno ne ho risparmiati quasi 650 il primo anno.",
    autore: "Giulia e Stefano B.",
    citta: "Monza",
    intervento: "Appartamento 4° piano, 6 serramenti PVC + zanzariere a scomparsa",
  },
  {
    quote:
      "Avevo paura del cantiere con due bambini piccoli in casa. Hanno coperto tutti i mobili, smontato e rimontato camera per camera in giornata, e a fine lavori la casa era più pulita di quando sono arrivati. Mai vista una squadra così.",
    autore: "Famiglia Rossi",
    citta: "Bergamo",
    intervento: "Villetta a schiera, 14 serramenti + porta blindata d'ingresso",
  },
  {
    quote:
      "Volevo capire prima quanto avrei risparmiato davvero. Mi hanno fatto vedere il calcolo dei kWh persi dalle vecchie finestre, mi hanno spiegato il payback. Dopo 18 mesi i numeri tornano spaccati: 480 € risparmiati in bolletta, esattamente come avevano stimato.",
    autore: "Ing. Lorenzo T.",
    citta: "Milano",
    intervento: "Attico, 10 serramenti scorrevoli alluminio-legno",
  },
];

export const PRESET_RECENSIONI_ANZIANI: SrTestimonianza[] = [
  {
    quote:
      "Mia madre ha 82 anni e aveva paura del cantiere. Sono stati pazienti, le hanno spiegato tutto, hanno coperto tutti i mobili con teli e a fine giornata la casa era come prima. Lei adesso apre la finestra senza fatica con un dito — prima ci voleva un uomo.",
    autore: "Paola C.",
    citta: "Sesto San Giovanni (MI)",
    intervento: "Appartamento anni '70, 7 serramenti PVC con maniglie ergonomiche",
  },
];
