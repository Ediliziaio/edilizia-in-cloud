import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface CustomField {
  id: string;
  company_id: string;
  name: string;
  field_type: string;
  options: string[];
  section: string;
  position: number;
  created_at: string;
}

const FIELD_TYPES = [
  { value: "text", label: "Testo" },
  { value: "number", label: "Numero" },
  { value: "date", label: "Data" },
  { value: "select", label: "Selezione" },
];

const SECTIONS = [
  { value: "contact", label: "Contatto" },
  { value: "general_info", label: "Informazioni generali" },
  { value: "additional_info", label: "Informazioni aggiuntive" },
];

export function CustomFieldsConfig() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [section, setSection] = useState("general_info");
  const [optionsInput, setOptionsInput] = useState("");

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ["marketing_custom_fields", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("*")
        .eq("company_id", companyId)
        .order("section")
        .order("position");
      if (error) throw error;
      return data as CustomField[];
    },
    enabled: !!companyId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !name.trim()) return;
      const options = fieldType === "select"
        ? optionsInput.split(",").map((o) => o.trim()).filter(Boolean)
        : [];
      const { error } = await supabase.from("marketing_custom_fields").insert({
        company_id: companyId,
        name: name.trim(),
        field_type: fieldType,
        options,
        section,
        position: fields.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields"] });
      toast.success("Campo personalizzato aggiunto");
      setDialogOpen(false);
      setName("");
      setFieldType("text");
      setSection("general_info");
      setOptionsInput("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_custom_fields").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields"] });
      toast.success("Campo eliminato");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const getTypeLabel = (t: string) => FIELD_TYPES.find((f) => f.value === t)?.label || t;
  const getSectionLabel = (s: string) => SECTIONS.find((sec) => sec.value === s)?.label || s;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Campi Personalizzati</CardTitle>
            <CardDescription>
              Definisci i campi personalizzati che appariranno nella scheda dei contatti marketing.
            </CardDescription>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nuovo campo
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Caricamento...</p>
          ) : fields.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              Nessun campo personalizzato definito. Clicca "Nuovo campo" per iniziare.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Sezione</TableHead>
                  <TableHead>Opzioni</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getTypeLabel(f.field_type)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {getSectionLabel(f.section)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {f.field_type === "select" && f.options?.length > 0
                        ? f.options.join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteMutation.mutate(f.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo Campo Personalizzato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome del campo *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="es. Tipo di caldaia"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={fieldType} onValueChange={setFieldType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sezione</Label>
                <Select value={section} onValueChange={setSection}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SECTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {fieldType === "select" && (
              <div className="space-y-1.5">
                <Label>Opzioni (separate da virgola)</Label>
                <Input
                  value={optionsInput}
                  onChange={(e) => setOptionsInput(e.target.value)}
                  placeholder="es. Condensazione, Tradizionale, Ibrida"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!name.trim() || addMutation.isPending}>
              {addMutation.isPending ? "Salvataggio..." : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
