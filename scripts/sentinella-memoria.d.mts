export interface LetturaMemoria {
  impegnataPct: number;
  disponibilePct: number;
  swapPct: number;
  impegnataGiB: number;
  tettoGiB: number;
  disponibileGiB: number;
  totaleGiB: number;
}

export type LivelloMemoria = "ok" | "attenzione" | "critico";

type SogliaMemoria = { impegnataPct: number; disponibilePct: number; swapPct: number };
export const SOGLIE: { attenzione: SogliaMemoria; critico: SogliaMemoria };

type MetricheFetch = (url: string, init?: RequestInit) => Promise<Response>;

export function leggiMemoria(testo: string | null | undefined): LetturaMemoria | null;
export function livello(lettura: LetturaMemoria): LivelloMemoria;
export function livelloPersistente(letture: LetturaMemoria[]): LivelloMemoria;
export function chiaveServizio(ref: string, token: string, send?: MetricheFetch): Promise<string | null>;
export function controllaMemoria(env?: Record<string, string | undefined>, send?: MetricheFetch,
  wait?: (ms: number) => unknown): Promise<{ letture: LetturaMemoria[]; livello: LivelloMemoria }>;
