/**
 * Fatture e costi → Subappaltatori: una riga per ogni uscita verso ditte e subappaltatori,
 * con lo stato dei loro SAL. Gli importi sono quelli di commessa_quadro_pagamenti, qui solo l'abbinamento.
 */
import type { Uscita } from "./quadroPagamenti";

export interface ContrattoRiga { id: string; subappaltatore_id: string | null }
export interface SalRiga { id: string; contratto_id: string | null; subappaltatore_id: string | null; numero_sal: number | null; stato: string | null; data_emissione?: string | null; importo_netto?: number | null }

export interface RigaSubappalto {
  uscita: Uscita;
  /** La scheda da aprire: solo i contratti e i SAL hanno un subappaltatore. */
  subappaltatoreId: string | null;
  contrattoId: string | null;
  /** I suoi SAL, in ordine di numero. */
  sal: SalRiga[];
  salTotali: number;
  salDaVerificare: number;
  salContestati: number;
}

export function righeSubappalti(uscite: Uscita[], sal: SalRiga[], contratti: ContrattoRiga[]): RigaSubappalto[] {
  return uscite.filter((u) => u.categoria === "subappalti").map((u) => {
    if (u.origine_tipo !== "subappalto") return { uscita: u, subappaltatoreId: null, contrattoId: null, sal: [], salTotali: 0, salDaVerificare: 0, salContestati: 0 };
    // commessa_quadro_pagamenti: l'origine è il contratto o, per i SAL senza contratto, la ditta.
    const contratto = contratti.find((c) => c.id === u.origine_id);
    const suoi = contratto
      ? sal.filter((s) => s.contratto_id === contratto.id)
      : sal.filter((s) => !s.contratto_id && s.subappaltatore_id === u.origine_id);
    return {
      uscita: u,
      subappaltatoreId: contratto ? contratto.subappaltatore_id : u.origine_id,
      contrattoId: contratto?.id ?? null,
      sal: [...suoi].sort((a, b) => (a.numero_sal ?? 0) - (b.numero_sal ?? 0)),
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

/** I totali in cima alla pagina: solo le uscite con un contratto hanno contratto e maturato. */
export function totaliSubappalti(righe: RigaSubappalto[]) {
  const somma = (f: (u: Uscita) => number | null | undefined) => Math.round(righe.reduce((s, r) => s + Number(f(r.uscita) ?? 0), 0) * 100) / 100;
  return { contratto: somma((u) => u.contratto), maturato: somma((u) => u.maturato_lordo), ritenute: somma((u) => u.ritenute), pagato: somma((u) => u.pagato), residuo: somma((u) => u.residuo) };
}

/** Quanto del contratto è maturato, da 0 a 100. Null senza un contratto con un importo. */
export function percentualeMaturato(u: Pick<Uscita, "contratto" | "maturato_lordo">): number | null {
  if (!u.contratto || u.contratto <= 0) return null;
  return Math.min(100, Math.round(((u.maturato_lordo ?? 0) / u.contratto) * 100));
}
