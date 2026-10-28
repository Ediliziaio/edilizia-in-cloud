import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import {
  receivedSupplierGroups,
  type ReceivedSupplierRow,
  type PartnerIdentity,
} from "@/lib/suppliers/partnerRelations";

export type ReconciliationKind = "cliente" | "fornitore";
export type FiscalPartner = PartnerIdentity & {
  cliente_id: string | null;
  fornitore_id: string | null;
  tipo: string;
  receiptIds?: string[];
};
type FiscalRow = {
  id: string;
  company_id: string;
  tipo: string;
  ragione_sociale: string | null;
  nome: string | null;
  cognome: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  cliente_id: string | null;
  fornitore_id: string | null;
  attivo: boolean;
};
type CustomerRow = {
  id: string;
  company_id: string;
  first_name: string | null;
  last_name: string | null;
  vat_number: string | null;
  fiscal_code: string | null;
};
type SupplierRow = {
  id: string;
  company_id: string;
  name: string;
  vat_number: string | null;
  fiscal_code: string | null;
  is_active: boolean;
};

export function usePartnerReconciliation(
  companyId: string | null,
  kind: ReconciliationKind,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["partner-reconciliation", companyId, kind],
    enabled: !!companyId && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId) throw Error("Seleziona un’azienda.");
      const fiscal = await loadCatalogPages<FiscalRow>(
        (from, to) =>
          supabase
            .from("anagrafiche_native" as never)
            .select(
              "id,company_id,tipo,ragione_sociale,nome,cognome,partita_iva,codice_fiscale,cliente_id,fornitore_id,attivo",
            )
            .eq("company_id", companyId)
            .in("tipo", [kind, "entrambi"])
            .order("id")
            .range(from, to) as never,
      );
      let targets: PartnerIdentity[];
      let receipts: FiscalPartner[] = [];
      if (kind === "cliente") {
        const rows = await loadCatalogPages<CustomerRow>(
          (from, to) =>
            supabase
              .rpc(
                "fiscal_customer_candidates" as never,
                { p_company_id: companyId } as never,
              )
              .order("id")
              .range(from, to) as never,
        );
        targets = rows.map((r) => ({
          id: r.id,
          company_id: r.company_id,
          name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
          vat: r.vat_number,
          fiscal: r.fiscal_code,
        }));
      } else {
        const rows = await loadCatalogPages<SupplierRow>((from, to) =>
          supabase
            .from("suppliers")
            .select("id,company_id,name,vat_number,fiscal_code,is_active")
            .eq("company_id", companyId)
            .order("id")
            .range(from, to),
        );
        targets = rows.map((r) => ({
          id: r.id,
          company_id: r.company_id,
          name: r.name,
          vat: r.vat_number,
          fiscal: r.fiscal_code,
          active: r.is_active,
        }));
        const received = await loadCatalogPages<ReceivedSupplierRow>(
          (from, to) =>
            supabase
              .from("fatture_ricevute" as never)
              .select(
                "id,company_id,cedente_ragione_sociale,cedente_piva,cedente_cf,cedente_paese,fornitore_id",
              )
              .eq("company_id", companyId)
              .order("id")
              .range(from, to) as never,
        );
        receipts = receivedSupplierGroups(received).map(
          (r): FiscalPartner => ({
            ...r,
            tipo: "fornitore",
            cliente_id: null,
          }),
        );
      }
      return {
        fiscal: [
          ...fiscal.map(
            (r): FiscalPartner => ({
              id: r.id,
              company_id: r.company_id,
              name:
                r.ragione_sociale ||
                `${r.nome ?? ""} ${r.cognome ?? ""}`.trim(),
              vat: r.partita_iva,
              fiscal: r.codice_fiscale,
              active: r.attivo,
              cliente_id: r.cliente_id,
              fornitore_id: r.fornitore_id,
              tipo: r.tipo,
            }),
          ),
          ...receipts,
        ],
        targets,
      };
    },
  });
}

export function useReconcilePartner(
  companyId: string | null,
  canEdit: boolean,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fiscalId,
      kind,
      targetId,
      completeMissing,
      receiptIds,
    }: {
      fiscalId: string;
      kind: ReconciliationKind;
      targetId: string | null;
      completeMissing: boolean;
      receiptIds?: string[];
    }) => {
      if (!companyId || !canEdit)
        throw Error("Non puoi modificare i collegamenti fiscali.");
      if (receiptIds) {
        if (kind !== "fornitore")
          throw Error("Fonte di riconciliazione non valida.");
        const { error } = await supabase.rpc(
          "collega_fornitore_ricevute" as never,
          {
            p_company_id: companyId,
            p_invoice_ids: receiptIds,
            p_supplier_id: targetId,
          } as never,
        );
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc(
        "collega_anagrafica_operativa" as never,
        {
          p_company_id: companyId,
          p_anagrafica_id: fiscalId,
          p_tipo: kind,
          p_target_id: targetId,
          p_sync: completeMissing,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all(
        [
          "partner-reconciliation",
          "anagrafiche-native",
          "anagrafiche-reconciliation",
          "anagrafica-suggested-matches",
          "fatture-ricevute",
        ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
      );
    },
  });
}
