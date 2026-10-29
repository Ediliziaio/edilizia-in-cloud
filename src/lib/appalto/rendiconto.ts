/**
 * I conti del rendiconto d'appalto, fuori dal componente.
 *
 * Stanno qui per due ragioni: si provano senza montare una pagina, e un file
 * che esporta componenti e funzioni insieme rompe il ricarico a caldo di Vite.
 */

export interface RigaPerTotali {
  importo: number;
  costo_interno: number | null;
  margine: number | null;
  stato: string;
  extra_contratto: boolean;
  /**
   * Lo stato del RENDICONTO che contiene la riga, quando serve sapere se e'
   * gia' diventato una fattura. Le righe non arrivano mai a «fatturata»: dal
   * 28/10/2026 lo stato del documento sta sul documento e non si propaga
   * (migrazione `appalto_sal_una_verita_sullo_stato`). Chi legge il fatturato
   * dalle righe legge zero per sempre.
   */
  sal_stato?: string | null;
}

export interface TariffaPerValidita {
  attivo: boolean;
  valido_dal: string | null;
  valido_al: string | null;
}

/** Una tariffa si puo' usare per una riga di quel giorno? */
export function tariffaUsabileIl(t: TariffaPerValidita, giorno: string): boolean {
  if (!t.attivo) return false;
  if (t.valido_dal && giorno < t.valido_dal) return false;
  if (t.valido_al && giorno > t.valido_al) return false;
  return true;
}

export interface TotaliRendiconto {
  confermato: number;
  inBozza: number;
  extra: number;
  costo: number | null;
  margine: number | null;
  /**
   * Il ricavo delle SOLE righe confermate di cui si conosce il costo: e' l'unico
   * denominatore onesto per la percentuale di margine. Dividere il margine per
   * il confermato intero lo fa uscire piu' basso del vero ogni volta che una
   * riga non ha il costo — e la riga senza costo c'e' quasi sempre (un nolo, un
   * trasporto di terzi).
   */
  confermatoConCosto: number;
  righeSenzaCosto: number;
  /** La percentuale, calcolata sul denominatore giusto. NULL se non si sa. */
  marginePct: number | null;
}

/**
 * I totali del rendiconto.
 *
 * Due regole che non sono dettagli:
 * - le BOZZE si contano a parte. Non sono ancora soldi, e sommarle al
 *   confermato farebbe sembrare incassabile una riga che nessuno ha guardato.
 * - il MARGINE e' NULL se nessuna riga confermata conosce il suo costo. Un
 *   margine pari all'incasso, mostrato come se fosse vero, e' peggio di un
 *   trattino: il titolare ci prende una decisione sopra.
 */
export function totaliRendiconto(righe: ReadonlyArray<RigaPerTotali>): TotaliRendiconto {
  const somma = (f: (r: RigaPerTotali) => number) => righe.reduce((s, r) => s + f(r), 0);
  const confermate = righe.filter((r) => r.stato === "confermata");
  const costoNoto = confermate.filter((r) => r.costo_interno !== null);
  const margine = costoNoto.length > 0 ? costoNoto.reduce((s, r) => s + Number(r.margine ?? 0), 0) : null;
  const confermatoConCosto = costoNoto.reduce((s, r) => s + Number(r.importo), 0);
  return {
    confermato: somma((r) => (r.stato === "confermata" ? Number(r.importo) : 0)),
    inBozza: somma((r) => (r.stato === "bozza" ? Number(r.importo) : 0)),
    extra: somma((r) => (r.extra_contratto ? Number(r.importo) : 0)),
    costo: costoNoto.length > 0 ? costoNoto.reduce((s, r) => s + Number(r.costo_interno), 0) : null,
    margine,
    confermatoConCosto,
    righeSenzaCosto: confermate.length - costoNoto.length,
    marginePct:
      margine !== null && confermatoConCosto > 0
        ? Math.round((margine * 1000) / confermatoConCosto) / 10
        : null,
  };
}

/**
 * I conti della COMMESSA in appalto, per l'intestazione economica.
 *
 * Diversi da `totaliRendiconto` di proposito, e la differenza non e' un
 * dettaglio: quella risponde a «cosa mi resta da chiudere», e guarda le sole
 * righe ancora confermate; questa risponde a «quanto vale questo cantiere», e
 * guarda tutto il lavoro valorizzato — confermato, gia' chiuso in un rendiconto
 * e gia' fatturato. Le bozze restano fuori da entrambe: una riga che nessuno ha
 * guardato non e' un soldo.
 *
 * Il margine resta NULL quando nessuna riga conosce il suo costo, e la
 * percentuale si divide per il ricavo delle sole righe di cui il costo si sa.
 */
export interface TotaliCommessaAppalto {
  /** Tutto il lavoro valorizzato, bozze escluse. */
  rendicontato: number;
  inBozza: number;
  /** Confermato ma non ancora dentro un rendiconto al committente. */
  daRendicontare: number;
  /** Chiuso in un rendiconto (mandato, approvato o fatturato). */
  chiuso: number;
  /** La parte che e' gia' diventata una fattura. */
  fatturato: number;
  extra: number;
  costo: number | null;
  margine: number | null;
  rendicontatoConCosto: number;
  righeSenzaCosto: number;
  marginePct: number | null;
}

export function totaliCommessaAppalto(righe: ReadonlyArray<RigaPerTotali>): TotaliCommessaAppalto {
  const valorizzate = righe.filter((r) => r.stato !== "bozza");
  const costoNoto = valorizzate.filter((r) => r.costo_interno !== null);
  const sommaDi = (rs: ReadonlyArray<RigaPerTotali>, f: (r: RigaPerTotali) => number) =>
    rs.reduce((s, r) => s + f(r), 0);
  const margine = costoNoto.length > 0 ? sommaDi(costoNoto, (r) => Number(r.margine ?? 0)) : null;
  const rendicontatoConCosto = sommaDi(costoNoto, (r) => Number(r.importo));
  const per = (stati: string[]) =>
    sommaDi(righe.filter((r) => stati.includes(r.stato)), (r) => Number(r.importo));
  return {
    rendicontato: sommaDi(valorizzate, (r) => Number(r.importo)),
    inBozza: per(["bozza"]),
    daRendicontare: per(["confermata"]),
    chiuso: per(["in_sal", "fatturata"]),
    // Dal rendiconto, non dalla riga: vedi `sal_stato`.
    fatturato: sommaDi(
      righe.filter((r) => r.sal_stato === "fatturato" || r.stato === "fatturata"),
      (r) => Number(r.importo),
    ),
    extra: sommaDi(valorizzate.filter((r) => r.extra_contratto), (r) => Number(r.importo)),
    costo: costoNoto.length > 0 ? sommaDi(costoNoto, (r) => Number(r.costo_interno)) : null,
    margine,
    rendicontatoConCosto,
    righeSenzaCosto: valorizzate.length - costoNoto.length,
    marginePct:
      margine !== null && rendicontatoConCosto > 0
        ? Math.round((margine * 1000) / rendicontatoConCosto) / 10
        : null,
  };
}

/**
 * Il periodo che si propone quando si compone un rendiconto: il mese appena
 * chiuso. Si rendiconta a mese finito, non a mese in corso.
 *
 * Scritto con l'aritmetica dei numeri e non con `setMonth`, perche' a gennaio
 * `setMonth(-1)` porta a dicembre dell'anno prima solo se si ricorda di
 * cambiare anche l'anno — ed e' il classico errore che nessuno vede fino al
 * primo gennaio.
 */
export function periodoDaRendicontare(oggi: Date = new Date()): { dal: string; al: string } {
  const anno = oggi.getFullYear();
  const mese = oggi.getMonth(); // 0-11, mese corrente
  const annoPrec = mese === 0 ? anno - 1 : anno;
  const mesePrec = mese === 0 ? 12 : mese; // 1-12
  const ultimo = new Date(Date.UTC(annoPrec, mesePrec, 0)).getUTCDate();
  const mm = String(mesePrec).padStart(2, "0");
  return { dal: `${annoPrec}-${mm}-01`, al: `${annoPrec}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

/**
 * Il periodo da proporre quando ci sono gia' righe confermate in attesa.
 *
 * `periodoDaRendicontare` propone il mese appena chiuso, che e' la regola
 * giusta quando si lavora al passo. Ma se il lavoro in attesa e' di questo
 * mese — o di tre mesi fa, perche' nessuno ha rendicontato — quel periodo non
 * contiene NIENTE, e chi preme «Componi» si prende «Nessuna riga confermata da
 * rendicontare in questo periodo» con sotto un riquadro che dice 3.235 € da
 * rendicontare. Qui il periodo si prende dalle righe: dal primo giorno del
 * mese della piu' vecchia all'ultimo giorno del mese della piu' recente.
 */
export function periodoDaRigheInAttesa(
  giorni: ReadonlyArray<string>,
  oggi: Date = new Date(),
): { dal: string; al: string } {
  // Tipato `string[]`, ma e' il periodo proposto di una finestra: se arriva
  // altro non si fa cadere la pagina intera, si torna alla regola del mese.
  const valide = giorni
    .filter((g): g is string => typeof g === "string")
    .map((g) => g.slice(0, 10))
    .filter((g) => g.length === 10)
    .sort();
  if (valide.length === 0) return periodoDaRendicontare(oggi);
  const primo = valide[0];
  const ultimo = valide[valide.length - 1];
  const [annoU, meseU] = ultimo.split("-").map(Number);
  // Giorno 0 del mese dopo = ultimo giorno di questo mese, anche a febbraio.
  const fine = new Date(Date.UTC(annoU, meseU, 0)).getUTCDate();
  return {
    dal: `${primo.slice(0, 7)}-01`,
    al: `${ultimo.slice(0, 7)}-${String(fine).padStart(2, "0")}`,
  };
}

/** Come si legge lo stato di un rendiconto, in parole. */
export const STATI_SAL: Record<string, { etichetta: string; spiega: string }> = {
  bozza: { etichetta: "Bozza", spiega: "Si può ancora cambiare: le righe non sono congelate." },
  inviato: { etichetta: "Mandato", spiega: "È dal committente. Le righe sono congelate." },
  approvato: { etichetta: "Approvato", spiega: "Il committente l'ha accettato. Non torna indietro." },
  fatturato: { etichetta: "Fatturato", spiega: "È diventato una fattura." },
};

/**
 * L'accordo economico della commessa, in una forma sola.
 *
 * **A corpo la cifra concordata è `orders.total_amount`**, non il tetto: il
 * tetto si imposta solo a misura (il modulo di creazione lo mostra solo lì),
 * perché a misura l'importo cresce riga dopo riga e serve qualcosa che avvisi.
 * Fino al 29/10/2026 l'intestazione della commessa leggeva soltanto il tetto:
 * su un appalto a corpo da 18.500 € creato dall'interfaccia scriveva «A corpo»
 * e basta, senza la cifra e senza dire quanto restava da fare.
 *
 * E sforare non vuol dire la stessa cosa nei due modi:
 *  - **a misura** oltre il tetto il lavoro lo fatturi comunque (se te lo
 *    approvano): hai superato l'accordo, non hai perso i soldi;
 *  - **a corpo** oltre il concordato il lavoro NON lo fatturi: il compenso è
 *    quello, e ogni euro in più è margine che se ne va.
 * Dirlo con la stessa frase sarebbe comodo e sbagliato.
 */
export interface AccordoCommessa {
  /** La cifra di riferimento: il concordato a corpo, il tetto a misura. */
  riferimento: number | null;
  /** La riga in testa al riquadro: «A corpo, 18.500 €». */
  etichetta: string;
  /** Quanto manca alla cifra; negativo se l'ha superata. NULL se non c'è. */
  residuo: number | null;
  /** La nota sotto «Rendicontato». */
  nota: string;
  /** Se la nota va mostrata in ambra. */
  allarme: boolean;
}

const numeroONull = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function accordoCommessa(p: {
  valorizzazione: string | null;
  totalAmount: number | string | null;
  tettoImporto: number | string | null;
  rendicontato: number;
  extra: number;
  euro: (v: number) => string;
}): AccordoCommessa {
  const aMisura = p.valorizzazione === "a_misura";
  const tetto = numeroONull(p.tettoImporto);
  const totale = numeroONull(p.totalAmount);

  /* A corpo vale il concordato; il tetto resta come ripiego per le commesse
     vecchie, scritte prima che il concordato finisse in `total_amount`. */
  const riferimento = aMisura ? tetto : (totale ?? tetto);

  const etichetta = aMisura
    ? riferimento
      ? `A misura, entro ${p.euro(riferimento)}`
      : "A misura: vale quello che rendiconti"
    : riferimento
      ? `A corpo, ${p.euro(riferimento)}`
      : "A corpo";

  const residuo = riferimento === null ? null : riferimento - p.rendicontato;

  let nota: string;
  let allarme = false;
  if (residuo === null) {
    nota = p.extra > 0 ? `Di cui ${p.euro(p.extra)} fuori contratto` : "Bozze escluse";
  } else if (residuo >= 0) {
    nota = aMisura
      ? `Restano ${p.euro(residuo)} del tetto`
      : `Restano ${p.euro(residuo)} del concordato`;
  } else {
    allarme = true;
    nota = aMisura
      ? `Sforato di ${p.euro(Math.abs(residuo))} oltre il tetto`
      : `${p.euro(Math.abs(residuo))} oltre il concordato: non li fatturi`;
  }

  return { riferimento, etichetta, residuo, nota, allarme };
}

/**
 * Il margine della commessa, che a corpo non si calcola come a misura.
 *
 * A misura incassi quello che rendiconti: il ricavo È il rendiconto, e il
 * margine è la somma dei margini delle righe. Se qualche riga non conosce il
 * suo costo si guarda solo la parte che lo conosce, e si dice su quanto.
 *
 * A corpo no. Incassi il concordato e basta: le giornate in più le hai fatte
 * ma non le fatturi. Sommare i margini delle righe dà un numero più alto del
 * vero esattamente dello sforamento — e lo dà proprio sui cantieri andati
 * male, che sono quelli in cui il margine va guardato. Quindi a corpo il
 * ricavo è il concordato (più il lavoro segnato fuori contratto, che si
 * fattura a parte) e il margine è quel ricavo meno il costo.
 *
 * E a corpo il costo deve essere completo: un costo parziale contro un ricavo
 * intero non è un margine ottimista, è un margine sbagliato. Se una sola riga
 * non sa quanto è costata, qui non esce un numero.
 */
export interface MargineCommessa {
  /** NULL quando non si può dire. */
  margine: number | null;
  marginePct: number | null;
  /** Il ricavo su cui è calcolato: il concordato a corpo, il rendiconto a misura. */
  ricavo: number | null;
  /** La riga sotto «Margine €». */
  nota: string;
  /** La riga sotto «Margine %». */
  notaPct: string;
}

export function margineCommessa(p: {
  valorizzazione: string | null;
  /** La cifra concordata, da `accordoCommessa`. */
  riferimento: number | null;
  totali: TotaliCommessaAppalto;
  euro: (v: number) => string;
}): MargineCommessa {
  const t = p.totali;
  const soloBozze = t.rendicontato === 0 && t.inBozza > 0;
  const aCorpo = p.valorizzazione !== "a_misura" && p.riferimento !== null;

  if (!aCorpo) {
    const copertura = t.rendicontato > 0 && t.rendicontatoConCosto > 0
      ? Math.round((t.rendicontatoConCosto * 100) / t.rendicontato)
      : null;
    return {
      margine: t.margine,
      marginePct: t.marginePct,
      ricavo: t.margine === null ? null : t.rendicontatoConCosto,
      nota: t.margine === null
        ? (soloBozze ? "Le righe sono ancora in bozza" : "Nessuna riga conosce il suo costo")
        : t.righeSenzaCosto > 0
          ? `${t.righeSenzaCosto} ${t.righeSenzaCosto === 1 ? "riga non ha" : "righe non hanno"} il costo`
          : "Su tutte le righe valorizzate",
      notaPct: copertura !== null
        ? `Sul ${copertura}% del rendicontato`
        : soloBozze ? "Le righe sono ancora in bozza" : "Serve almeno un costo",
    };
  }

  if (t.costo === null) {
    return {
      margine: null,
      marginePct: null,
      ricavo: null,
      nota: soloBozze ? "Le righe sono ancora in bozza" : "Nessuna riga conosce il suo costo",
      notaPct: soloBozze ? "Le righe sono ancora in bozza" : "Serve il costo delle righe",
    };
  }

  if (t.righeSenzaCosto > 0) {
    return {
      margine: null,
      marginePct: null,
      ricavo: null,
      nota: `${t.righeSenzaCosto} ${t.righeSenzaCosto === 1 ? "riga non ha" : "righe non hanno"} il costo: a corpo servono tutte`,
      notaPct: "A corpo serve il costo di tutte le righe",
    };
  }

  const concordato = p.riferimento as number;
  const ricavo = concordato + t.extra;
  const margine = ricavo - t.costo;
  const marginePct = ricavo > 0 ? Math.round((margine * 1000) / ricavo) / 10 : null;
  /* A cantiere aperto il concordato c'e' tutto e i costi no: il numero e' il
     margine SE non si spende altro — che e' anche quanto resta per finire.
     Dirlo e' meglio che nasconderlo finche' il lavoro non e' chiuso. */
  const nota = t.extra > 0
    ? `Concordato più ${p.euro(t.extra)} fuori contratto, meno i costi`
    : "Concordato meno i costi, se non spendi altro";

  return { margine, marginePct, ricavo, nota, notaPct: "Sul concordato, non sul rendiconto" };
}
