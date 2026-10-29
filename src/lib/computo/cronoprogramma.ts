/**
 * Il cronoprogramma dei lavori del preventivo con computo (29/10/2026): le
 * fasi in giorni lavorativi (lunedì-venerdì) a partire da una data, come le
 * scrive un'impresa sul diagramma di Gantt del preventivo. Lo propone Silvio
 * dalle voci del computo (`computo-cronoprogramma`), oppure si parte dai
 * capitoli; poi si corregge a mano. Esce nel PDF in una pagina sua.
 */
import { arrotondaDecimale, calcolaVoce, type BozzaComputo } from "./editorNativo";
import { cronoprogrammaSchema, type Cronoprogramma, type FaseCrono } from "./cronoprogrammaSchema";

export { cronoprogrammaSchema, type Cronoprogramma, type FaseCrono };

export const cronoprogrammaVuoto = (): Cronoprogramma => cronoprogrammaSchema.parse({});

/** Il giorno lavorativo dell'ultima fase: la durata complessiva del cantiere. */
export const durataTotale = (c: Pick<Cronoprogramma, "fasi">) => c.fasi.reduce((max, f) => Math.max(max, f.inizio + f.durata - 1), 0);

/** «gg/mm/aaaa» → Date a mezzogiorno (niente salti di fuso). */
export function leggiData(s: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** La data del giorno lavorativo n (1 = la data d'inizio, o il lunedì dopo se cade nel fine settimana). */
export function dataDelGiorno(inizio: Date, n: number): Date {
  const d = new Date(inizio);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  for (let k = 1; k < n;) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) k++; }
  return d;
}
export const dataBreve = (d: Date) => d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });

/** Le fasi in ordine di partenza, i numeri ripuliti: inizio e durata interi e positivi. */
export function normalizzaFasi(fasi: FaseCrono[]): FaseCrono[] {
  return fasi
    .map(f => ({ ...f, nome: f.nome.trim().slice(0, 200) || "Fase", inizio: Math.max(1, Math.round(f.inizio) || 1), durata: Math.max(1, Math.round(f.durata) || 1) }))
    .sort((a, b) => a.inizio - b.inizio || a.durata - b.durata)
    .slice(0, 60);
}

/**
 * Senza AI: una fase per capitolo, una dopo l'altra, lunga quanto pesa il
 * capitolo (circa una giornata di squadra ogni 1.500 € di lavori, almeno un
 * giorno). È una base da correggere, e lo dice la nota.
 */
export function cronoDaCapitoli(bozza: BozzaComputo, dataInizio = ""): Cronoprogramma {
  const capitoli = new Map<string, number>();
  for (const v of bozza.voci) {
    const nome = v.capitolo.trim() || "Opere edili";
    capitoli.set(nome, (capitoli.get(nome) ?? 0) + (calcolaVoce(v).importo ?? 0));
  }
  let giorno = 1;
  const fasi = [...capitoli].map(([nome, importo]) => {
    const durata = Math.min(60, Math.max(1, Math.round(arrotondaDecimale(importo / 1500, 0))));
    const fase = { id: crypto.randomUUID(), nome, inizio: giorno, durata, nota: "" };
    giorno += durata;
    return fase;
  });
  return { dataInizio, fasi, nota: "Durate stimate dal valore dei capitoli: correggile con i tempi reali delle tue squadre." };
}

/** Quello che serve a Silvio per proporre le fasi: capitoli e voci, senza prezzi unitari. */
export function richiestaCrono(bozza: BozzaComputo) {
  const capitoli = new Map<string, { nome: string; importo: number; voci: { descrizione: string; unita: string; quantita: number | null }[] }>();
  for (const v of bozza.voci) {
    const nome = v.capitolo.trim() || "Opere edili";
    const c = capitoli.get(nome) ?? { nome, importo: 0, voci: [] };
    const r = calcolaVoce(v);
    c.importo += r.importo ?? 0;
    if (c.voci.length < 40) c.voci.push({ descrizione: v.descrizione.trim().split("\n")[0].slice(0, 200), unita: v.unita, quantita: r.quantita });
    capitoli.set(nome, c);
  }
  return { titolo: bozza.titolo, oggetto: bozza.oggetto, indirizzo: bozza.indirizzo, capitoli: [...capitoli.values()].slice(0, 40).map(c => ({ ...c, importo: Math.round(c.importo) })) };
}
