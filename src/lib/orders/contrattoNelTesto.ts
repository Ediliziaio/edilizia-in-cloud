/**
 * Il contratto letto dall'AI, ricontrollato sul testo del PDF (17/11/2026).
 *
 * L'AI legge il contratto (generic-doc-ai-extract, contratto_commessa) e restituisce importi, date,
 * rate, cliente. Qui, senza AI, si cerca ogni valore nel testo delle pagine: trovato = si dice a che
 * pagina; non trovato = «da controllare» (l'AI l'ha calcolato, o l'ha letto male, o inventato).
 * È lo stesso principio della lettura dei documenti dei lavori pubblici (pagina + citazione), fatto
 * a valle: funziona con la funzione già pubblicata e non costa chiamate.
 *
 * Un PDF scansionato non ha testo: allora non si dice niente (`senzaTesto`), non «tutto da controllare».
 */
import type { ContractExtract } from "./contractExtract";

export interface CampoNelTesto {
  chiave: string;
  etichetta: string;
  valore: string;
  /** Pagina (da 1) dove il valore compare; null = non trovato nel testo. */
  pagina: number | null;
  /** Il pezzo di testo attorno al valore trovato, per mostrarlo. */
  citazione: string | null;
  /** Un valore che di solito si calcola (totale con IVA): non trovarlo è meno grave. */
  calcolabile?: boolean;
}

export interface VerificaNelTesto {
  campi: CampoNelTesto[];
  /** Il PDF non ha testo (scansione): il controllo non si può fare. */
  senzaTesto: boolean;
}

const MINIMO_TESTO = 200;

/** Spazi normali, minuscole, niente accenti: per cercare senza badare a come è scritto. */
export function normalizza(s: string): string {
  return s.replace(/[\u00a0\u202f]/g, " ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

const conPunti = (intero: string) => intero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Come può essere scritto un importo in un contratto italiano: 12.345,67 · 12345,67 · 12.345 · 12345.67. */
export function variantiImporto(n: number): string[] {
  const assoluto = Math.abs(n);
  const [intero, dec] = assoluto.toFixed(2).split(".");
  const v = new Set<string>([`${conPunti(intero)},${dec}`, `${intero},${dec}`, `${intero}.${dec}`, `${conPunti(intero).replace(/\./g, " ")},${dec}`]);
  if (dec === "00") { v.add(conPunti(intero)); if (intero.length >= 4) v.add(intero); v.add(`${conPunti(intero)},-`); }
  else if (dec.endsWith("0")) v.add(`${conPunti(intero)},${dec[0]}`);
  return [...v];
}

export function variantiPercentuale(p: number): string[] {
  const s = Number.isInteger(p) ? String(p) : String(p).replace(".", ",");
  return [`${s}%`, `${s} %`, `${s},00%`, `${s},00 %`, `${s} per cento`];
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** 2026-03-05 → 05/03/2026 · 5/3/2026 · 05-03-2026 · 05.03.2026 · 05/03/26 · 5 marzo 2026. */
export function variantiData(iso: string): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return [];
  const [, a, me, g] = m;
  const gg = String(Number(g)), mm = String(Number(me));
  return [
    `${g}/${me}/${a}`, `${gg}/${mm}/${a}`, `${g}-${me}-${a}`, `${g}.${me}.${a}`, `${g}/${me}/${a.slice(2)}`,
    `${gg} ${MESI[Number(me) - 1]} ${a}`, `${g} ${MESI[Number(me) - 1]} ${a}`,
  ];
}

/** La prima pagina che contiene una delle scritte, non attaccata ad altre cifre (12.345 non vale per 112.345). */
export function cercaNelTesto(pagine: string[], varianti: string[]): { pagina: number; citazione: string } | null {
  const norme = pagine.map(normalizza);
  for (const v of varianti.map(normalizza)) {
    const re = new RegExp(`(^|[^\\d.,])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d]|[.,]\\d)`);
    for (let i = 0; i < norme.length; i++) {
      const t = re.exec(norme[i]);
      if (t) {
        const da = Math.max(0, t.index - 40);
        return { pagina: i + 1, citazione: norme[i].slice(da, t.index + t[0].length + 40).trim() };
      }
    }
  }
  return null;
}

/** Il nome del cliente: basta che le parole lunghe compaiano tutte nella stessa pagina. */
function cercaNome(pagine: string[], nome: string): { pagina: number; citazione: string } | null {
  const parole = normalizza(nome).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((p) => p.length >= 3 && !["srl", "spa", "snc", "sas", "s.r.l"].includes(p));
  if (!parole.length) return null;
  const norme = pagine.map((p) => normalizza(p).replace(/[^a-z0-9 ]/g, " "));
  for (let i = 0; i < norme.length; i++) {
    if (parole.every((p) => norme[i].includes(p))) {
      const k = norme[i].indexOf(parole[0]);
      return { pagina: i + 1, citazione: norme[i].slice(Math.max(0, k - 20), k + 60).trim() };
    }
  }
  return null;
}

const euro = (n: number) => `${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const dataIt = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function verificaContrattoNelTesto(e: ContractExtract, pagine: string[]): VerificaNelTesto {
  const testo = pagine.join(" ").replace(/\s+/g, " ").trim();
  if (testo.length < MINIMO_TESTO) return { campi: [], senzaTesto: true };
  const campi: CampoNelTesto[] = [];
  const aggiungi = (chiave: string, etichetta: string, valore: string, trovato: { pagina: number; citazione: string } | null, calcolabile?: boolean) =>
    campi.push({ chiave, etichetta, valore, pagina: trovato?.pagina ?? null, citazione: trovato?.citazione ?? null, calcolabile });
  const importo = (chiave: string, etichetta: string, n: number | null | undefined, calcolabile?: boolean) => {
    if (n == null || !Number.isFinite(n) || n === 0) return;
    aggiungi(chiave, etichetta, euro(n), cercaNelTesto(pagine, variantiImporto(n)), calcolabile);
  };
  const percentuale = (chiave: string, etichetta: string, p: number | null | undefined) => {
    if (p == null || !Number.isFinite(p)) return;
    aggiungi(chiave, etichetta, `${String(p).replace(".", ",")}%`, cercaNelTesto(pagine, variantiPercentuale(p)));
  };
  const data = (chiave: string, etichetta: string, iso: string | null | undefined) => {
    if (!iso) return;
    aggiungi(chiave, etichetta, dataIt(iso), cercaNelTesto(pagine, variantiData(iso)));
  };

  if (e.cliente.nome_completo) aggiungi("cliente.nome", "Cliente", e.cliente.nome_completo, cercaNome(pagine, e.cliente.nome_completo));
  if (e.cliente.partita_iva) aggiungi("cliente.piva", "Partita IVA", e.cliente.partita_iva, cercaNelTesto(pagine, [e.cliente.partita_iva.replace(/^IT/i, "")]));
  if (e.cliente.codice_fiscale) aggiungi("cliente.cf", "Codice fiscale", e.cliente.codice_fiscale, cercaNelTesto(pagine, [e.cliente.codice_fiscale]));
  importo("importo", "Importo dei lavori", e.importo_totale_eur);
  percentuale("iva", "IVA", e.iva_pct);
  importo("ivato", "Totale con IVA", e.importo_totale_ivato_eur, true);
  const da = e.dati_appalto;
  if (da) {
    importo("appalto.base", "Importo a base", da.importo_base_eur);
    percentuale("appalto.ribasso", "Ribasso", da.ribasso_pct);
    importo("appalto.sicurezza", "Oneri della sicurezza", da.oneri_sicurezza_eur);
    percentuale("appalto.ritenuta", "Ritenuta di garanzia", da.ritenuta_pct);
  }
  data("data_documento", "Data del contratto", e.data_documento);
  data("inizio", "Inizio lavori", e.data_inizio_lavori);
  data("fine", "Fine lavori", e.data_fine_lavori);
  e.fasi_pagamento.forEach((f, i) => {
    const nome = `Rata ${i + 1}${f.descrizione ? ` · ${f.descrizione.slice(0, 40)}` : ""}`;
    if (f.importo_eur == null || f.importo_eur === 0) { percentuale(`rata.${i + 1}`, nome, f.percentuale); return; }
    let trovato = cercaNelTesto(pagine, variantiImporto(f.importo_eur));
    // Rata scritta solo in percentuale: vale se la percentuale c'è e l'importo ne è il conto giusto.
    const base = e.importo_totale_eur ?? e.importo_totale_ivato_eur;
    if (!trovato && f.percentuale != null && base && Math.abs(f.importo_eur - (base * f.percentuale) / 100) <= 1) {
      trovato = cercaNelTesto(pagine, variantiPercentuale(f.percentuale));
    }
    aggiungi(`rata.${i + 1}`, nome, euro(f.importo_eur), trovato);
  });
  return { campi, senzaTesto: false };
}

/** Quelli da guardare: non trovati e non semplicemente calcolabili. */
export function daControllare(v: VerificaNelTesto): CampoNelTesto[] {
  return v.campi.filter((c) => c.pagina == null && !c.calcolabile);
}
