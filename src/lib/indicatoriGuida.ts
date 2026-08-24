// ============================================================================
// indicatoriGuida — logica pura per "I numeri che comandano" (Cruscotto)
// ============================================================================
// Gli indicatori-guida di un'impresa edile con le soglie di allarme della
// prassi di settore (giorni di copertura, acconti÷saldi, concentrazione
// clienti, puntualità cantieri, saturazione squadra, margine di sicurezza,
// velocità firma→ordine).
//
// REGOLA FONDANTE: nessun numero inventato. Ogni valutatore accetta solo dati
// reali già registrati in piattaforma; quando l'input manca restituisce stato
// "nd" con l'elenco di COSA manca e DOVE inserirlo — mai un default plausibile.
//
// Le soglie sono costanti documentate qui (un posto solo). L'override per
// azienda arriverà su company_governance_settings quando passeremo dal DB:
// per ora niente colonne nuove, quindi niente personalizzazione.
// ============================================================================

export type StatoIndicatore = "ok" | "attenzione" | "allarme" | "nd";

/** Un dato mancante: cosa serve e dove si inserisce (link interno all'app). */
export interface DatoMancante {
  cosa: string;
  link: string;
  azione: string;
}

export interface Indicatore {
  /** Valore numerico calcolato; null quando lo stato è "nd". */
  valore: number | null;
  stato: StatoIndicatore;
  /** Riga di contesto sotto il valore (sempre riferita a dati reali). */
  dettaglio?: string;
  /** Compilato solo con stato "nd": cosa inserire per accendere il numero. */
  mancanti?: DatoMancante[];
}

// ── Soglie (prassi di controllo di gestione edile) ──────────────────────────

export const SOGLIE_INDICATORI = {
  /** Giorni di liquidità a costi fissi correnti: sotto 45 è zona rossa. */
  coperturaGiorniAllarme: 45,
  coperturaGiorniAttenzione: 60,
  /** Acconti incassati ÷ saldi incassati: sopra 1,2 stai vivendo di lavoro futuro. */
  accontiSuSaldiAllarme: 1.2,
  accontiSuSaldiAttenzione: 1.0,
  /** Quota del primo cliente sul fatturato: sopra il 25% è dipendenza. */
  quotaPrimoClienteAllarme: 25,
  quotaPrimoClienteAttenzione: 20,
  /** % cantieri chiusi entro la data promessa: sotto il 70% il problema è di sistema. */
  neiTempiAllarme: 70,
  neiTempiAttenzione: 85,
  /** Ore su commessa ÷ ore contrattuali: sotto il 65% paghi gente per aspettare. */
  saturazioneAllarme: 65,
  saturazioneAttenzione: 75,
  /** (Venduto − break-even) ÷ venduto: sotto il 20% un cantiere perso chiude l'anno in rosso. */
  margineSicurezzaAllarme: 20,
  margineSicurezzaAttenzione: 30,
  /** Giorni dall'apertura commessa al primo ordine fornitore: sano entro 5. */
  firmaOrdineGiorniOk: 5,
  firmaOrdineGiorniAllarme: 10,
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

export function mediana(valori: number[]): number | null {
  if (valori.length === 0) return null;
  const ordinati = [...valori].sort((a, b) => a - b);
  const mid = Math.floor(ordinati.length / 2);
  return ordinati.length % 2 === 1
    ? ordinati[mid]
    : (ordinati[mid - 1] + ordinati[mid]) / 2;
}

function nd(mancanti: DatoMancante[]): Indicatore {
  return { valore: null, stato: "nd", mancanti };
}

// ── Valutatori ──────────────────────────────────────────────────────────────

/** Giorni di copertura = saldo di Prima Nota ÷ (costi fissi mensili ÷ 30). */
export function valutaCopertura(
  saldo: number,
  haMovimenti: boolean,
  fissiMensili: number,
): Indicatore {
  const mancanti: DatoMancante[] = [];
  if (!haMovimenti) {
    mancanti.push({
      cosa: "movimenti in Prima Nota (il saldo di cassa)",
      link: "/azienda/prima-nota",
      azione: "Registra gli incassi e i pagamenti",
    });
  }
  if (fissiMensili <= 0) {
    mancanti.push({
      cosa: "costi fissi mensili (affitti, stipendi, canoni)",
      link: "/azienda/costi",
      azione: "Inserisci i costi fissi ricorrenti",
    });
  }
  if (mancanti.length > 0) return nd(mancanti);

  const giorni = saldo / (fissiMensili / 30);
  const s = SOGLIE_INDICATORI;
  const stato: StatoIndicatore =
    giorni < s.coperturaGiorniAllarme ? "allarme"
    : giorni < s.coperturaGiorniAttenzione ? "attenzione"
    : "ok";
  return {
    valore: Math.round(giorni),
    stato,
    dettaglio: `Con ${eur(fissiMensili)} di fissi al mese, la cassa attuale regge ${Math.round(giorni)} giorni senza incassare.`,
  };
}

/** Acconti incassati ÷ saldi incassati sul periodo (denaro futuro vs lavoro finito). */
export function valutaAccontiSuSaldi(acconti: number, saldi: number): Indicatore {
  if (acconti <= 0 && saldi <= 0) {
    return nd([{
      cosa: "incassi di rate registrati negli ultimi 90 giorni",
      link: "/azienda/ordini",
      azione: "Segna come pagate le rate incassate delle commesse",
    }]);
  }
  if (saldi <= 0) {
    // Solo acconti, nessun saldo: la definizione stessa dell'allarme.
    return {
      valore: null,
      stato: "allarme",
      dettaglio: `${eur(acconti)} di acconti incassati e nessun saldo: la cassa sta salendo solo con lavoro ancora da fare.`,
    };
  }
  const ratio = acconti / saldi;
  const s = SOGLIE_INDICATORI;
  const stato: StatoIndicatore =
    ratio > s.accontiSuSaldiAllarme ? "allarme"
    : ratio > s.accontiSuSaldiAttenzione ? "attenzione"
    : "ok";
  return {
    valore: Math.round(ratio * 100) / 100,
    stato,
    dettaglio: `${eur(acconti)} di acconti contro ${eur(saldi)} di saldi incassati (90 gg).`,
  };
}

/** Quota del primo cliente sul fatturato degli ultimi 12 mesi. */
export function valutaQuotaPrimoCliente(
  quotaPerc: number | null,
  nomeCliente: string | null,
  fatturato12m: number,
): Indicatore {
  if (quotaPerc === null) {
    return nd([{
      cosa: "fatture emesse negli ultimi 12 mesi",
      link: "/azienda/fatturazione",
      azione: "Emetti o importa le fatture di vendita",
    }]);
  }
  const s = SOGLIE_INDICATORI;
  const stato: StatoIndicatore =
    quotaPerc > s.quotaPrimoClienteAllarme ? "allarme"
    : quotaPerc > s.quotaPrimoClienteAttenzione ? "attenzione"
    : "ok";
  return {
    valore: Math.round(quotaPerc),
    stato,
    dettaglio: nomeCliente
      ? `${nomeCliente} pesa il ${Math.round(quotaPerc)}% di ${eur(fatturato12m)} fatturati in 12 mesi.`
      : undefined,
  };
}

/** % cantieri chiusi entro la data promessa (su quelli con entrambe le date). */
export function valutaNeiTempi(
  chiusiTotali: number,
  chiusiNeiTempi: number,
  inRitardoOra: number,
): Indicatore {
  if (chiusiTotali <= 0) {
    return nd([{
      cosa: "commesse chiuse con data promessa e data fine lavori",
      link: "/azienda/ordini",
      azione: "Compila consegna prevista e fine lavori sulle commesse",
    }]);
  }
  const perc = (chiusiNeiTempi / chiusiTotali) * 100;
  const s = SOGLIE_INDICATORI;
  const stato: StatoIndicatore =
    perc < s.neiTempiAllarme ? "allarme"
    : perc < s.neiTempiAttenzione ? "attenzione"
    : "ok";
  return {
    valore: Math.round(perc),
    stato,
    dettaglio: `${chiusiNeiTempi} su ${chiusiTotali} chiuse in tempo (12 mesi)${inRitardoOra > 0 ? ` · ${inRitardoOra} oltre la data adesso` : ""}.`,
  };
}

/** Saturazione squadra = ore su commessa ÷ ore contrattuali del mese. */
export function valutaSaturazione(
  oreSuCommessa: number,
  oreContrattuali: number,
): Indicatore {
  if (oreContrattuali <= 0) {
    return nd([{
      cosa: "dipendenti attivi con ore contrattuali e stipendio",
      link: "/azienda/personale",
      azione: "Completa l'anagrafica del personale",
    }]);
  }
  const perc = (oreSuCommessa / oreContrattuali) * 100;
  const s = SOGLIE_INDICATORI;
  const stato: StatoIndicatore =
    perc < s.saturazioneAllarme ? "allarme"
    : perc < s.saturazioneAttenzione ? "attenzione"
    : "ok";
  return {
    valore: Math.round(perc),
    stato,
    dettaglio: `${fmtOre(oreSuCommessa)} ore su commessa contro ${fmtOre(oreContrattuali)} contrattuali questo mese.`,
  };
}

/** Margine di sicurezza = (venduto 12m − break-even annuo) ÷ venduto 12m. */
export function valutaMargineSicurezza(
  venduto12m: number,
  breakEvenAnnuo: number,
): Indicatore {
  const mancanti: DatoMancante[] = [];
  if (breakEvenAnnuo <= 0) {
    mancanti.push({
      cosa: "costi fissi e margini reali per calcolare il break-even",
      link: "/azienda/costi",
      azione: "Inserisci i costi fissi (il break-even si accende da solo)",
    });
  }
  if (venduto12m <= 0) {
    mancanti.push({
      cosa: "commesse degli ultimi 12 mesi",
      link: "/azienda/ordini",
      azione: "Registra le commesse vendute",
    });
  }
  if (mancanti.length > 0) return nd(mancanti);

  const perc = ((venduto12m - breakEvenAnnuo) / venduto12m) * 100;
  const s = SOGLIE_INDICATORI;
  const stato: StatoIndicatore =
    perc < s.margineSicurezzaAllarme ? "allarme"
    : perc < s.margineSicurezzaAttenzione ? "attenzione"
    : "ok";
  return {
    valore: Math.round(perc),
    stato,
    dettaglio: `Venduto ${eur(venduto12m)} in 12 mesi contro un pareggio di ${eur(breakEvenAnnuo)} l'anno.`,
  };
}

/** Mediana dei giorni dall'apertura della commessa al primo ordine fornitore. */
export function valutaFirmaOrdine(giorniPerCommessa: number[]): Indicatore {
  const med = mediana(giorniPerCommessa);
  if (med === null) {
    return nd([{
      cosa: "commesse con almeno un ordine d'acquisto collegato",
      link: "/azienda/ordini",
      azione: "Crea gli ordini fornitore dalle commesse",
    }]);
  }
  const s = SOGLIE_INDICATORI;
  const stato: StatoIndicatore =
    med > s.firmaOrdineGiorniAllarme ? "allarme"
    : med > s.firmaOrdineGiorniOk ? "attenzione"
    : "ok";
  return {
    valore: Math.round(med),
    stato,
    dettaglio: `Mediana su ${giorniPerCommessa.length} commesse (6 mesi): l'ordine ai fornitori parte dopo ${Math.round(med)} giorni.`,
  };
}

// ── Formattazione locale (niente dipendenze React) ──────────────────────────

function eur(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtOre(n: number): string {
  return n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
}
