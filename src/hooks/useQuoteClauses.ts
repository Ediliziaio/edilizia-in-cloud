/**
 * useQuoteClauses — clausole contrattuali e testi legali DELL'AZIENDA.
 *
 * Vivono in `quote_clause_templates` (già per azienda). Due usi distinti,
 * distinti dal jsonb libero `applicable_to`:
 *  - `{ vessatoria: true }`  → clausola che il cliente deve approvare a parte
 *    (art. 1341 c.c. c.2: senza approvazione specifica è nulla);
 *  - `{ tipo_legale: "..." }` → testo informativo che sostituisce il nostro
 *    (recesso, privacy, condizioni, inizio anticipato).
 *
 * Nessun default viene imposto: se l'azienda non configura nulla, al cliente
 * non si fa approvare nessuna clausola vessatoria e restano i testi di sistema.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { logger } from "@/utils/logger";

/** Categorie ammesse dal CHECK sulla tabella: non inventarne altre. */
export const CATEGORIE_CLAUSOLA = [
  "payment_terms",
  "penalties",
  "exclusions",
  "warranty",
  "cancellation",
  "force_majeure",
  "price_revision",
  "custom",
] as const;
export type CategoriaClausola = (typeof CATEGORIE_CLAUSOLA)[number];

export const ETICHETTA_CATEGORIA: Record<CategoriaClausola, string> = {
  payment_terms: "Termini di pagamento",
  penalties: "Penali",
  exclusions: "Esclusioni e limiti di responsabilità",
  warranty: "Garanzia",
  cancellation: "Recesso e disdetta",
  force_majeure: "Cause di forza maggiore",
  price_revision: "Revisione prezzi",
  custom: "Altro",
};

/** Testi informativi che l'azienda può riscrivere con parole sue. */
export const TIPI_LEGALI = ["condizioni", "privacy", "recesso", "inizio_anticipato"] as const;
export type TipoLegale = (typeof TIPI_LEGALI)[number];

export interface QuoteClause {
  id: string;
  company_id: string;
  category: CategoriaClausola;
  title: string;
  content: string;
  active: boolean;
  is_default: boolean;
  sort_order: number;
  applicable_to: { vessatoria?: boolean; tipo_legale?: TipoLegale } | null;
}

export type QuoteClauseInput = Partial<Omit<QuoteClause, "id" | "company_id">> & { id?: string };

export function useQuoteClauses() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: clausole = [], isLoading, error } = useQuery({
    queryKey: queryKeys.quoteClauses.list(companyId),
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from("quote_clause_templates")
        .select("id, company_id, category, title, content, active, is_default, sort_order, applicable_to")
        .eq("company_id", companyId!)
        .order("sort_order", { ascending: true });
      if (qErr) {
        logger.error("Errore caricamento clausole contrattuali:", qErr);
        throw qErr;
      }
      return (data ?? []) as unknown as QuoteClause[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const invalida = () => queryClient.invalidateQueries({ queryKey: queryKeys.quoteClauses.all });

  const salva = useMutation({
    mutationFn: async (input: QuoteClauseInput) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { id, ...resto } = input;
      if (id) {
        const { error: uErr } = await supabase
          .from("quote_clause_templates")
          .update({ ...resto, updated_at: new Date().toISOString() } as never)
          .eq("id", id)
          .eq("company_id", companyId);
        if (uErr) throw uErr;
        return id;
      }
      const { data, error: iErr } = await supabase
        .from("quote_clause_templates")
        .insert({ ...resto, company_id: companyId } as never)
        .select("id")
        .single();
      if (iErr) throw iErr;
      return (data as { id: string }).id;
    },
    onSuccess: invalida,
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { error: dErr } = await supabase
        .from("quote_clause_templates")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (dErr) throw dErr;
    },
    onSuccess: invalida,
  });

  // Shape diverse dalla stessa lista: derivarle qui evita query duplicate.
  const vessatorie = clausole.filter((c) => c.applicable_to?.vessatoria === true);
  const testiLegali = clausole.filter((c) => !!c.applicable_to?.tipo_legale);
  const contrattuali = clausole.filter(
    (c) => !c.applicable_to?.vessatoria && !c.applicable_to?.tipo_legale,
  );

  return { clausole, vessatorie, testiLegali, contrattuali, isLoading, error, salva, elimina };
}
