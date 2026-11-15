/**
 * L'ultimo esito del collegamento automatico, dalla traccia (`acquisti_collegamenti`):
 * quante proposte aspettano una conferma e l'ultimo collegamento fatto.
 * Lo legge chi vede costi o acquisti (regola della tabella): agli altri dice «nessun esito».
 */
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { UltimoEsito } from "@/components/settings/automazioni/registroAutomatismi";

type Riga = { id: string; company_id: string; stato: string; esito: string; regola: string; created_at: string; updated_at: string };
type Db = { public: { Tables: { acquisti_collegamenti: { Row: Riga; Insert: never; Update: never; Relationships: [] } }; Views: {}; Functions: {} } };
const db = supabase as unknown as SupabaseClient<Db>;

export function testoUltimoCollegamento(inAttesa: number, ultimo: Pick<Riga, "stato" | "esito" | "updated_at"> | null): UltimoEsito | null {
  if (inAttesa > 0)
    return {
      quando: ultimo?.updated_at ?? null,
      testo: inAttesa === 1 ? "1 collegamento proposto aspetta la tua conferma" : `${inAttesa} collegamenti proposti aspettano la tua conferma`,
      tono: "attenzione",
    };
  if (!ultimo) return null;
  const cosa =
    ultimo.stato === "collegato" && ultimo.esito === "automatico"
      ? "Ultimo collegamento fatto da solo"
      : ultimo.stato === "annullato" || ultimo.stato === "rifiutato"
        ? "Ultimo collegamento annullato da una persona"
        : "Ultimo collegamento confermato";
  // Un collegamento annullato non è un errore, ma nemmeno una buona notizia: tono neutro.
  return { quando: ultimo.updated_at, testo: cosa, tono: ultimo.stato === "annullato" || ultimo.stato === "rifiutato" ? "neutro" : "ok" };
}

export function useUltimoCollegamento(companyId: string): UltimoEsito | null | undefined {
  const { data } = useQuery({
    queryKey: ["ultimo-collegamento", companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const [attesa, ultimo] = await Promise.all([
        db.from("acquisti_collegamenti").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("stato", "proposto"),
        db.from("acquisti_collegamenti").select("stato, esito, updated_at").eq("company_id", companyId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (attesa.error || ultimo.error) return null;
      return testoUltimoCollegamento(attesa.count ?? 0, (ultimo.data as Riga | null) ?? null);
    },
  });
  return data;
}
