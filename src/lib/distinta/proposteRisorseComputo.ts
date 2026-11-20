import { normalizzaTesto, type VoceComputo } from "./generaDistinta";
import { serviziDelComputo, type PeriodoNolo, type ServizioComputo } from "./serviziComputo";
import { dettagliLottoIncompleto } from "./materialiDocumentali";

export type TipoRisorsa = "nolo" | "servizio" | "manodopera" | "lotto";
export type StatoPropostaRisorsa = "da_completare" | "da_quotare" | "in_gestione" | "esclusa";
export interface PropostaRisorsa {
  id: string; tipo: TipoRisorsa; descrizione: string;
  fonti: { id: string; numero: string | null; quantita: number; unita: string }[];
  fase_ids: string[]; sottofase_ids: string[]; impronta: string;
  quantita: number | null; unita: string; periodi: PeriodoNolo[]; note_origine: string[];
  scelta: { stato: StatoPropostaRisorsa; fornitore: string; dal: string; al: string; note: string;
    quantita?: number | null; unita?: string; periodi?: PeriodoNolo[] };
  da_rivedere?: boolean;
}
export interface PianoRisorse {
  versione: 1; revisione: number; company_id: string; order_id: string; computo_id: string;
  salvato_il: string; salvato_da: string; proposte: PropostaRisorsa[];
}
const famiglia = (t: string) => /^ponteggio a telaio/.test(t) ? "telaio"
  : /^piano di lavoro per ponteggi/.test(t) ? "impalcati"
    : /^ponteggio a tubo giunto/.test(t) ? "tubo_giunto"
      : /^prefabbricato monoblocco/.test(t) ? "monoblocchi" : null;

/** Un unico lotto per avvio, rinnovi e smontaggio. Le risorse condivise non si moltiplicano per fase. */
export function proponiRisorseComputo(voci: VoceComputo[], opzioni: {
  faseDi?: (v: VoceComputo) => string | null;
  sottofasi?: { id: string; computo_voce_id: string | null }[];
  senzaRicetta?: VoceComputo[];
} = {}): PropostaRisorsa[] {
  const perId = new Map(voci.map(v => [v.id, v]));
  const gruppi: { id: string; famiglia: string | null; righe: ServizioComputo[] }[] = [];
  for (const s of serviziDelComputo(voci).filter(s => s.tipo !== "trasferimento")) {
    const v = perId.get(s.voce_id)!;
    const t = normalizzaTesto(`${v.descrizione_breve} ${v.descrizione_estesa ?? ""}`);
    let f = famiglia(t);
    const precedente = gruppi.at(-1);
    if (/^smontaggio a fine lavoro/.test(t) && precedente?.famiglia === "tubo_giunto"
      && precedente.righe.some(r => r.quantita === s.quantita)) f = "tubo_giunto";
    const avvio = /primi 30 giorni|montaggio e smontaggio|posa e rimozione/.test(t);
    const gruppo = f && !avvio ? [...gruppi].reverse().find(g => g.famiglia === f
      && perId.get(g.righe[0].voce_id)?.categoria === v.categoria
      && normalizzaTesto(perId.get(g.righe[0].voce_id)!.descrizione_breve).split(" ").slice(0, 12).join(" ") === t.split(" ").slice(0, 12).join(" ")) : null;
    if (gruppo) gruppo.righe.push(s);
    else if (f === "tubo_giunto" && /^smontaggio a fine lavoro/.test(t) && precedente?.famiglia === f) precedente.righe.push(s);
    else gruppi.push({ id: s.voce_id, famiglia: f, righe: [s] });
  }
  const crea = (righe: ServizioComputo[], id: string, f: string | null): PropostaRisorsa => {
    const primo = righe[0];
    const periodi = righe.flatMap(r => {
      const periodi = r.periodi ?? (r.mesi && r.pezzi
        ? [{ quantita: r.pezzi, mesi: r.mesi, unita: /^(mq|m2|m²)$/i.test(r.unita) ? "m²" : "pz", nota: r.nota }] : []);
      if (f === "telaio" && periodi.length > 1 && periodi.every(p => p.mesi === periodi[0].mesi && p.unita === periodi[0].unita)) {
        return [{ ...periodi[0], quantita: Math.round(periodi.reduce((n, p) => n + p.quantita, 0) * 10000) / 10000,
          nota: periodi.map(p => p.nota).filter(Boolean).join("; ") }];
      }
      return periodi;
    });
    if (f && f !== "monoblocchi" && righe.length > 1 && !primo.periodi?.length && !primo.mesi
      && periodi.length && Math.abs(periodi.reduce((n, p) => n + p.quantita, 0) - primo.quantita) < 0.011) {
      periodi.unshift({ quantita: primo.quantita, mesi: 1, unita: periodi[0].unita, nota: "Primo periodo; i rinnovi sono nelle voci successive." });
    }
    const successivi = righe.find(r => (r.periodi?.length ?? 0) > 0 || r.mesi);
    const quantita = successivi?.pezzi ?? (primo.tipo === "nolo" ? primo.pezzi : primo.quantita);
    const unita = periodi[0]?.unita ?? primo.unita;
    const fonti = righe.map(r => ({ id: r.voce_id, numero: r.numero, quantita: r.quantita, unita: r.unita }));
    const fase_ids = [...new Set(righe.flatMap(r => { const id = opzioni.faseDi?.(perId.get(r.voce_id)!); return id ? [id] : []; }))];
    const sottofase_ids = (opzioni.sottofasi ?? []).filter(s => fonti.some(f => f.id === s.computo_voce_id)).map(s => s.id);
    const tipo: TipoRisorsa = f || primo.tipo === "nolo" ? "nolo" : primo.tipo === "manodopera" ? "manodopera" : "servizio";
    const note_origine = [...new Set(righe.map(r => r.nota))];
    const origine = { tipo, fonti, fase_ids, sottofase_ids, quantita, unita, periodi, note_origine };
    return { id: `${tipo}:${id}`, descrizione: primo.descrizione, ...origine, impronta: JSON.stringify(origine),
      scelta: { stato: "da_completare", fornitore: "", dal: "", al: "", note: "" } };
  };
  const proposte = gruppi.map(g => crea(g.righe, g.id, g.famiglia));
  for (const v of opzioni.senzaRicetta ?? []) {
    if (proposte.some(p => p.fonti.some(f => f.id === v.id))) continue;
    const p = crea([{ voce_id: v.id, numero: v.numero_ordine ?? null, tipo: "prestazione", descrizione: v.descrizione_breve.slice(0, 160),
      quantita: Number(v.quantita ?? 0), unita: v.unita_misura ?? "", mesi: null, pezzi: null,
      nota: "Distinta non risolta: definisci se acquistare un kit, richiedere una ricetta o affidare fornitura e posa." }], v.id, null);
    const note_origine = [...p.note_origine, ...dettagliLottoIncompleto(v)];
    proposte.push({ ...p, id: `lotto:${v.id}`, tipo: "lotto", note_origine,
      impronta: JSON.stringify({ origine: p.impronta, note_origine }), scelta: { ...p.scelta, stato: "da_completare" } });
  }
  return proposte;
}

/** Le scelte manuali sopravvivono alla rigenerazione; una fonte cambiata richiede revisione. */
export function unisciProposteRisorse(nuove: PropostaRisorsa[], salvate: PropostaRisorsa[]): PropostaRisorsa[] {
  const prima = new Map(salvate.map(p => [p.id, p]));
  return [...nuove.map(p => {
    const s = prima.get(p.id);
    return s ? { ...p, scelta: s.scelta, da_rivedere: s.impronta !== p.impronta || s.da_rivedere } : p;
  }), ...salvate.filter(p => !nuove.some(n => n.id === p.id)).map(p => ({ ...p, da_rivedere: true }))];
}

export function leggiPianoRisorse(raw: unknown, ambito: { companyId: string; orderId: string; computoId: string }): PianoRisorse | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = (raw as Record<string, unknown>)._piano_risorse_v1 as PianoRisorse | undefined;
  if (!p) return null;
  if (p.versione !== 1 || !Number.isInteger(p.revisione) || !Array.isArray(p.proposte)
    || p.company_id !== ambito.companyId || p.order_id !== ambito.orderId || p.computo_id !== ambito.computoId) {
    throw new Error("Il piano risorse non appartiene a questo computo e a questa commessa, oppure ha un formato non supportato.");
  }
  return p;
}
