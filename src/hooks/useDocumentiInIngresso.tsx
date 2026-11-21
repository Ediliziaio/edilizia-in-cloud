import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentiDDT } from "@/hooks/useDocumentiDDT";
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
import {
  documentiDb,
  avviaLetturaPersistente,
  type DocumentoPersistente,
  type PossibileDuplicatoDDT,
  type RiepilogoInvioWhatsApp,
} from "@/lib/ddt/documentiPersistenti";
import { RevisioneDocumento } from "@/components/ddt/DocumentiInIngresso";

export function useDocumentiInIngresso(enabled = true, documentoId?: string, invioId?: string) {
  const { effectiveCompany, user } = useAuth();
  const ripresaLocale = useOfflineSync({
    companyId: effectiveCompany?.id ?? null,
  });
  const query = useDocumentiDDT(false, undefined, !!documentoId, enabled, documentoId, invioId);
  const qc = useQueryClient();
  const [aperto, setAperto] = useState<DocumentoPersistente | null>(null);
  const [riprovando, setRiprovando] = useState<string | null>(null);
  const documenti = enabled
    ? (query.data ?? []).filter(
        (j) => !["registered", "split"].includes(j.status),
      )
    : [];
  const documentiLetti = documenti.filter(j => j.status === "review").slice(0, 120);
  const info = useQuery({
    queryKey: ["ddt-ingresso-info", effectiveCompany?.id, user?.id, invioId, documentoId, documentiLetti.map(j => [j.id, j.updated_at])],
    enabled: enabled && !!effectiveCompany?.id && !!user?.id && (!documentoId || documentiLetti.length > 0),
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const p_company = effectiveCompany!.id;
      const [invii, duplicati] = await Promise.all([
        !documentoId ? documentiDb.rpc("ddt_ingresso_invii", { p_company, p_invio: invioId ?? null }) : { data: [], error: null },
        documentiLetti.length
          ? documentiDb.rpc("ddt_ingresso_duplicati", { p_company, p_documenti: documentiLetti.map(j => j.id) })
          : { data: [], error: null },
      ]);
      const errore = [invii.error, duplicati.error].find(e => e && e.code !== "PGRST202");
      if (errore) throw errore;
      return { invii: (invii.data ?? []) as RiepilogoInvioWhatsApp[], duplicati: (duplicati.data ?? []) as PossibileDuplicatoDDT[] };
    },
  });
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
    invii: info.data?.invii ?? [],
    duplicati: new Map(info.data?.duplicati.map(d => [d.documento_id, d])),
    infoNonAggiornate: info.isError,
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
