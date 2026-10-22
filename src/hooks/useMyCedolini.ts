/**
 * I propri cedolini (sola lettura), via employee_id del profilo HR.
 * Condiviso dalla pagina «Cedolini» e dal riepilogo di «Il mio stato»:
 * stesse chiavi di cache, stessa forma dei dati.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMyHrProfilo } from "@/hooks/useTimbratura";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface Cedolino {
  id: string;
  mese: number;
  anno: number;
  lordo: number;
  netto: number;
  contributi_dipendente: number | null;
  ritenute_irpef: number | null;
  stato: string;
  note: string | null;
  /** Il PDF caricato dal consulente, se c'è (si apre con apriDocumentoPaghe). */
  documento_id: string | null;
}

export function useMyCedolini() {
  const { user } = useAuth();
  const companyId = useEffectiveCompanyId();
  const { data: profilo } = useMyHrProfilo();

  // Se profilo.employee_id è null, prova a recuperare employee_id dalla tabella employees
  const employee = useQuery({
    queryKey: ["my-employee-id", profilo?.employee_id, user?.id, companyId],
    queryFn: async () => {
      if (profilo?.employee_id) return profilo.employee_id;
      const { data, error } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user!.id)
        // Chi lavora per due aziende ha due schede: con una riga per azienda
        // maybeSingle non va in errore (prima la pagina diceva «nessun cedolino»).
        .eq("company_id", companyId!)
        .maybeSingle();
      // Un errore reale (RLS/DB) non va confuso con "nessun collegamento".
      if (error) throw error;
      return data?.id ?? null;
    },
    enabled: !!profilo && !!companyId,
    staleTime: 10 * 60 * 1000,
  });
  const employeeId = employee.data ?? null;

  const cedolini = useQuery({
    queryKey: ["my-cedolini", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cedolini")
        .select("id, mese, anno, lordo, netto, contributi_dipendente, ritenute_irpef, stato, note, documento_id")
        .eq("employee_id", employeeId!)
        // Una bozza non è ancora stata consegnata: il dipendente non la vede.
        .neq("stato", "bozza")
        .order("anno", { ascending: false })
        .order("mese", { ascending: false });
      if (error) throw error;
      // documento_id non è ancora nei tipi generati del database: c'è nella vista.
      return (data ?? []) as unknown as Cedolino[];
    },
    enabled: !!employeeId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    employeeId,
    cedolini: cedolini.data ?? [],
    loadingEmployee: employee.isLoading,
    loadingCedolini: cedolini.isLoading,
  };
}

export interface DocumentoPaghePersonale {
  id: string;
  tipo: string;
  titolo: string;
  anno: number | null;
  mese: number | null;
  visto_at: string | null;
}

/**
 * Gli altri documenti del consulente intestati a me e pubblicati (CU, foglio
 * presenze, una busta non ancora collegata a un cedolino): le regole del
 * database fanno vedere solo i propri.
 */
export function useMieiDocumentiPaghe() {
  const { data: profilo } = useMyHrProfilo();
  return useQuery({
    queryKey: ["my-documenti-paghe", profilo?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_paghe_documenti" as never)
        .select("id, tipo, titolo, anno, mese, visto_at")
        .eq("hr_profilo_id", profilo!.id)
        .is("cedolino_id", null)
        .is("sostituito_da", null)
        .not("pubblicato_at", "is", null)
        .order("anno", { ascending: false })
        .order("mese", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DocumentoPaghePersonale[];
    },
    enabled: !!profilo?.id,
    staleTime: 5 * 60 * 1000,
  });
}
