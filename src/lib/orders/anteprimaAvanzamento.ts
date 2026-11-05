// src/lib/orders/anteprimaAvanzamento.ts
/**
 * Cosa succede alle fasi quando un rapportino viene approvato (07/10/2026): lo
 * specchio, per l'anteprima, della regola del trigger campo_rapportino_avanzamento_approvato.
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
  /** Fase mai iniziata su cui si è lavorato: parte, anche senza una percentuale. */
  inizia?: true;
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
    if (!fase) continue;   // una fase non disponibile non ha effetto; il server rifiuta il rapporto finché non viene corretto
    const prima = avanzamentoFase(fase);
    const delle = perFase.get(fase.id) ?? [];
    const spunte = Array.isArray(voce.sottofasi_fatte) ? voce.sottofasi_fatte.filter((x): x is string => typeof x === "string") : null;

    if (spunte && delle.length > 0) {
      const nuove = delle.filter((s) => !s.fatta && spunte.includes(s.id));
      if (nuove.length === 0) {
        // Niente di finito: il database non tocca l'avanzamento, ma una fase mai iniziata parte.
        if (fase.status === "da_iniziare") righe.push({ phaseId: fase.id, nome: fase.name, prima, dopo: prima, chiude: false, sottofasiNuove: [], dichiarata: null, inizia: true });
        continue;
      }
      // Il database pesa anche sugli importi, che qui non ci sono: una spunta in più non fa mai scendere la stima.
      const dopo = Math.max(prima, avanzamentoDaSottofasi(delle.map((s) => ({ peso: s.peso, fatta: s.fatta || nuove.includes(s), percentuale: s.percentuale }))) ?? prima);
      righe.push({ phaseId: fase.id, nome: fase.name, prima, dopo, chiude: dopo >= 100 && prima < 100, sottofasiNuove: nuove.map((s) => s.name), dichiarata: null });
      continue;
    }
    if (delle.length > 0) {   // la decidono le sottofasi: una % dichiarata non cambia niente
      if (fase.status === "da_iniziare") righe.push({ phaseId: fase.id, nome: fase.name, prima, dopo: prima, chiude: false, sottofasiNuove: [], dichiarata: null, inizia: true });
      continue;
    }

    const grezza = voce.percentuale;
    const numero = grezza === undefined || grezza === null || grezza === "" ? 0 : Number(grezza);
    if (!Number.isFinite(numero)) continue;   // non è un numero: il server rifiuta l’approvazione
    const dichiarata = limita(numero);
    const dopo = Math.max(prima, dichiarata);
    if (dopo === prima && dichiarata >= prima) {
      if (fase.status === "da_iniziare") righe.push({ phaseId: fase.id, nome: fase.name, prima, dopo, chiude: false, sottofasiNuove: [], dichiarata, inizia: true });
      continue;
    }
    righe.push({ phaseId: fase.id, nome: fase.name, prima, dopo, chiude: dopo >= 100 && prima < 100, sottofasiNuove: [], dichiarata });
  }
  return righe;
}

/** Le fasi ancora aperte: un rapporto di fine lavori non le chiude, e chi approva lo deve sapere. */
export function fasiAperte(fasi: ReadonlyArray<Pick<FaseDellaCommessa, "name" | "status">>): string[] {
  return fasi.filter((f) => f.status !== "completata").map((f) => f.name);
}

/** Una sottofase portata avanti dal rapportino, come la legge chi approva. */
export interface AvanzataInAnteprima { id: string; nome: string; testo: string; oltre: boolean }

/**
 * Quanto dichiara il rapportino, sottofase per sottofase: «+76,5 mq» o «fino al 50%». `oltre` se la quantità
 * supera quello che manca: approvando la sottofase si chiude (un 1000 al posto di 10 si vede prima).
 */
export function avanzateInAnteprima(
  sottofasi: ReadonlyArray<Pick<Sottofase, "id" | "name" | "fatta" | "percentuale" | "quantita_fatta">>,
  fasiLavorate: unknown,
  quantitaDi: ReadonlyMap<string, { quantita: number; unita: string | null }> = new Map(),
): AvanzataInAnteprima[] {
  if (!Array.isArray(fasiLavorate)) return [];
  const perId = new Map(sottofasi.map((s) => [s.id, s]));
  const esito: AvanzataInAnteprima[] = [];
  for (const f of fasiLavorate as Array<{ sottofasi_avanzate?: unknown }>) {
    if (!Array.isArray(f?.sottofasi_avanzate)) continue;
    for (const a of f.sottofasi_avanzate as Array<{ id?: string; quantita?: number; percentuale?: number }>) {
      const s = a?.id ? perId.get(a.id) : undefined;
      if (!s || s.fatta) continue;
      const q = quantitaDi.get(s.id);
      if (a.quantita && q) {
        const gia = Number(s.quantita_fatta) || (q.quantita * (Number(s.percentuale) || 0)) / 100;
        esito.push({ id: s.id, nome: s.name, testo: `+${a.quantita.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${q.unita ? ` ${q.unita}` : ""}`, oltre: gia + a.quantita > q.quantita });
      } else if (a.percentuale) {
        esito.push({ id: s.id, nome: s.name, testo: `fino al ${a.percentuale}%`, oltre: false });
      }
    }
  }
  return esito;
}
