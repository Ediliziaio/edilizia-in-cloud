import type { VoceComputo } from "./generaDistinta";

export type FamigliaAbaco = "serramento" | "avvolgibile" | "oscurante";
export interface PosizioneAbaco {
  id: string; voce_id: string; numero_voce: string; ordine_misura: number;
  famiglia: FamigliaAbaco; tipologia: string; ubicazione: string; prospetto: string;
  descrizione_misura: string; formula: string | null;
  pezzi: number | null; fonte_pezzi: "misure" | "formula_contabile" | "minimo_contabile" | "mancante";
  pezzi_ipotizzati?: number | null;
  larghezza_m: number | null; altezza_m: number | null; superficie_contabile_mq: number;
  minimo_fatturabile: boolean; avvisi: string[];
  riferimento_misure?: { voce_id: string; numero_voce: string };
}
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const n = (s: string) => Number(s.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
const vicino = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.021, Math.abs(b) * 0.001);
const intero = (x: number) => x > 0 && Number.isInteger(x);

export function famigliaAbaco(v: VoceComputo): FamigliaAbaco | null {
  const t = norm(v.descrizione_breve).replace(/^fornitura (?:e (?:posa|collocazione|collocamento|installazione)(?: in opera)? )?(?:di |dei |degli |delle )?/, "");
  if (/^(?:serrament[oi]|finestr[ae]|port[ae][ -]?finestr[ae]|porton[ei])\b/.test(t)) return "serramento";
  if (/^avvolgibil[ei]\b/.test(t)) return "avvolgibile";
  if (/^(?:chiusure oscuranti|pannelli oscuranti|oscurant[ei]|contro\s?sportelli|scuretti|scuri|persiane)\b/.test(t)) return "oscurante";
  return null;
}

/** Un rinvio univoco con identica superficie può riusare le misure complete della voce indicata. */
function misureConRiferimento(v: VoceComputo, voci: VoceComputo[]) {
  const proprie = v.misure ?? [];
  const positive = proprie.filter(m => Number(m.quantita) > 0);
  if (positive.length !== 1 || positive.some(m => Number(m.larghezza) > 0 || Number(m.altezza_peso) > 0)) return { misure: proprie };
  const rinvii = [...(positive[0].descrizione ?? "").matchAll(/vedi\s+voce\s+n[°ºo.]?\s*(\d+)/gi)];
  if (rinvii.length !== 1) return { misure: proprie };
  const fonti = voci.filter(w => w.id !== v.id && w.numero_ordine === rinvii[0][1] && famigliaAbaco(w)
    && w.is_included !== false && !w.is_detrazione && /^(mq|m2|m²)$/i.test(w.unita_misura ?? ""));
  if (fonti.length !== 1) return { misure: proprie };
  const fonte = fonti[0], misure = (fonte.misure ?? []).filter(m => Number(m.quantita) > 0);
  if (!misure.length || !vicino(Number(v.quantita), Number(fonte.quantita))
    || !vicino(Number(positive[0].quantita), Number(v.quantita))
    || !vicino(misure.reduce((s, m) => s + Number(m.quantita), 0), Number(v.quantita))
    || misure.some(m => !(Number(m.larghezza ?? m.lunghezza) > 0) || !(Number(m.altezza_peso) > 0))) return { misure: proprie };
  return { misure, riferimento: { voce_id: fonte.id, numero_voce: fonte.numero_ordine ?? "" } };
}
function contesto(t: string) {
  const unit = [...t.matchAll(/unit[àa]\s+figurativ[ae]\s+[^]*?(?=\s+lato\b|\s+\(?\*?\(?par\.?\s*ug|$)/gi)].at(-1)?.[0]?.trim();
  const lato = /lato\s+(?:nord|sud|est|ovest)(?:\s*-?\s*(?:nord|sud|est|ovest))?/i.exec(t)?.[0];
  return { unit, lato };
}

/** Le righe di misura diventano posizioni; un minimo di fatturazione non diventa mai una dimensione. */
export function abacoDalComputo(voci: VoceComputo[]): PosizioneAbaco[] {
  const righe: PosizioneAbaco[] = [];
  for (const v of voci) {
    const famiglia = famigliaAbaco(v);
    if (!famiglia || v.is_included === false || v.is_detrazione || !/^(mq|m2|m²)$/i.test(v.unita_misura ?? "")) continue;
    const testo = `${v.descrizione_breve} ${v.descrizione_estesa ?? ""}`;
    const tuttiTesti = [testo, ...(v.misure ?? []).map(m => m.descrizione ?? "")].join(" ");
    const min = /min(?:imo)?\.?\s*fatt(?:urabil[ei]|urato)?\.?\s*(\d+(?:[.,]\d+)?)\s*m[q²2]/i.exec(tuttiTesti);
    const minimo = min ? n(min[1]) : null;
    let { unit: ubicazione = "", lato: prospetto = "" } = contesto(testo);
    const tipologia = /(?:finestra|portafinestra)(?:[^:]*?)$/i.exec(v.descrizione_breve.split(/\bDa Abaco\b|\bUnit[àa] Figurativ/i)[0])?.[0]
      ?? (famiglia === "avvolgibile" ? "Avvolgibile in alluminio" : famiglia === "oscurante" ? "Oscurante interno" : "Serramento");
    const sorgente = misureConRiferimento(v, voci);
    sorgente.misure.forEach((m, i) => {
      const q = Number(m.quantita);
      if (!(q > 0)) return;
      const d = m.descrizione ?? "", c = contesto(d);
      if (c.unit) { ubicazione = c.unit; prospetto = c.lato ?? ""; }
      else if (c.lato) prospetto = c.lato;
      else if (/^\d+[a-z](?:_|\s)/i.test(d.trim())) ubicazione = d.replace(/\s*\*\(.*/, "").trim();
      const larghezza = Number(m.larghezza) > 0 ? Number(m.larghezza) : Number(m.lunghezza) > 0 ? Number(m.lunghezza) : null;
      const altezza = Number(m.altezza_peso) > 0 ? Number(m.altezza_peso) : null;
      let pezzi: number | null = null, ipotizzati: number | null = null, fonte: PosizioneAbaco["fonte_pezzi"] = "mancante";
      let minimoContabile = false;
      const avvisi: string[] = [];
      if (sorgente.riferimento) avvisi.push(`Misure richiamate dalla voce ${sorgente.riferimento.numero_voce}: abbinamento documentale, da confermare sul vano per questa fornitura.`);
      if (larghezza && altezza && intero(Number(m.parti_uguali) || 1)
        && vicino((Number(m.parti_uguali) || 1) * larghezza * altezza, q)) {
        pezzi = Number(m.parti_uguali) || 1; fonte = "misure";
      } else if (larghezza && altezza) avvisi.push("Quantità e dimensioni della riga non coincidono: verifica il conteggio.");
      const formula = /par\.?\s*ug\.?\s*=\s*([\d.,*\s]+)/i.exec(d)?.[1]?.trim() ?? m.formula?.trim() ?? null;
      if (pezzi === null && !larghezza && !altezza && formula && /^\d+(?:[.,]\d+)?(?:\s*\*\s*\d+(?:[.,]\d+)?)+$/.test(formula)) {
        const fattori = formula.split("*").map(x => n(x.trim()));
        const aree = fattori.filter(x => !Number.isInteger(x));
        if (aree.length === 1 && vicino(fattori.reduce((a, b) => a * b, 1), q)) {
          const pz = fattori.filter(Number.isInteger).reduce((a, b) => a * b, 1);
          if (intero(pz)) { pezzi = pz; fonte = "formula_contabile"; minimoContabile = minimo !== null && vicino(aree[0], minimo); }
        }
      }
      if (pezzi === null && !larghezza && !altezza && minimo && vicino(q / minimo, Math.round(q / minimo))) {
        ipotizzati = Math.round(q / minimo); fonte = "minimo_contabile"; minimoContabile = true;
        avvisi.push("Il solo minimo fatturato non prova il numero di pezzi: il conteggio proposto è un'ipotesi, non un dato produttivo.");
      }
      if (!larghezza || !altezza) avvisi.push("Larghezza e altezza non riportate: serve il rilievo del vano.");
      if (fonte === "formula_contabile" || fonte === "minimo_contabile") avvisi.push("Pezzi ricostruiti dalla contabilizzazione: da confermare nell'abaco definitivo.");
      if (!ubicazione) avvisi.push("Ubicazione non riportata in questa riga.");
      if (larghezza && altezza) avvisi.push("Misure del computo: verificare sul vano prima della produzione.");
      righe.push({ id: `${v.id}:${i}`, voce_id: v.id, numero_voce: v.numero_ordine ?? v.codice_voce ?? "", ordine_misura: i,
        famiglia, tipologia, ubicazione, prospetto, descrizione_misura: d, formula, pezzi, fonte_pezzi: fonte,
        pezzi_ipotizzati: ipotizzati, larghezza_m: larghezza, altezza_m: altezza, superficie_contabile_mq: q, minimo_fatturabile: minimoContabile, avvisi });
      if (sorgente.riferimento) righe[righe.length - 1].riferimento_misure = sorgente.riferimento;
    });
  }
  return righe;
}

export function riepilogoAbaco(righe: PosizioneAbaco[]) {
  return { posizioni: righe.length, pezzi_ricostruiti: righe.reduce((n, r) => n + (r.pezzi ?? r.pezzi_ipotizzati ?? 0), 0),
    pezzi_da_dimensioni_e_formule: righe.reduce((n, r) => n + (r.pezzi ?? 0), 0),
    pezzi_solo_ipotizzati: righe.reduce((n, r) => n + (r.pezzi_ipotizzati ?? 0), 0),
    posizioni_con_dimensioni: righe.filter(r => r.larghezza_m && r.altezza_m).length,
    posizioni_da_rilevare: righe.filter(r => !r.larghezza_m || !r.altezza_m).length,
    posizioni_senza_conteggio: righe.filter(r => r.pezzi === null).length,
    superficie_contabile_mq: Math.round(righe.reduce((n, r) => n + r.superficie_contabile_mq, 0) * 100) / 100 };
}
