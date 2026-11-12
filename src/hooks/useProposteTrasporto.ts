/**
 * Mezzi e personale dell'azienda, per proporre targa e autista quando la merce
 * l'abbiamo ritirata noi (12/11/2026). Chi non può vedere i mezzi (can_view_mezzi)
 * o il personale (solo amministratori) riceve un elenco vuoto: scrive a mano.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Proposta } from "@/components/ddt/CampoConProposte";

export function proposteMezzi(mezzi: ReadonlyArray<{ nome: string; targa: string | null }>): Proposta[] {
  return mezzi
    .filter((m) => m.targa && m.targa.trim())
    .map((m) => ({ valore: m.targa!.trim().toUpperCase(), etichetta: m.targa!.trim().toUpperCase(), dettaglio: m.nome }));
}

export function proposteAutisti(persone: ReadonlyArray<{ nome: string | null; cognome: string | null }>): Proposta[] {
  return persone
    .map((p) => [p.nome, p.cognome].filter(Boolean).join(" ").trim())
    .filter(Boolean)
    .map((n) => ({ valore: n, etichetta: n }));
}

export function useProposteTrasporto(companyId: string | null | undefined, attivo: boolean) {
  return useQuery({
    queryKey: ["ddt-proposte-trasporto", companyId],
    enabled: attivo && !!companyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [mezzi, persone] = await Promise.all([
        supabase.from("mezzi").select("id, nome, targa").eq("company_id", companyId!).is("deleted_at", null).order("nome").limit(500),
        supabase.from("hr_profili").select("id, nome, cognome").eq("company_id", companyId!).eq("attivo", true).order("cognome").limit(500),
      ]);
      return {
        mezzi: proposteMezzi(mezzi.error ? [] : mezzi.data ?? []),
        autisti: proposteAutisti(persone.error ? [] : persone.data ?? []),
      };
    },
  });
}
