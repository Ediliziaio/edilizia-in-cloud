// v8.6.58 — CRUD dati fatturazione separati dall'anagrafica company
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface BillingDetails {
  company_id: string;
  legal_name: string | null;
  vat_number: string | null;
  tax_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  country: string;
  pec: string | null;
  sdi_code: string | null;
  invoice_email: string | null;
  payment_method: "card" | "bank_transfer" | "sepa" | null;
  updated_at?: string;
}

export type BillingDetailsInput = Partial<Omit<BillingDetails, "company_id" | "updated_at">>;

const KEY = (companyId?: string) => ["company-billing-details", companyId];

export function useBillingDetails() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: KEY(companyId),
    enabled: !!companyId,
    queryFn: async (): Promise<BillingDetails | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("company_billing_details")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) {
        // Resiliente pre-migration
        if (/company_billing_details.*does not exist/i.test(error.message ?? "")) return null;
        throw error;
      }
      return (data as BillingDetails) ?? null;
    },
  });
}

export function useSaveBillingDetails() {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BillingDetailsInput) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      // Validazioni base client-side
      const vat = (input.vat_number ?? "").trim();
      if (vat && vat.length < 6) throw new Error("P.IVA troppo corta (minimo 6 caratteri)");
      const sdi = (input.sdi_code ?? "").trim().toUpperCase();
      if (sdi && sdi.length !== 7) throw new Error("Codice destinatario SDI deve essere di 7 caratteri");
      const pec = (input.pec ?? "").trim();
      if (pec && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pec)) throw new Error("PEC non valida");

      const payload = {
        company_id: companyId,
        legal_name: input.legal_name?.trim() || null,
        vat_number: vat || null,
        tax_code: input.tax_code?.trim().toUpperCase() || null,
        address_line1: input.address_line1?.trim() || null,
        address_line2: input.address_line2?.trim() || null,
        postal_code: input.postal_code?.trim() || null,
        city: input.city?.trim() || null,
        province: input.province?.trim().toUpperCase().slice(0, 2) || null,
        country: input.country?.trim().toUpperCase().slice(0, 2) || "IT",
        pec: pec || null,
        sdi_code: sdi || null,
        invoice_email: input.invoice_email?.trim() || null,
        payment_method: input.payment_method ?? null,
        updated_by: user?.id ?? null,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("company_billing_details")
        .upsert(payload, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dati fatturazione salvati");
      qc.invalidateQueries({ queryKey: KEY(companyId) });
    },
    onError: (err) =>
      toast.error("Errore salvataggio dati fatturazione", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      }),
  });
}
