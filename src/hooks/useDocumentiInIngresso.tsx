import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentiDDT } from "@/hooks/useDocumentiDDT";
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
import {
  documentiDb,
  avviaLetturaPersistente,
  type DocumentoPersistente,
} from "@/lib/ddt/documentiPersistenti";
import { RevisioneDocumento } from "@/components/ddt/DocumentiInIngresso";

export function useDocumentiInIngresso(enabled = true) {
  const { effectiveCompany } = useAuth();
  const ripresaLocale = useOfflineSync({
    companyId: effectiveCompany?.id ?? null,
  });
  const query = useDocumentiDDT(false, undefined, false, enabled);
  const qc = useQueryClient();
  const [aperto, setAperto] = useState<DocumentoPersistente | null>(null);
  const [riprovando, setRiprovando] = useState<string | null>(null);
  const documenti = enabled
    ? (query.data ?? []).filter(
        (j) => !["registered", "split"].includes(j.status),
      )
    : [];
  const riprova = async (j: DocumentoPersistente) => {
    if (!enabled) return;
    setRiprovando(j.id);
    try {
      const { error } = await documentiDb.rpc("ddt_documento_ritenta", {
        p_id: j.id,
      });
      if (error) throw error;
      void avviaLetturaPersistente(j.id).catch(() => {});
      await qc.invalidateQueries({ queryKey: ["ddt-documenti"] });
      toast.success(
        j.status === "da_leggere"
          ? "Lettura con l'AI avviata"
          : "Lettura rimessa in coda",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Non riesco a riprovare");
    } finally {
      setRiprovando(null);
    }
  };
  return {
    query,
    documenti,
    ripresaLocale,
    riprovando,
    riprova,
    apri: (j: DocumentoPersistente) => {
      if (enabled) setAperto(j);
    },
    dialog:
      enabled && aperto ? (
        <RevisioneDocumento
          documento={aperto}
          onClose={() => {
            setAperto(null);
            void query.refetch();
          }}
        />
      ) : null,
  };
}
