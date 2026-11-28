/** «Chiudi le spese bancarie» (lotto B, 28/11/2026): forma delle risposte e scelte di partenza. */
export interface SpesaBancariaAperta {
  id: string;
  data: string;
  descrizione: string;
  importo: number;
  conto_id: string | null;
  regola_natura: string;
  categoria_costo: string;
  da_controllare: boolean;
  motivo_controllo: "importo" | "bonifico" | null;
  gia_in_prima_nota: boolean;
}
export interface ElencoSpese {
  movimenti: SpesaBancariaAperta[];
  numero: number;
  totale: number;
  da_controllare: number;
  soglia: number;
  troppi: boolean;
}
export interface EsitoChiusura {
  chiusi: string[];
  con_costo: number;
  /** Già nella prima nota senza banca: restano aperti, da collegare a mano alla loro riga. */
  lasciati_prima_nota: string[];
  gia_chiusi: number;
  totale: number;
}

/** Una spesa già nella prima nota senza banca non si chiude in blocco: va collegata alla sua riga. */
export const chiudibile = (r: SpesaBancariaAperta) => !r.gia_in_prima_nota;

/** Quelle da controllare (sopra soglia, o con «bonifico» in causale) partono non selezionate. */
export const preselezione = (righe: SpesaBancariaAperta[]) =>
  new Set(righe.filter((r) => chiudibile(r) && !r.da_controllare).map((r) => r.id));

export const sommaSelezionate = (righe: SpesaBancariaAperta[], scelte: Set<string>) =>
  Math.round(righe.filter((r) => scelte.has(r.id)).reduce((s, r) => s + Number(r.importo), 0) * 100) / 100;
