import { supabase } from "@/integrations/supabase/client";
import { invokeDistyra } from "./distyra";

export interface ConnessioneDaAggiornare {
  id: string;
  provider_slug?: string | null;
  institution_name?: string | null;
  accounts_count?: number | null;
}
export interface EsitoAggiornamentoBanca {
  movimenti: number;
  avviso?: string;
}

/** Stesso flusso per il pulsante della singola banca e per quello generale. */
export async function aggiornaConnessioneBanca(companyId: string, conn: ConnessioneDaAggiornare, puoConfermare: boolean): Promise<EsitoAggiornamentoBanca> {
  if (conn.provider_slug === "distyra") {
    const conti = puoConfermare
      ? (await invokeDistyra(companyId, { action: "finalize", connection_id: conn.id }))?.conti
      : conn.accounts_count;
    if (!conti) throw new Error(puoConfermare
      ? "La banca sta ancora preparando i conti. Riprova senza ricollegare."
      : "Il titolare deve prima completare il collegamento dei conti.");
    try {
      const esito = await invokeDistyra(companyId, { action: "sync", connection_id: conn.id }, { onScreen: true });
      if (typeof esito?.movimenti !== "number" || !Number.isFinite(esito.movimenti) || esito.movimenti < 0) throw new Error("La banca non ha ancora confermato l'importazione dei movimenti.");
      return { movimenti: esito.movimenti };
    } catch (e) {
      return { movimenti: 0, avviso: `Conti collegati (${conti}). ${e instanceof Error ? e.message : "Movimenti non ancora disponibili."}` };
    }
  }
  throw new Error("Questo collegamento va aggiornato dalla scheda Connessioni.");
}

export async function sincronizzaBancheAzienda(companyId: string, puoConfermare: boolean) {
  if (!companyId) throw new Error("Seleziona un'azienda per aggiornare i conti.");
  const { data, error } = await supabase.from("bank_connections")
    .select("id,provider_slug,institution_name,accounts_count")
    .eq("company_id", companyId).eq("provider_slug", "distyra").neq("status", "disconnected");
  if (error) throw new Error("Impossibile leggere i collegamenti bancari. Riprova.");
  const connessioni = (data ?? []) as ConnessioneDaAggiornare[];
  const risultato = { totale: connessioni.length, aggiornate: 0, movimenti: 0, avvisi: [] as string[], errori: [] as string[] };
  // Una banca alla volta: niente raffiche di richieste e un errore non ferma le altre.
  for (const conn of connessioni) {
    const nome = conn.institution_name || "Banca";
    try {
      const esito = await aggiornaConnessioneBanca(companyId, conn, puoConfermare);
      if (esito.avviso) risultato.avvisi.push(`${nome}: ${esito.avviso}`);
      else { risultato.aggiornate++; risultato.movimenti += esito.movimenti; }
    } catch (e) {
      risultato.errori.push(`${nome}: ${e instanceof Error ? e.message : "Aggiornamento non completato."}`);
    }
  }
  return risultato;
}
