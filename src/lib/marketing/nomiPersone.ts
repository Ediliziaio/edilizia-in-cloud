import { supabase } from "@/integrations/supabase/client";

/** Nome e cognome di chi segue appuntamenti o attività, in una sola lettura. */
export async function nomiPersone(ids: Array<string | null>): Promise<Record<string, string>> {
  const unici = [...new Set(ids.filter((id): id is string => !!id))];
  const nomi: Record<string, string> = {};
  if (unici.length === 0) return nomi;
  const { data: profili } = await supabase.from("profiles").select("id, first_name, last_name").in("id", unici);
  for (const p of profili ?? []) {
    nomi[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ");
  }
  return nomi;
}
