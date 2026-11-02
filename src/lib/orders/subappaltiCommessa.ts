/**
 * Fatture e costi → Subappaltatori: una riga per ogni uscita verso ditte e subappaltatori,
 * con lo stato dei loro SAL. Gli importi sono quelli di commessa_quadro_pagamenti, qui solo l'abbinamento.
 */
import type { Uscita } from "./quadroPagamenti";

export interface ContrattoRiga { id: string; subappaltatore_id: string | null }
export interface SalRiga { id: string; contratto_id: string | null; subappaltatore_id: string | null; numero_sal: number | null; stato: string | null }

export interface RigaSubappalto {
  uscita: Uscita;
  /** La scheda da aprire: solo i contratti e i SAL hanno un subappaltatore. */
  subappaltatoreId: string | null;
  contrattoId: string | null;
  salTotali: number;
  salDaVerificare: number;
  salContestati: number;
}

export function righeSubappalti(uscite: Uscita[], sal: SalRiga[], contratti: ContrattoRiga[]): RigaSubappalto[] {
  return uscite.filter((u) => u.categoria === "subappalti").map((u) => {
    if (u.origine_tipo !== "subappalto") return { uscita: u, subappaltatoreId: null, contrattoId: null, salTotali: 0, salDaVerificare: 0, salContestati: 0 };
    // commessa_quadro_pagamenti: l'origine è il contratto o, per i SAL senza contratto, la ditta.
    const contratto = contratti.find((c) => c.id === u.origine_id);
    const suoi = contratto
      ? sal.filter((s) => s.contratto_id === contratto.id)
      : sal.filter((s) => !s.contratto_id && s.subappaltatore_id === u.origine_id);
    return {
      uscita: u,
      subappaltatoreId: contratto ? contratto.subappaltatore_id : u.origine_id,
      contrattoId: contratto?.id ?? null,
      salTotali: suoi.length,
      salDaVerificare: suoi.filter((s) => s.stato === "ricevuto").length,
      salContestati: suoi.filter((s) => s.stato === "contestato").length,
    };
  });
}

export type StatoSubappalto = "problema" | "daVerificare" | "daPagare" | "inRegola" | "nessuno";

export function statoRigaSubappalto(r: { salTotali: number; salDaVerificare: number; salContestati: number; residuo: number }): { chiave: StatoSubappalto; testo: string } {
  if (r.salContestati > 0) return { chiave: "problema", testo: `${r.salContestati} SAL ${r.salContestati === 1 ? "contestato" : "contestati"}` };
  if (r.salDaVerificare > 0) return { chiave: "daVerificare", testo: `${r.salDaVerificare} SAL da verificare` };
  if (r.residuo > 0.005) return { chiave: "daPagare", testo: "Da pagare" };
  return r.salTotali > 0 ? { chiave: "inRegola", testo: "Saldato" } : { chiave: "nessuno", testo: "Nessun SAL" };
}
