/**
 * Profili per id, con una query separata.
 *
 * Molte tabelle hanno `user_id`/`actor_id` con FK verso auth.users, NON verso
 * profiles: un embed PostgREST `profiles!<fk>(…)` su quelle tabelle risponde
 * 400 PGRST200 ("Could not find a relationship") e la pagina resta vuota o
 * senza nomi. Qui si prendono i profili con un `.in("id", …)` e si
 * restituiscono in una mappa da unire a mano alle righe.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ProfiloLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export async function caricaProfiliPerId(
  ids: Array<string | null | undefined>,
): Promise<Map<string, ProfiloLite>> {
  const unici = [...new Set(ids.filter((x): x is string => !!x))];
  const mappa = new Map<string, ProfiloLite>();
  if (unici.length === 0) return mappa;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in("id", unici);
  // Un profilo non leggibile (RLS) non deve far fallire la lista: resta senza nome.
  if (error) return mappa;
  for (const p of (data ?? []) as ProfiloLite[]) mappa.set(p.id, p);
  return mappa;
}

export function nomeProfilo(p: ProfiloLite | null | undefined, fallback = "Utente"): string {
  if (!p) return fallback;
  const nome = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return nome || p.email || fallback;
}
