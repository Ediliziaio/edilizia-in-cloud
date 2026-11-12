/**
 * L'economia del preventivo con computo (29/10/2026, passo «Economia»): il
 * piano dei pagamenti (acconto, SAL, saldo), i margini sul costo stimato delle
 * voci e il flusso di cassa del cantiere sul cronoprogramma.
 *
 * Il flusso è una stima per decidere le condizioni, non contabilità: i costi
 * si spendono mentre la fase che li contiene è in corso (una fase si lega a un
 * capitolo dal nome; quello che non si lega si spalma su tutto il cantiere),
 * gli incassi arrivano quando scatta la rata. La CASSA è al netto dell'IVA, che
 * non è dell'impresa; le RATE invece si leggono sul totale che paga il cliente,
 * IVA inclusa, come in tutti gli altri preventivatori (11/11/2026).
 *
 * Dall'11/11/2026 una rata può essere A MISURA: si paga quello che risulta dal
 * SAL, e al preventivo l'importo non si conosce. Il piano allora non deve fare
 * 100% di rate fisse: le percentuali fisse non possono superare 100, e quello
 * che resta è la quota che i SAL si divideranno sull'avanzamento vero.
 */
import { arrotondaDecimale, calcolaVoce, numeroEditor, type BozzaComputo } from "./editorNativo";
import { durataTotale, normalizzaFasi } from "./cronoprogramma";
import { calcolaSconto } from "./scontoComputo";
import { calcolaIvaComputo } from "./ivaComputo";

export {
  MOMENTI_RATA, MOMENTI_SAL, TERMINI_RATA, pianoPagamentiSchema, rataSchema, ritenutaSchema, testoTermine,
  type MomentoRata, type Rata, type RitenutaGaranzia,
} from "./pagamentiSchema";
import { MOMENTI_RATA, MOMENTI_SAL, type MomentoRata, type Rata, type RitenutaGaranzia } from "./pagamentiSchema";

const rata = (descrizione: string, percentuale: string, evento: MomentoRata, extra: Partial<Rata> = {}): Rata =>
  ({ id: crypto.randomUUID(), descrizione, percentuale, base: "percentuale", evento, numero: null, soglia: null,
    fasi: [], giorno: null, termineGiorni: 0, termineFineMese: false, ...extra });

/** Una rata nuova, da riempire: il momento più comune è un SAL. */
export const rataVuota = (descrizione: string): Rata => rata(descrizione, "", "sal_numero");

/** Una rata a misura: nessuna percentuale, l'importo lo dice il SAL. */
const salAMisura = (descrizione: string, numero: number): Rata =>
  rata(descrizione, "", "sal_numero", { base: "avanzamento", numero });

/** Piani di partenza: i più usati dalle imprese, da correggere. `durata` = giorni lavorativi del cantiere. */
export function pianiPredefiniti(durata: number): { nome: string; rate: () => Rata[] }[] {
  const d = Math.max(3, durata || 20);
  return [
    { nome: "30 · 40 · 30", rate: () => [rata("Acconto", "30", "firma_contratto"),
      rata("A metà lavori", "40", "sal_percentuale", { soglia: 50 }), rata("Saldo", "30", "fine_lavori")] },
    { nome: "Acconto + 2 SAL + saldo", rate: () => [rata("Acconto", "20", "firma_contratto"),
      salAMisura("1° SAL", 1), salAMisura("2° SAL", 2), rata("Saldo", "20", "fine_lavori")] },
    { nome: "SAL mensili", rate: () => {
      const mesi = Math.max(1, Math.min(12, Math.ceil(d / 20)));
      return [rata("Acconto", "10", "firma_contratto"),
        ...Array.from({ length: mesi }, (_, k) => salAMisura(`${k + 1}° SAL mensile`, k + 1)),
        rata("Saldo", "10", "fine_lavori")];
    } },
    { nome: "Tutto a fine lavori", rate: () => [rata("Saldo", "100", "fine_lavori")] },
  ];
}

/**
 * I momenti dei modelli di pagamento dell'azienda (`lib/orders/rateEventi`) in quelli che il
 * computo sa disegnare. Quello che il computo non distingue si avvicina al momento più simile.
 */
const EVENTI_DAL_MODELLO: Record<string, MomentoRata> = {
  firma_contratto: "firma_contratto", accettazione_preventivo: "firma_contratto",
  merce_magazzino: "merce_magazzino", consegna_cantiere: "merce_magazzino",
  inizio_lavori: "inizio_lavori", data_posa: "inizio_lavori",
  sal_numero: "sal_numero", fine_lavori: "fine_lavori",
  fattura_acconto: "firma_contratto", fattura_saldo: "fine_lavori", data_fissa: "fine_lavori",
};

/** Un modello di pagamento dell'azienda diventa le rate di questo preventivo (copiate, non collegate). */
export function rateDaModelloPagamento(righe: readonly { nome: string; percent: number; evento: string; numero?: number | null }[]): Rata[] {
  return righe.slice(0, 24).map(r => {
    const evento = EVENTI_DAL_MODELLO[r.evento] ?? "fine_lavori";
    return rata(r.nome || "Rata", String(Math.round((Number(r.percent) || 0) * 100) / 100).replace(".", ","), evento,
      evento === "sal_numero" ? { numero: r.numero ?? null } : {});
  });
}

const perc = (s: string) => { const n = numeroEditor(s); return n == null ? null : n; };

/** Il numero del SAL di una rata: quello scritto, o la sua posizione fra le rate a SAL. */
export function numeroSal(rate: readonly Rata[], r: Rata): number {
  if (r.numero != null) return r.numero;
  return rate.filter(x => MOMENTI_SAL.includes(x.evento)).indexOf(r) + 1 || 1;
}

/**
 * Il giorno di cantiere in cui l'impresa INCASSA la rata (0 = prima di iniziare).
 * `salTotali` serve a spalmare i SAL numerati lungo il cantiere: senza, undici SAL mensili
 * cadevano tutti a metà lavori e il flusso di cassa diventava una favola.
 */
export function giornoIncasso(r: Rata, durata: number, fasi: { nome: string; inizio: number; durata: number }[] = [], salTotali = 0): number {
  const fine = durata || 1;
  let base: number;
  switch (r.evento) {
    case "firma_contratto": base = 0; break;
    case "inizio_lavori": case "merce_magazzino": base = 1; break;
    case "sal_percentuale": base = Math.max(1, Math.min(fine, Math.round(fine * (r.soglia ?? 50) / 100))); break;
    case "fase_completata": {
      const scelte = fasi.filter(f => r.fasi.some(n => n.trim().toLowerCase() === f.nome.trim().toLowerCase()));
      base = scelte.length ? Math.min(fine, Math.max(...scelte.map(f => f.inizio + f.durata - 1))) : Math.ceil(fine / 2);
      break;
    }
    case "sal_numero": {
      if (r.giorno != null) { base = Math.min(fine, r.giorno); break; }
      // Il SAL n di N si colloca a n/(N+1) del cantiere: l'ultimo resta prima della fine lavori.
      const n = r.numero ?? 1;
      base = salTotali > 0 ? Math.max(1, Math.min(fine, Math.round(fine * n / (salTotali + 1)))) : Math.ceil(fine / 2);
      break;
    }
    default: base = fine; // fine_lavori, collaudo
  }
  // I giorni di pagamento sono solari: circa 5 lavorativi ogni 7. Il «fine mese» qui non si stima.
  return base + Math.round(r.termineGiorni * 5 / 7);
}

/** Come si legge il momento della rata in un documento: «Al SAL 2», «Al raggiungimento del 30% dei lavori». */
export function testoQuando(r: Rata, rate: readonly Rata[]): string {
  switch (r.evento) {
    case "sal_numero": return `Al SAL ${numeroSal(rate, r)}`;
    case "sal_percentuale": return r.soglia != null ? `Al raggiungimento del ${r.soglia.toLocaleString("it-IT")}% dei lavori` : "Al raggiungimento della percentuale di lavori concordata";
    case "fase_completata": return r.fasi.length ? `A completamento di: ${r.fasi.join(", ")}` : "A completamento della fase concordata";
    default: return MOMENTI_RATA[r.evento];
  }
}

/**
 * Il momento della rata nella lingua delle commesse (`lib/orders/rateEventi`). Dal 12/11/2026 la
 * condizione scritta nel contratto arriva intera: «a completamento di una fase» porta il nome
 * della fase e il collaudo resta il collaudo. Il database conosce i momenti (vincolo e
 * `data_attesa_rata`) e le due funzioni che scrivono le rate sanno dove metterli.
 *
 * ECCEZIONE, da togliere: «al X% dei lavori» viaggia ancora come SAL numerato. La regola SQL
 * che lo fa maturare somma gli importi dei SAL, ma `sal_records.importo_totale` è già il
 * cumulativo («lavori a tutto il …»): così la soglia si raggiunge troppo presto e la rata
 * risulterebbe scaduta prima del dovuto. La correzione è pronta in
 * `docs/sal-percentuale-importo-progressivo-20261112.sql`; applicata quella, qui si toglie
 * questa riga e la soglia viaggia col suo evento. La soglia si porta dietro comunque.
 */
export function eventoPerCommessa(r: Rata, rate: readonly Rata[]): {
  evento: string; numero: number | null; soglia: number | null; fase: string | null;
} {
  const vuoto: { numero: number | null; soglia: number | null; fase: string | null } = { numero: null, soglia: null, fase: null };
  switch (r.evento) {
    case "sal_numero": return { ...vuoto, evento: "sal_numero", numero: numeroSal(rate, r) };
    case "sal_percentuale": return { ...vuoto, evento: "sal_numero", numero: numeroSal(rate, r), soglia: r.soglia ?? null };
    case "fase_completata": return { ...vuoto, evento: "fase_completata", fase: r.fasi[0]?.trim() || null };
    default: return { ...vuoto, evento: r.evento };
  }
}

export type RataCalcolata = {
  rata: Rata;
  percentuale: number | null;
  /** Quello che il cliente paga, IVA inclusa quando l'IVA è decisa. Nullo per una rata a misura. */
  importo: number | null;
  /** Lo stesso importo al netto dell'IVA: è quello che entra in cassa all'impresa. */
  importoNetto: number;
  /** Quota trattenuta a garanzia su questa rata, e quello che resta davvero in cassa. */
  trattenuta: number;
  /**
   * Per una rata a misura: quanto le toccherebbe se l'avanzamento fosse regolare, IVA inclusa.
   * È una previsione, non un importo del contratto: serve alla cassa e alla commessa, mai al PDF
   * come cifra da pagare.
   */
  stima: number | null;
  giorno: number;
};

export type AnalisiEconomia = {
  totaleLavori: number; sconto: number; netto: number;
  /** Il totale che paga il cliente (IVA inclusa). Nullo se l'IVA è ancora da definire. */
  totaleCliente: number | null;
  costo: number; vociSenzaCosto: number; margine: number; marginePerc: number | null;
  perCapitolo: Map<string, { costo: number; ricavo: number; senzaCosto: number }>;
  rate: RataCalcolata[];
  sommaPercentuali: number; errorePiano: string;
  /** Quota del contratto lasciata alle rate a misura (100 meno le percentuali fisse). */
  quotaAMisura: number;
  /** La ritenuta a garanzia: quanto si trattiene in tutto e il giorno in cui torna. */
  ritenuta: { percentuale: number; totale: number; giornoSvincolo: number } | null;
  cassa: { giorno: number; saldo: number }[] | null;
  esposizioneMassima: number; giornoEsposizione: number | null; accontoConsigliato: number | null;
  rischi: { livello: "alto" | "medio"; testo: string }[];
};

export function analizzaEconomia(bozza: BozzaComputo): AnalisiEconomia {
  let totaleLavori = 0, costo = 0, vociSenzaCosto = 0;
  const perCapitolo = new Map<string, { costo: number; ricavo: number; senzaCosto: number }>();
  for (const v of bozza.voci) {
    if (v.opzionale) continue; // fuori dal totale: niente ricavo, niente costo
    const r = calcolaVoce(v);
    const nome = v.capitolo.trim() || "Opere edili";
    const c = perCapitolo.get(nome) ?? { costo: 0, ricavo: 0, senzaCosto: 0 };
    const ricavo = r.importo ?? 0;
    totaleLavori += ricavo; c.ricavo += ricavo;
    const cu = numeroEditor(v.costo ?? "");
    if (cu == null || r.quantita == null) { if (ricavo) { vociSenzaCosto++; c.senzaCosto++; } }
    else { const cv = arrotondaDecimale(r.quantita * cu / (v.unita.trim() === "%" ? 100 : 1)); costo += cv; c.costo += cv; }
    perCapitolo.set(nome, c);
  }
  const sicurezza = bozza.voci.reduce((t, v) => t + (v.sicurezza ? calcolaVoce(v).importo ?? 0 : 0), 0);
  const sconto = calcolaSconto(totaleLavori, bozza.sconto, sicurezza).importo;
  const netto = totaleLavori - sconto;
  const margine = netto - costo;
  const marginePerc = netto > 0 && costo > 0 ? margine / netto * 100 : null;
  // Le rate si leggono sul totale che paga il cliente. Con l'IVA «da definire» quel totale non esiste
  // ancora: restano le percentuali, e gli importi si diranno quando l'IVA sarà decisa.
  const fiscale = calcolaIvaComputo(netto, bozza);
  const totaleCliente = fiscale.errore ? null : fiscale.totale;

  const fasi = normalizzaFasi(bozza.cronoprogramma.fasi);
  const durata = durataTotale({ fasi });
  const pianoRate = bozza.pianoPagamenti.rate;
  // Difensivo: una bozza composta a mano (test, vecchi salvataggi) può non avere la ritenuta.
  const ritenutaPiano: RitenutaGaranzia = bozza.pianoPagamenti.ritenuta ?? { percentuale: "", su: "sal", svincolo: "collaudo", mesi: 12 };
  const ritenutaPerc = perc(ritenutaPiano.percentuale) ?? 0;
  const quantiSal = pianoRate.filter(r => r.evento === "sal_numero").length;
  // Dove si trattiene la ritenuta: su tutte le rate, o solo su quelle a SAL. Una regola sola, scritta qui.
  const siTrattiene = (r: Rata) => ritenutaPerc > 0 && (ritenutaPiano.su === "tutte" || MOMENTI_SAL.includes(r.evento));
  const rate: RataCalcolata[] = pianoRate.map(r => {
    const aMisura = r.base === "avanzamento";
    const p = aMisura ? null : perc(r.percentuale);
    const importo = p == null || totaleCliente == null ? null : arrotondaDecimale(totaleCliente * p / 100);
    const importoNetto = p == null ? 0 : arrotondaDecimale(netto * p / 100);
    const trattenuta = siTrattiene(r) ? arrotondaDecimale(importoNetto * ritenutaPerc / 100) : 0;
    const calcolata: RataCalcolata = { rata: r, percentuale: p, importo, importoNetto, trattenuta, stima: null,
      giorno: giornoIncasso(r, durata, fasi, quantiSal) };
    return calcolata;
  });
  const sommaPercentuali = arrotondaDecimale(rate.reduce((s, r) => s + (r.percentuale ?? 0), 0), 2);
  const aMisura = rate.filter(r => r.rata.base === "avanzamento");
  const quotaAMisura = arrotondaDecimale(Math.max(0, 100 - sommaPercentuali), 2);
  // Con le rate al 100% l'ultima prende il resto: la somma degli importi torna al centesimo col totale.
  if (!aMisura.length && rate.length && Math.abs(sommaPercentuali - 100) <= 0.01 && rate.every(r => r.percentuale != null)) {
    const fisse = rate.filter(r => r.importo != null);
    const ultima = fisse.at(-1);
    if (ultima && totaleCliente != null) {
      ultima.importo = arrotondaDecimale(totaleCliente - fisse.slice(0, -1).reduce((t, r) => t + (r.importo ?? 0), 0));
      ultima.importoNetto = arrotondaDecimale(netto - fisse.slice(0, -1).reduce((t, r) => t + r.importoNetto, 0));
    }
  }
  const errorePiano = !pianoRate.length ? ""
    : rate.some(r => r.rata.base !== "avanzamento" && r.percentuale == null) ? "Scrivi la percentuale di ogni rata che non è a misura."
    : sommaPercentuali - 100 > 0.01 ? `Le rate fisse sommano il ${sommaPercentuali.toLocaleString("it-IT")}%: non possono superare il 100%.`
    : !aMisura.length && Math.abs(sommaPercentuali - 100) > 0.01 ? `Le rate sommano il ${sommaPercentuali.toLocaleString("it-IT")}%: devono fare 100%.`
    : aMisura.length && quotaAMisura <= 0 ? "Le rate fisse si prendono tutto il contratto: alle rate a misura non resta niente."
    : "";

  // La quota lasciata ai SAL si divide fra le rate a misura: su quelle si trattiene come sulle altre.
  const quotaPerAMisura = aMisura.length ? arrotondaDecimale(netto * quotaAMisura / 100 / aMisura.length) : 0;
  // La stessa quota su quello che paga il cliente: è la previsione con cui la rata nasce in commessa.
  const stimaCliente = aMisura.length && totaleCliente != null ? arrotondaDecimale(totaleCliente * quotaAMisura / 100 / aMisura.length) : null;
  for (const r of aMisura) r.stima = stimaCliente;
  const trattenutaAMisura = aMisura.reduce((t, r) => t + (siTrattiene(r.rata) ? quotaPerAMisura * ritenutaPerc / 100 : 0), 0);
  const trattenutoTotale = arrotondaDecimale(rate.reduce((t, r) => t + r.trattenuta, 0) + trattenutaAMisura);
  const giornoSvincolo = ritenutaPiano.svincolo === "mesi"
    ? (durata || 1) + Math.round(ritenutaPiano.mesi * 21) : (durata || 1) + 21;
  const ritenuta = ritenutaPerc > 0 ? { percentuale: ritenutaPerc, totale: trattenutoTotale, giornoSvincolo } : null;

  // Flusso di cassa: solo con cronoprogramma, piano valido e costi stimati. Tutto al netto dell'IVA.
  let cassa: AnalisiEconomia["cassa"] = null, esposizioneMassima = 0, giornoEsposizione: number | null = null, accontoConsigliato: number | null = null;
  if (durata > 0 && pianoRate.length && !errorePiano && costo > 0) {
    const spesaGiorno = new Array(durata + 1).fill(0);
    let legato = 0;
    for (const [nome, c] of perCapitolo) {
      if (!c.costo) continue;
      const fase = fasi.find(f => f.nome.trim().toLowerCase() === nome.toLowerCase()) ?? fasi.find(f => f.nome.toLowerCase().includes(nome.toLowerCase()) || nome.toLowerCase().includes(f.nome.toLowerCase()));
      if (!fase) continue;
      legato += c.costo;
      for (let g = fase.inizio; g < fase.inizio + fase.durata && g <= durata; g++) spesaGiorno[g] += c.costo / fase.durata;
    }
    for (let g = 1; g <= durata; g++) spesaGiorno[g] += (costo - legato) / durata;
    // Una rata a misura incassa, in media, la sua parte della quota lasciata ai SAL.
    const perAMisura = quotaPerAMisura;
    const ultimo = Math.max(durata, ...rate.map(r => r.giorno), ritenuta?.giornoSvincolo ?? 0);
    const incassoGiorno = new Array(ultimo + 1).fill(0);
    for (const r of rate) {
      const lordo = r.rata.base === "avanzamento" ? perAMisura : r.importoNetto;
      const trattenuta = r.rata.base === "avanzamento" ? (siTrattiene(r.rata) ? arrotondaDecimale(perAMisura * ritenutaPerc / 100) : 0) : r.trattenuta;
      incassoGiorno[r.giorno] += lordo - trattenuta;
    }
    // La ritenuta non è persa: torna allo svincolo, e fino ad allora è cassa che l'impresa non ha.
    if (ritenuta) incassoGiorno[ritenuta.giornoSvincolo] += ritenuta.totale;
    let saldo = 0;
    cassa = [];
    for (let g = 0; g <= ultimo; g++) {
      saldo += (incassoGiorno[g] ?? 0) - (spesaGiorno[g] ?? 0);
      cassa.push({ giorno: g, saldo: arrotondaDecimale(saldo) });
      if (saldo < esposizioneMassima) { esposizioneMassima = arrotondaDecimale(saldo); giornoEsposizione = g; }
    }
    if (esposizioneMassima < 0 && netto > 0) accontoConsigliato = Math.min(100, Math.ceil(-esposizioneMassima / netto * 100 / 5) * 5);
  }

  const rischi: AnalisiEconomia["rischi"] = [];
  if (marginePerc != null && marginePerc < 10) rischi.push({ livello: "alto", testo: `Margine del ${marginePerc.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%: con un imprevisto il lavoro va in perdita.` });
  else if (marginePerc != null && marginePerc < 20) rischi.push({ livello: "medio", testo: `Margine del ${marginePerc.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%: poco spazio per varianti e ritardi.` });
  if (vociSenzaCosto) rischi.push({ livello: "medio", testo: `${vociSenzaCosto} ${vociSenzaCosto === 1 ? "voce senza costo stimato" : "voci senza costo stimato"}: il margine è più alto di quello vero.` });
  if (sconto > 0 && costo > 0 && margine > 0) rischi.push({ livello: "medio", testo: `Lo sconto vale il ${(sconto / (margine + sconto) * 100).toLocaleString("it-IT", { maximumFractionDigits: 0 })}% del margine che avevi.` });
  if (esposizioneMassima < 0 && netto > 0 && -esposizioneMassima / netto > 0.15) rischi.push({ livello: "alto", testo: `Anticipi fino a ${Math.round(-esposizioneMassima).toLocaleString("it-IT")} € di tasca tua${accontoConsigliato ? `: con un acconto del ${accontoConsigliato}% il cantiere si finanzia da solo` : ""}.` });
  if (ritenuta && ritenuta.totale > 0) rischi.push({ livello: ritenuta.totale / Math.max(1, netto) > 0.04 ? "alto" : "medio",
    testo: `Ritenuta a garanzia del ${ritenuta.percentuale.toLocaleString("it-IT")}%: ${Math.round(ritenuta.totale).toLocaleString("it-IT")} € restano fermi fino allo svincolo.` });
  const ultimaRata = rate.reduce((max, r) => Math.max(max, r.percentuale != null && (r.rata.evento === "fine_lavori" || r.rata.evento === "collaudo") ? r.percentuale : 0), 0);
  if (ultimaRata > 40) rischi.push({ livello: "medio", testo: `Il ${ultimaRata}% arriva a fine lavori: è la parte che si incassa con più fatica.` });

  return { totaleLavori, sconto, netto, totaleCliente, costo, vociSenzaCosto, margine, marginePerc, perCapitolo, rate,
    sommaPercentuali, errorePiano, quotaAMisura, ritenuta, cassa, esposizioneMassima, giornoEsposizione, accontoConsigliato, rischi };
}

/**
 * Il totale del computo per l'elenco dei preventivi (30/10/2026): imponibile scontato,
 * più l'IVA quando è applicata (come la cifra che va in firma). Nullo senza importi.
 */
export function totaleElencoComputo(bozza: BozzaComputo): number | null {
  const { netto } = analizzaEconomia(bozza);
  if (!(netto > 0)) return null;
  return calcolaIvaComputo(netto, bozza).totale ?? arrotondaDecimale(netto);
}
