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

interface Supplier {
  id: string;
  name: string;
}

interface SupplierSelectProps {
  value?: string;
  onValueChange: (value: string | undefined) => void;
  placeholder?: string;
}

export function SupplierSelect({
  value,
  onValueChange,
  placeholder = "Seleziona fornitore",
}: SupplierSelectProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch company ID
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", profile!.company_id)
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!profile?.company_id,
  });

  // Create supplier mutation
  const createSupplierMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          company_id: profile!.company_id,
          name: name.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      onValueChange(data.id);
      setDialogOpen(false);
      setNewSupplierName("");
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
    createSupplierMutation.mutate(newSupplierName);
  };

  return (
    <div className="flex gap-2">
      <Select
        value={value || "none"}
        onValueChange={(v) => onValueChange(v === "none" ? undefined : v)}
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
              {supplier.name}
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
