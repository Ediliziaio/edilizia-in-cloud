import { supabase } from "@/integrations/supabase/client";

// The shared generated schema is maintained separately; validate these new RPC
// responses at the boundary rather than treating untyped transport as success.
export async function fiscalCommand(
  name:
    | "fiscalita_f24_anteprima"
    | "fiscalita_f24_conferma"
    | "fiscalita_svincolo_anteprima"
    | "fiscalita_svincola"
    | "fiscalita_transizione_periodo",
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc(name as never, params as never);
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw Error("Risposta del servizio fiscale non valida");
  return data as Record<string, unknown>;
}
