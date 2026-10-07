// src/lib/orders/anteprimaAvanzamento.ts
/**
 * Cosa succede alle fasi quando un rapportino viene approvato (07/10/2026): lo
 * specchio, per l'anteprima, della regola del trigger fn_rapportino_applica_avanzamento.
 * Modulo puro.
 */
import { avanzamentoFase } from "@/lib/orders/cronoprogramma";
import { avanzamentoDaSottofasi, sottofasiPerFase, type Sottofase } from "@/lib/orders/sottofasi";

export interface FaseDellaCommessa { id: string; name: string; status: string; percentuale: number | null }
export interface VoceRapportino { phase_id: string; percentuale?: unknown; sottofasi_fatte?: unknown }

export interface RigaAnteprima {
  phaseId: string;
  nome: string;
  /** Avanzamento di oggi, letto con avanzamentoFase (mai la % grezza). */
  prima: number;
  /** Avanzamento dopo l'approvazione. */
  dopo: number;
  /** La fase passa a completata. */
  chiude: boolean;
  /** Nomi delle sottofasi che diventano fatte. */
  sottofasiNuove: string[];
  /** La percentuale dichiarata dalla voce; `null` se la voce porta sottofasi. */
  dichiarata: number | null;
}

const limita = (n: number): number => Math.min(100, Math.max(0, Math.round(n)));

export function anteprimaAvanzamento(
  fasi: ReadonlyArray<FaseDellaCommessa>,
  sottofasi: ReadonlyArray<Sottofase>,
  voci: ReadonlyArray<VoceRapportino>,
): RigaAnteprima[] {
  const perFase = sottofasiPerFase(sottofasi);
  const righe: RigaAnteprima[] = [];
  for (const voce of voci) {
    const fase = fasi.find((f) => f.id === voce.phase_id);
    if (!fase) continue;   // un'altra commessa, o una fase tolta: il database la salta
    const prima = avanzamentoFase(fase);
    const delle = perFase.get(fase.id) ?? [];
    const spunte = Array.isArray(voce.sottofasi_fatte) ? voce.sottofasi_fatte.filter((x): x is string => typeof x === "string") : null;

    if (spunte && delle.length > 0) {
      const nuove = delle.filter((s) => !s.fatta && spunte.includes(s.id));
      if (nuove.length === 0) continue;   // niente di nuovo: il database non tocca la fase
      const dopo = avanzamentoDaSottofasi(delle.map((s) => ({ peso: s.peso, fatta: s.fatta || nuove.includes(s) }))) ?? prima;
      righe.push({ phaseId: fase.id, nome: fase.name, prima, dopo, chiude: dopo >= 100 && prima < 100, sottofasiNuove: nuove.map((s) => s.name), dichiarata: null });
      continue;
    }
    if (delle.length > 0) continue;   // la decidono le sottofasi: una % dichiarata non cambia niente

    const grezza = voce.percentuale;
    const numero = grezza === undefined || grezza === null || grezza === "" ? 0 : Number(grezza);
    if (!Number.isFinite(numero)) continue;   // non è un numero: il database salta la voce
    const dichiarata = limita(numero);
    const dopo = Math.max(prima, dichiarata);
    if (dopo === prima && dichiarata >= prima) continue;
    righe.push({ phaseId: fase.id, nome: fase.name, prima, dopo, chiude: dopo >= 100 && prima < 100, sottofasiNuove: [], dichiarata });
  }
  return righe;
}
