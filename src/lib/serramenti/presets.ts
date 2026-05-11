/**
 * src/lib/serramenti/presets.ts — Template pre-compilati settore serramenti.
 *
 * Preset realistici basati su prassi commerciali standard del settore
 * (rilievo, posa qualificata, garanzia decennale, smaltimento, ecc.).
 * L'azienda può applicarli con 1 click e poi personalizzarli.
 */
import type { SrEsigenza, SrSoluzioneItem, SrTestimonianza } from "@/types/serramenti";

// ─── Esigenze tipiche (3 pain bullets) ──────────────────────────────────────

export const PRESET_ESIGENZE: SrEsigenza[] = [
  {
    titolo: "Spifferi e correnti",
    descrizione:
      "Telai nuovi con guarnizioni multiple e perimetro sigillato a regola d'arte. Niente più aria fredda dalle finestre e tende che si muovono da sole.",
  },
  {
    titolo: "Condensa e muffa",
    descrizione:
      "Vetri con prestazioni isolanti adeguate al clima della tua zona. Niente più condensa al mattino sui vetri e meno rischio di muffa lungo i bordi.",
  },
  {
    titolo: "Aspetto e finitura",
    descrizione:
      "Colore, finitura e maniglie scelte da te in consulenza. I serramenti si integrano con lo stile della casa, valorizzandola.",
  },
];

export const PRESET_ESIGENZE_ALT: SrEsigenza[] = [
  {
    titolo: "Bollette alle stelle",
    descrizione:
      "Vetri basso-emissivi e profili a taglio termico riducono le dispersioni del 30-50% rispetto ai serramenti vecchi. Risparmio reale ogni mese sulla bolletta.",
  },
  {
    titolo: "Rumore esterno",
    descrizione:
      "Vetrocamere acustiche fino a 42 dB di abbattimento. Pace anche se vivi su strada trafficata o vicino a una linea ferroviaria.",
  },
  {
    titolo: "Sicurezza e tranquillità",
    descrizione:
      "Ferramenta antieffrazione, vetri di sicurezza stratificati e chiusure a più punti. Dormi tranquillo anche al piano terra.",
  },
];

// ─── Soluzione (2-3 elementi) ───────────────────────────────────────────────

export const PRESET_SOLUZIONE: SrSoluzioneItem[] = [
  {
    titolo: "Serramenti su misura",
    descrizione:
      "Profili durevoli e prestazionali, finitura sempre in ordine. Materiale e colore scelti insieme in consulenza in base allo stile della casa e al budget.",
  },
  {
    titolo: "Posa qualificata",
    descrizione:
      "Sigillature al perimetro con nastri autoespandenti e membrane traspiranti, eseguite a regola d'arte: zero infiltrazioni d'aria o acqua nel tempo. Garanzia decennale sulla posa scritta in contratto.",
  },
];

export const PRESET_SOLUZIONE_PREMIUM: SrSoluzioneItem[] = [
  {
    titolo: "Vetri ad alte prestazioni",
    descrizione:
      "Vetrocamera basso-emissiva con warm-edge o tripla camera. Trasmittanza fino a Uw 0,8 W/m²K e abbattimento acustico fino a 42 dB.",
  },
  {
    titolo: "Profili a taglio termico",
    descrizione:
      "Alluminio o PVC multicamera con barriere termiche integrate. Niente ponti termici, niente condensa sul telaio.",
  },
  {
    titolo: "Posa certificata UNI 11673",
    descrizione:
      "Squadra interna formata sulla norma UNI 11673: sigillatura primaria, secondaria e barriere a vista. Documentazione fotografica del cantiere consegnata a fine lavori.",
  },
];

// ─── Perché noi (USP) ───────────────────────────────────────────────────────

export const PRESET_PERCHE_NOI: string[] = [
  "Un solo interlocutore dalla prima consulenza al collaudo finale",
  "Posa eseguita a regola d'arte con sigillature certificate nel tempo",
  "Garanzia decennale sulla posa scritta in contratto",
  "Squadre di posa interne nostre, mai subappaltatori",
  "Prezzo del Piano dei Lavori bloccato fino alla firma",
];

export const PRESET_PERCHE_NOI_ALT: string[] = [
  "Oltre 15 anni di esperienza nel settore serramenti",
  "Cantieri completati a regola d'arte e referenziati nella tua zona",
  "Pratica Ecobonus inclusa nel prezzo (50% o 65% senza costi aggiuntivi)",
  "Tempi di consegna garantiti contrattualmente",
  "Showroom dedicato con tutti i campioni di materiali e colori",
  "Assistenza post-vendita entro 48 ore",
];

// ─── Cosa è incluso (5-6 bullet) ────────────────────────────────────────────

export const PRESET_INCLUSO: string[] = [
  "Rilievo dimensionale a casa tua con un nostro tecnico, senza costi aggiuntivi",
  "Smontaggio e smaltimento dei serramenti vecchi a carico nostro",
  "Posa qualificata da squadre interne specializzate, mai subappaltata",
  "Sigillature con nastri autoespandenti e membrane traspiranti, per tenuta all'aria e all'acqua duratura",
  "Collaudo finale, regolazioni a richiesta e manuale di manutenzione consegnato a fine lavori",
];

export const PRESET_INCLUSO_PLUS: string[] = [
  "Rilievo dimensionale e consulenza tecnica a casa tua, senza impegno",
  "Smontaggio serramenti esistenti, trasporto e smaltimento in discarica autorizzata",
  "Fornitura serramenti su misura con materiali e finiture concordati",
  "Posa qualificata UNI 11673 da squadre interne, mai subappaltata",
  "Sigillature a triplo strato (interna, primaria, esterna) con nastri certificati",
  "Pulizia finale del cantiere e ritiro imballaggi",
  "Documentazione tecnica per pratica Ecobonus e ENEA",
  "Manuale d'uso e collaudo con il cliente a fine cantiere",
];

// ─── Prossimi passi (4 step) ────────────────────────────────────────────────

export const PRESET_PROSSIMI_PASSI: string[] = [
  "Ci vediamo a casa tua per la Consulenza tecnica",
  "Ascoltiamo le tue esigenze e troviamo la soluzione migliore",
  "Sviluppiamo il Piano dei Lavori e definiamo i dettagli",
  "Firmi e procediamo insieme",
];

export const PRESET_PROSSIMI_PASSI_PREMIUM: string[] = [
  "Sopralluogo tecnico gratuito a casa tua con rilievo dimensionale puntuale",
  "Scelta materiali, finiture e maniglie in showroom (campioni reali)",
  "Stesura del Piano dei Lavori definitivo con tempi, costi e garanzie",
  "Firma del contratto e blocco del prezzo fino all'installazione",
  "Produzione + posa nei tempi concordati e collaudo finale insieme",
];

// ─── Recensioni di esempio (placeholder credibili da personalizzare) ───────

export const PRESET_RECENSIONI: SrTestimonianza[] = [
  {
    quote:
      "Avevamo chiesto un preventivo a quattro aziende: due ci hanno detto che non lo facevano, una ce lo aveva fatto in subappalto. Loro ce lo hanno fatto interamente in casa. Si vede dalla cura del dettaglio.",
    autore: "Andrea e Silvia M.",
    citta: "Gorgonzola",
    intervento: "Bifamiliare nuova costruzione, 22 serramenti alluminio-legno",
  },
  {
    quote:
      "Il cantiere è durato due settimane esatte, come avevano detto. Sono passati quattro anni: nessun problema, e quando ho avuto bisogno di una regolazione sono venuti in tre giorni.",
    autore: "Marco e Chiara G.",
    citta: "Cassano d'Adda",
    intervento: "Villa singola, sostituzione 28 serramenti",
  },
  {
    quote:
      "Avevo ricevuto preventivi più bassi, ma volevo capire chi mi avrebbe seguito anche dopo. Da loro un solo numero di telefono per tutto il cantiere e per i dieci anni successivi. Ho dormito tranquillo.",
    autore: "Roberto P.",
    citta: "Segrate",
    intervento: "Appartamento ristrutturato, 8 serramenti PVC",
  },
];

export const PRESET_RECENSIONI_EXTRA: SrTestimonianza[] = [
  {
    quote:
      "La differenza si è sentita dal primo giorno: zero spifferi, condensa scomparsa, e in inverno la caldaia parte molto meno. La bolletta del gas è scesa del 35%.",
    autore: "Giulia e Stefano B.",
    citta: "Monza",
    intervento: "Appartamento al 4° piano, 6 serramenti PVC + zanzariere",
  },
  {
    quote:
      "Avevo paura del cantiere con bambini piccoli. Hanno protetto tutto, smontato e rimontato in giornata camera per camera. Pulizia impeccabile a fine lavori.",
    autore: "Famiglia Rossi",
    citta: "Bergamo",
    intervento: "Villetta a schiera, 14 serramenti + 2 porte ingresso",
  },
];
