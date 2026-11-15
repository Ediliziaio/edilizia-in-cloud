/**
 * Motore di riconciliazione — componente comune (§7.2, piano §4).
 *
 * Decide fra i candidati per un collegamento (una bolla per una riga DDT della
 * fattura, un ordine per un riferimento, un'anagrafica per un mittente, una
 * commessa per un costo) e restituisce UNO dei cinque esiti:
 *
 *   automatico  unico e verificato, e la regola permette di collegare da sé
 *   proposta    plausibile, o verificato dove la regola non permette l'automatico
 *   scelta      più candidati validi: sceglie una persona, coi motivi di ognuno
 *   conflitto   riferimenti che si contraddicono: niente collegamento, segnalazione
 *   nessuno     nessun candidato: da gestire, con i dati che mancano
 *
 * NIENTE PUNTEGGIO. Ogni candidato porta le sue prove, e le prove hanno un
 * ruolo, non un peso:
 *   - «identifica»: basta da sola a dire quale documento è (P.IVA, numero
 *     d'ordine dello stesso fornitore, id interno);
 *   - «conferma»: rende sicuro un candidato già identificato (la data del DDT,
 *     l'importo), o da sola fa una proposta;
 *   - «indizio»: fa una proposta, mai un collegamento (nome simile, indirizzo).
 * Una prova con `essenziale: true` ed esito «diverso» esclude il candidato, e
 * se quel candidato era identificato da un'altra prova diventa un conflitto:
 * nessuna somiglianza compensa una P.IVA diversa.
 *
 * La sicurezza dichiarata da un modello AI non è una prova e qui non entra.
 */

export type Esito = "automatico" | "proposta" | "scelta" | "conflitto" | "nessuno";

export type RuoloProva = "identifica" | "conferma" | "indizio";

export interface Prova {
  /** Cosa si è confrontato: «piva», «numero_ddt», «data_ddt», «importo»… */
  campo: string;
  ruolo: RuoloProva;
  esito: "uguale" | "diverso" | "mancante";
  /** Se «diverso», il candidato è escluso (e in conflitto se identificato). */
  essenziale?: boolean;
  /** Il valore sul documento da collegare e quello sul candidato, per mostrarli. */
  atteso?: string | number | null;
  trovato?: string | number | null;
  /** Una frase per chi controlla: «stesso numero di DDT (1068) e stessa data». */
  testo: string;
}

export interface Candidato<T = unknown> {
  id: string;
  /** Il documento candidato, per chi mostra la scelta. */
  dato?: T;
  prove: Prova[];
}

export type Stato = "verificato" | "plausibile" | "escluso" | "in_conflitto";

export interface CandidatoValutato<T = unknown> extends Candidato<T> {
  stato: Stato;
  /** Il perché dello stato, in una frase. */
  motivo: string;
}

export interface Decisione<T = unknown> {
  esito: Esito;
  /** Il candidato scelto (automatico o proposta). */
  sceltoId: string | null;
  /** Tutti i candidati valutati: verificati e plausibili prima, poi esclusi. */
  candidati: CandidatoValutato<T>[];
  /** Frase per l'utente. */
  motivo: string;
  /** Per «nessuno» e «proposta»: i dati che servirebbero per chiudere da sé. */
  mancanti: string[];
}

export interface OpzioniDecisione {
  /** La regola permette il collegamento automatico? (default false: si propone). */
  automaticoConsentito?: boolean;
  /** Dati che, se assenti, si elencano come mancanti per l'esito «nessuno». */
  datiUtili?: string[];
}

/** Lo stato di un candidato dalle sue prove. Esportato per i test e per chi mostra il dettaglio. */
export function valutaCandidato<T>(c: Candidato<T>): CandidatoValutato<T> {
  const identifica = c.prove.filter((p) => p.ruolo === "identifica" && p.esito === "uguale");
  const contrari = c.prove.filter((p) => p.essenziale && p.esito === "diverso");
  if (contrari.length) {
    const perche = contrari.map((p) => p.testo).join("; ");
    if (identifica.length)
      return { ...c, stato: "in_conflitto", motivo: `${identifica.map((p) => p.testo).join("; ")}, ma ${perche}` };
    return { ...c, stato: "escluso", motivo: perche };
  }
  const conferme = c.prove.filter((p) => p.ruolo === "conferma" && p.esito === "uguale");
  const confermeContro = c.prove.filter((p) => p.ruolo === "conferma" && p.esito === "diverso");
  const indizi = c.prove.filter((p) => p.ruolo === "indizio" && p.esito === "uguale");
  if (identifica.length && !confermeContro.length)
    return { ...c, stato: "verificato", motivo: [...identifica, ...conferme].map((p) => p.testo).join("; ") };
  if (identifica.length)
    return {
      ...c,
      stato: "plausibile",
      motivo: `${identifica.map((p) => p.testo).join("; ")}, però ${confermeContro.map((p) => p.testo).join("; ")}`,
    };
  if (conferme.length || indizi.length)
    return { ...c, stato: "plausibile", motivo: [...conferme, ...indizi].map((p) => p.testo).join("; ") };
  return { ...c, stato: "escluso", motivo: "nessun dato in comune" };
}

const ORDINE: Record<Stato, number> = { verificato: 0, plausibile: 1, in_conflitto: 2, escluso: 3 };

/** I cinque esiti. Vedi l'intestazione del file. */
export function decidi<T>(candidati: Candidato<T>[], opzioni: OpzioniDecisione = {}): Decisione<T> {
  const valutati = candidati.map(valutaCandidato).sort((a, b) => ORDINE[a.stato] - ORDINE[b.stato]);
  const verificati = valutati.filter((c) => c.stato === "verificato");
  const plausibili = valutati.filter((c) => c.stato === "plausibile");
  const inConflitto = valutati.filter((c) => c.stato === "in_conflitto");
  const mancantiDa = (cs: CandidatoValutato<T>[]) =>
    [...new Set(cs.flatMap((c) => c.prove.filter((p) => p.esito === "mancante").map((p) => p.campo)))];

  // Un candidato identificato ma contraddetto blocca tutto: anche se un altro
  // sembra giusto, i documenti dicono due cose diverse e lo deve vedere qualcuno.
  if (inConflitto.length)
    return {
      esito: "conflitto",
      sceltoId: null,
      candidati: valutati,
      motivo: inConflitto.map((c) => c.motivo).join(" · "),
      mancanti: [],
    };
  if (verificati.length === 1 && !plausibili.some((p) => p.prove.some((x) => x.ruolo === "identifica" && x.esito === "uguale"))) {
    const c = verificati[0];
    return {
      esito: opzioni.automaticoConsentito ? "automatico" : "proposta",
      sceltoId: c.id,
      candidati: valutati,
      motivo: c.motivo,
      mancanti: [],
    };
  }
  if (verificati.length > 1)
    return {
      esito: "scelta",
      sceltoId: null,
      candidati: valutati,
      motivo: `${verificati.length} documenti corrispondono allo stesso riferimento`,
      mancanti: mancantiDa(verificati),
    };
  if (verificati.length === 1 || plausibili.length > 1)
    return {
      esito: "scelta",
      sceltoId: null,
      candidati: valutati,
      motivo: `${verificati.length + plausibili.length} candidati possibili`,
      mancanti: mancantiDa([...verificati, ...plausibili]),
    };
  if (plausibili.length === 1)
    return {
      esito: "proposta",
      sceltoId: plausibili[0].id,
      candidati: valutati,
      motivo: plausibili[0].motivo,
      mancanti: mancantiDa(plausibili),
    };
  return {
    esito: "nessuno",
    sceltoId: null,
    candidati: valutati,
    motivo: candidati.length ? "nessun candidato regge al confronto" : "nessun candidato",
    mancanti: opzioni.datiUtili ?? [],
  };
}

/**
 * Quando più FONTI indipendenti indicano un valore (la commessa dell'ordine, la
 * commessa del DDT, il codice scritto in fattura, l'indirizzo del cantiere):
 * - fonti forti tutte d'accordo → quel valore;
 * - fonti forti in disaccordo, o una fonte debole che ne indica un altro → conflitto;
 * - solo fonti deboli → proposta se indicano un valore solo, scelta se più d'uno.
 * Il risultato è una Decisione come le altre, coi candidati = i valori indicati.
 */
export interface Indicazione<T = unknown> {
  valore: string;
  fonte: string;
  forte: boolean;
  testo: string;
  dato?: T;
}

export function decidiTraFonti<T>(
  indicazioni: Indicazione<T>[],
  opzioni: OpzioniDecisione = {},
): Decisione<T> {
  const valori = [...new Set(indicazioni.map((i) => i.valore))];
  const candidati: CandidatoValutato<T>[] = valori.map((v) => {
    const mie = indicazioni.filter((i) => i.valore === v);
    const forte = mie.some((i) => i.forte);
    return {
      id: v,
      dato: mie[0].dato,
      prove: mie.map((i) => ({
        campo: i.fonte,
        ruolo: i.forte ? ("identifica" as const) : ("indizio" as const),
        esito: "uguale" as const,
        testo: i.testo,
      })),
      stato: forte ? "verificato" : "plausibile",
      motivo: mie.map((i) => i.testo).join("; "),
    };
  });
  if (!candidati.length)
    return { esito: "nessuno", sceltoId: null, candidati, motivo: "nessuna fonte indica un valore", mancanti: opzioni.datiUtili ?? [] };
  const forti = candidati.filter((c) => c.stato === "verificato");
  if (forti.length > 1 || (forti.length === 1 && candidati.length > 1)) {
    return {
      esito: "conflitto",
      sceltoId: null,
      candidati: candidati.map((c) => ({ ...c, stato: "in_conflitto" as const })),
      motivo: candidati.map((c) => c.motivo).join(" · contro · "),
      mancanti: [],
    };
  }
  if (forti.length === 1)
    return {
      esito: opzioni.automaticoConsentito ? "automatico" : "proposta",
      sceltoId: forti[0].id,
      candidati,
      motivo: forti[0].motivo,
      mancanti: [],
    };
  if (candidati.length === 1)
    return { esito: "proposta", sceltoId: candidati[0].id, candidati, motivo: candidati[0].motivo, mancanti: [] };
  return { esito: "scelta", sceltoId: null, candidati, motivo: `${candidati.length} valori possibili`, mancanti: [] };
}
