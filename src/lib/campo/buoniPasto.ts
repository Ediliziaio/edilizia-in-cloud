/**
 * Buoni pasto visti dall'operaio (richiesta del founder, 23/11/2026: «il sistema li calcola, ma l'operaio non li vede»).
 *
 * I buoni nascono nel database (`matura_buono_pasto_da_giornata`, sulle giornate di `hr_giornate`): un buono «fisso»
 * per ogni giorno con almeno `buono_pasto_soglia_ore` ore lavorate, se l'azienda li ha attivi e la persona è
 * abilitata. Qui solo i conti del mese e le frasi da mostrare: niente si scrive.
 */
export type StatoBuono = "maturato" | "da_erogare" | "erogato" | "annullato";

export interface BuonoPasto {
  id: string;
  giorno: string;
  tipo: "fisso" | "ricevuta";
  importo: number | null;
  stato: StatoBuono;
}

export interface RegoleBuoni {
  buono_pasto_attivo: boolean;
  buono_pasto_modalita: "fisso" | "ricevuta" | "entrambi";
  buono_pasto_valore: number | null;
  buono_pasto_soglia_ore: number | null;
}

export interface RiepilogoMese {
  /** Buoni validi del mese (tutti tranne gli annullati). */
  validi: number;
  totale: number;
  erogati: number;
  daRicevere: number;
}

/** Il mese «2026-11» di una data «2026-11-23». */
export const meseDi = (giorno: string) => giorno.slice(0, 7);

export function buoniDelMese(buoni: readonly BuonoPasto[], mese: string): BuonoPasto[] {
  return buoni.filter(b => meseDi(b.giorno) === mese).sort((a, b) => b.giorno.localeCompare(a.giorno));
}

export function riepilogoMese(buoni: readonly BuonoPasto[]): RiepilogoMese {
  const validi = buoni.filter(b => b.stato !== "annullato");
  const importo = (b: BuonoPasto) => Number(b.importo) || 0;
  return {
    validi: validi.length,
    totale: Math.round(validi.reduce((s, b) => s + importo(b), 0) * 100) / 100,
    erogati: validi.filter(b => b.stato === "erogato").length,
    daRicevere: validi.filter(b => b.stato !== "erogato").length,
  };
}

/** Cosa vede l'operaio: perché non ci sono buoni, oppure null se li ha. */
export function motivoSenzaBuoni(regole: RegoleBuoni | null | undefined, abilitato: boolean | null | undefined):
  "azienda" | "persona" | null {
  if (!regole?.buono_pasto_attivo) return "azienda";
  if (!abilitato) return "persona";
  return null;
}

/** La regola in una frase, con la soglia in ore («6» o «6,5»). Null se i buoni arrivano solo con lo scontrino. */
export function sogliaLeggibile(regole: RegoleBuoni): string | null {
  if (regole.buono_pasto_modalita === "ricevuta") return null;
  const ore = Number(regole.buono_pasto_soglia_ore) || 0;
  return ore.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

/** «2026-11» ± n mesi. */
export function spostaMese(mese: string, di: number): string {
  const [anno, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(anno, m - 1 + di, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
