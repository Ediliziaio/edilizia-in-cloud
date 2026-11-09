import { supabase } from "@/integrations/supabase/client";

/**
 * Gli accessi che l'anti-forza-bruta tiene fuori adesso.
 *
 * Il blocco non è sull'utente: è sulla coppia (email, indirizzo di provenienza).
 * Chi sbaglia la password tre volte dal computer dell'ufficio resta fuori DA QUEL
 * COMPUTER, e dal telefono entra lo stesso. È voluto — così i tentativi di un
 * estraneo non possono chiudere fuori la persona vera — ma va detto a chi guarda
 * la pagina, altrimenti sembra un blocco dell'account.
 */
export interface AccessoBloccato {
  email: string;
  ip_address: string;
  nome: string | null;
  user_id: string | null;
  tentativi: number;
  max_tentativi: number;
  /** Quando si riapre da solo. Null se il database non sa dirlo. */
  sbloccato_il: string | null;
  ultimo_tentativo: string;
}

// `accessi_bloccati` e `sblocca_accesso` non sono ancora in types.ts (generato
// dal database): finché non lo si rigenera, il client va passato da qui.
// Togliere il cast quando types.ts le conosce.
type ClientConRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function leggiAccessiBloccati(): Promise<AccessoBloccato[]> {
  const { data, error } = await (supabase as unknown as ClientConRpc).rpc("accessi_bloccati");
  if (error) throw new Error(error.message);
  return (data ?? []) as AccessoBloccato[];
}

export async function sbloccaAccesso(email: string, ip: string): Promise<void> {
  // `supabase.rpc()` NON solleva: l'errore torna dentro `error`. Senza guardarlo
  // il bottone direbbe «fatto» anche quando il database ha rifiutato.
  const { error } = await (supabase as unknown as ClientConRpc).rpc("sblocca_accesso", {
    p_email: email,
    p_ip: ip,
  });
  if (error) throw new Error(error.message);
}

/**
 * Il testo dell'attesa, per chi è bloccato e per chi amministra.
 * Niente «fino a null» quando l'orario non c'è.
 */
export function quandoSiRiapre(sbloccatoIl: string | null | undefined): string | null {
  if (!sbloccatoIl) return null;
  const quando = new Date(sbloccatoIl);
  if (Number.isNaN(quando.getTime())) return null;
  return quando.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
