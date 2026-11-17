/**
 * Noli, servizi e manodopera del computo (17/11/2026).
 *
 * Le voci della sicurezza e delle opere provvisionali (ponteggi, baracche, bagno chimico, estintori,
 * cartelli, piattaforma con operatore) e le ore di installatore non sono materiali da ordinare: sono
 * noli con una durata, prestazioni o ore. La distinta le escludeva con un motivo unico («oneri della
 * sicurezza»); il bagno chimico computato «13 cad» sembrava 13 bagni, ed è 1 bagno per 13 mesi.
 *
 * Qui ogni voce riceve il suo tipo e, quando le misure lo dicono, la durata in mesi e i pezzi:
 * «Per 13 mesi (13*20)» = 20 cartelli per 13 mesi; «Durata cantiere 9 mesi (8*2407,80)» = 2.407,80 m²
 * per 8 mesi successivi; «130 giorni per 8 ore» = 1.040 ore.
 */
import { normalizzaTesto, type VoceComputo } from "./generaDistinta";

export type TipoServizio = "nolo" | "manodopera" | "prestazione" | "impianto_cantiere" | "trasferimento";

export interface ServizioComputo {
  voce_id: string;
  numero: string | null;
  tipo: TipoServizio;
  descrizione: string;
  quantita: number;
  unita: string;
  /** Mesi di nolo letti dalle misure o dalla descrizione. */
  mesi: number | null;
  /** Pezzi (o m²) noleggiati, quando la quantità è pezzi × mesi. */
  pezzi: number | null;
  nota: string;
}

type MisuraTesto = { descrizione?: string | null; parti_uguali?: number | null; quantita?: number | null };
export type VoceServizio = VoceComputo & { misure?: MisuraTesto[] | null; prezzo_unitario_computo?: number | null };

const ORE = /^(h|ora|ore)$/i;
const MENSILE = /(per ogni mese|costo di utilizzo mensile|utilizzo mensile|mese successivo|mesi successivi|per i primi 30 giorni|valutato per ogni mese|ogni mese di utilizzo|nolo|noleggio)/;
const MANODOPERA = /(installatore|operaio|manodopera|riunion|formazione|ad personam|coordinament)/;
const NOLO_A_ORE = /(piattaforma|autogru|gru\b|escavator|sollevator|con operatore|a caldo|a freddo)/;
const PRESTAZIONE = /(progettazion|pimus|verifica|ricerca sottoservizi|pratica|collaud|attivazion|messa in funzione|avviament|adeguament|prescrizion|smontaggio|trasporto|conferiment|discarica)/;
const IMPIANTO_CANTIERE = /(impianto elettrico di cantiere|quadro elettrico generale|dispersori di terra)/;

const PEZZI_O_MQ = /^(cad|cad\.|cadauno|cadauna|pz|n|nr|mq|m2|m²)$/i;
const testoVoce = (v: VoceComputo) => normalizzaTesto(`${v.descrizione_breve} ${v.descrizione_estesa ?? ""}`);
const numero = (s: string) => Number(s.replace(",", "."));

/** I mesi scritti nelle misure o nella descrizione: «per 13 mesi», «durata 12mesi», «Durata cantiere 9 mesi». */
export function mesiDaTesto(t: string): number | null {
  const m = /(?:per|durata(?:\s+cantiere)?(?:\s+di)?|per la durata di)\s+(\d+(?:[.,]\d+)?)\s*mes/i.exec(t) ?? /\b(\d+(?:[.,]\d+)?)\s*mesi\b/i.exec(t);
  return m ? numero(m[1]) : null;
}

/** «(par.ug.=13*20)» → [13, 20]. */
function fattori(t: string): number[] {
  const m = /par\.?\s*ug\.?\s*=\s*([\d.,*\s]+)/i.exec(t);
  return m ? m[1].split("*").map((x) => numero(x.trim().replace(/\.(?=\d{3}\b)/g, ""))).filter((x) => x > 0) : [];
}

export function classificaServizio(v: VoceServizio): ServizioComputo | null {
  const t = testoVoce(v);
  const unita = (v.unita_misura ?? "").trim();
  const q = Number(v.quantita ?? 0);
  const misure = (v.misure ?? []).map((m) => m.descrizione ?? "").join(" ; ");
  const base = { voce_id: v.id, numero: v.numero_ordine ?? null, descrizione: v.descrizione_breve.split("\n")[0].slice(0, 160), quantita: q, unita };

  if (v.is_detrazione || (v.prezzo_unitario_computo != null && Math.abs(Math.abs(v.prezzo_unitario_computo) - 1) < 0.0001)) {
    return { ...base, tipo: "trasferimento", mesi: null, pezzi: null, nota: "Sposta un importo fra categorie: non è un costo da sostenere." };
  }

  // Le ore: manodopera, o nolo di un mezzo con operatore.
  if (ORE.test(unita)) {
    if (NOLO_A_ORE.test(t)) return { ...base, tipo: "nolo", mesi: null, pezzi: null, nota: `${q.toLocaleString("it-IT")} ore di nolo con operatore: non aggiungere le ore dello stesso operatore.` };
    if (MANODOPERA.test(t) || v.is_sicurezza) return { ...base, tipo: "manodopera", mesi: null, pezzi: null, nota: `${q.toLocaleString("it-IT")} ore: confrontale con le voci «fornitura e posa» per non pagarle due volte.` };
  }

  // Da qui solo le voci della sicurezza e delle opere provvisionali: fuori, «trasporto» o «smontaggio»
  // compaiono in mille voci di lavoro.
  if (!v.is_sicurezza) return null;

  if (IMPIANTO_CANTIERE.test(t)) return { ...base, tipo: "impianto_cantiere", mesi: mesiDaTesto(misure), pezzi: null, nota: "Impianto di cantiere a corpo per tutta la durata: un contratto con l'elettricista." };

  if (MENSILE.test(t) || /mes/i.test(misure)) {
    const mesi = mesiDaTesto(misure) ?? mesiDaTesto(t);
    // I pezzi: la quantità divisa per i mesi, o il fattore che non è il numero di mesi.
    const f = fattori(misure);
    let pezzi: number | null = null;
    // «13*20» con 13 mesi: 20 pezzi. «8*2407,80» con 9 mesi di cantiere: 8 mesi successivi al primo, 2.407,80 m².
    if (mesi && f.length === 2) pezzi = f.some((x) => Math.abs(x - mesi) < 0.001) ? f.find((x) => Math.abs(x - mesi) > 0.001) ?? f[1] : Math.max(...f);
    else if (mesi && q > 0 && Math.abs(q / mesi - Math.round(q / mesi)) < 0.001) pezzi = q / mesi;
    else if (/successiv/.test(t) && f.length === 2) pezzi = f[1];
    const unitaPezzi = /^(mq|m2|m²)$/i.test(unita) ? "m²" : "pz";
    // Prezzo «mensile» senza i mesi nelle misure: «2*13» sono 2 pezzi per 13 mesi, «13» è 1 pezzo per
    // 13 mesi (come li legge chi conosce il computo). Da confermare: lo dice la nota.
    if (!mesi && /(mensile|ogni mese|per mese)/.test(t) && PEZZI_O_MQ.test(unita)) {
      const [a, b] = f.length === 2 ? [Math.min(...f), Math.max(...f)] : [1, q];
      if (b > 1 && Number.isInteger(b) && b <= 60) {
        return { ...base, tipo: "nolo", mesi: b, pezzi: a,
          nota: `${a.toLocaleString("it-IT")} ${unitaPezzi} per ${b.toLocaleString("it-IT")} mesi (letto dal prezzo mensile, da confermare): un nolo, non ${q.toLocaleString("it-IT")} pezzi da comprare.` };
      }
    }
    const nota = mesi && pezzi
      ? `${pezzi.toLocaleString("it-IT")} ${unitaPezzi} per ${mesi.toLocaleString("it-IT")} mesi: un nolo, non ${q.toLocaleString("it-IT")} pezzi da comprare.`
      : mesi ? `Nolo per ${mesi.toLocaleString("it-IT")} mesi.` : "Nolo: la quantità è pezzi × mesi, chiarisci la durata.";
    return { ...base, tipo: "nolo", mesi, pezzi, nota };
  }

  if (PRESTAZIONE.test(t) || /a corpo/i.test(unita) || v.a_corpo) {
    return { ...base, tipo: "prestazione", mesi: null, pezzi: null, nota: "Prestazione o opera a corpo: un contratto o una prestazione, non materiale." };
  }
  // Sicurezza senza durata: dotazioni di cantiere (recinzioni, reti, puntelli) a nolo o a consumo.
  return { ...base, tipo: "nolo", mesi: mesiDaTesto(misure), pezzi: null, nota: "Dotazione di cantiere: nolo o fornitura, da decidere col fornitore." };
}

export const ETICHETTA_SERVIZIO: Record<TipoServizio, string> = {
  nolo: "Nolo", manodopera: "Ore", prestazione: "Prestazione", impianto_cantiere: "Impianto di cantiere", trasferimento: "Spostamento di importo",
};

export function serviziDelComputo(voci: VoceServizio[]): ServizioComputo[] {
  return voci.map(classificaServizio).filter((s): s is ServizioComputo => !!s);
}
