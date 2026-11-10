/**
 * Lo stile unico dei documenti operativi e contrattuali (10/11/2026).
 *
 * Il titolare: «bisogna mandare una carta omogenea nei colori, nelle tabelle…, vale per tutti». Fino a oggi ogni
 * generatore aveva i suoi colori e la sua testata: il rapportino col logo in un riquadro bianco su una fascia
 * colorata, il giornale con il nome dell'azienda scritto accanto al logo, il rendiconto con le card, gli ordini con
 * una barra blu. Questo modulo è l'unica fonte: colori, testata, titoli di sezione, tabelle, riquadri, piè.
 * Vale per rapportino e fine lavori, ordini/RDO/trasporti/servizi/economia, rendiconto, contratti (cliente e
 * subappalto), SAL, giornale dei lavori, riepilogo commessa, varianti. NON per i preventivi, che hanno i loro modelli.
 *
 * Modulo puro (niente import di librerie): lo usano react-pdf, jsPDF, pdf-lib e l'HTML stampato. Misure in punti.
 *
 * ── LA PAGINA ─────────────────────────────────────────────────────────────────────────────────────────────────
 * A4, margini laterali 40 pt, testo Helvetica.
 *
 * TESTATA (prima pagina e, se il generatore la ripete, le altre):
 *   - a sinistra il LOGO, su fondo bianco, MAI in un riquadro o su una fascia colorata. Altezza `testata.logoAltezza`
 *     (o quella della veste, `personalizzazioneDocumento(companyId).logoAltezza`), larghezza al massimo
 *     `testata.logoLarghezzaMax` (o quella della veste). Senza logo: la ragione sociale in grassetto 13 pt, inchiostro.
 *     Con il logo la ragione sociale NON si ripete accanto (è già nel logo, e i dati societari stanno nel piè).
 *   - a destra, allineati a destra: il TITOLO del documento (14 pt grassetto, inchiostro, maiuscole come
 *     «Rapportino giornaliero», non tutto maiuscolo) e sotto, 9 pt `testoTenue`, numero · data (e lo stato, se c'è,
 *     come etichetta: vedi `etichetta`).
 *   - sotto, a tutta larghezza, un filetto `colore.accento` di 1,5 pt, 10 pt sotto il più basso dei due blocchi.
 *   Niente fasce colorate a tutta pagina, niente testo bianco su fondo pieno nella testata.
 *
 * TITOLO DI SEZIONE: 8 pt grassetto, MAIUSCOLO, spaziatura 1 pt, `colore.accento`; sotto un filetto `colore.linea`
 *   di 0,75 pt; 14 pt di spazio prima, 6 pt dopo. Nessuna barretta verticale colorata a sinistra.
 *
 * TABELLA: intestazione con fondo `colore.fondoIntestazione`, testo 7,5 pt grassetto MAIUSCOLO `colore.testoTenue`;
 *   righe 9 pt inchiostro, alte almeno 18 pt, separate da un filetto `colore.linea` 0,5 pt; niente righe alternate,
 *   niente bordi verticali; numeri e importi allineati a destra; riga del totale in grassetto con filetto
 *   `colore.inchiostro` 0,75 pt sopra. Un raggruppamento dentro la tabella (per commessa, per giorno) è una riga
 *   con fondo `colore.fondoTenue` e testo grassetto inchiostro, NON una fascia piena colorata.
 *
 * RIQUADRO (dati del committente, del fornitore, riepiloghi): fondo `colore.fondoTenue`, bordo `colore.linea`
 *   0,75 pt, raggio 3 pt, padding 10 pt. Etichetta 7,5 pt MAIUSCOLO `testoTenue`, valore 10 pt inchiostro.
 *   Il riquadro dei numeri chiave (totale, ore): stesso riquadro, valore 14 pt; quello che conta di più (il netto,
 *   il totale da pagare) ha il valore in `colore.accento`. Nessun riquadro con fondo pieno colorato.
 *
 * ETICHETTA DI STATO («Firmato», «Bozza», «Da approvare»): 7 pt grassetto MAIUSCOLO, fondo `colore.fondoTenue`,
 *   bordo `colore.linea`, testo `colore.testoTenue`; solo «firmato/approvato/accettato» usa `colore.positivo`.
 *
 * TESTO: corpo 9,5 pt inchiostro, interlinea 1,4; note e didascalie 8 pt `testoTenue`.
 *
 * FIRME: due (o tre) colonne, una riga `colore.inchiostro` 0,5 pt, sotto 8 pt `testoTenue` «Firma e timbro — ruolo».
 *
 * PIÈ: quello della veste per chi ce l'ha (Vulcano: `piedeRighe`, `misurePiede`), altrimenti le righe societarie
 *   centrate 7 pt `testoTenue`; il numero di pagina «Pag. n / m» centrato sotto. Riferimenti tecnici (impronta,
 *   edizione, «generato il») in una sola riga 6,5 pt `testoTenue` sopra il piè, mai in mezzo al documento.
 */

export const colore = Object.freeze({
  /** Testo principale. */
  inchiostro: "#1F2933",
  /** Etichette, note, intestazioni di tabella. */
  testoTenue: "#6B7280",
  /** Filetti e bordi. */
  linea: "#E3E6EB",
  /** Fondo di riquadri e righe di raggruppamento. */
  fondoTenue: "#F7F8FA",
  /** Fondo dell'intestazione delle tabelle. */
  fondoIntestazione: "#EEF1F5",
  /** Stato positivo (firmato, approvato). */
  positivo: "#1F7A4D",
  /** Avviso (fuori contratto, da verificare). */
  avviso: "#B45309",
  /** Accento predefinito, se l'azienda non ne ha uno. */
  accentoPredefinito: "#1E3A5F",
});

export const pagina = Object.freeze({
  margineLaterale: 40,
  margineAlto: 36,
  corpo: 9.5,
  interlinea: 1.4,
  nota: 8,
});

export const testata = Object.freeze({
  /** Logo senza veste: alto fino a 44 pt, largo fino a 200 pt, proporzioni conservate. */
  logoAltezza: 44,
  logoLarghezzaMax: 200,
  ragioneSocialeCorpo: 13,
  titoloCorpo: 14,
  sottotitoloCorpo: 9,
  filettoSpessore: 1.5,
  filettoDistanza: 10,
  spazioDopo: 16,
});

export const sezione = Object.freeze({ corpo: 8, spaziatura: 1, spazioPrima: 14, spazioDopo: 6, filetto: 0.75 });

export const tabella = Object.freeze({
  intestazioneCorpo: 7.5,
  corpo: 9,
  altezzaRigaMin: 18,
  filetto: 0.5,
  filettoTotale: 0.75,
  paddingOrizzontale: 6,
});

export const riquadro = Object.freeze({ bordo: 0.75, raggio: 3, padding: 10, etichettaCorpo: 7.5, valoreCorpo: 10, numeroCorpo: 14 });

/** Un colore #RRGGBB valido, oppure null. */
function esadecimale(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : null;
}

/** Luminanza relativa (WCAG) di un #RRGGBB. */
function luminanza(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * Il colore d'accento del documento: filetto della testata, titoli di sezione, il numero che conta.
 * Ordine: il colore della veste (Vulcano: il blu del logo e del piè), poi il colore principale dell'azienda, poi il
 * predefinito. Un colore troppo chiaro per leggersi su bianco (contrasto < 4,5) ripiega sul predefinito.
 */
export function accentoDocumento(opz: { coloreVeste?: string | null; coloreAzienda?: string | null }): string {
  for (const c of [esadecimale(opz.coloreVeste), esadecimale(opz.coloreAzienda)]) {
    if (c && 1.05 / (luminanza(c) + 0.05) >= 4.5) return c;
  }
  return colore.accentoPredefinito;
}

/** #RRGGBB → [r, g, b] 0-255 (jsPDF). */
export function rgb255(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** #RRGGBB → [r, g, b] 0-1 (pdf-lib). */
export function rgb01(hex: string): [number, number, number] {
  return rgb255(hex).map((v) => v / 255) as [number, number, number];
}

/** Il blocco CSS dello stile, per i documenti HTML stampati (SAL, giornale). `accento` da accentoDocumento. */
export function cssDocumento(accento: string): string {
  return `
:root{--ink:${colore.inchiostro};--muted:${colore.testoTenue};--line:${colore.linea};--soft:${colore.fondoTenue};--th:${colore.fondoIntestazione};--accent:${accento};--ok:${colore.positivo};--warn:${colore.avviso}}
.doc-testata{display:flex;justify-content:space-between;align-items:flex-end;gap:16pt;padding-bottom:${testata.filettoDistanza}pt;border-bottom:${testata.filettoSpessore}pt solid var(--accent);margin-bottom:${testata.spazioDopo}pt}
.doc-testata .logo img{display:block;object-fit:contain;object-position:left center}
.doc-testata .ragione{font-size:${testata.ragioneSocialeCorpo}pt;font-weight:700;color:var(--ink)}
.doc-testata .titolo{text-align:right}
.doc-testata .titolo h1{margin:0;font-size:${testata.titoloCorpo}pt;font-weight:700;color:var(--ink)}
.doc-testata .titolo .sotto{margin-top:3pt;font-size:${testata.sottotitoloCorpo}pt;color:var(--muted)}
.doc-sezione{margin:${sezione.spazioPrima}pt 0 ${sezione.spazioDopo}pt;padding-bottom:3pt;border-bottom:${sezione.filetto}pt solid var(--line);font-size:${sezione.corpo}pt;font-weight:700;letter-spacing:${sezione.spaziatura}pt;text-transform:uppercase;color:var(--accent)}
table.doc-tabella{width:100%;border-collapse:collapse;font-size:${tabella.corpo}pt;color:var(--ink)}
table.doc-tabella th{background:var(--th);color:var(--muted);font-size:${tabella.intestazioneCorpo}pt;font-weight:700;text-transform:uppercase;text-align:left;padding:5pt ${tabella.paddingOrizzontale}pt;border:0}
table.doc-tabella td{padding:5pt ${tabella.paddingOrizzontale}pt;border:0;border-bottom:${tabella.filetto}pt solid var(--line);vertical-align:top}
table.doc-tabella .num{text-align:right;white-space:nowrap}
table.doc-tabella tr.gruppo td{background:var(--soft);font-weight:700}
table.doc-tabella tr.totale td{font-weight:700;border-top:${tabella.filettoTotale}pt solid var(--ink);border-bottom:0}
.doc-riquadro{background:var(--soft);border:${riquadro.bordo}pt solid var(--line);border-radius:${riquadro.raggio}pt;padding:${riquadro.padding}pt}
.doc-riquadro .etichetta{font-size:${riquadro.etichettaCorpo}pt;text-transform:uppercase;color:var(--muted);letter-spacing:.5pt}
.doc-riquadro .valore{font-size:${riquadro.valoreCorpo}pt;color:var(--ink)}
.doc-riquadro .numero{font-size:${riquadro.numeroCorpo}pt;color:var(--ink)}
.doc-riquadro .numero.conta{color:var(--accent)}
.doc-etichetta{display:inline-block;font-size:7pt;font-weight:700;text-transform:uppercase;padding:2pt 6pt;border-radius:3pt;background:var(--soft);border:.75pt solid var(--line);color:var(--muted)}
.doc-etichetta.ok{color:var(--ok)}
`;
}
