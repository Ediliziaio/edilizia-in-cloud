// src/lib/orders/generali/simulatoreOperazione.ts
// «Diventa operazione»: dall'ipotesi scelta, quello che serve a creare la commessa generale
// in una volta sola (RPC generale_ipotesi_diventa_operazione): la generale, la prima versione
// del piano economico con voci e mesi, le fonti e, se si vuole, le unità in serie.
// Le voci e le fonti sono quelle del simulatore (vociPiano, fontiIpotesi): l'operazione
// parte con gli stessi numeri visti nell'ipotesi.
import { MAX_SERIE, type UnitaDaCreare } from "@/lib/orders/generali/unitaSerie";
import { arrotonda } from "@/lib/orders/generali/pianoConti";
import { fontiIpotesi, unitaTotali, vociPiano, type Ipotesi, type ModelloSimulato } from "@/lib/orders/generali/simulatore";

/** Una voce come la vuole generale_piano_nuova_versione (p_voci). */
export interface VoceDaCreare {
  tipo: "ricavo" | "costo";
  categoria: string;
  descrizione: string;
  importo: number;
  /** Primo giorno del mese: «2027-03-01». */
  mese: string;
  durata_mesi: number;
  ordine: number;
}

/** Una fonte come la vuole generale_fonti. */
export interface FonteDaCreare {
  tipo: "propri" | "capitale" | "prestito" | "banca";
  nome: string;
  soggetto: "persona" | "societa";
  impegno: number;
  quota_utile_pct: number | null;
  tasso_pct: number | null;
  data_inizio: string;
  forma: string | null;
  spese_iniziali: number;
  rimborso: "scadenza" | "rate" | "vendite";
  ordine: number;
}

export interface OperazioneDaCreare {
  modello: ModelloSimulato;
  nome: string;
  /** Ricavi previsti: il valore della generale. */
  valore: number;
  voci: VoceDaCreare[];
  fonti: FonteDaCreare[];
  unita: UnitaDaCreare[];
}

/** Il prefisso delle sigle di una tipologia: la sua iniziale, oppure A, B, C… se si ripete. */
function prefissi(nomi: string[]): string[] {
  const usati = new Set<string>();
  return nomi.map((nome, i) => {
    const iniziale = nome.trim().charAt(0).toUpperCase();
    let p = /[A-Z]/.test(iniziale) ? iniziale : String.fromCharCode(65 + (i % 26));
    for (let k = 0; usati.has(p) && k < 26; k++) p = String.fromCharCode(65 + ((p.charCodeAt(0) - 64) % 26));
    usati.add(p);
    return p;
  });
}

/** Le unità in serie dalle tipologie: A1…A6 per gli appartamenti, B1, B2 per i box. */
export function unitaDaIpotesi(ip: Ipotesi): UnitaDaCreare[] {
  const p = prefissi(ip.tipologie.map((t) => t.nome));
  return ip.tipologie.flatMap((t, i) => Array.from({ length: Math.max(0, Math.round(t.quante)) }, (_, k): UnitaDaCreare => ({
    sigla: `${p[i]}${k + 1}`,
    edificio: null,
    piano: null,
    tipologia: t.nome.trim() || null,
    mq_commerciali: t.mq > 0 ? arrotonda(t.mq) : null,
    millesimi: null,
    prezzo_listino: t.mq > 0 && t.prezzoMq > 0 ? arrotonda(t.mq * t.prezzoMq) : null,
  })));
}

/** Perché le unità non si possono creare insieme all'operazione; null = si può. */
export function motivoSenzaUnita(ip: Ipotesi): string | null {
  const n = unitaTotali(ip);
  if (n <= 0) return "Non ci sono unità da creare.";
  if (n > MAX_SERIE) return `Sono ${n} unità: in serie se ne creano al massimo ${MAX_SERIE} alla volta. Le aggiungi dopo, dalla scheda Unità.`;
  return null;
}

/** Tutto ciò che crea «Diventa operazione». */
export function operazioneDaIpotesi(ip: Ipotesi, opzioni: { nome: string; conUnita: boolean }): OperazioneDaCreare {
  const voci = vociPiano(ip);
  const fonti = fontiIpotesi(ip).map((f, i): FonteDaCreare => ({
    tipo: f.tipo === "finanziamento" ? "banca" : f.tipo,
    nome: f.nome,
    soggetto: f.soggetto,
    impegno: arrotonda(f.impegno),
    quota_utile_pct: f.quotaUtilePct,
    tasso_pct: f.tassoPct,
    data_inizio: f.dataInizio ?? `${ip.inizio}-01`,
    forma: f.forma ?? null,
    spese_iniziali: arrotonda(f.speseIniziali ?? 0),
    rimborso: f.rimborso ?? "scadenza",
    ordine: i + 1,
  }));
  return {
    modello: ip.modello,
    nome: opzioni.nome.trim(),
    valore: arrotonda(voci.filter((v) => v.tipo === "ricavo").reduce((t, v) => t + v.importo, 0)),
    voci: voci.map((v, i) => ({
      tipo: v.tipo,
      categoria: v.categoria,
      descrizione: v.descrizione.slice(0, 300),
      importo: v.importo,
      mese: `${v.mese}-01`,
      durata_mesi: v.durataMesi,
      ordine: i + 1,
    })),
    fonti,
    unita: opzioni.conUnita && motivoSenzaUnita(ip) === null ? unitaDaIpotesi(ip) : [],
  };
}
