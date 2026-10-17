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
export interface FotoPicco {
  connessioni?: Array<{ app: string; utente: string; n: number; attive: number; ferme_in_transazione: number; attiva_da_s: number | null }>;
  query_attive?: number;
  piu_lunghe?: Array<{ app: string; stato: string; attesa: string | null; durata_s: number | null; query_id: string | null }>;
  cron_in_corso?: Array<{ jobname: string; da_s: number }>;
}
export function livelloMassimo(letture: LetturaMemoria[]): LivelloMemoria;
export function scattaFoto(env: Record<string, string | undefined>, livello: string, letture: LetturaMemoria[],
  send?: MetricheFetch): Promise<FotoPicco | null>;
export function testoFoto(foto: FotoPicco | null): string;
export function controllaMemoria(env?: Record<string, string | undefined>, send?: MetricheFetch,
  wait?: (ms: number) => unknown): Promise<{ letture: LetturaMemoria[]; livello: LivelloMemoria; foto: FotoPicco | null }>;
