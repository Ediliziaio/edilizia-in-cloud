import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { leggiModelliPdf, salvaModelloPdf } from "@/lib/modelliPdf/repository";
import type { ModelloPdf, TipoModelloPdf } from "@/lib/modelliPdf/catalogo";
export function useDocumentPdfTemplates() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["modelli-pdf-documenti", companyId],
    enabled: !!companyId,
    queryFn: () => leggiModelliPdf(companyId!),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const save = async (
    tipo: TipoModelloPdf,
    config: ModelloPdf,
    versione: string | null,
  ) => {
    if (!companyId) throw new Error("Azienda non disponibile");
    const saved = await salvaModelloPdf(companyId, tipo, config, versione);
    await qc.invalidateQueries({
      queryKey: ["modelli-pdf-documenti", companyId],
    });
    return saved;
  };
  return { ...query, save };
}
