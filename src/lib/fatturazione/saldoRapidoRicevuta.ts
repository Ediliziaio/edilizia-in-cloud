import { supabase } from "@/integrations/supabase/client";

export async function registraSaldoRicevuta(id: string, data: string | null = null): Promise<string | null> {
  const { data: esito, error } = await supabase.rpc("registra_saldo_fattura_ricevuta", {
    p_id: id, p_data: data, p_richiesta: crypto.randomUUID(),
  });
  if (error) throw error;
  const risposta = esito as { annullamento?: string | null; gia_registrato?: boolean } | null;
  if (typeof risposta?.annullamento === "string") return risposta.annullamento;
  if (risposta?.gia_registrato) return null;
  throw new Error("Saldo non confermato. Ricarica la fattura.");
}

export async function annullaSaldoRicevuta(id: string, operazione?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("annulla_saldo_fattura_ricevuta", {
    p_id: id, p_richiesta: operazione ?? null,
  });
  if (error) throw error;
  return data === true;
}

export function messaggioPagamentoRicevuta(errore: unknown): string {
  return typeof errore === "object" && errore !== null && "message" in errore
    ? String(errore.message) : "Ricarica la fattura e riprova.";
}
