import type { RigaElencoLavori } from "./contrattoSubappaltoHtml";
import type { AffidamentoChiFaCosa } from "./affidamentiCommessa";
import type { VoceSub } from "./lavoriMisure";
import type { SalPerRiepilogo } from "./riconciliazioneContratto";
import { pagatoSal } from "./importiSal";

export interface ContrattoFlusso {
  id: string;
  subappaltatore_id: string;
  numero_contratto: string | null;
  descrizione_lavori: string;
  stato: string;
  firmato_il: string | null;
  elenco_lavori: unknown;
  importo_contrattuale: number;
  oneri_sicurezza: number;
  ritenuta_garanzia_pct: number;
  data_inizio: string | null;
  data_fine_prevista: string | null;
}

export interface VarianteFlusso {
  id: string;
  importo_prima: number;
  importo_dopo: number;
  oneri_prima: number;
  oneri_dopo: number;
  motivo: string;
  created_at: string;
}

export interface QuadroFlusso {
  id: string;
  revisione: number;
  importo_lavori: number;
  voci: VoceSub[];
}

const cent = (n: number) => Math.round(n * 100) / 100;
export const variazioneSubappalto = (v: VarianteFlusso) =>
  cent(Number(v.importo_dopo) + Number(v.oneri_dopo) - Number(v.importo_prima) - Number(v.oneri_prima));

/** L'importo del contratto è già aggiornato: lo storico serve al confronto, mai a incrementarlo. */
export function costiFlussoSubappalto(c: ContrattoFlusso, varianti: readonly VarianteFlusso[], sal: readonly SalPerRiepilogo[]) {
  const attuale = cent(Number(c.importo_contrattuale) + Number(c.oneri_sicurezza));
  // Sommare i delta non dipende dall'ordine di due varianti registrate nello stesso istante.
  const delta = cent(varianti.reduce((s, v) => s + Math.round(variazioneSubappalto(v) * 100), 0) / 100);
  const iniziale = cent(attuale - delta);
  const validi = sal.filter((s) => s.stato !== "contestato");
  const somma = (righe: readonly SalPerRiepilogo[], valore: (s: SalPerRiepilogo) => number) =>
    righe.reduce((s, r) => s + Math.round(valore(r) * 100), 0) / 100;
  const approvati = validi.filter((s) => s.stato === "verificato" || s.stato === "pagato");
  return {
    attuale, iniziale, variazione: cent(attuale - iniziale),
    inBozza: c.stato === "bozza" && !c.firmato_il,
    approvato: somma(approvati, (s) => Number(s.importo_lordo)),
    daVerificare: somma(validi.filter((s) => s.stato === "ricevuto"), (s) => Number(s.importo_lordo)),
    pagato: somma(validi, pagatoSal),
    daPagareApprovato: cent(Math.max(0, somma(approvati, (s) => Number(s.importo_netto) - pagatoSal(s)))),
  };
}

/** Il documento corrente deriva dal quadro versionato; l'Allegato A firmato rimane intatto. */
export function computoCorrenteSubappalto(
  c: Pick<ContrattoFlusso, "elenco_lavori" | "importo_contrattuale">,
  quadro: QuadroFlusso | null,
  fasi: readonly { id: string; name: string }[],
  voci: readonly { id: string; phase_id: string; subphase_id?: string | null }[],
  sottofasi: readonly { id: string; name: string }[],
  affidamenti: readonly AffidamentoChiFaCosa[],
) {
  const originali = Array.isArray(c.elenco_lavori) ? c.elenco_lavori as RigaElencoLavori[] : [];
  const righe: RigaElencoLavori[] = quadro ? quadro.voci.map((v) => {
    const origine = originali.find((r) => v.affidamento_id ? r.affidamento_id === v.affidamento_id : v.voce_commessa_id ? r.voce_id === v.voce_commessa_id : false);
    const voce = voci.find((r) => r.id === v.voce_commessa_id);
    const faseId = v.fase_id ?? voce?.phase_id ?? origine?.fase_id;
    const sottofaseId = origine?.sottofase_id ?? voce?.subphase_id;
    return {
      fase_id: faseId, fase: origine?.fase || fasi.find((f) => f.id === faseId)?.name || "Altri lavori",
      sottofase_id: sottofaseId, sottofase: origine?.sottofase || sottofasi.find((s) => s.id === sottofaseId)?.name,
      descrizione: v.descrizione, unita: v.base === "corpo" ? "a corpo" : v.unita,
      quantita: Number(v.quantita), prezzo: Number(v.prezzo), importo: cent(Number(v.quantita) * Number(v.prezzo)),
      voce_id: v.voce_commessa_id, affidamento_id: v.affidamento_id,
      comprende: affidamenti.find((a) => a.id === v.affidamento_id)?.comprende ?? origine?.comprende,
    };
  }) : originali.map((r) => ({
    // Solo i campi destinati alla ditta: nessun prezzo di vendita o margine nel computo.
    fase: r.fase, fase_id: r.fase_id, sottofase: r.sottofase, sottofase_id: r.sottofase_id,
    descrizione: r.descrizione, unita: r.unita, quantita: Number(r.quantita), prezzo: Number(r.prezzo),
    importo: cent(Number(r.quantita) * Number(r.prezzo)), voce_id: r.voce_id, affidamento_id: r.affidamento_id, comprende: r.comprende,
  }));
  const totale = righe.reduce((s, r) => s + Math.round(r.importo * 100), 0) / 100;
  const coerente = righe.length > 0 && righe.every((r) => Number.isFinite(r.importo) && r.quantita > 0 && r.prezzo >= 0)
    && Math.abs(totale - Number(c.importo_contrattuale)) < 0.005
    && (!quadro || Math.abs(Number(quadro.importo_lavori) - Number(c.importo_contrattuale)) < 0.005);
  return { righe, originali, totale, coerente, revisione: quadro?.revisione ?? null };
}
