import type { RigaPlanimetria } from "./archivio";
import { DEFINIZIONI_COLLEGAMENTI, haCollegamenti, TIPI_COLLEGAMENTO, type MappaCollegamenti, type TipoCollegamento } from "./collegamenti";
export const STATI_PIANTA = { bozza: "Bozza", in_uso: "In uso", archiviata: "Archiviata" } as const;

export interface FiltriElencoPiante {
  stato: "attive" | "bozza" | "in_uso" | "archiviata";
  ricerca: string;
  collegamento: "tutti" | "collegate" | "libere" | TipoCollegamento;
  ordine: "recenti" | "nome" | "meno_recenti";
}

export function filtraElencoPiante(righe: RigaPlanimetria[], filtri: FiltriElencoPiante, mappa?: MappaCollegamenti): RigaPlanimetria[] {
  const parole = filtri.ricerca.trim().toLocaleLowerCase("it-IT").split(/\s+/).filter(Boolean);
  return righe.filter((riga) => {
    if (filtri.stato === "attive" ? riga.stato === "archiviata" : riga.stato !== filtri.stato) return false;
    if (filtri.collegamento === "collegate" && !haCollegamenti(riga)) return false;
    if (filtri.collegamento === "libere" && haCollegamenti(riga)) return false;
    if (TIPI_COLLEGAMENTO.includes(filtri.collegamento as TipoCollegamento)
      && !riga[DEFINIZIONI_COLLEGAMENTI[filtri.collegamento as TipoCollegamento].colonna]) return false;
    const testo = [riga.titolo, riga.descrizione, ...TIPI_COLLEGAMENTO.map((tipo) => {
      const id = riga[DEFINIZIONI_COLLEGAMENTI[tipo].colonna];
      return id ? mappa?.[tipo][id]?.nome : null;
    })].filter(Boolean).join(" ").toLocaleLowerCase("it-IT");
    return parole.every((parola) => testo.includes(parola));
  }).sort((a, b) => filtri.ordine === "nome" ? a.titolo.localeCompare(b.titolo, "it")
    : filtri.ordine === "meno_recenti" ? a.updated_at.localeCompare(b.updated_at) : b.updated_at.localeCompare(a.updated_at));
}
