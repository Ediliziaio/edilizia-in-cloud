/**
 * Libreria standard delle scomposizioni: il punto di partenza per impianti
 * elettrici (civile e terziario), rivelazione incendi, climatizzazione e
 * fotovoltaico. Ogni voce dice quali materiali servono per UNA unità (un
 * punto, un metro, un apparecchio), con quantità, unità, sfrido e specifiche
 * da capitolato.
 *
 * Le quantità sono medie prudenti per un'abitazione o un ufficio (cavi e
 * tubi: metri medi per punto). L'azienda importa la libreria con «Aggiungi la
 * libreria standard»: le voci entrano SPENTE (origine 'standard'), il tecnico
 * le controlla, le corregge e le approva. Niente marche.
 *
 * Riconoscimento: tutte le parole chiave devono comparire all'inizio di una
 * parola della voce di computo o della legenda della tavola (vedi
 * punteggioScomposizione). A parità vince la voce con più parole chiave: per
 * questo «punto luce deviato» ha due parole e batte «punto luce» da solo.
 * Le voci a punto non fissano l'unità (cad, n., pz vanno tutte bene); quelle
 * a metro sì.
 */
import type { ComponenteScomposizione, Scomposizione } from "./generaDistinta";

export type AmbitoStandard = "elettrico" | "antincendio" | "climatizzazione" | "fotovoltaico";

export interface ComponenteStandard {
  descrizione: string;
  specifiche: string | null;
  unita_misura: "pz" | "m" | "mq" | "kg" | "l" | "conf";
  quantita_per_unita: number;
  sfrido_percentuale: number;
  categoria: string;
}

export interface ScomposizioneStandard {
  codice_standard: string;
  ambito: AmbitoStandard;
  nome: string;
  /** Unità della voce di computo: null = qualsiasi (cad, n., pz). */
  unita_misura: "m" | null;
  parole_chiave: string[];
  /** Come compare di solito nella legenda delle tavole (per chi controlla i conteggi). */
  simboli: string[];
  componenti: ComponenteStandard[];
  note: string | null;
}

const CATEGORIA: Record<AmbitoStandard, string> = {
  elettrico: "Impianto elettrico",
  antincendio: "Rivelazione incendi",
  climatizzazione: "Climatizzazione",
  fotovoltaico: "Fotovoltaico",
};

function c(ambito: AmbitoStandard) {
  return (descrizione: string, specifiche: string | null, unita_misura: ComponenteStandard["unita_misura"], quantita_per_unita: number, sfrido_percentuale = 0): ComponenteStandard =>
    ({ descrizione, specifiche, unita_misura, quantita_per_unita, sfrido_percentuale, categoria: CATEGORIA[ambito] });
}

const el = c("elettrico");
const ai = c("antincendio");
const cl = c("climatizzazione");
const fv = c("fotovoltaico");

// Parti comuni dei punti elettrici.
const CORRUGATO_20 = "Tubo corrugato flessibile Ø20 mm, autoestinguente, CEI EN 61386";
const CORRUGATO_25 = "Tubo corrugato flessibile Ø25 mm, autoestinguente, CEI EN 61386";
const CAVO_15 = "Cavo FS17 450/750 V 1×1,5 mm², CPR Cca-s3,d1,a3";
const CAVO_25 = "Cavo FS17 450/750 V 1×2,5 mm², CPR Cca-s3,d1,a3";

const comandoIncasso = (funzione: string, quanti = 1): ComponenteStandard[] => [
  el("Scatola da incasso 3 moduli (503)", "In materiale isolante, per pareti in muratura o cartongesso", "pz", 1),
  el(funzione, "Serie civile 1 modulo, 10 A 250 V", "pz", quanti),
  el("Supporto 3 moduli", null, "pz", 1),
  el("Placca 3 moduli", "Colore da capitolato", "pz", 1),
  el("Copriforo 1 modulo", null, "pz", 3 - quanti),
];

const uscitaLuce: ComponenteStandard[] = [
  el("Quota cassetta di derivazione da incasso", "Con coperchio, IP40, quota per punto", "pz", 0.25),
  el("Morsetto a leva", "Per conduttori 0,2-4 mm²", "pz", 3),
];

export const SCOMPOSIZIONI_STANDARD: ScomposizioneStandard[] = [
  // ─── Impianto elettrico ────────────────────────────────────────────────
  {
    codice_standard: "EL-PUNTO-LUCE-INT", ambito: "elettrico", nome: "Punto luce interrotto", unita_misura: null,
    parole_chiave: ["punto luce"], simboli: ["Punto luce", "Interruttore"],
    componenti: [
      ...comandoIncasso("Interruttore unipolare"),
      ...uscitaLuce,
      el("Tubo corrugato", CORRUGATO_20, "m", 10, 10),
      el("Cavo unipolare", `${CAVO_15} (fase, ritorno, protezione)`, "m", 30, 10),
    ],
    note: "Un comando e un'uscita luce; 10 m medi di tubo dalla cassetta di derivazione.",
  },
  {
    codice_standard: "EL-PUNTO-LUCE-DEV", ambito: "elettrico", nome: "Punto luce deviato", unita_misura: null,
    parole_chiave: ["punto luce", "deviat"], simboli: ["Deviatore"],
    componenti: [
      ...comandoIncasso("Deviatore unipolare"),
      el("Scatola da incasso 3 moduli (503) per il secondo comando", null, "pz", 1),
      el("Deviatore unipolare (secondo comando)", "Serie civile 1 modulo, 10 A 250 V", "pz", 1),
      el("Supporto e placca 3 moduli (secondo comando)", null, "pz", 1),
      ...uscitaLuce,
      el("Tubo corrugato", CORRUGATO_20, "m", 16, 10),
      el("Cavo unipolare", `${CAVO_15} (fase, due ritorni, protezione)`, "m", 56, 10),
    ],
    note: "Due comandi; 16 m medi di tubo.",
  },
  {
    codice_standard: "EL-PUNTO-LUCE-INV", ambito: "elettrico", nome: "Punto luce invertito", unita_misura: null,
    parole_chiave: ["punto luce", "invertit"], simboli: ["Invertitore"],
    componenti: [
      ...comandoIncasso("Deviatore unipolare"),
      el("Scatola da incasso 3 moduli (503) per gli altri comandi", null, "pz", 2),
      el("Deviatore unipolare (ultimo comando)", "Serie civile 1 modulo, 10 A 250 V", "pz", 1),
      el("Invertitore", "Serie civile 1 modulo, 10 A 250 V", "pz", 1),
      el("Supporto e placca 3 moduli (altri comandi)", null, "pz", 2),
      ...uscitaLuce,
      el("Tubo corrugato", CORRUGATO_20, "m", 22, 10),
      el("Cavo unipolare", `${CAVO_15} (fase, due ritorni, protezione)`, "m", 80, 10),
    ],
    note: "Tre comandi (due deviatori e un invertitore); 22 m medi di tubo.",
  },
  {
    codice_standard: "EL-PUNTO-LUCE-SOFFITTO", ambito: "elettrico", nome: "Punto luce a soffitto", unita_misura: null,
    parole_chiave: ["punto luce", "soffit"], simboli: ["Punto luce a soffitto"],
    componenti: [
      ...comandoIncasso("Interruttore unipolare"),
      el("Scatola portafrutto o cassetta a soffitto", "Ø65 mm per controsoffitto o tonda da getto", "pz", 1),
      ...uscitaLuce,
      el("Tubo corrugato", CORRUGATO_20, "m", 12, 10),
      el("Cavo unipolare", `${CAVO_15} (fase, ritorno, protezione)`, "m", 36, 10),
    ],
    note: "Come il punto interrotto, con la scatola a soffitto e 2 m di tubo in più.",
  },
  {
    codice_standard: "EL-PUNTO-LUCE-PARETE", ambito: "elettrico", nome: "Punto luce a parete", unita_misura: null,
    parole_chiave: ["punto luce", "a parete"], simboli: ["Applique", "Punto luce a parete"],
    componenti: [
      ...comandoIncasso("Interruttore unipolare"),
      el("Scatola da incasso tonda per applique", "Ø60 mm", "pz", 1),
      ...uscitaLuce,
      el("Tubo corrugato", CORRUGATO_20, "m", 10, 10),
      el("Cavo unipolare", `${CAVO_15} (fase, ritorno, protezione)`, "m", 30, 10),
    ],
    note: null,
  },
  {
    codice_standard: "EL-PLAFONIERA-LED", ambito: "elettrico", nome: "Plafoniera LED", unita_misura: null,
    parole_chiave: ["plafonier"], simboli: ["Plafoniera LED", "Pannello LED 600×600"],
    componenti: [
      el("Plafoniera LED", "Da capitolato: potenza, flusso luminoso, 4000 K, UGR<19 per uffici, IP20 (IP65 in esterno o locali umidi)", "pz", 1),
      el("Kit di fissaggio (tasselli, viti o staffe per controsoffitto)", null, "conf", 1),
      el("Morsetto a leva", "Per conduttori 0,2-4 mm²", "pz", 3),
    ],
    note: "Solo l'apparecchio: il punto luce è una voce a parte.",
  },
  {
    codice_standard: "EL-LAMPADA-EMERGENZA", ambito: "elettrico", nome: "Lampada di emergenza", unita_misura: null,
    parole_chiave: ["emergenza"], simboli: ["Lampada di emergenza", "SE", "Illuminazione di sicurezza"],
    componenti: [
      el("Apparecchio di illuminazione di emergenza LED", "Autonomia 1 h, ricarica 12 h, IP40 (IP65 dove serve), CEI EN 60598-2-22", "pz", 1),
      el("Pittogramma di via di fuga", "Se apparecchio di segnalazione, UNI EN ISO 7010", "pz", 1),
      el("Scatola da incasso 3 moduli (503)", null, "pz", 1),
      el("Tubo corrugato", CORRUGATO_20, "m", 8, 10),
      el("Cavo unipolare", `${CAVO_15} (fase, neutro, protezione)`, "m", 24, 10),
    ],
    note: null,
  },
  {
    codice_standard: "EL-PUNTO-PRESA-10-16", ambito: "elettrico", nome: "Punto presa 10/16 A", unita_misura: null,
    parole_chiave: ["punto presa"], simboli: ["Presa 10/16 A", "Presa bipasso"],
    componenti: [
      el("Scatola da incasso 3 moduli (503)", null, "pz", 1),
      el("Presa bipasso 2P+T 10/16 A", "Serie civile 1 modulo, CEI 23-50", "pz", 1),
      el("Supporto 3 moduli", null, "pz", 1),
      el("Placca 3 moduli", "Colore da capitolato", "pz", 1),
      el("Copriforo 1 modulo", null, "pz", 2),
      el("Quota cassetta di derivazione da incasso", "Con coperchio, IP40, quota per punto", "pz", 0.25),
      el("Tubo corrugato", CORRUGATO_25, "m", 9, 10),
      el("Cavo unipolare", `${CAVO_25} (fase, neutro, protezione)`, "m", 27, 10),
    ],
    note: "Derivata da dorsale; 9 m medi di tubo.",
  },
  {
    codice_standard: "EL-PRESA-SCHUKO", ambito: "elettrico", nome: "Presa Schuko", unita_misura: null,
    parole_chiave: ["presa", "schuko"], simboli: ["Presa Schuko", "Presa universale"],
    componenti: [
      el("Scatola da incasso 3 moduli (503)", null, "pz", 1),
      el("Presa universale 2P+T 16 A (Schuko e bipasso)", "Serie civile 2 moduli, CEI 23-50", "pz", 1),
      el("Supporto 3 moduli", null, "pz", 1),
      el("Placca 3 moduli", "Colore da capitolato", "pz", 1),
      el("Copriforo 1 modulo", null, "pz", 1),
      el("Tubo corrugato", CORRUGATO_25, "m", 9, 10),
      el("Cavo unipolare", `${CAVO_25} (fase, neutro, protezione)`, "m", 27, 10),
    ],
    note: null,
  },
  {
    codice_standard: "EL-PRESA-DATI-RJ45", ambito: "elettrico", nome: "Presa dati RJ45", unita_misura: null,
    parole_chiave: ["dati", "rj45"], simboli: ["Presa dati RJ45", "TD"],
    componenti: [
      el("Scatola da incasso 3 moduli (503)", null, "pz", 1),
      el("Connettore RJ45", "Cat. 6 U/UTP, keystone, serie civile", "pz", 1),
      el("Supporto e placca 3 moduli", null, "pz", 1),
      el("Copriforo 1 modulo", null, "pz", 2),
      el("Tubo corrugato", CORRUGATO_25, "m", 15, 10),
      el("Cavo dati", "Cat. 6 U/UTP 4 coppie AWG23, guaina LSZH, CPR Cca", "m", 25, 10),
    ],
    note: "Linea dedicata fino al rack o al centralino dati (25 m medi).",
  },
  {
    codice_standard: "EL-PRESA-TELEFONO-RJ11", ambito: "elettrico", nome: "Presa telefono RJ11", unita_misura: null,
    parole_chiave: ["presa", "telefon"], simboli: ["Presa telefonica", "TP"],
    componenti: [
      el("Scatola da incasso 3 moduli (503)", null, "pz", 1),
      el("Presa telefonica RJ11", "6 poli 4 contatti, serie civile", "pz", 1),
      el("Supporto e placca 3 moduli", null, "pz", 1),
      el("Copriforo 1 modulo", null, "pz", 2),
      el("Tubo corrugato", CORRUGATO_20, "m", 12, 10),
      el("Cavo telefonico", "2 coppie 0,6 mm, guaina LSZH", "m", 15, 10),
    ],
    note: null,
  },
  {
    codice_standard: "EL-PRESA-TV", ambito: "elettrico", nome: "Presa TV", unita_misura: null,
    parole_chiave: ["presa", "tv"], simboli: ["Presa TV-SAT", "Presa TV"],
    componenti: [
      el("Scatola da incasso 3 moduli (503)", null, "pz", 1),
      el("Presa TV-SAT", "Derivata, 5-2400 MHz, connettore IEC/F", "pz", 1),
      el("Supporto e placca 3 moduli", null, "pz", 1),
      el("Copriforo 1 modulo", null, "pz", 2),
      el("Tubo corrugato", CORRUGATO_25, "m", 12, 10),
      el("Cavo coassiale", "75 Ω classe A, Ø6,8 mm, guaina LSZH", "m", 15, 10),
      el("Connettore F a compressione", null, "pz", 2),
    ],
    note: null,
  },
  {
    codice_standard: "EL-QUADRO-ZONA", ambito: "elettrico", nome: "Quadro elettrico di zona", unita_misura: null,
    parole_chiave: ["quadr", "zona"], simboli: ["QZ", "Quadro di zona", "Quadro di piano"],
    componenti: [
      el("Centralino da incasso", "36 moduli DIN, IP40, porta trasparente, CEI EN 61439-3", "pz", 1),
      el("Interruttore magnetotermico differenziale generale", "2P C25 Id 0,03 A tipo A, 6 kA", "pz", 1),
      el("Interruttore magnetotermico", "1P+N C10 4,5 kA (luci)", "pz", 3),
      el("Interruttore magnetotermico", "1P+N C16 4,5 kA (prese)", "pz", 4),
      el("Morsettiera di terra e neutro", "Su barra DIN", "pz", 2),
      el("Pettine di collegamento e accessori di cablaggio", null, "conf", 1),
      el("Targhette identificative", null, "conf", 1),
    ],
    note: "Composizione tipica da adeguare allo schema unifilare del progetto.",
  },
  {
    codice_standard: "EL-LINEA-DORSALE", ambito: "elettrico", nome: "Linea dorsale (al metro)", unita_misura: "m",
    parole_chiave: ["dorsale"], simboli: ["Dorsale"],
    componenti: [
      el("Tubo corrugato", "Tubo corrugato flessibile Ø32 mm, autoestinguente, CEI EN 61386", "m", 1, 10),
      el("Cavo unipolare", "Cavo FS17 450/750 V 1×4 mm², CPR Cca-s3,d1,a3 (fase, neutro, protezione)", "m", 3, 10),
    ],
    note: "Per 1 m di dorsale: tubo e tre conduttori.",
  },
  {
    codice_standard: "EL-CASSETTA-DERIVAZIONE", ambito: "elettrico", nome: "Cassetta di derivazione", unita_misura: null,
    parole_chiave: ["cassett", "derivazion"], simboli: ["Cassetta di derivazione"],
    componenti: [
      el("Cassetta di derivazione da incasso", "152×98×70 mm, coperchio a vite, IP40", "pz", 1),
      el("Morsetto a leva", "Per conduttori 0,2-4 mm²", "pz", 8),
      el("Separatore interno", null, "pz", 1),
    ],
    note: null,
  },
  {
    codice_standard: "EL-INT-MAGNETOTERMICO", ambito: "elettrico", nome: "Interruttore magnetotermico", unita_misura: null,
    parole_chiave: ["magnetotermic"], simboli: ["MT"],
    componenti: [
      el("Interruttore magnetotermico", "Modulare DIN, curva C, potere di interruzione 4,5-6 kA, CEI EN 60898-1 (poli e corrente da schema)", "pz", 1),
      el("Targhetta identificativa", null, "pz", 1),
    ],
    note: null,
  },
  {
    codice_standard: "EL-INT-DIFFERENZIALE", ambito: "elettrico", nome: "Interruttore differenziale", unita_misura: null,
    parole_chiave: ["differenzial"], simboli: ["ID", "Differenziale puro"],
    componenti: [
      el("Interruttore differenziale puro", "Modulare DIN, Id 0,03 A tipo A, CEI EN 61008-1 (poli e corrente da schema)", "pz", 1),
      el("Targhetta identificativa", null, "pz", 1),
    ],
    note: null,
  },
  {
    codice_standard: "EL-INT-MAGNETOTERMICO-DIFF", ambito: "elettrico", nome: "Interruttore magnetotermico differenziale", unita_misura: null,
    parole_chiave: ["magnetotermic", "differenzial"], simboli: ["MTD"],
    componenti: [
      el("Interruttore magnetotermico differenziale", "Modulare DIN, curva C, Id 0,03 A tipo A, 6 kA, CEI EN 61009-1 (poli e corrente da schema)", "pz", 1),
      el("Targhetta identificativa", null, "pz", 1),
    ],
    note: null,
  },

  // ─── Rivelazione incendi ───────────────────────────────────────────────
  {
    codice_standard: "AI-RIVELATORE-OTTICO", ambito: "antincendio", nome: "Rivelatore ottico di fumo", unita_misura: null,
    parole_chiave: ["ottic", "fumo"], simboli: ["Rivelatore ottico di fumo", "Rilevatore ottico"],
    componenti: [
      ai("Rivelatore ottico di fumo", "Indirizzato, UNI EN 54-7", "pz", 1),
      ai("Base per rivelatore", "Compatibile con il rivelatore e la centrale", "pz", 1),
      ai("Cavo resistente al fuoco", "FTE29OHM16 2×1,5 mm² schermato, PH120, CEI 20-105", "m", 10, 10),
      ai("Tubo rigido o corrugato", "Ø20 mm, autoestinguente, colore rosso per antincendio", "m", 10, 10),
    ],
    note: "10 m medi di linea di loop per rivelatore. Posizioni secondo UNI 9795.",
  },
  {
    codice_standard: "AI-RIVELATORE-TERMOVELOCIMETRICO", ambito: "antincendio", nome: "Rivelatore termovelocimetrico", unita_misura: null,
    parole_chiave: ["termovelocimetric"], simboli: ["Rivelatore termovelocimetrico"],
    componenti: [
      ai("Rivelatore termovelocimetrico", "Indirizzato, classe A1R, UNI EN 54-5", "pz", 1),
      ai("Base per rivelatore", "Compatibile con il rivelatore e la centrale", "pz", 1),
      ai("Cavo resistente al fuoco", "FTE29OHM16 2×1,5 mm² schermato, PH120, CEI 20-105", "m", 10, 10),
      ai("Tubo rigido o corrugato", "Ø20 mm, autoestinguente, colore rosso per antincendio", "m", 10, 10),
    ],
    note: null,
  },
  {
    codice_standard: "AI-PULSANTE-ALLARME", ambito: "antincendio", nome: "Pulsante di allarme", unita_misura: null,
    parole_chiave: ["pulsante", "allarme"], simboli: ["Pulsante manuale di allarme", "Pulsante a rottura vetro"],
    componenti: [
      ai("Pulsante manuale di allarme incendio", "Indirizzato, a rottura vetro riarmabile, UNI EN 54-11, IP24 (IP67 in esterno)", "pz", 1),
      ai("Cartello di segnalazione pulsante", "UNI EN ISO 7010", "pz", 1),
      ai("Cavo resistente al fuoco", "FTE29OHM16 2×1,5 mm² schermato, PH120, CEI 20-105", "m", 12, 10),
      ai("Tubo rigido o corrugato", "Ø20 mm, autoestinguente, colore rosso per antincendio", "m", 12, 10),
    ],
    note: null,
  },
  {
    codice_standard: "AI-SEGNALATORE-OTTICO-ACUSTICO", ambito: "antincendio", nome: "Segnalatore ottico-acustico", unita_misura: null,
    parole_chiave: ["segnalator"], simboli: ["Pannello ottico-acustico", "Sirena con lampeggiante"],
    componenti: [
      ai("Segnalatore ottico-acustico", "UNI EN 54-3 e UNI EN 54-23, 24 V cc, IP33 (IP65 in esterno)", "pz", 1),
      ai("Cavo resistente al fuoco", "FTE29OHM16 2×1,5 mm² schermato, PH120, CEI 20-105", "m", 15, 10),
      ai("Tubo rigido o corrugato", "Ø20 mm, autoestinguente, colore rosso per antincendio", "m", 15, 10),
    ],
    note: null,
  },
  {
    codice_standard: "AI-CENTRALE", ambito: "antincendio", nome: "Centrale di rivelazione incendi", unita_misura: null,
    parole_chiave: ["centrale", "incend"], simboli: ["Centrale di rivelazione incendi", "CRI"],
    componenti: [
      ai("Centrale di rivelazione e segnalazione incendi", "Indirizzata, loop da progetto, UNI EN 54-2 e 54-4, con display", "pz", 1),
      ai("Batteria al piombo", "12 V 17 Ah (autonomia secondo UNI 9795)", "pz", 2),
      ai("Linea di alimentazione dedicata", "FG18OM16 3G2,5 mm² dal quadro con interruttore dedicato", "m", 15, 10),
      ai("Interruttore magnetotermico dedicato", "1P+N C10 con targa «Centrale antincendio»", "pz", 1),
    ],
    note: null,
  },
  {
    codice_standard: "AI-CAVO-FTE29OHM16", ambito: "antincendio", nome: "Cavo resistente al fuoco FTE29OHM16 2×1,5", unita_misura: "m",
    parole_chiave: ["fte29ohm16"], simboli: ["Loop di rivelazione"],
    componenti: [
      ai("Cavo resistente al fuoco", "FTE29OHM16 2×1,5 mm² schermato twistato, PH120, CEI 20-105", "m", 1, 10),
      ai("Fascette e graffette resistenti al fuoco", null, "pz", 2, 10),
    ],
    note: null,
  },
  {
    codice_standard: "AI-CASSETTA-10X10", ambito: "antincendio", nome: "Cassetta di derivazione 10×10", unita_misura: null,
    parole_chiave: ["cassett", "10x10"], simboli: ["Cassetta 10×10"],
    componenti: [
      ai("Cassetta di derivazione da esterno 100×100 mm", "IP55, coperchio rosso per rivelazione incendi", "pz", 1),
      ai("Morsettiera ceramica resistente al fuoco", "Per circuiti di rivelazione", "pz", 1),
      ai("Pressacavo o raccordo tubo-scatola", "Ø20 mm", "pz", 2),
    ],
    note: null,
  },

  // ─── Climatizzazione ───────────────────────────────────────────────────
  {
    codice_standard: "CL-TERMOSTATO", ambito: "climatizzazione", nome: "Termostato ambiente", unita_misura: null,
    parole_chiave: ["termostat"], simboli: ["Termostato", "T"],
    componenti: [
      cl("Termostato ambiente", "Elettronico, da incasso 3 moduli o a parete, 230 V o a batterie", "pz", 1),
      cl("Scatola da incasso 3 moduli (503)", null, "pz", 1),
      cl("Tubo corrugato", CORRUGATO_20, "m", 8, 10),
      cl("Cavo di comando", "FG16OR16 3G1,5 mm² o bus da progetto", "m", 10, 10),
    ],
    note: null,
  },
  {
    codice_standard: "CL-COLLETTORE", ambito: "climatizzazione", nome: "Collettore di distribuzione", unita_misura: null,
    parole_chiave: ["collettor"], simboli: ["Collettore"],
    componenti: [
      cl("Collettore di distribuzione mandata e ritorno", "Ottone, 1\", vie da progetto, con valvole di intercettazione e detentori", "pz", 1),
      cl("Cassetta da incasso per collettore", "Lamiera verniciata, profondità 80-110 mm", "pz", 1),
      cl("Kit sfiato e scarico", null, "conf", 1),
      cl("Raccordi per tubo multistrato", "Diametro da progetto (16-20 mm)", "pz", 8),
    ],
    note: "Un collettore a 4 vie: i raccordi vanno adeguati alle vie reali.",
  },
  {
    codice_standard: "CL-SPLIT", ambito: "climatizzazione", nome: "Climatizzatore split", unita_misura: null,
    parole_chiave: ["split"], simboli: ["Unità interna split"],
    componenti: [
      cl("Unità interna split a parete", "Potenza da progetto, gas R32, classe A++", "pz", 1),
      cl("Staffa di fissaggio unità interna", null, "pz", 1),
      cl("Pompa scarico condensa", "Se lo scarico a gravità non è possibile", "pz", 0.3),
      cl("Cavo di collegamento interna-esterna", "FG16OR16 5G1,5 mm²", "m", 6, 10),
    ],
    note: "Le linee frigorifere e lo scarico condensa sono voci a metro.",
  },
  {
    codice_standard: "CL-FANCOIL", ambito: "climatizzazione", nome: "Ventilconvettore (fancoil)", unita_misura: null,
    parole_chiave: ["ventilconvettor"], simboli: ["Fancoil", "Ventilconvettore"],
    componenti: [
      cl("Ventilconvettore", "A parete o a pavimento, 2 tubi, motore EC, potenza da progetto", "pz", 1),
      cl("Valvola a tre vie con attuatore", "230 V on-off", "pz", 1),
      cl("Detentore e valvola di intercettazione", "1/2\"", "pz", 2),
      cl("Comando a bordo o a parete", null, "pz", 1),
      cl("Kit raccordi per tubo multistrato", "Ø16-20 mm", "conf", 1),
    ],
    note: null,
  },
  {
    codice_standard: "CL-LINEA-FRIGORIFERA", ambito: "climatizzazione", nome: "Linea frigorifera (al metro)", unita_misura: "m",
    parole_chiave: ["frigorifer"], simboli: ["Linea frigorifera"],
    componenti: [
      cl("Tubo di rame preisolato (liquido)", "1/4\" spessore 0,8 mm, isolante 9 mm classe 1", "m", 1, 10),
      cl("Tubo di rame preisolato (gas)", "3/8\" o 1/2\" secondo la macchina, isolante 9 mm classe 1", "m", 1, 10),
      cl("Nastro e accessori di finitura", null, "m", 1, 10),
    ],
    note: "Diametri da adeguare alla potenza della macchina.",
  },
  {
    codice_standard: "CL-SCARICO-CONDENSA", ambito: "climatizzazione", nome: "Scarico condensa (al metro)", unita_misura: "m",
    parole_chiave: ["condensa"], simboli: ["Scarico condensa"],
    componenti: [
      cl("Tubo in PVC o PP per scarico condensa", "Ø20-32 mm, pendenza minima 1%", "m", 1, 10),
      cl("Raccordi e curve", null, "pz", 0.3, 10),
      cl("Sifone", "Ispezionabile, dove lo scarico va in fogna", "pz", 0.1),
    ],
    note: null,
  },

  // ─── Fotovoltaico ──────────────────────────────────────────────────────
  {
    codice_standard: "FV-MODULO", ambito: "fotovoltaico", nome: "Modulo fotovoltaico", unita_misura: null,
    parole_chiave: ["modul", "fotovoltaic"], simboli: ["Modulo FV"],
    componenti: [
      fv("Modulo fotovoltaico monocristallino", "Potenza da progetto (400-450 Wp), CEI EN 61215 e 61730", "pz", 1),
      fv("Struttura di fissaggio (quota per modulo)", "Alluminio, per falda o tetto piano, con staffe e morsetti", "pz", 1),
      fv("Morsetto terminale o intermedio", null, "pz", 2),
    ],
    note: null,
  },
  {
    codice_standard: "FV-INVERTER", ambito: "fotovoltaico", nome: "Inverter fotovoltaico", unita_misura: null,
    parole_chiave: ["inverter"], simboli: ["Inverter"],
    componenti: [
      fv("Inverter fotovoltaico", "Potenza da progetto, 2 MPPT, conforme CEI 0-21, con monitoraggio", "pz", 1),
      fv("Staffa a parete", null, "pz", 1),
      fv("Connettori MC4", "Coppia maschio/femmina", "pz", 4),
      fv("Cavo lato alternata", "FG16OR16 3G6 mm² verso il quadro", "m", 10, 10),
    ],
    note: null,
  },
  {
    codice_standard: "FV-QUADRO-CAMPO", ambito: "fotovoltaico", nome: "Quadro di campo fotovoltaico", unita_misura: null,
    parole_chiave: ["quadro", "campo"], simboli: ["Quadro di campo", "QC"],
    componenti: [
      fv("Quadro in materiale isolante", "IP65, doppio isolamento", "pz", 1),
      fv("Sezionatore in corrente continua", "1000 V cc, poli da progetto", "pz", 1),
      fv("Scaricatore di sovratensione lato continua", "Tipo 2, 1000 V cc", "pz", 1),
      fv("Portafusibili con fusibili gPV", "Per stringa", "pz", 2),
      fv("Pressacavi", "IP68", "pz", 4),
    ],
    note: null,
  },
  {
    codice_standard: "FV-CAVO-SOLARE", ambito: "fotovoltaico", nome: "Cavo solare (al metro)", unita_misura: "m",
    parole_chiave: ["cavo", "solar"], simboli: ["Cavo solare"],
    componenti: [
      fv("Cavo solare", "H1Z2Z2-K 1×6 mm² 1,5 kV cc, CEI EN 50618", "m", 1, 10),
      fv("Tubo corrugato o canale per esterno", "Ø25 mm, resistente ai raggi UV", "m", 0.5, 10),
    ],
    note: "Per 1 m di linea (un conduttore): il polo positivo e il negativo sono due metri.",
  },
];

/** La libreria come scomposizioni attive (per provare il riconoscimento). */
export function catalogoComeScomposizioni(): Scomposizione[] {
  return SCOMPOSIZIONI_STANDARD.map((s) => ({
    id: s.codice_standard,
    nome: s.nome,
    codice_prezzario: null,
    parole_chiave: s.parole_chiave,
    unita_misura: s.unita_misura,
    categoria: CATEGORIA[s.ambito],
    attiva: true,
    componenti: s.componenti.map((x): ComponenteScomposizione => ({ ...x })),
  }));
}

/** I dati per scomposizioni_importa_standard (una riga per scomposizione). */
export function vociPerImport(ambiti?: AmbitoStandard[]) {
  return SCOMPOSIZIONI_STANDARD
    .filter((s) => !ambiti?.length || ambiti.includes(s.ambito))
    .map((s) => ({
      codice_standard: s.codice_standard,
      nome: s.nome,
      parole_chiave: s.parole_chiave,
      unita_misura: s.unita_misura,
      categoria: CATEGORIA[s.ambito],
      note: [
        "Dalla libreria standard: controlla quantità e specifiche prima di approvarla.",
        s.note,
        s.simboli.length ? `Nelle tavole: ${s.simboli.join(", ")}.` : null,
      ].filter(Boolean).join("\n"),
      componenti: s.componenti,
    }));
}

export const ETICHETTA_AMBITO: Record<AmbitoStandard, string> = CATEGORIA;
