/**
 * Risoluzione delle anagrafiche senza doppioni — componente comune (§7.2).
 *
 * Dal mittente letto su un documento (fattura, bolla, offerta, estratto conto)
 * all'anagrafica già in rubrica. Vale per fornitori, subappaltatori, clienti.
 *
 * Cosa identifica e cosa no:
 *   - id interno, P.IVA, codice fiscale, codice fornitore → identificano;
 *   - IBAN già VERIFICATO, alias VERIFICATO, denominazione precedente → confermano
 *     (da soli fanno una proposta, mai un collegamento);
 *   - nome simile, email/PEC, indirizzo della sede → indizi.
 * Un identificativo uguale e un altro discordante (stessa P.IVA con un altro
 * codice fiscale, stesso codice fornitore con un'altra P.IVA) = conflitto: lo
 * deve guardare una persona prima di unire o creare qualcosa. Lo stesso nome
 * con un'altra P.IVA NON è un conflitto (due «Edil Rossi» esistono): il
 * candidato è escluso, ma si elenca in `omonimiConAltroIdentificativo` perché
 * chi crea un'anagrafica nuova veda che potrebbe essere un errore di battitura.
 *
 * Regole che NON si piegano:
 *   - un nome simile non unisce due anagrafiche;
 *   - un IBAN letto sul documento non cambia mai i dati di pagamento: se è nuovo
 *     si segnala come «da verificare» (tabella `fornitori_iban_storico`, colonna
 *     `confermato`), e resta fuori dai pagamenti finché qualcuno non lo conferma
 *     per un canale diverso dal documento stesso;
 *   - si propone di CREARE un'anagrafica nuova solo con un identificativo fiscale
 *     valido e nessun candidato: mai su un nome solo.
 */
import {
  chiaveFiscale,
  identificativoFiscale,
  indirizzoConfrontabile,
  nomeConfrontabile,
  soloAlfanumerico,
} from "./normalizza.ts";
import { decidi, type Candidato, type Decisione, type Prova } from "./riconciliazione.ts";

/** Quello che il documento dice del mittente. Tutto facoltativo: si usa quello che c'è. */
export interface SoggettoLetto {
  idInterno?: string | null;
  piva?: string | null;
  codiceFiscale?: string | null;
  paese?: string | null;
  nome?: string | null;
  /** Il codice con cui il fornitore ci identifica, o il nostro codice del fornitore. */
  codiceFornitore?: string | null;
  iban?: string | null;
  email?: string | null;
  pec?: string | null;
  indirizzo?: string | null;
}

/** Un'anagrafica già in rubrica, coi dati di cui ci si può fidare. */
export interface AnagraficaNota {
  id: string;
  nome: string | null;
  piva?: string | null;
  codiceFiscale?: string | null;
  paese?: string | null;
  codiciFornitore?: string[];
  /** Nomi con cui l'anagrafica si chiamava (cambi di ragione sociale). */
  denominazioniPrecedenti?: string[];
  /** Alias confermati da una persona («Rossi Edilizia» = «Edil Rossi SRL»). */
  aliasVerificati?: string[];
  /** Solo IBAN confermati: un IBAN «visto» su un documento non conta. */
  ibanVerificati?: string[];
  recapitiVerificati?: string[];
  sedi?: string[];
  /** Disattivata: resta candidata (i documenti vecchi la citano) ma si dice. */
  attiva?: boolean;
}

export interface AzioniAnagrafica {
  /** IBAN letto che non è fra i verificati del candidato: da verificare, mai da applicare. */
  ibanDaVerificare: string | null;
  /** Identificativi letti che non coincidono con quelli in rubrica. */
  identificativiDiscordanti: Array<{ campo: "piva" | "codice_fiscale"; letto: string; inRubrica: string }>;
  /** Si può proporre una nuova anagrafica (nessun candidato e identificativo valido). */
  creaNuova: boolean;
  /** Anagrafiche con lo stesso nome ma P.IVA/CF diversi: escluse, da mostrare prima di creare. */
  omonimiConAltroIdentificativo: string[];
  /** Il nome letto non è fra quelli noti del candidato scelto: si può proporre come alias. */
  aliasDaProporre: string | null;
}

export interface RisoluzioneAnagrafica extends Decisione<AnagraficaNota> {
  azioni: AzioniAnagrafica;
}

function prove(letto: SoggettoLetto, a: AnagraficaNota): Prova[] {
  const p: Prova[] = [];
  if (letto.idInterno)
    p.push({
      campo: "id",
      ruolo: "identifica",
      esito: letto.idInterno === a.id ? "uguale" : "diverso",
      essenziale: true,
      testo: letto.idInterno === a.id ? "è l'anagrafica indicata" : "il documento indica un'altra anagrafica",
    });

  const pivaL = chiaveFiscale(letto.piva);
  const pivaA = chiaveFiscale(a.piva);
  if (pivaL && pivaA)
    p.push({
      campo: "piva",
      ruolo: "identifica",
      esito: pivaL === pivaA ? "uguale" : "diverso",
      essenziale: true,
      atteso: pivaL,
      trovato: pivaA,
      testo: pivaL === pivaA ? `stessa P.IVA (${pivaL})` : `P.IVA diversa (${pivaL} sul documento, ${pivaA} in rubrica)`,
    });
  else if (pivaL) p.push({ campo: "piva", ruolo: "identifica", esito: "mancante", testo: "P.IVA assente in rubrica" });

  const cfL = chiaveFiscale(letto.codiceFiscale);
  const cfA = chiaveFiscale(a.codiceFiscale);
  if (cfL && cfA)
    p.push({
      campo: "codice_fiscale",
      ruolo: "identifica",
      esito: cfL === cfA ? "uguale" : "diverso",
      essenziale: true,
      atteso: cfL,
      trovato: cfA,
      testo: cfL === cfA ? `stesso codice fiscale (${cfL})` : `codice fiscale diverso (${cfL} / ${cfA})`,
    });

  const codL = soloAlfanumerico(letto.codiceFornitore);
  if (codL && a.codiciFornitore?.length) {
    const ok = a.codiciFornitore.some((c) => soloAlfanumerico(c) === codL);
    if (ok) p.push({ campo: "codice_fornitore", ruolo: "identifica", esito: "uguale", testo: `stesso codice fornitore (${codL})` });
  }

  const ibanL = soloAlfanumerico(letto.iban);
  if (ibanL && a.ibanVerificati?.some((i) => soloAlfanumerico(i) === ibanL))
    p.push({ campo: "iban", ruolo: "conferma", esito: "uguale", testo: "IBAN già verificato per questa anagrafica" });

  const nomeL = nomeConfrontabile(letto.nome);
  if (nomeL.length >= 3) {
    if (nomeConfrontabile(a.nome) === nomeL)
      p.push({ campo: "nome", ruolo: "indizio", esito: "uguale", testo: `stesso nome («${letto.nome}»)` });
    else if (a.aliasVerificati?.some((x) => nomeConfrontabile(x) === nomeL))
      p.push({ campo: "alias", ruolo: "conferma", esito: "uguale", testo: `alias verificato («${letto.nome}»)` });
    else if (a.denominazioniPrecedenti?.some((x) => nomeConfrontabile(x) === nomeL))
      p.push({ campo: "denominazione_precedente", ruolo: "conferma", esito: "uguale", testo: `nome precedente («${letto.nome}»)` });
  }

  const recapiti = [letto.email, letto.pec].map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean);
  if (recapiti.length && a.recapitiVerificati?.some((r) => recapiti.includes(r.trim().toLowerCase())))
    p.push({ campo: "recapito", ruolo: "indizio", esito: "uguale", testo: "stesso recapito verificato" });

  const ind = indirizzoConfrontabile(letto.indirizzo);
  if (ind.length >= 8 && a.sedi?.some((s) => indirizzoConfrontabile(s) === ind))
    p.push({ campo: "sede", ruolo: "indizio", esito: "uguale", testo: "stessa sede" });

  return p;
}

/**
 * Trova l'anagrafica del soggetto letto. Esito «automatico» solo con un
 * identificativo forte e nessuna discordanza; un nome uguale da solo è una proposta.
 */
export function risolviAnagrafica(letto: SoggettoLetto, rubrica: AnagraficaNota[]): RisoluzioneAnagrafica {
  // Si confrontano solo le anagrafiche che hanno almeno un punto di contatto:
  // le altre milleduecento non sono candidate, sono rumore.
  const candidati: Candidato<AnagraficaNota>[] = rubrica
    .map((a) => ({ id: a.id, dato: a, prove: prove(letto, a) }))
    .filter((c) => c.prove.some((p) => p.esito === "uguale"));

  const decisione = decidi(candidati, {
    automaticoConsentito: true,
    datiUtili: ["piva", "codice_fiscale"].filter((c) => (c === "piva" ? !letto.piva : !letto.codiceFiscale)),
  });

  const scelto = rubrica.find((a) => a.id === decisione.sceltoId) ?? null;
  const ibanL = soloAlfanumerico(letto.iban);
  const discordanti: AzioniAnagrafica["identificativiDiscordanti"] = [];
  for (const c of decisione.candidati.filter((x) => x.stato === "in_conflitto")) {
    for (const pr of c.prove.filter((x) => x.esito === "diverso" && (x.campo === "piva" || x.campo === "codice_fiscale")))
      discordanti.push({ campo: pr.campo as "piva" | "codice_fiscale", letto: String(pr.atteso ?? ""), inRubrica: String(pr.trovato ?? "") });
  }
  const idL = identificativoFiscale(letto.piva, letto.paese) ?? identificativoFiscale(letto.codiceFiscale, letto.paese);
  const nomiNoti = scelto ? [scelto.nome, ...(scelto.aliasVerificati ?? []), ...(scelto.denominazioniPrecedenti ?? [])].map(nomeConfrontabile) : [];
  const nomeL = nomeConfrontabile(letto.nome);

  return {
    ...decisione,
    azioni: {
      ibanDaVerificare:
        ibanL && scelto && !scelto.ibanVerificati?.some((i) => soloAlfanumerico(i) === ibanL) ? ibanL : null,
      identificativiDiscordanti: discordanti,
      omonimiConAltroIdentificativo: rubrica
        .filter((a) => nomeL.length >= 3 && nomeConfrontabile(a.nome) === nomeL && a.id !== decisione.sceltoId)
        .filter((a) => decisione.candidati.find((c) => c.id === a.id)?.stato === "escluso")
        .map((a) => a.id),
      creaNuova: decisione.esito === "nessuno" && !!idL && idL.valido !== false,
      aliasDaProporre:
        scelto && decisione.esito === "automatico" && nomeL.length >= 3 && !nomiNoti.includes(nomeL) ? String(letto.nome).trim() : null,
    },
  };
}
