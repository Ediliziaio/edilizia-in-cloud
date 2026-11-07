/**
 * L'archivio delle condizioni contrattuali (07/11/2026).
 *
 * Florin: «da qualche parte nelle impostazioni mettere tutte le condizioni, e da lì il sistema pesca le
 * condizioni sia per i preventivi, per i contratti, subappaltatori, committenti — tutto. Evitando di creare
 * doppioni».
 *
 * Qui le regole, senza React e senza database, così si provano da sole:
 *   · da dove pesca le condizioni un documento (la regola è UNA per tutti);
 *   · come un modello diventa il testo stampato;
 *   · cosa si scrive sul documento quando si riscrive una clausola, per sapere poi da dove viene.
 *
 * La regola di lettura, in ordine:
 *   1. il documento ha già la SUA copia  → quella, sempre. Un modello aggiornato non tocca i documenti emessi.
 *   2. altrimenti il modello PREDEFINITO dell'ambito, per quell'azienda.
 *   3. altrimenti il testo di sistema.
 */

/** I cinque tipi di documento che hanno condizioni contrattuali. */
export const AMBITI_CONDIZIONI = ["preventivo", "computo", "commessa", "subappalto", "lavoro"] as const;
export type AmbitoCondizioni = (typeof AMBITI_CONDIZIONI)[number];

export const NOMI_AMBITI: Record<AmbitoCondizioni, string> = {
  preventivo: "Preventivi",
  computo: "Computi metrici",
  commessa: "Commesse e lavori extra",
  subappalto: "Subappaltatori",
  lavoro: "Contratti di lavoro",
};

export interface Clausola {
  /** L'id nella libreria, quando la clausola viene da lì; null se è scritta a mano nel modello. */
  clausola_id?: string | null;
  titolo: string;
  testo: string;
  /** Art. 1341 c.2 c.c.: il cliente la approva a parte. */
  vessatoria?: boolean;
}

export interface ModelloCondizioni {
  id: string;
  nome: string;
  ambito: AmbitoCondizioni;
  predefinito: boolean;
  attivo: boolean;
  versione: number;
  clausole: Clausola[];
}

/** Da dove vengono le condizioni di un documento: si scrive sul documento, non sul modello. */
export interface OrigineCondizioni {
  modello_id?: string | null;
  modello_nome?: string | null;
  versione?: number | null;
  /** I titoli delle clausole cambiate a mano su QUESTO documento. */
  clausole_riscritte?: string[];
  riscritte_da?: string | null;
  riscritte_il?: string | null;
  /** Quando il testo del modello è stato copiato dentro il documento (emissione). */
  congelate_il?: string | null;
}

const haParole = (v: unknown): boolean =>
  String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim().length > 0;

/** Le clausole buone di un modello: niente righe vuote, nell'ordine in cui sono. */
export function clausoleDelModello(modello: Pick<ModelloCondizioni, "clausole"> | null | undefined): Clausola[] {
  return (modello?.clausole ?? []).filter((c) => haParole(c?.titolo) || haParole(c?.testo));
}

/** Il modello che vale per un ambito: il predefinito attivo. Niente predefinito, niente modello. */
export function modelloPredefinito(
  modelli: ReadonlyArray<ModelloCondizioni>,
  ambito: AmbitoCondizioni,
): ModelloCondizioni | null {
  return modelli.find((m) => m.ambito === ambito && m.predefinito && m.attivo) ?? null;
}

/** Il testo stampabile di un modello: un titolo e un testo per clausola. */
export function testoDelModello(modello: Pick<ModelloCondizioni, "clausole"> | null | undefined): string {
  return clausoleDelModello(modello)
    .map((c) => [c.titolo?.trim(), c.testo?.trim()].filter(haParole).join("\n"))
    .filter(haParole)
    .join("\n\n");
}

export interface CondizioniRisolte {
  testo: string;
  /** Da dove viene: la copia del documento, il modello predefinito, o il testo di sistema. */
  fonte: "documento" | "modello" | "sistema" | "nessuna";
  modello?: ModelloCondizioni | null;
}

/**
 * La regola unica: cosa stampa un documento. Vale per preventivi, computi, commesse, subappalti e
 * contratti di lavoro: cambia solo l'ambito.
 */
export function condizioniDelDocumento(a: {
  /** La copia già sul documento: se c'è, vince sempre. */
  testoDelDocumento?: string | null;
  ambito: AmbitoCondizioni;
  modelli: ReadonlyArray<ModelloCondizioni>;
  /** Il testo di sistema, quando l'azienda non ha ancora un modello suo. */
  testoDiSistema?: string | null;
}): CondizioniRisolte {
  if (haParole(a.testoDelDocumento)) return { testo: String(a.testoDelDocumento), fonte: "documento" };
  const modello = modelloPredefinito(a.modelli, a.ambito);
  const dalModello = testoDelModello(modello);
  if (haParole(dalModello)) return { testo: dalModello, fonte: "modello", modello };
  if (haParole(a.testoDiSistema)) return { testo: String(a.testoDiSistema), fonte: "sistema" };
  return { testo: "", fonte: "nessuna" };
}

/**
 * Cosa scrivere sul documento quando si EMETTE: la copia del testo e da dove viene. Da chiamare quando il
 * documento parte verso il cliente, non in anteprima. Se il documento ha già la sua copia, non si tocca.
 */
export function daCongelare(
  a: Parameters<typeof condizioniDelDocumento>[0],
  adesso = new Date().toISOString(),
): { condizioni_testo: string; condizioni_origine: OrigineCondizioni } | null {
  const risolte = condizioniDelDocumento(a);
  if (risolte.fonte === "documento" || risolte.fonte === "nessuna") return null;
  return {
    condizioni_testo: risolte.testo,
    condizioni_origine: {
      modello_id: risolte.modello?.id ?? null,
      modello_nome: risolte.modello?.nome ?? null,
      versione: risolte.modello?.versione ?? null,
      congelate_il: adesso,
    },
  };
}

/**
 * Cosa scrivere sul documento quando qualcuno RISCRIVE le condizioni: il testo nuovo e la traccia di chi e
 * quando. La traccia di prima (quale modello) resta: serve a dire «partiva dal modello X, versione 3».
 */
export function daRiscrivere(
  testoNuovo: string,
  origine: OrigineCondizioni | null | undefined,
  chi: string | null | undefined,
  clausoleRiscritte: string[] = [],
  adesso = new Date().toISOString(),
): { condizioni_testo: string; condizioni_origine: OrigineCondizioni } {
  return {
    condizioni_testo: testoNuovo,
    condizioni_origine: {
      ...(origine ?? {}),
      clausole_riscritte: clausoleRiscritte.length ? clausoleRiscritte : origine?.clausole_riscritte,
      riscritte_da: chi?.trim() || null,
      riscritte_il: adesso,
    },
  };
}

/** Una riga sola da mostrare sulla scheda: da dove vengono le condizioni che si stanno guardando. */
export function raccontaOrigine(origine: OrigineCondizioni | null | undefined, fonte: CondizioniRisolte["fonte"]): string {
  const giorno = (iso: string | null | undefined) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("it-IT") : null;
  };
  if (origine?.riscritte_il) {
    const chi = origine.riscritte_da ? ` da ${origine.riscritte_da}` : "";
    const base = origine.modello_nome ? ` (partivano dal modello «${origine.modello_nome}»${origine.versione ? `, versione ${origine.versione}` : ""})` : "";
    return `Riscritte per questo documento${chi}${giorno(origine.riscritte_il) ? ` il ${giorno(origine.riscritte_il)}` : ""}${base}.`;
  }
  if (origine?.congelate_il && origine.modello_nome) {
    return `Dal modello «${origine.modello_nome}»${origine.versione ? `, versione ${origine.versione}` : ""}, fissate il ${giorno(origine.congelate_il)}. Cambiare il modello non tocca più questo documento.`;
  }
  if (fonte === "modello") return "Dal modello predefinito dell'azienda: finché il documento non parte, segue il modello.";
  if (fonte === "sistema") return "Testo di sistema: l'azienda non ha ancora un modello suo per questo tipo di documento.";
  return "Nessuna condizione impostata.";
}
