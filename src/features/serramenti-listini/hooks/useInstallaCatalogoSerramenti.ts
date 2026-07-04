/**
 * Hook: useInstallaCatalogoSerramenti
 *
 * Wrapper su supabase.functions.invoke('serramenti-installa-catalogo').
 * Gestisce toast success/error e invalidation della query article_families.
 *
 * Input mutation: { companyId, slugs? } — se slugs vuoto, installa tutte le
 * 20 tipologie. Altrimenti solo quelle passate.
 *
 * Output edge: { ok, installed, skipped, errors: string[] }.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { captureVelocityError } from "@/lib/velocity/sentry";
import { queryKeys } from "@/lib/queryKeys";

interface InstallaCatalogoInput {
  companyId: string;
  slugs?: string[];
}

interface InstallaCatalogoResult {
  ok: true;
  installed: number;
  skipped: number;
  errors: string[];
}

export function useInstallaCatalogoSerramenti() {
  const qc = useQueryClient();

  return useMutation<InstallaCatalogoResult, Error, InstallaCatalogoInput>({
    mutationFn: async ({ companyId, slugs }) => {
      if (!companyId) {
        throw new Error("Azienda non identificata");
      }
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        installed?: number;
        skipped?: number;
        errors?: string[];
        error?: string;
      }>("serramenti-installa-catalogo", {
        body: {
          company_id: companyId,
          ...(slugs && slugs.length > 0 ? { slugs } : {}),
        },
      });

      if (error) {
        throw new Error(error.message || "Errore di rete nell'installazione");
      }
      if (!data || data.ok !== true) {
        throw new Error(data?.error ?? "Installazione non riuscita");
      }
      return {
        ok: true,
        installed: data.installed ?? 0,
        skipped: data.skipped ?? 0,
        errors: data.errors ?? [],
      };
    },
    onSuccess: (result) => {
      const { installed, skipped, errors } = result;
      if (errors.length > 0) {
        toast.warning(`Installate ${installed} tipologie con ${errors.length} errori`, {
          description: errors.slice(0, 3).join("; "),
        });
      } else if (installed === 0 && skipped > 0) {
        toast.info("Catalogo già installato", {
          description: `${skipped} tipologie erano già presenti.`,
        });
      } else {
        toast.success("Catalogo installato", {
          description:
            skipped > 0
              ? `${installed} tipologie create, ${skipped} già presenti.`
              : `${installed} tipologie create.`,
        });
      }
      // Invalida le liste famiglie: la chiave registry è "article-families"
      // (col trattino, queryKeys.ts) — le vecchie ["article_families"]/
      // ["families"] non matchavano nessuna query → catalogo stale 5 min.
      qc.invalidateQueries({ queryKey: queryKeys.articleFamilies.all });
    },
    onError: (err, variables) => {
      captureVelocityError("serramenti-listini.installa_catalogo", err, {
        companyId: variables.companyId,
        slugCount: variables.slugs?.length ?? null,
      });
      toast.error("Errore installazione catalogo", { description: err.message });
    },
  });
}
