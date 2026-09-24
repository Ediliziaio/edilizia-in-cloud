/**
 * Dati del registro imprese sulle fatture delle società (art. 2250 c.c.).
 *
 * «Negli atti e nella corrispondenza delle società soggette all'obbligo
 * dell'iscrizione nel registro delle imprese devono essere indicati la sede
 * della società e l'ufficio del registro delle imprese presso il quale questa
 * è iscritta e il numero d'iscrizione», e per S.p.A. e S.r.l. anche il
 * capitale effettivamente versato, l'eventuale unico socio e lo stato di
 * liquidazione. In FatturaPA è il blocco <IscrizioneREA> del cedente, che le
 * specifiche chiedono per le società iscritte.
 *
 * Fino al 24/09/2026 la pagina Impostazioni non aveva dove scrivere numero REA
 * e capitale sociale: il blocco non usciva mai, nemmeno per le S.r.l. Qui la
 * regola sta in un posto solo: la usano il generatore XML, invia-sdi (che non
 * spedisce una fattura di società senza REA) e la pagina Impostazioni.
 *
 * Modulo puro, provato in src/test/logic/datiSocietari.test.ts.
 */

/** Forme giuridiche della pagina Impostazioni, ridotte a sole lettere maiuscole. */
export function formaGiuridica(forma: unknown): string {
  return String(forma ?? "").toUpperCase().replace(/[^A-Z]/g, "");
}

/** Società iscritte al registro delle imprese: il REA va in fattura. */
const SOCIETA = new Set(["SRL", "SRLS", "SPA", "SAPA", "SAS", "SNC", "SS", "COOPERATIVA", "SCARL", "SCRL"]);
/** Società di capitali: anche il capitale versato va in fattura (art. 2250 c. 2). */
const CAPITALI = new Set(["SRL", "SRLS", "SPA", "SAPA"]);

export function eSocieta(forma: unknown): boolean {
  return SOCIETA.has(formaGiuridica(forma));
}

export function eSocietaDiCapitali(forma: unknown): boolean {
  return CAPITALI.has(formaGiuridica(forma));
}

export interface AziendaRea {
  forma_giuridica?: string | null;
  codice_rea?: string | null;
  rea_ufficio?: string | null;
  indirizzo_provincia?: string | null;
  capitale_sociale?: number | string | null;
  socio_unico?: boolean | null;
  stato_liquidazione?: string | null;
}

export interface IscrizioneRea {
  ufficio: string;
  numero: string;
  capitale: number | null;
  socioUnico: "SU" | "SM" | null;
  stato: "LN" | "LS";
}

/**
 * Il blocco IscrizioneREA pronto per l'XML, o null se il numero manca.
 * Chi scrive «PN-123456» nel numero ottiene ufficio PN e numero 123456: il
 * formato in cui il REA compare nelle visure.
 */
export function iscrizioneRea(a: AziendaRea): IscrizioneRea | null {
  let numero = String(a.codice_rea ?? "").trim().toUpperCase();
  if (!numero) return null;
  let ufficio = String(a.rea_ufficio ?? "").trim().toUpperCase();
  const conProvincia = /^([A-Z]{2})[\s./-]+([A-Z0-9]+)$/.exec(numero);
  if (conProvincia) {
    if (!ufficio) ufficio = conProvincia[1];
    numero = conProvincia[2];
  }
  if (!/^[A-Z]{2}$/.test(ufficio)) ufficio = String(a.indirizzo_provincia ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(ufficio)) return null;

  const capitale = Number(a.capitale_sociale);
  const conCapitale = Number.isFinite(capitale) && capitale > 0;
  return {
    ufficio,
    numero: numero.slice(0, 20),
    capitale: conCapitale ? Math.round(capitale * 100) / 100 : null,
    // SocioUnico solo per S.p.A. e S.r.l. (e solo se il capitale è indicato).
    socioUnico: conCapitale && eSocietaDiCapitali(a.forma_giuridica) ? (a.socio_unico ? "SU" : "SM") : null,
    stato: a.stato_liquidazione === "LS" ? "LS" : "LN",
  };
}

/** Cosa manca perché le fatture di questa azienda siano in regola con l'art. 2250 c.c. */
export function datiReaMancanti(a: AziendaRea): string[] {
  const mancanti: string[] = [];
  if (!eSocieta(a.forma_giuridica)) return mancanti;
  if (!iscrizioneRea(a)) {
    mancanti.push(
      "Numero REA mancante: per le società va indicato in fattura (art. 2250 c.c.). " +
        "Inseriscilo in Impostazioni → Fatturazione → Dati Fiscali: lo trovi nella visura camerale.",
    );
  }
  const capitale = Number(a.capitale_sociale);
  if (eSocietaDiCapitali(a.forma_giuridica) && !(Number.isFinite(capitale) && capitale > 0)) {
    mancanti.push(
      "Capitale sociale versato mancante: per S.r.l. e S.p.A. va indicato in fattura (art. 2250 c.c.). " +
        "Inseriscilo in Impostazioni → Fatturazione → Dati Fiscali.",
    );
  }
  return mancanti;
}
