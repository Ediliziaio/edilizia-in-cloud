import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type OperazioniRpc = (
  funzione: string, args: Record<string, Json | undefined>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function operazioniRpc<T>(funzione: string, args: Record<string, Json | undefined>): Promise<T> {
  const rpc = supabase.rpc as unknown as OperazioniRpc;
  const { data, error } = await rpc.call(supabase, funzione, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type TipoEccezione = "ddt" | "pagamento" | "cantiere";

export interface ControlloPagamento {
  stato: "non_applicabile" | "pronta" | "da_verificare" | "verificata" | "chiusa";
  bloccata: boolean;
  impronta: string;
  puo_approvare?: boolean;
  puo_confermare?: boolean;
  nota?: string | null;
  ddt?: Array<{ numero?: string | null; data?: string | null; candidati: number }>;
  problemi?: Array<{
    tipo: string;
    riga?: number;
    descrizione?: string;
    ddt_id?: string | null;
    ordine_id?: string | null;
    fatturata?: number;
    ricevuta?: number;
    mancante?: number;
    unita?: string;
    prezzo_fattura?: number;
    prezzo_ordine?: number;
    motivo?: string;
  }>;
}

export interface RischioMateriale {
  materiale: string;
  fase?: string | null;
  commessa?: string | null;
  serve: string;
  unita?: string | null;
  residuo: number;
  mancante: number;
  ordini: Array<{ ordine_id: string; numero: string; fornitore?: string | null; consegna?: string | null; residuo: number }>;
}

export interface EccezioneOperativa {
  id: string;
  tipo: TipoEccezione;
  origine_id: string;
  commessa_id: string | null;
  titolo: string;
  scadenza: string;
  dati: ControlloPagamento | RischioMateriale;
  responsabile: string | null;
  nome_responsabile: string | null;
  puo_prendere: boolean;
}

export const riepilogoFatturaHref = (id: string) => "/azienda/documenti/fatture-ricevute?fattura=" + encodeURIComponent(id);

export const numeroOperativo = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 3 });

