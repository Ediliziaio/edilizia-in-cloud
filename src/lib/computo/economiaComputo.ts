/**
 * L'economia del preventivo con computo (29/10/2026, passo «Economia»): il
 * piano dei pagamenti (acconto, SAL, saldo), i margini sul costo stimato delle
 * voci e il flusso di cassa del cantiere sul cronoprogramma.
 *
 * Il flusso è una stima per decidere le condizioni, non contabilità: i costi
 * si spendono mentre la fase che li contiene è in corso (una fase si lega a un
 * capitolo dal nome; quello che non si lega si spalma su tutto il cantiere),
 * gli incassi arrivano quando scatta la rata. Tutto al netto dell'IVA, che non
 * è dell'impresa.
 */
import { arrotondaDecimale, calcolaVoce, numeroEditor, type BozzaComputo } from "./editorNativo";
import { durataTotale, normalizzaFasi } from "./cronoprogramma";
import { calcolaSconto } from "./scontoComputo";
import { calcolaIvaComputo } from "./ivaComputo";

export { MOMENTI_RATA, rataSchema, type MomentoRata, type Rata } from "./pagamentiSchema";
import type { MomentoRata, Rata } from "./pagamentiSchema";

const rata = (descrizione: string, percentuale: string, quando: MomentoRata, giorno: number | null = null): Rata =>
  ({ id: crypto.randomUUID(), descrizione, percentuale, quando, giorno, giorniPagamento: 0 });

/** Piani di partenza: i più usati dalle imprese, da correggere. `durata` = giorni lavorativi del cantiere. */
export function pianiPredefiniti(durata: number): { nome: string; rate: () => Rata[] }[] {
  const d = Math.max(3, durata || 20);
  const sal = (k: number, n: number) => Math.max(1, Math.round(d * k / (n + 1)));
  return [
    { nome: "30 · 40 · 30", rate: () => [rata("Acconto", "30", "firma"), rata("A metà lavori", "40", "sal", sal(1, 1)), rata("Saldo", "30", "fine")] },
    { nome: "Acconto + 2 SAL + saldo", rate: () => [rata("Acconto", "20", "firma"), rata("1° SAL", "30", "sal", sal(1, 2)), rata("2° SAL", "30", "sal", sal(2, 2)), rata("Saldo", "20", "fine")] },
    { nome: "SAL mensili", rate: () => {
      const mesi = Math.max(1, Math.ceil(d / 20));
      const quota = arrotondaDecimale(90 / mesi, 2);
      return [rata("Acconto", "10", "firma"), ...Array.from({ length: mesi }, (_, k) => rata(`${k + 1}° SAL mensile`, String(k === mesi - 1 ? arrotondaDecimale(90 - quota * (mesi - 1), 2) : quota).replace(".", ","), "sal", Math.min(d, (k + 1) * 20)))];
    } },
    { nome: "Tutto a fine lavori", rate: () => [rata("Saldo", "100", "fine")] },
  ];
}

const perc = (s: string) => { const n = numeroEditor(s); return n == null ? null : n; };

/** Il giorno di cantiere in cui l'impresa INCASSA la rata (0 = prima di iniziare). */
export function giornoIncasso(r: Rata, durata: number): number {
  const base = r.quando === "firma" ? 0 : r.quando === "inizio" ? 1 : r.quando === "sal" ? Math.min(durata || 1, r.giorno ?? Math.ceil((durata || 1) / 2)) : durata || 1;
  // I giorni di pagamento sono solari: circa 5 lavorativi ogni 7.
  return base + Math.round(r.giorniPagamento * 5 / 7);
}

export type AnalisiEconomia = {
  totaleLavori: number; sconto: number; netto: number;
  costo: number; vociSenzaCosto: number; margine: number; marginePerc: number | null;
  perCapitolo: Map<string, { costo: number; ricavo: number; senzaCosto: number }>;
  rate: { rata: Rata; percentuale: number | null; importo: number; giorno: number }[];
  sommaPercentuali: number; errorePiano: string;
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

  const fasi = normalizzaFasi(bozza.cronoprogramma.fasi);
  const durata = durataTotale({ fasi });
  const pianoRate = bozza.pianoPagamenti.rate;
  const rate = pianoRate.map(r => {
    const p = perc(r.percentuale);
    return { rata: r, percentuale: p, importo: p == null ? 0 : arrotondaDecimale(netto * p / 100), giorno: giornoIncasso(r, durata) };
  });
  const sommaPercentuali = arrotondaDecimale(rate.reduce((s, r) => s + (r.percentuale ?? 0), 0), 2);
  // Con le rate al 100% l'ultima prende il resto: la somma degli importi torna al centesimo con l'imponibile.
  if (rate.length && Math.abs(sommaPercentuali - 100) <= 0.01 && rate.every(r => r.percentuale != null)) {
    const altre = rate.slice(0, -1).reduce((t, r) => t + r.importo, 0);
    rate[rate.length - 1].importo = arrotondaDecimale(netto - altre);
  }
  const errorePiano = !pianoRate.length ? "" : rate.some(r => r.percentuale == null) ? "Scrivi la percentuale di ogni rata." : Math.abs(sommaPercentuali - 100) > 0.01 ? `Le rate sommano il ${sommaPercentuali.toLocaleString("it-IT")}%: devono fare 100%.` : "";

  // Flusso di cassa: solo con cronoprogramma, piano valido e costi stimati.
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
    const ultimo = Math.max(durata, ...rate.map(r => r.giorno));
    const incassoGiorno = new Array(ultimo + 1).fill(0);
    for (const r of rate) incassoGiorno[r.giorno] += r.importo;
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
  const ultimaRata = rate.reduce((max, r) => Math.max(max, r.percentuale != null && (r.rata.quando === "fine" || r.rata.quando === "collaudo") ? r.percentuale : 0), 0);
  if (ultimaRata > 40) rischi.push({ livello: "medio", testo: `Il ${ultimaRata}% arriva a fine lavori: è la parte che si incassa con più fatica.` });

  return { totaleLavori, sconto, netto, costo, vociSenzaCosto, margine, marginePerc, perCapitolo, rate, sommaPercentuali, errorePiano, cassa, esposizioneMassima, giornoEsposizione, accontoConsigliato, rischi };
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
