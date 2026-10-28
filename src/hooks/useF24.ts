import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { readAllPages } from "@/lib/personale/readAllPages";
import { fiscalCommand } from "@/lib/fatturazione/fiscalCommands";

export interface F24Entry {
  id: string;
  company_id: string;
  anno: number;
  mese: number | null;
  tributo_code: string;
  tributo_descrizione: string;
  importo: number;
  stato: "da_pagare" | "pagato" | "annullato";
  data_scadenza: string | null;
  data_pagamento: string | null;
  note: string | null;
  pdf_url: string | null;
  created_at: string;
}

export const TRIBUTI_PREDEFINITI: Array<{
  code: string;
  descrizione: string;
  categoria: string;
}> = [
  {
    code: "1001",
    descrizione: "Ritenute su retribuzioni, pensioni e mensilità aggiuntive",
    categoria: "ERARIO",
  },
  {
    code: "1040",
    descrizione: "Ritenute su redditi di lavoro autonomo — arti e professioni",
    categoria: "ERARIO",
  },
  ...Array.from({ length: 12 }, (_, i) => ({
    code: String(6001 + i),
    descrizione: `IVA mensile — ${["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"][i]}`,
    categoria: "ERARIO",
  })),
];

export function useF24(anno?: number) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const permissions = usePermissions();
  const canEdit =
    permissions.isAdmin && !permissions.solaLettura && !permissions.isLoading;
  const annoCorrente = anno ?? new Date().getFullYear();

  const f24Query = useQuery({
    queryKey: ["f24", "list", companyId, annoCorrente],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) =>
      readAllPages((from, to) =>
        supabase
          .from("f24_entries")
          .select(
            "id, company_id, anno, mese, tributo_code, tributo_descrizione, importo, stato, data_scadenza, data_pagamento, note, pdf_url, created_at",
          )
          .eq("company_id", companyId!)
          .eq("anno", annoCorrente)
          .order("data_scadenza", { ascending: true, nullsFirst: false })
          .order("id")
          .range(from, to)
          .abortSignal(signal),
      ) as Promise<F24Entry[]>,
  });

  const salvaMutation = useMutation({
    mutationFn: async (
      payload: Partial<F24Entry> & {
        tributo_code: string;
        importo: number;
        versione?: string;
      },
    ) => {
      if (!companyId || !canEdit) throw Error("Modifica non autorizzata");
      if (
        !TRIBUTI_PREDEFINITI.some((t) => t.code === payload.tributo_code) ||
        !Number.isFinite(payload.importo) ||
        payload.importo <= 0 ||
        !payload.note ||
        payload.note.trim().length < 5
      )
        throw Error(
          "Verifica codice, importo e riferimento al prospetto del consulente",
        );
      if (payload.stato && payload.stato !== "da_pagare")
        throw Error(
          "Gli esiti di pagamento richiedono una quietanza verificata",
        );
      const record = {
        company_id: companyId!,
        anno: annoCorrente,
        tributo_code: payload.tributo_code,
        tributo_descrizione:
          payload.tributo_descrizione ??
          TRIBUTI_PREDEFINITI.find((t) => t.code === payload.tributo_code)
            ?.descrizione ??
          payload.tributo_code,
        importo: payload.importo,
        stato: payload.stato ?? "da_pagare",
        data_scadenza: payload.data_scadenza ?? null,
        mese: payload.mese ?? null,
        note: payload.note ?? null,
      };
      if (payload.id) {
        const { error } = await supabase
          .from("f24_entries")
          .update(record)
          .eq("id", payload.id)
          .eq("company_id", companyId!)
          .eq("stato", "da_pagare")
          .select("id")
          .single();
        if (error) throw error;
      } else {
        if (!payload.versione || !payload.mese)
          throw Error("Verifica prima l’anteprima del mese");
        const result = await fiscalCommand("fiscalita_f24_conferma", {
          p_company: companyId,
          p_anno: annoCorrente,
          p_mese: payload.mese,
          p_versione: payload.versione,
          p_righe: [record],
          p_riferimento: payload.note,
        });
        if (result.ok !== true) throw Error("Conferma non ricevuta dal server");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["f24", "list", companyId, annoCorrente],
      });
      toast.success("Registrazione F24 salvata. Nessun pagamento eseguito.");
    },
    onError: () => toast.error("Errore salvataggio F24"),
  });

  const entries = f24Query.data ?? [];
  const oggi = new Date();
  const scadentiProssimi30gg = entries.filter((e) => {
    if (e.stato !== "da_pagare" || !e.data_scadenza) return false;
    const diff =
      (new Date(e.data_scadenza).getTime() - oggi.getTime()) / 86400000;
    return diff >= 0 && diff <= 30;
  });

  return {
    entries,
    companyId,
    anteprima: async (mese: number) => {
      if (!companyId || !canEdit) throw Error("Verifica non autorizzata");
      const data = await fiscalCommand("fiscalita_f24_anteprima", {
        p_company: companyId,
        p_anno: annoCorrente,
        p_mese: mese,
      });
      if (typeof data.versione !== "string")
        throw Error("Versione anteprima non disponibile");
      return data.versione;
    },
    canEdit,
    isError: f24Query.isError,
    refetch: f24Query.refetch,
    isLoading: f24Query.isLoading,
    salva: salvaMutation.mutateAsync,
    isSalvando: salvaMutation.isPending,
    scadentiProssimi30gg,
    totaleAPagare: entries
      .filter((e) => e.stato === "da_pagare")
      .reduce((s, e) => s + Number(e.importo), 0),
  };
}
