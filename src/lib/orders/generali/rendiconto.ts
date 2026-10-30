// src/lib/orders/generali/rendiconto.ts
// Il dossier di rendicontazione di una commessa generale: un documento unico da dare a banca,
// soci, investitori o commercialista. Qui si sceglie COSA entra (modelli pronti, sezioni,
// permessi di chi lo genera) e si mettono in fila i numeri che i moduli hanno già calcolato
// (piano, investitori, unità, contratto, documenti): nessun conto rifatto, solo scelte e
// semafori. Niente React né database: il PDF, l'Excel e lo storico leggono `DatiDossier`.
import {
  DEFINIZIONI_MODELLI, totaliGenerale,
  type ModelloGenerale, type RiepilogoGenerale,
} from "@/lib/orders/commesseGenerali";
import {
  STATI_SAL, TIPI_ATTO, TIPI_GARANZIA, anticipazione, fineAggiornata, giorniTra, penaleMaturata, ritenute,
  salEmesso, totaliSal, valoreContratto,
  type DatiContratto, type ValoreContratto,
} from "@/lib/orders/generali/contratto";
import { riepilogoVoceFiglie, type ChecklistDocumenti, type ConteggiDocumenti, type StatoVoce } from "@/lib/orders/generali/documenti";
import {
  NOMI_FONTE, NOMI_FORMA, aCapitale, aDebito,
  type ContiInvestitori,
} from "@/lib/orders/generali/investitoriConti";
import { avanzamentoMedio } from "@/lib/orders/generali/investitoriRendiconto";
import { moduliDelModello, type ModuloGenerale } from "@/lib/orders/generali/moduli";
import type { PianoCalcolato, RigaConfronto, TotaliColonne } from "@/lib/orders/generali/pianoConti";
import type { FotografiaPiano, VersionePiano } from "@/lib/orders/generali/pianoLettura";
import { NOMI_STATO, prezzoCorrente, unitaVive, type ElencoUnita, type StatoVendita } from "@/lib/orders/generali/unita";
import { pagamentiUnita, riepilogoVendite } from "@/lib/orders/generali/unitaConti";

// ── Sezioni e modelli ───────────────────────────────────────────────────────

/** La copertina c'è sempre: non è una sezione da scegliere. */
export const SEZIONI_DOSSIER = [
  "sintesi", "avanzamento", "foto", "piano", "andamento", "cassa", "fonti", "investitori", "unita", "contratto", "documenti", "note",
] as const;
export type SezioneDossier = typeof SEZIONI_DOSSIER[number];

export const NOMI_SEZIONE: Record<SezioneDossier, { nome: string; aiuto: string }> = {
  sintesi: { nome: "Sintesi", aiuto: "Una pagina con i numeri chiave e i semafori." },
  avanzamento: { nome: "Avanzamento lavori", aiuto: "Le commesse dentro, con stato e avanzamento." },
  foto: { nome: "Foto dal cantiere", aiuto: "Le foto più recenti dei rapportini e del diario." },
  piano: { nome: "Piano economico", aiuto: "Previsto, reale, a finire e scostamenti, voce per voce." },
  andamento: { nome: "Andamento nei mesi", aiuto: "Come è cambiata la stima, dalle fotografie di fine mese." },
  cassa: { nome: "Flusso di cassa", aiuto: "Entrate, uscite e capitale impegnato mese per mese." },
  fonti: { nome: "Fonti, debito e rendimenti", aiuto: "Chi copre il fabbisogno, il debito, ROI, ROE e leva." },
  investitori: { nome: "Posizione di soci e investitori", aiuto: "Per ciascuno: capitale, rendimento e quanto gli spetta." },
  unita: { nome: "Unità e vendite", aiuto: "Unità vendute, prenotate e libere, incassi." },
  contratto: { nome: "Contratto e SAL", aiuto: "Valore, atti aggiuntivi, SAL, ritenute, anticipazione, garanzie." },
  documenti: { nome: "Documenti", aiuto: "Quali documenti ci sono e quali mancano." },
  note: { nome: "Note del titolare", aiuto: "Il tuo commento, in fondo al dossier." },
};

export type ModelloDossier = "banca" | "soci" | "completo";
export const MODELLI_DOSSIER: Record<ModelloDossier, { nome: string; aiuto: string; sezioni: readonly SezioneDossier[] }> = {
  banca: {
    nome: "Per la banca",
    aiuto: "Avanzamento, piano, cassa, debito e garanzie. Senza la posizione dei singoli soci.",
    sezioni: ["sintesi", "avanzamento", "foto", "piano", "andamento", "cassa", "fonti", "unita", "contratto", "documenti", "note"],
  },
  soci: {
    nome: "Per i soci",
    aiuto: "Come va l'operazione e quanto spetta a ciascun socio e investitore.",
    sezioni: ["sintesi", "avanzamento", "foto", "piano", "andamento", "cassa", "fonti", "investitori", "unita", "contratto", "note"],
  },
  completo: {
    nome: "Completo",
    aiuto: "Tutto quello che c'è: per te o per il commercialista.",
    sezioni: SEZIONI_DOSSIER,
  },
};
export const MODELLI_DOSSIER_ORDINE: readonly ModelloDossier[] = ["banca", "soci", "completo"];

/** Il modulo da cui viene ogni sezione; null = sempre (dati della generale). */
const MODULO_SEZIONE: Record<SezioneDossier, ModuloGenerale | null> = {
  sintesi: null, avanzamento: null, foto: null, note: null,
  piano: "piano", andamento: "piano", cassa: "piano",
  fonti: "investitori", investitori: "investitori",
  unita: "unita", contratto: "contratto", documenti: "documenti",
};

/** Sezioni con costi, margini o investitori: le vede solo chi vede i margini. */
const SEZIONI_MARGINI: ReadonlySet<SezioneDossier> = new Set(["piano", "andamento", "cassa", "fonti", "investitori"]);

/** Cosa c'è da mettere: i dati che i moduli hanno restituito (null = niente o non leggibile). */
export interface PresenzaDati {
  piano: boolean;
  fotografie: number;
  fonti: number;
  /** Fonti che non sono debito: mezzi propri e investitori. */
  investitori: number;
  unita: number;
  contratto: boolean;
  documenti: boolean;
  foto: number;
}

export interface DisponibilitaSezione {
  sezione: SezioneDossier;
  disponibile: boolean;
  /** Perché non si può scegliere, detto a chi usa l'app. */
  motivo: string | null;
}

/** Le sezioni che chi genera il dossier può mettere, e perché le altre no. */
export function sezioniDisponibili(p: {
  modello: ModelloGenerale;
  permessi: RiepilogoGenerale["permessi"];
  dati: PresenzaDati;
}): DisponibilitaSezione[] {
  const moduli = moduliDelModello(p.modello);
  const motivo = (s: SezioneDossier): string | null => {
    const modulo = MODULO_SEZIONE[s];
    if (modulo && !moduli.includes(modulo)) return "Questo tipo di operazione non lo usa.";
    if (SEZIONI_MARGINI.has(s) && !p.permessi.margini) return "Serve il permesso di vedere i margini.";
    if (s === "contratto" && !p.permessi.importi) return "Serve il permesso di vedere gli importi.";
    switch (s) {
      case "piano":
      case "cassa":
        return p.dati.piano ? null : "Il piano economico non c'è ancora.";
      case "andamento":
        return p.dati.fotografie > 0 ? null : "Nessuna fotografia di fine mese, per ora.";
      case "fonti":
        return p.dati.fonti > 0 ? null : "Nessuna fonte di finanziamento inserita.";
      case "investitori":
        return p.dati.investitori > 0 ? null : "Nessun socio o investitore inserito.";
      case "unita":
        return p.dati.unita > 0 ? null : "Nessuna unità, per ora.";
      case "contratto":
        return p.dati.contratto ? null : "Il contratto non è ancora compilato.";
      case "documenti":
        return p.dati.documenti ? null : "Non riesco a leggere i documenti.";
      case "foto":
        return p.dati.foto > 0 ? null : "Nessuna foto nei rapportini e nel diario.";
      default:
        return null;
    }
  };
  return SEZIONI_DOSSIER.map((sezione) => {
    const m = motivo(sezione);
    return { sezione, disponibile: m === null, motivo: m };
  });
}

/** Le sezioni di un modello pronto, solo tra quelle che si possono mettere. */
export function sezioniDelModello(modello: ModelloDossier, disponibili: readonly DisponibilitaSezione[]): SezioneDossier[] {
  const si = new Set(disponibili.filter((d) => d.disponibile).map((d) => d.sezione));
  return MODELLI_DOSSIER[modello].sezioni.filter((s) => si.has(s));
}

/** Chi può rileggere il dossier dallo storico: lo decide la sezione più riservata che contiene. */
export type LivelloDossier = "base" | "importi" | "margini";

export function livelloDossier(sezioni: readonly SezioneDossier[], permessi: RiepilogoGenerale["permessi"]): LivelloDossier {
  if (sezioni.some((s) => SEZIONI_MARGINI.has(s))) return "margini";
  const conImporti = sezioni.some((s) => s === "sintesi" || s === "avanzamento" || s === "unita" || s === "contratto");
  return conImporti && permessi.importi ? "importi" : "base";
}

// ── I dati del dossier ──────────────────────────────────────────────────────

export interface AziendaDossier {
  nome: string;
  partitaIva: string | null;
  indirizzo: string | null;
  email: string | null;
  telefono: string | null;
  logo: string | null;
}

export type Tono = "verde" | "giallo" | "rosso";
export interface Semaforo { id: string; titolo: string; tono: Tono; testo: string }

export interface NumeroChiave {
  etichetta: string;
  valore: number | string | null;
  /** «percento»: 0.12 = 12%. */
  formato: "euro" | "percento" | "testo";
  nota?: string;
}

export interface RigaPianoDossier {
  etichetta: string;
  previsto: number;
  reale: number;
  aFinire: number;
  stima: number;
  scostamento: number;
}

export interface FotoDossier {
  /** Indirizzo dell'immagine; nel PDF un data: URL già ridotto. */
  src: string;
  didascalia: string;
  data: string | null;
}

export interface DatiDossier {
  /** «2027-03-15». */
  data: string;
  periodo: { dal: string | null; al: string };
  modello: ModelloDossier | "personalizzato";
  titolo: string;
  livello: LivelloDossier;
  sezioni: SezioneDossier[];
  azienda: AziendaDossier;
  operazione: {
    nome: string;
    codice: string | null;
    modello: ModelloGenerale;
    modelloNome: string;
    cliente: string | null;
    clienteEtichetta: string;
    figlie: number;
    figliaTante: string;
  };
  sintesi: { numeri: NumeroChiave[]; semafori: Semaforo[] } | null;
  avanzamento: {
    medio: number | null;
    figlie: {
      nome: string; codice: string | null; stato: string | null; avanzamento: number;
      importo: number | null; eseguito: number | null; fatturato: number | null; incassato: number | null;
    }[];
    /** Solo con il permesso sugli importi. */
    scala: { valore: number | null; valoreEtichetta: string; assegnato: number | null; eseguito: number | null; fatturato: number | null; incassato: number | null; daIncassare: number | null } | null;
  } | null;
  foto: FotoDossier[];
  piano: {
    versione: string | null;
    ricavi: RigaPianoDossier[];
    costi: RigaPianoDossier[];
    totali: { ricavi: TotaliColonne; costi: TotaliColonne; margine: TotaliColonne };
    indicatori: {
      marginePct: number | null; roi: number | null; tir: number | null; durataMesi: number | null;
      costoMq: number | null; prezzoMq: number | null; pareggioMq: number | null;
    };
    avvisi: string[];
  } | null;
  andamento: {
    mese: string;
    ricaviStima: number; costiStima: number; margineStima: number; marginePrevisto: number; capitaleInvestito: number;
  }[] | null;
  cassa: {
    mesi: { mese: string; entrate: number; uscite: number; netto: number; cumulato: number; passato: boolean }[];
    capitaleMassimo: number;
    meseCapitaleMassimo: string | null;
    capitaleMassimoPrevisto: number;
    capitaleInvestitoOggi: number;
  } | null;
  fonti: {
    copertura: { nome: string; impegno: number; dentro: number }[];
    totali: { impegno: number; dentro: number; daVersare: number };
    scoperto: number;
    debito: { nome: string; forma: string; impegno: number; dentro: number; tassoPct: number | null; scadenza: string | null; interessi: number }[];
    costoDebito: { interessi: number; spese: number; totale: number; costoAnnuo: number | null };
    rendimenti: {
      margineProgetto: number; capitaleProgetto: number; roi: number | null; tirProgetto: number | null;
      roe: number | null; tirMezziPropri: number | null; utileMezziPropri: number | null; leva: number | null;
    } | null;
  } | null;
  investitori: {
    nome: string; tipo: string; impegno: number; dentro: number; rendimentoNome: string;
    rendimentoStima: number; giaPagato: number; spettaAFine: number; rendimentoPct: number | null; tir: number | null; quotaPct: number | null;
  }[] | null;
  unita: {
    totale: number;
    conteggi: Record<StatoVendita, number>;
    venduto: number | null; prenotato: number | null; inVendita: number | null; incassato: number | null; daIncassare: number | null;
    elenco: { sigla: string; tipologia: string | null; mq: number | null; stato: string; prezzo: number | null; incassato: number | null; residuo: number | null }[];
  } | null;
  contratto: {
    riferimento: string | null; cig: string | null; cup: string | null;
    dataFirma: string | null; consegna: string | null; finePrevista: string | null; fineAggiornata: string | null; ultimazione: string | null;
    valore: ValoreContratto | null;
    atti: { tipo: string; numero: string | null; data: string; descrizione: string; importo: number; giorniProroga: number }[];
    sal: { numero: number; stato: string; al: string | null; cumulativo: number; lordo: number; ritenuta: number; recupero: number; netto: number }[];
    aSal: number;
    ritenute: { trattenute: number; svincolate: number; daSvincolare: number };
    anticipazione: { importo: number; recuperato: number; daRecuperare: number };
    garanzie: { tipo: string; garante: string | null; numero: string | null; importo: number | null; scadenza: string | null; svincolataIl: string | null }[];
    penale: { giorni: number; importo: number } | null;
    fatture: { emesso: number; incassato: number };
  } | null;
  documenti: {
    conteggi: ConteggiDocumenti;
    generale: { nome: string; stato: StatoVoce; scadenza: string | null; obbligatoria: boolean }[];
    figlie: { nome: string; presenti: number; valgono: number; daFare: number }[];
  } | null;
  note: string | null;
}

export interface InputDossier {
  oggi: string;
  periodo: { dal: string | null; al: string };
  modello: ModelloDossier | "personalizzato";
  /** Quelle scelte; entrano solo se disponibili. */
  sezioni: readonly SezioneDossier[];
  riepilogo: RiepilogoGenerale;
  azienda: AziendaDossier;
  piano: PianoCalcolato | null;
  versionePiano?: VersionePiano | null;
  fotografie?: readonly FotografiaPiano[] | null;
  conti?: ContiInvestitori | null;
  unita?: ElencoUnita | null;
  contratto?: DatiContratto | null;
  checklist?: ChecklistDocumenti | null;
  foto?: readonly FotoDossier[];
  note?: string | null;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;
// «always»: in italiano Intl non mette il punto nelle cifre a quattro (3000 invece di 3.000).
const CIFRE = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" } as Intl.NumberFormatOptions);
/** «€ 1.250.000», «-€ 3.500», come nel PDF (trattino normale: l'Helvetica del PDF non ha il segno meno). */
export const euroTesto = (n: number) => `${n < -0.5 ? "-" : ""}€ ${CIFRE.format(Math.abs(n))}`;
const dentroPeriodo = (data: string | null, periodo: InputDossier["periodo"]) =>
  !data || ((!periodo.dal || data.slice(0, 10) >= periodo.dal) && data.slice(0, 10) <= periodo.al);
const meseDentro = (mese: string, periodo: InputDossier["periodo"]) =>
  (!periodo.dal || mese >= periodo.dal.slice(0, 7)) && mese <= periodo.al.slice(0, 7);

export function presenzaDati(i: Omit<InputDossier, "oggi" | "periodo" | "modello" | "sezioni" | "azienda">): PresenzaDati {
  const fonti = i.conti?.fonti ?? [];
  return {
    piano: !!i.piano,
    fotografie: i.fotografie?.length ?? 0,
    fonti: fonti.length,
    investitori: fonti.filter((c) => !aDebito(c.fonte.tipo)).length,
    unita: i.unita ? unitaVive(i.unita.unita).length : 0,
    contratto: !!i.contratto?.contratto,
    documenti: !!i.checklist,
    foto: i.foto?.length ?? 0,
  };
}

const rigaPiano = (r: RigaConfronto): RigaPianoDossier => ({
  etichetta: r.etichetta, previsto: r.previsto, reale: r.reale, aFinire: r.aFinire, stima: r.stima, scostamento: r.scostamento,
});

/** Mette insieme il dossier: solo le sezioni scelte, disponibili e permesse a chi lo genera. */
export function componiDossier(i: InputDossier): DatiDossier {
  const r = i.riepilogo;
  const def = DEFINIZIONI_MODELLI[r.generale.modello];
  const disponibili = sezioniDisponibili({ modello: r.generale.modello, permessi: r.permessi, dati: presenzaDati(i) });
  const ammesse = new Set(disponibili.filter((d) => d.disponibile).map((d) => d.sezione));
  const nota = i.note?.trim() || null;
  const sezioni = SEZIONI_DOSSIER.filter((s) => i.sezioni.includes(s) && ammesse.has(s) && (s !== "note" || !!nota));
  const c = new Set(sezioni);
  const totali = totaliGenerale(r);
  const p = r.permessi;

  const avanzamento: DatiDossier["avanzamento"] = c.has("avanzamento") || c.has("sintesi")
    ? {
        medio: avanzamentoMedio(r.figlie),
        figlie: r.figlie.map((f) => ({
          nome: f.nome, codice: f.codice, stato: f.statoNome, avanzamento: Math.round(f.avanzamento),
          importo: p.importi ? f.importo : null, eseguito: p.importi ? f.eseguito : null,
          fatturato: p.importi ? f.fatturato : null, incassato: p.importi ? f.incassato : null,
        })),
        scala: p.importi
          ? {
              valore: r.generale.valore, valoreEtichetta: def.valore.etichetta, assegnato: totali.assegnato, eseguito: totali.eseguito,
              fatturato: totali.fatturato, incassato: totali.incassato, daIncassare: totali.daIncassare,
            }
          : null,
      }
    : null;

  const pc = i.piano;
  const piano: DatiDossier["piano"] = c.has("piano") && pc
    ? {
        versione: i.versionePiano ? `Versione ${i.versionePiano.numero}${i.versionePiano.stato === "approvata" ? " approvata" : i.versionePiano.stato === "bozza" ? " in bozza" : ""}` : null,
        ricavi: pc.confronto.ricavi.map(rigaPiano),
        costi: pc.confronto.costi.map(rigaPiano),
        totali: pc.confronto.totali,
        indicatori: {
          marginePct: pc.indicatori.stima.marginePct, roi: pc.indicatori.stima.roi, tir: pc.indicatori.stima.tir,
          durataMesi: pc.indicatori.stima.durataMesi, costoMq: pc.indicatori.stima.costoMq,
          prezzoMq: pc.indicatori.stima.prezzoMq, pareggioMq: pc.indicatori.stima.pareggioMq,
        },
        avvisi: pc.avvisi,
      }
    : null;

  const andamento: DatiDossier["andamento"] = c.has("andamento") && i.fotografie
    ? i.fotografie
        .filter((f) => meseDentro(f.mese, i.periodo))
        .map((f) => ({
          mese: f.mese,
          ricaviStima: f.ricaviStima, costiStima: f.costiStima, margineStima: arrotonda(f.ricaviStima - f.costiStima),
          marginePrevisto: arrotonda(f.ricaviPrevisti - f.costiPrevisti), capitaleInvestito: f.capitaleInvestito,
        }))
    : null;

  const cassa: DatiDossier["cassa"] = c.has("cassa") && pc
    ? {
        mesi: pc.cassa.stima.map(({ mese, entrate, uscite, netto, cumulato, passato }) => ({ mese, entrate, uscite, netto, cumulato, passato })),
        capitaleMassimo: pc.capitale.massimoStima,
        meseCapitaleMassimo: pc.capitale.meseMassimoStima,
        capitaleMassimoPrevisto: pc.capitale.massimoPrevisto,
        capitaleInvestitoOggi: pc.capitale.investitoOggi,
      }
    : null;

  const ci = i.conti ?? null;
  const fonti: DatiDossier["fonti"] = c.has("fonti") && ci
    ? {
        copertura: ci.copertura.map((x) => ({ nome: x.nome, impegno: x.impegno, dentro: x.dentro })),
        totali: { impegno: ci.totali.impegno, dentro: ci.totali.dentro, daVersare: ci.totali.daVersare },
        scoperto: ci.scoperto,
        debito: ci.fonti
          .filter((x) => aDebito(x.fonte.tipo))
          .map((x) => ({
            nome: x.fonte.nome,
            forma: x.fonte.forma ? NOMI_FORMA[x.fonte.forma] : NOMI_FONTE[x.fonte.tipo].nome,
            impegno: x.fonte.impegno, dentro: x.capitaleDentro, tassoPct: x.fonte.tassoPct, scadenza: x.fonte.scadenza,
            interessi: x.rendimento.stima,
          })),
        costoDebito: {
          interessi: ci.costoDebito.interessi.stima, spese: ci.costoDebito.spese.stima,
          totale: ci.costoDebito.totale, costoAnnuo: ci.costoDebito.costoAnnuo,
        },
        rendimenti: ci.haPiano
          ? {
              margineProgetto: ci.rendimenti.progetto.margine, capitaleProgetto: ci.rendimenti.progetto.capitale,
              roi: ci.rendimenti.progetto.roi, tirProgetto: ci.rendimenti.progetto.tir,
              roe: ci.rendimenti.mezziPropri?.roe ?? null, tirMezziPropri: ci.rendimenti.mezziPropri?.tir ?? null,
              utileMezziPropri: ci.rendimenti.mezziPropri?.utile ?? null, leva: ci.rendimenti.leva,
            }
          : null,
      }
    : null;

  const investitori: DatiDossier["investitori"] = c.has("investitori") && ci
    ? ci.fonti
        .filter((x) => !aDebito(x.fonte.tipo))
        .map((x) => ({
          nome: x.fonte.nome, tipo: NOMI_FONTE[x.fonte.tipo].nome, impegno: x.fonte.impegno, dentro: x.capitaleDentro,
          rendimentoNome: aCapitale(x.fonte.tipo) ? "Utile" : "Interessi",
          rendimentoStima: x.rendimento.stima, giaPagato: x.pagato, spettaAFine: x.spettaAFine,
          rendimentoPct: x.rendimentoPct, tir: x.tir, quotaPct: x.quota ? x.quota.stima : null,
        }))
    : null;

  const eu = i.unita ?? null;
  const unita: DatiDossier["unita"] = c.has("unita") && eu
    ? (() => {
        const rv = riepilogoVendite(eu);
        const importi = eu.permessi.importi;
        return {
          totale: rv.unita, conteggi: rv.conteggi, venduto: rv.venduto, prenotato: rv.prenotato, inVendita: rv.inVendita,
          incassato: rv.incassato, daIncassare: rv.daIncassare,
          elenco: unitaVive(eu.unita).map((u) => {
            const pag = pagamentiUnita(u);
            return {
              sigla: u.sigla, tipologia: u.tipologia, mq: u.mq, stato: NOMI_STATO[u.stato].una,
              prezzo: importi ? prezzoCorrente(u) : null, incassato: importi ? pag.incassato : null, residuo: importi ? pag.residuo : null,
            };
          }),
        };
      })()
    : null;

  const dc = i.contratto ?? null;
  const contratto: DatiDossier["contratto"] = c.has("contratto") && dc?.contratto
    ? (() => {
        const k = dc.contratto!;
        const pen = penaleMaturata(k, dc.atti, i.oggi);
        return {
          riferimento: k.riferimento, cig: k.cig, cup: k.cup,
          dataFirma: k.dataFirma, consegna: k.dataConsegnaLavori, finePrevista: k.dataFinePrevista,
          fineAggiornata: fineAggiornata(k, dc.atti).data, ultimazione: k.dataUltimazione,
          valore: valoreContratto(k, dc.atti),
          atti: dc.atti.map((a) => ({ tipo: TIPI_ATTO[a.tipo], numero: a.numero, data: a.data, descrizione: a.descrizione, importo: a.importo, giorniProroga: a.giorniProroga })),
          sal: dc.sal
            .filter((s) => s.diContratto && salEmesso(s))
            .sort((a, b) => a.numero - b.numero)
            .map((s) => ({
              numero: s.numero, stato: STATI_SAL[s.stato] ?? s.stato, al: s.al, cumulativo: s.cumulativo, lordo: s.lordo,
              ritenuta: s.ritenuta, recupero: s.recupero, netto: s.netto,
            })),
          aSal: totaliSal(dc.sal).aSal,
          ritenute: (({ trattenute, svincolate, daSvincolare }) => ({ trattenute, svincolate, daSvincolare }))(ritenute(dc.sal)),
          anticipazione: anticipazione(k, dc.sal),
          garanzie: dc.garanzie.map((g) => ({
            tipo: TIPI_GARANZIA[g.tipo], garante: g.garante, numero: g.numero, importo: g.importo, scadenza: g.scadenza, svincolataIl: g.svincolataIl,
          })),
          penale: pen ? { giorni: pen.giorni, importo: pen.importo } : null,
          fatture: {
            emesso: arrotonda(dc.fatture.reduce((t, f) => t + f.totale, 0)),
            incassato: arrotonda(dc.fatture.reduce((t, f) => t + f.incassato, 0)),
          },
        };
      })()
    : null;

  const ck = i.checklist ?? null;
  const documenti: DatiDossier["documenti"] = c.has("documenti") && ck
    ? {
        conteggi: ck.conteggi,
        generale: ck.generale.map((x) => ({ nome: x.voce.nome, stato: x.stato, scadenza: x.scadenza, obbligatoria: x.obbligatoria })),
        figlie: ck.figlie.map((g) => ({ nome: g.voce.nome, ...riepilogoVoceFiglie(g.caselle) })),
      }
    : null;

  const foto = c.has("foto") ? (i.foto ?? []).filter((f) => dentroPeriodo(f.data, i.periodo)).slice(0, 12) : [];

  const d: DatiDossier = {
    data: i.oggi,
    periodo: i.periodo,
    modello: i.modello,
    titolo: i.modello === "personalizzato" ? "Rendiconto dell'operazione" : `Rendiconto dell'operazione · ${MODELLI_DOSSIER[i.modello].nome.toLowerCase()}`,
    livello: livelloDossier(sezioni, p),
    sezioni,
    azienda: i.azienda,
    operazione: {
      nome: r.generale.nome, codice: r.generale.codice, modello: r.generale.modello, modelloNome: def.nome,
      cliente: r.generale.cliente, clienteEtichetta: def.cliente.etichetta, figlie: r.figlie.length, figliaTante: def.figlia.tante,
    },
    sintesi: null,
    avanzamento: c.has("avanzamento") ? avanzamento : null,
    foto,
    piano,
    andamento: andamento && andamento.length > 0 ? andamento : null,
    cassa,
    fonti,
    investitori,
    unita,
    contratto,
    documenti,
    note: c.has("note") ? nota : null,
  };
  if (c.has("sintesi")) d.sintesi = { numeri: numeriChiave(d, avanzamento, pc), semafori: semafori(d, avanzamento, i.oggi) };
  return d;
}

/** I numeri della prima pagina: solo da sezioni che il dossier contiene. */
function numeriChiave(d: DatiDossier, av: DatiDossier["avanzamento"], pc: PianoCalcolato | null): NumeroChiave[] {
  const n: NumeroChiave[] = [];
  n.push({ etichetta: "Avanzamento lavori", valore: av?.medio != null ? av.medio / 100 : null, formato: "percento", nota: `${d.operazione.figlie} ${d.operazione.figliaTante.toLowerCase()}` });
  if (av?.scala) {
    n.push({ etichetta: av.scala.valoreEtichetta, valore: av.scala.valore ?? av.scala.assegnato, formato: "euro" });
    if (av.scala.incassato !== null) n.push({ etichetta: "Incassato", valore: av.scala.incassato, formato: "euro" });
  }
  if (d.piano && pc) {
    n.push({ etichetta: "Ricavi a fine operazione", valore: d.piano.totali.ricavi.stima, formato: "euro", nota: "stima finale" });
    n.push({ etichetta: "Costi a fine operazione", valore: d.piano.totali.costi.stima, formato: "euro", nota: "stima finale" });
    n.push({ etichetta: "Margine a fine operazione", valore: d.piano.totali.margine.stima, formato: "euro", nota: `previsto ${euroTesto(d.piano.totali.margine.previsto)}` });
  }
  if (d.cassa) n.push({ etichetta: "Capitale massimo impegnato", valore: d.cassa.capitaleMassimo, formato: "euro" });
  if (d.fonti?.rendimenti) {
    n.push({ etichetta: "ROI dell'operazione", valore: d.fonti.rendimenti.roi, formato: "percento" });
    if (d.fonti.rendimenti.roe !== null) n.push({ etichetta: "ROE dei mezzi propri", valore: d.fonti.rendimenti.roe, formato: "percento" });
  }
  if (d.unita) {
    const vendute = d.unita.conteggi.compromesso + d.unita.conteggi.rogitata;
    n.push({ etichetta: `${d.operazione.figliaTante} vendute`, valore: `${vendute} su ${d.unita.totale}`, formato: "testo" });
  }
  if (d.contratto) n.push({ etichetta: "Lavori messi a SAL", valore: d.contratto.aSal, formato: "euro" });
  return n.slice(0, 9);
}

/** Tre colori, una frase: dove va bene, dove guardare, dove intervenire. */
export function semafori(d: DatiDossier, av: DatiDossier["avanzamento"], oggi: string): Semaforo[] {
  const s: Semaforo[] = [];
  const euro = euroTesto;
  if (d.piano) {
    const m = d.piano.totali.margine;
    const calo = m.previsto > 0 ? (m.stima - m.previsto) / m.previsto : 0;
    s.push({
      id: "margine",
      titolo: "Margine",
      tono: m.stima < 0 ? "rosso" : calo >= -0.005 ? "verde" : calo >= -0.1 ? "giallo" : "rosso",
      testo: `Stima finale ${euro(m.stima)} contro ${euro(m.previsto)} previsti.`,
    });
    const k = d.piano.totali.costi;
    const sforo = k.previsto > 0 ? k.scostamento / k.previsto : 0;
    s.push({
      id: "costi",
      titolo: "Costi",
      tono: sforo <= 0.005 ? "verde" : sforo <= 0.05 ? "giallo" : "rosso",
      testo: k.scostamento > 0.5 ? `${euro(k.scostamento)} oltre il previsto (${(sforo * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%).` : "Nel previsto.",
    });
  }
  if (d.fonti) {
    s.push({
      id: "copertura",
      titolo: "Copertura finanziaria",
      tono: d.fonti.scoperto >= 1 ? "rosso" : "verde",
      testo: d.fonti.scoperto >= 1 ? `Alle fonti mancano ${euro(d.fonti.scoperto)} per coprire il picco di cassa.` : "Le fonti coprono il capitale che l'operazione chiede.",
    });
  }
  if (d.unita && d.unita.totale > 0) {
    const vendute = d.unita.conteggi.compromesso + d.unita.conteggi.rogitata;
    const quota = vendute / d.unita.totale;
    const lavori = (av?.medio ?? 0) / 100;
    s.push({
      id: "vendite",
      titolo: "Vendite",
      tono: quota >= 0.5 || quota >= lavori - 0.15 ? "verde" : vendute > 0 || lavori < 0.5 ? "giallo" : "rosso",
      testo: `${vendute} ${d.operazione.figliaTante.toLowerCase()} su ${d.unita.totale} a compromesso o rogitate, con i lavori al ${Math.round(lavori * 100)}%.`,
    });
  }
  if (d.contratto) {
    const fine = d.contratto.fineAggiornata;
    const g = fine && !d.contratto.ultimazione ? giorniTra(oggi, fine) : null;
    s.push({
      id: "tempi",
      titolo: "Tempi del contratto",
      tono: d.contratto.penale ? "rosso" : g !== null && g < 0 ? "rosso" : g !== null && g <= 30 ? "giallo" : "verde",
      testo: d.contratto.penale
        ? `${d.contratto.penale.giorni} giorni oltre la fine: penale maturata ${euro(d.contratto.penale.importo)}.`
        : d.contratto.ultimazione ? "Lavori ultimati." : fine ? `Fine dei lavori il ${giornoIt(fine)}.` : "Manca la data di fine dei lavori.",
    });
    const vive = d.contratto.garanzie.filter((x) => !x.svincolataIl && x.scadenza);
    const scadute = vive.filter((x) => x.scadenza! < oggi).length;
    const vicine = vive.filter((x) => x.scadenza! >= oggi && giorniTra(oggi, x.scadenza!) <= 60).length;
    if (d.contratto.garanzie.length > 0) {
      s.push({
        id: "garanzie",
        titolo: "Garanzie",
        tono: scadute > 0 ? "rosso" : vicine > 0 ? "giallo" : "verde",
        testo: scadute > 0 ? `${scadute === 1 ? "Una garanzia è scaduta" : `${scadute} garanzie sono scadute`}.`
          : vicine > 0 ? `${vicine === 1 ? "Una garanzia scade" : `${vicine} garanzie scadono`} entro 60 giorni.` : "Tutte valide.",
      });
    }
  }
  // Le fatture dei SAL di contratto stanno sulla generale: il riepilogo delle figlie non le conta.
  const fatt = (av?.scala?.fatturato ?? 0) + (d.contratto?.fatture.emesso ?? 0);
  const inc = (av?.scala?.incassato ?? 0) + (d.contratto?.fatture.incassato ?? 0);
  if ((av?.scala?.fatturato != null || d.contratto) && fatt > 0) {
    const daIncassare = Math.max(0, fatt - inc);
    const q = daIncassare / fatt;
    s.push({
      id: "incassi",
      titolo: "Incassi",
      tono: q <= 0.15 ? "verde" : q <= 0.4 ? "giallo" : "rosso",
      testo: daIncassare < 1 ? "Tutto il fatturato è incassato." : `${euro(daIncassare)} fatturati e non ancora incassati, su ${euro(fatt)}.`,
    });
  }
  if (d.documenti) {
    const k = d.documenti.conteggi;
    s.push({
      id: "documenti",
      titolo: "Documenti",
      tono: k.scaduti > 0 ? "rosso" : k.mancanti > 0 || k.inScadenza > 0 ? "giallo" : "verde",
      testo: k.scaduti + k.mancanti + k.inScadenza === 0
        ? `Tutti presenti (${k.presenti} su ${k.richiesti}).`
        : [k.mancanti ? `${k.mancanti} mancanti` : null, k.scaduti ? `${k.scaduti} scaduti` : null, k.inScadenza ? `${k.inScadenza} in scadenza` : null].filter(Boolean).join(", ") + ".",
    });
  }
  return s;
}

/** «15/03/2027». */
export const giornoIt = (d: string | null | undefined) =>
  d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";

/** «Rendiconto Residenza Via Roma 2027-03-15.pdf», senza caratteri strani. */
export function nomeFileDossier(d: Pick<DatiDossier, "operazione" | "data">, estensione: "pdf" | "xlsx" = "pdf"): string {
  const pulito = d.operazione.nome.replace(/[^\p{L}\p{N} .,_-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `Rendiconto ${pulito} ${d.data}.${estensione}`;
}

/** Destinatari scritti a mano: separati da virgola, punto e virgola, spazio o a capo; senza doppioni. */
export function leggiDestinatari(testo: string): { validi: string[]; sbagliati: string[] } {
  const parti = testo.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const validi: string[] = [];
  const sbagliati: string[] = [];
  for (const x of parti) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) || x.length > 254) sbagliati.push(x);
    else if (!validi.includes(x)) validi.push(x);
  }
  return { validi, sbagliati };
}

export const MAX_DESTINATARI = 10;
