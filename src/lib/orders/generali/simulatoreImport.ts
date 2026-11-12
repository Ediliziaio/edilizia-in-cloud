import type { StoredContractFile } from "../contractPreparation";
import { meseImportato } from "./businessPlanAi";
import { DA_STIMARE } from "./budgetCompletezza";
import type { VoceNuova } from "./pianoCategorie";
import type { Ipotesi, ModelloSimulato } from "./simulatore";

export interface OrigineIpotesi {
  originale: StoredContractFile; hash: string; scenario: string; confermata: boolean; avvisi: string[];
}
const oggetto = (x: unknown): Record<string, unknown> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
const n = (x: unknown, fallback = 0) => typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : fallback;
const delta = (da: string, a: string) => { const [y, m] = da.split("-").map(Number), [yy, mm] = a.split("-").map(Number); return (yy - y) * 12 + mm - m; };

/** Conserva il dettaglio nei ritocchi e nelle voci aggiunte del simulatore nativo. */
export function ipotesiDaPiano(voci: VoceNuova[], parametri: Record<string, unknown>, modello: ModelloSimulato, origine: Omit<OrigineIpotesi, "confermata" | "avvisi">): Ipotesi {
  if (!voci.length || voci.some(v => !meseImportato(v.mese) || !Number.isFinite(v.importo) || v.importo < 0 || v.nota?.includes(DA_STIMARE))) throw new Error("Completa importi e mesi nell’anteprima prima di trasferire il piano al simulatore.");
  const inizio = [meseImportato(parametri.inizio), ...voci.map(v => v.mese!)].filter((x): x is string => !!x).sort()[0];
  const mutuo = oggetto(parametri.mutuo);
  const ip: Ipotesi = {
    versione: 1, modello: parametri.modello === "sviluppo" || parametri.modello === "compravendita" ? parametri.modello : modello, inizio,
    acquisto: 0, impostePct: 0, costoMq: 0, oneri: 0, tecniciPct: 0, commercializzazionePct: 0, imprevistiPct: 0,
    mesiPermessi: n(parametri.mesiPermessi), mesiLavori: n(parametri.mesiLavori), mesiVendite: n(parametri.mesiVendite, 1), venditeDopoLavori: typeof parametri.venditeDopoLavori === "number" ? parametri.venditeDopoLavori : 0,
    mezziPropri: n(parametri.mezziPropri),
    mutuo: { importo: n(mutuo.importo), tassoPct: n(mutuo.tassoPct), speseIniziali: n(mutuo.speseIniziali), rimborso: mutuo.rimborso === "scadenza" || mutuo.rimborso === "rate" ? mutuo.rimborso : "vendite" },
    tipologie: (Array.isArray(parametri.tipologie) ? parametri.tipologie : []).map((t, i) => { const p = oggetto(t); return { id: `import-${i + 1}`, nome: typeof p.nome === "string" ? p.nome : "Unità", quante: Math.round(n(p.quante)), mq: n(p.mq), prezzoMq: n(p.prezzoMq), costoMq: p.costoMq == null ? null : n(p.costoMq) }; }).filter(t => t.quante > 0 && t.mq > 0),
    investitori: (Array.isArray(parametri.investitori) ? parametri.investitori : []).map((t, i) => { const p = oggetto(t); return { id: `fonte-import-${i + 1}`, nome: typeof p.nome === "string" ? p.nome : "Investitore", tipo: p.tipo === "prestito" ? "prestito" as const : "capitale" as const, importo: n(p.importo), tassoPct: p.tassoPct == null ? null : n(p.tassoPct), quotaUtilePct: p.quotaUtilePct == null ? null : n(p.quotaUtilePct) }; }),
    ritocchi: {}, aggiunte: [],
  };
  const mq = ip.tipologie.reduce((s, t) => s + t.quante * t.mq, 0);
  const ricavi = voci.filter(v => v.tipo === "ricavo");
  const totaleRicavi = ricavi.reduce((s, v) => s + v.importo, 0);
  const daTipologie = ip.tipologie.reduce((s, t) => s + t.quante * t.mq * t.prezzoMq, 0);
  const ricaviNativi = ricavi.length === 1 && ip.tipologie.length > 0 && Math.abs(totaleRicavi - daTipologie) < .01;
  for (const tp of ip.tipologie) ip.ritocchi[`vendite:${tp.id}`] = ricaviNativi ? { dopoMesi: delta(inizio, ricavi[0].mese!), durataMesi: ricavi[0].durataMesi } : { importo: 0 };
  const usati = new Set<string>();
  for (const [i, v] of voci.entries()) {
    if (v.tipo === "ricavo" && ricaviNativi) continue;
    const chiave = v.tipo !== "costo" ? undefined : /notai|imposte.*acquist/i.test(v.descrizione) ? "imposte" : v.categoria === "terreno" ? "acquisto" : ({ costruzione: "costruzione", progettazione: "tecnici", oneri: "oneri", imprevisti: "imprevisti", commercializzazione: "commercializzazione" } as Record<string,string>)[v.categoria];
    if (chiave && !usati.has(chiave)) {
      usati.add(chiave); ip.ritocchi[chiave] = { importo: v.importo, dopoMesi: delta(inizio, v.mese!), durataMesi: v.durataMesi };
      if (chiave === "acquisto") ip.acquisto = v.importo;
      if (chiave === "costruzione" && mq > 0) ip.costoMq = v.importo / mq;
      if (chiave === "oneri") ip.oneri = v.importo;
    } else ip.aggiunte.push({ id: `import-${i + 1}`, tipo: v.tipo, categoria: v.categoria, descrizione: v.descrizione, importo: v.importo, dopoMesi: delta(inizio, v.mese!), durataMesi: v.durataMesi });
  }
  const costruzione = ip.ritocchi.costruzione?.importo ?? 0;
  ip.impostePct = ip.acquisto > 0 ? (ip.ritocchi.imposte?.importo ?? 0) / ip.acquisto * 100 : 0;
  ip.tecniciPct = costruzione > 0 ? (ip.ritocchi.tecnici?.importo ?? 0) / costruzione * 100 : 0;
  ip.imprevistiPct = costruzione > 0 ? (ip.ritocchi.imprevisti?.importo ?? 0) / costruzione * 100 : 0;
  ip.commercializzazionePct = totaleRicavi > 0 ? (ip.ritocchi.commercializzazione?.importo ?? 0) / totaleRicavi * 100 : 0;
  // I mesi confermati nelle voci prevalgono sui riepiloghi temporali letti dall’AI.
  const cantieri = voci.filter(v => v.tipo === "costo" && v.categoria === "costruzione");
  if (cantieri.length) {
    ip.mesiPermessi = Math.min(...cantieri.map(v => delta(inizio, v.mese!)));
    ip.mesiLavori = Math.max(...cantieri.map(v => delta(inizio, v.mese!) + v.durataMesi)) - ip.mesiPermessi;
  }
  if (ricavi.length) {
    const inizioVendite = Math.min(...ricavi.map(v => delta(inizio, v.mese!)));
    ip.venditeDopoLavori = inizioVendite - ip.mesiPermessi - ip.mesiLavori;
    ip.mesiVendite = Math.max(...ricavi.map(v => delta(inizio, v.mese!) + v.durataMesi)) - inizioVendite;
  }
  ip.importazione = { ...origine, confermata: false, avvisi: [
    "Verifica finanziamenti, tassi, unità e superfici. I dati assenti restano a zero o vuoti, senza esempi precompilati.",
    "Le voci importate conservano importi e mesi nel Dettaglio voci. Togli un ritocco per ricalcolarlo dai parametri.",
    ...(!ip.tipologie.length ? ["Unità e superfici non leggibili: non verranno create unità automaticamente."] : []),
    ...(ip.mutuo.importo > 0 && mutuo.tassoPct == null ? ["Tasso del mutuo mancante: completalo prima di confermare."] : []),
  ] };
  return ip;
}
