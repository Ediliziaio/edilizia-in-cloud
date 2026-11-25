import { ViaggioSelect } from "@/components/mezzi/ViaggioSelect";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FornitoreEditor } from "@/components/suppliers/FornitoreEditor";
import {
  payloadFornitore,
  type Supplier,
  type SupplierFormData,
} from "@/lib/suppliers/anagraficaFornitore";
import { invalidaFornitori } from "@/lib/suppliers/cacheFornitori";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { categorieFornitore } from "@/lib/fornitori/categorieFornitore";

interface SupplierSelectProps {
  searchable?: boolean;
  allowCreate?: boolean;
  inlineCreate?: boolean;
  onSupplierNameChange?: (name: string) => void;
  value?: string;
  onValueChange: (
    value: string | undefined,
    supplierVatRate?: number,
    paymentMethod?: string,
  ) => void;
  placeholder?: string;
  /**
   * v8.6.34 — Fallback companyId per super_admin senza impersonation.
   * Se effectiveCompany è null, usiamo questo (es. company della commessa).
   */
  fallbackCompanyId?: string;
}

export function SupplierSelect({
  value,
  onValueChange,
  placeholder,
  fallbackCompanyId,
  searchable = false,
  allowCreate = true,
  inlineCreate = false,
  onSupplierNameChange,
}: SupplierSelectProps) {
  const t = useT();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { effectiveCompany } = useAuth();

  const queryClient = useQueryClient();

  const companyId = effectiveCompany?.id ?? fallbackCompanyId;

  // Fetch suppliers
  const {
    data: suppliers = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["suppliers-for-orders", companyId],
    queryFn: async () => {
      return loadCatalogPages<Supplier>((from, to) =>
        supabase
          .from("suppliers")
          .select("*")
          .eq("company_id", companyId!)
          .order("name")
          .order("id")
          .range(from, to),
      );
    },
    enabled: !!companyId,
  });

  // Create supplier mutation
  const createSupplierMutation = useMutation({
    mutationFn: async (form: SupplierFormData) => {
      if (!companyId) throw new Error("Azienda non disponibile.");
      const { data, error } = await supabase
        .from("suppliers")
        .insert({ ...payloadFornitore(form), company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      await invalidaFornitori(queryClient);
      onValueChange(
        data.id,
        data.vat_rate ?? 22,
        data.payment_method || undefined,
      );
      onSupplierNameChange?.(data.name);
      setDialogOpen(false);
      toast.success(t("Fornitore creato"), {
        description: t("{nome} è stato aggiunto ai fornitori.", { nome: data.name }),
      });
    },
    onError: (error) =>
      toast.error(t("Fornitore non creato"), {
        description: userErrorMessage(
          error,
          t("Non sono riuscito a salvare il fornitore. Riprova."),
        ),
      }),
  });

  const handleSelectChange = (v: string) => {
    onSupplierNameChange?.(suppliers.find((s) => s.id === v)?.name ?? "");
    if (v === "none") {
      onValueChange(undefined, undefined, undefined);
    } else {
      const supplier = suppliers.find((s) => s.id === v);
      onValueChange(
        v,
        supplier?.vat_rate ?? undefined,
        supplier?.payment_method || undefined,
      );
    }
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex gap-2">
        {searchable ? (
          <ViaggioSelect
            label={t("Fornitore")}
            value={value || "none"}
            onValueChange={handleSelectChange}
            disabled={isLoading || isError}
            emptyMessage={t("Fornitore non trovato. Usa + per registrarlo.")}
            options={[
              // Senza fornitore scelto la tendina mostra il «placeholder» di chi la usa: nelle bolle è
              // «Non in rubrica: <nome letto dall'AI>». Prima restava sempre «Nessun fornitore» (25/11/2026).
              { value: "none", label: placeholder ?? t("Nessun fornitore") },
              ...suppliers
                .filter((s) => s.is_active !== false || s.id === value)
                .map((s) => ({ value: s.id, label: [s.name, categorieFornitore(s).join(" · ")].filter(Boolean).join(" — ") })),
            ]}
          />
        ) : (
          <Select
            disabled={isLoading || isError}
            value={value || "none"}
            onValueChange={handleSelectChange}
          >
            <SelectTrigger className="min-w-0 flex-1" aria-label={t("Fornitore")}>
              <SelectValue placeholder={placeholder ?? t("Seleziona fornitore")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">{t("Nessun fornitore")}</span>
              </SelectItem>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  <span>
                    {supplier.name} ({supplier.vat_rate ?? 22}%)
                    {categorieFornitore(supplier).length > 0 && <span className="ml-2 text-xs text-muted-foreground">{categorieFornitore(supplier).join(" · ")}</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setDialogOpen(true)}
                aria-label={t("Aggiungi nuovo fornitore")}
                disabled={
                  !allowCreate ||
                  !companyId ||
                  isLoading ||
                  isError ||
                  createSupplierMutation.isPending
                }
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("Aggiungi nuovo fornitore")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {isError && (
        <p role="alert" className="text-xs text-destructive">
          {t("Elenco fornitori non disponibile.")}{" "}
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => void refetch()}
          >
            {t("Riprova fornitori")}
          </Button>
        </p>
      )}
      <FornitoreEditor
        aperta={dialogOpen}
        inline={inlineCreate}
        fornitore={null}
        esteroIniziale={false}
        fornitori={suppliers}
        categorieEsistenti={[
          ...new Set(
            suppliers
              .flatMap(categorieFornitore)
              .filter((c): c is string => !!c),
          ),
        ]}
        salvataggio={createSupplierMutation.isPending}
        onChiudi={() => setDialogOpen(false)}
        onSalva={(form) => createSupplierMutation.mutate(form)}
      />
    </div>
  );
}
