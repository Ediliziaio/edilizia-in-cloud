import { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VAT_RATES } from "@/lib/vatUtils";

interface Supplier {
  id: string;
  name: string;
  vat_rate: number;
}

interface SupplierSelectProps {
  value?: string;
  onValueChange: (value: string | undefined, supplierVatRate?: number) => void;
  placeholder?: string;
}

export function SupplierSelect({
  value,
  onValueChange,
  placeholder = "Seleziona fornitore",
}: SupplierSelectProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierVatRate, setNewSupplierVatRate] = useState<number>(22);
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const companyId = effectiveCompany?.id;

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, vat_rate")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!companyId,
  });

  // Create supplier mutation
  const createSupplierMutation = useMutation({
    mutationFn: async ({ name, vatRate }: { name: string; vatRate: number }) => {
      if (!companyId) throw new Error("Company ID non disponibile");
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          company_id: companyId,
          name: name.trim(),
          vat_rate: vatRate,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      onValueChange(data.id, data.vat_rate);
      setDialogOpen(false);
      setNewSupplierName("");
      setNewSupplierVatRate(22);
      toast({
        title: "Fornitore creato",
        description: `${data.name} è stato aggiunto ai fornitori.`,
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante la creazione del fornitore.",
        variant: "destructive",
      });
    },
  });

  const handleCreateSupplier = () => {
    if (!newSupplierName.trim()) return;
    createSupplierMutation.mutate({ name: newSupplierName, vatRate: newSupplierVatRate });
  };

  const handleSelectChange = (v: string) => {
    if (v === "none") {
      onValueChange(undefined, undefined);
    } else {
      const supplier = suppliers.find(s => s.id === v);
      onValueChange(v, supplier?.vat_rate);
    }
  };

  return (
    <div className="flex gap-2">
      <Select
        value={value || "none"}
        onValueChange={handleSelectChange}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <span className="text-muted-foreground">Nessun fornitore</span>
          </SelectItem>
          {suppliers.map((supplier) => (
            <SelectItem key={supplier.id} value={supplier.id}>
              {supplier.name} ({supplier.vat_rate}%)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setDialogOpen(true)}
        title="Nuovo fornitore"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuovo Fornitore</DialogTitle>
            <DialogDescription>
              Aggiungi un nuovo fornitore all'elenco
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supplier-name">Nome Fornitore *</Label>
              <Input
                id="supplier-name"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="Es: ABC Serramenti"
              />
            </div>
            <div className="space-y-2">
              <Label>Aliquota IVA Predefinita</Label>
              <Select
                value={newSupplierVatRate.toString()}
                onValueChange={(v) => setNewSupplierVatRate(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((rate) => (
                    <SelectItem key={rate.value} value={rate.value.toString()}>
                      {rate.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleCreateSupplier}
              disabled={!newSupplierName.trim() || createSupplierMutation.isPending}
            >
              {createSupplierMutation.isPending ? "Creazione..." : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
