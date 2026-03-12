import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import type { DocumentoFiscale, TipoDocumento, StatoDocumento } from "@/types/fatturazione";

// ─── Filters ──────────────────────────────────────────────────

export interface DocumentiFiscaliFilters {
  tipo?: TipoDocumento | TipoDocumento[];
  stato?: StatoDocumento | StatoDocumento[];
  anagrafica_id?: string;
  data_da?: string;
  data_a?: string;
  search?: string;
  page?: number;
  perPage?: number;
}

// ─── Row mapper ───────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): DocumentoFiscale {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    tipo: row.tipo as TipoDocumento,
    numero: row.numero as string,
    numero_progressivo: row.numero_progressivo as number,
    anno: row.anno as number,
    serie: row.serie as string | undefined,
    data_emissione: row.data_emissione as string,
    data_scadenza: row.data_scadenza as string | undefined,
    data_consegna: row.data_consegna as string | undefined,
    anagrafica_id: row.anagrafica_id as string | undefined,
    cliente_snapshot: (row.cliente_snapshot ?? {}) as DocumentoFiscale["cliente_snapshot"],
    stato: row.stato as StatoDocumento,
    sdi_id_trasmissione: row.sdi_id_trasmissione as string | undefined,
    sdi_stato: row.sdi_stato as string | undefined,
    sdi_errori: (row.sdi_errori ?? []) as unknown[],
    righe: (row.righe ?? []) as DocumentoFiscale["righe"],
    riepilogo_iva: (row.riepilogo_iva ?? []) as DocumentoFiscale["riepilogo_iva"],
    subtotale: Number(row.subtotale ?? 0),
    sconto_globale_percentuale: row.sconto_globale_percentuale as number | undefined,
    sconto_globale_valore: row.sconto_globale_valore as number | undefined,
    imponibile_totale: Number(row.imponibile_totale ?? 0),
    iva_totale: Number(row.iva_totale ?? 0),
    totale_documento: Number(row.totale_documento ?? 0),
    bollo_virtuale: row.bollo_virtuale as boolean | undefined,
    ritenuta_acconto: row.ritenuta_acconto as boolean | undefined,
    ritenuta_tipo: row.ritenuta_tipo as DocumentoFiscale["ritenuta_tipo"],
    ritenuta_aliquota: row.ritenuta_aliquota as number | undefined,
    ritenuta_causale: row.ritenuta_causale as string | undefined,
    ritenuta_importo: row.ritenuta_importo as number | undefined,
    cassa_previdenziale: row.cassa_previdenziale as boolean | undefined,
    cassa_tipo: row.cassa_tipo as string | undefined,
    cassa_aliquota: row.cassa_aliquota as number | undefined,
    cassa_importo: row.cassa_importo as number | undefined,
    totale_da_pagare: Number(row.totale_da_pagare ?? 0),
    scadenze_pagamento: (row.scadenze_pagamento ?? []) as DocumentoFiscale["scadenze_pagamento"],
    metodo_pagamento_codice: row.metodo_pagamento_codice as DocumentoFiscale["metodo_pagamento_codice"],
    iban_pagamento: row.iban_pagamento as string | undefined,
    documento_correlato_id: row.documento_correlato_id as string | undefined,
    cig: row.cig as string | undefined,
    cup: row.cup as string | undefined,
    note_documento: row.note_documento as string | undefined,
    importo_pagato: Number(row.importo_pagato ?? 0),
    pagato_at: row.pagato_at as string | undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  } as DocumentoFiscale;
}

// ─── List hook ────────────────────────────────────────────────

export function useDocumentiFiscali(filters: DocumentiFiscaliFilters = {}) {
  const companyId = useEffectiveCompanyId();
  const page = filters.page ?? 0;
  const perPage = filters.perPage ?? 50;

  return useQuery({
    queryKey: queryKeys.documentiFiscali.list(companyId ?? undefined, filters),
    enabled: !!companyId,
    queryFn: async () => {
      let query = supabase
        .from("documenti_fiscali" as never)
        .select("*", { count: "exact" })
        .eq("company_id", companyId!)
        .order("data_emissione", { ascending: false })
        .range(page * perPage, (page + 1) * perPage - 1);

      if (filters.tipo) {
        const tipi = Array.isArray(filters.tipo) ? filters.tipo : [filters.tipo];
        query = query.in("tipo", tipi);
      }
      if (filters.stato) {
        const stati = Array.isArray(filters.stato) ? filters.stato : [filters.stato];
        query = query.in("stato", stati);
      }
      if (filters.anagrafica_id) {
        query = query.eq("anagrafica_id", filters.anagrafica_id);
      }
      if (filters.data_da) {
        query = query.gte("data_emissione", filters.data_da);
      }
      if (filters.data_a) {
        query = query.lte("data_emissione", filters.data_a);
      }
      if (filters.search) {
        query = query.or(`numero.ilike.%${filters.search}%,note_documento.ilike.%${filters.search}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        documenti: ((data as unknown[]) ?? []).map((r) => mapRow(r as Record<string, unknown>)),
        total: count ?? 0,
        page,
        perPage,
      };
    },
  });
}

// ─── Detail hook ──────────────────────────────────────────────

export function useDocumentoFiscale(id: string | undefined) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: queryKeys.documentiFiscali.detail(id),
    enabled: !!id && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documenti_fiscali" as never)
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return mapRow(data as Record<string, unknown>);
    },
  });
}

// ─── Create mutation ──────────────────────────────────────────

interface CreateDocumentoInput {
  tipo: TipoDocumento;
  anagrafica_id?: string;
  cliente_snapshot?: DocumentoFiscale["cliente_snapshot"];
  righe?: DocumentoFiscale["righe"];
  data_emissione?: string;
  data_scadenza?: string;
  note_documento?: string;
  metodo_pagamento_codice?: string;
  [key: string]: unknown;
}

export function useCreateDocumento() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDocumentoInput) => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");

      // Generate progressive number via RPC
      const { data: numero, error: rpcError } = await supabase.rpc(
        "genera_numero_documento_native" as never,
        {
          p_company_id: companyId,
          p_tipo: input.tipo,
          p_anno: new Date().getFullYear(),
        } as never
      );

      if (rpcError) throw rpcError;

      const progressivo = parseInt((numero as string).split("-").pop() ?? "1", 10);

      const { data, error } = await supabase
        .from("documenti_fiscali" as never)
        .insert({
          company_id: companyId,
          numero: numero as string,
          numero_progressivo: progressivo,
          anno: new Date().getFullYear(),
          stato: "bozza",
          ...input,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return mapRow(data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
      toast.success("Documento creato");
    },
    onError: (err: Error) => {
      toast.error("Errore nella creazione", { description: err.message });
    },
  });
}

// ─── Update mutation ──────────────────────────────────────────

export function useUpdateDocumento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: unknown }) => {
      const { data, error } = await supabase
        .from("documenti_fiscali" as never)
        .update({ ...updates, updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return mapRow(data as Record<string, unknown>);
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.detail(doc.id) });
      toast.success("Documento aggiornato");
    },
    onError: (err: Error) => {
      toast.error("Errore nell'aggiornamento", { description: err.message });
    },
  });
}

// ─── Delete mutation (only bozza) ─────────────────────────────

export function useDeleteDocumento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Verify it's a draft
      const { data: doc, error: fetchErr } = await supabase
        .from("documenti_fiscali" as never)
        .select("stato")
        .eq("id", id)
        .single();

      if (fetchErr) throw fetchErr;
      if ((doc as Record<string, unknown>)?.stato !== "bozza") {
        throw new Error("Solo i documenti in bozza possono essere eliminati");
      }

      const { error } = await supabase
        .from("documenti_fiscali" as never)
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
      toast.success("Documento eliminato");
    },
    onError: (err: Error) => {
      toast.error("Errore nell'eliminazione", { description: err.message });
    },
  });
}

// ─── Emit mutation (bozza → emessa) ──────────────────────────

export function useEmittiDocumento() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: doc, error: fetchErr } = await supabase
        .from("documenti_fiscali" as never)
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr) throw fetchErr;

      const d = doc as Record<string, unknown>;
      if (d.stato !== "bozza") {
        throw new Error("Solo i documenti in bozza possono essere emessi");
      }

      const righe = (d.righe as unknown[]) ?? [];
      if (righe.length === 0) {
        throw new Error("Il documento deve avere almeno una riga");
      }

      const clienteSnapshot = d.cliente_snapshot as Record<string, unknown> | null;
      if (!clienteSnapshot?.ragione_sociale) {
        throw new Error("Il cliente è obbligatorio per emettere il documento");
      }

      const { data: updated, error } = await supabase
        .from("documenti_fiscali" as never)
        .update({ stato: "emessa", updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return mapRow(updated as Record<string, unknown>);
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.documentiFiscali.detail(doc.id) });
      toast.success("Documento emesso");
    },
    onError: (err: Error) => {
      toast.error("Errore nell'emissione", { description: err.message });
    },
  });
}
