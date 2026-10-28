/**
 * Collegamento del conto corrente con Distyra (PSD2, sola lettura).
 *
 * Perche' accanto a Salt Edge: Salt Edge e' in beta e si abilita azienda per azienda,
 * Distyra parte subito (primo collegamento gratis, nessun minimo) e dichiara 333 banche
 * italiane. Finche' la prova e' in corso il pulsante si vede solo nelle aziende qui sotto.
 */
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";

/** Aziende che vedono il collegamento Distyra. Demo Azienda 2: si prova li' prima di aprirlo a tutti. */
export const AZIENDE_PROVA_DISTYRA = ["d2000000-0000-4000-a000-000000000002"] as const;
export const distyraAbilitato = (companyId?: string | null): boolean =>
  !!companyId && (AZIENDE_PROVA_DISTYRA as readonly string[]).includes(companyId);

export async function invokeDistyra(companyId: string | null | undefined, body: Record<string, unknown>) {
  if (!companyId) throw new Error("Seleziona un'azienda per collegare il conto.");
  const { data, error } = await supabase.functions.invoke("bank-distyra", { body: { ...body, company_id: companyId } });
  if (error) {
    const ripiego = "Collegamento bancario non disponibile. Riprova fra poco.";
    const messaggio = await edgeErrorMessage(error, ripiego);
    throw new Error(/Failed to (send|fetch)|non-2xx|NetworkError|Load failed/i.test(messaggio) ? ripiego : messaggio);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Si apre solo un indirizzo di Distyra. La specifica non dichiara il dominio della pagina
 * ospitata, quindi si accetta qualunque sottodominio di distyra.com in https e nient'altro:
 * un indirizzo che arrivasse manomesso porterebbe il cliente a mettere le credenziali della
 * banca su un sito altrui.
 */
export function validDistyraUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      && (u.hostname === "distyra.com" || u.hostname.endsWith(".distyra.com"));
  } catch { return false; }
}
