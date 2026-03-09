import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical, ListChecks, Edit } from "lucide-react";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
}

interface Step {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_required: boolean;
  auto_check_key: string | null;
}

export default function AdminOnboardingConfig() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStepTitle, setNewStepTitle] = useState("");
  const [newStepDesc, setNewStepDesc] = useState("");
  const [newStepAutoKey, setNewStepAutoKey] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["onboarding-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_templates" as never)
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Template[];
    },
  });

  const { data: steps = [] } = useQuery({
    queryKey: ["onboarding-steps", selectedTemplate],
    enabled: !!selectedTemplate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_steps" as never)
        .select("*")
        .eq("template_id", selectedTemplate as never)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Step[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("onboarding_templates" as never)
        .insert({
          name: newName,
          description: newDesc || null,
          is_default: templates.length === 0,
          created_by: user!.id,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
      setNewName("");
      setNewDesc("");
      setShowNewTemplate(false);
      toast.success("Template creato");
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("onboarding_templates" as never)
        .delete()
        .eq("id", id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
      if (selectedTemplate) setSelectedTemplate(null);
      toast.success("Template eliminato");
    },
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      // Remove default from all
      await supabase
        .from("onboarding_templates" as never)
        .update({ is_default: false } as never)
        .neq("id", "none" as never);
      // Set this one as default
      const { error } = await supabase
        .from("onboarding_templates" as never)
        .update({ is_default: true } as never)
        .eq("id", id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
      toast.success("Template predefinito aggiornato");
    },
  });

  const addStep = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("onboarding_steps" as never)
        .insert({
          template_id: selectedTemplate,
          title: newStepTitle,
          description: newStepDesc || null,
          sort_order: steps.length,
          auto_check_key: newStepAutoKey || null,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-steps", selectedTemplate] });
      setNewStepTitle("");
      setNewStepDesc("");
      setNewStepAutoKey("");
      toast.success("Step aggiunto");
    },
  });

  const deleteStep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("onboarding_steps" as never)
        .delete()
        .eq("id", id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-steps", selectedTemplate] });
      toast.success("Step eliminato");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customer Success — Onboarding</h1>
          <p className="text-muted-foreground">Configura i template di onboarding per le nuove aziende</p>
        </div>
        <Dialog open={showNewTemplate} onOpenChange={setShowNewTemplate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Nuovo Template</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuovo Template Onboarding</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Nome</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Es: Onboarding Standard" />
              </div>
              <div>
                <Label>Descrizione</Label>
                <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Descrizione opzionale" />
              </div>
              <Button onClick={() => createTemplate.mutate()} disabled={!newName.trim() || createTemplate.isPending} className="w-full">
                Crea Template
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Template list */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <Card
            key={t.id}
            className={`cursor-pointer transition-colors ${selectedTemplate === t.id ? "ring-2 ring-primary" : ""}`}
            onClick={() => setSelectedTemplate(t.id)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  {t.name}
                </CardTitle>
                <div className="flex items-center gap-1">
                  {t.is_default && <Badge variant="default" className="text-xs">Default</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t.description || "Nessuna descrizione"}</p>
              <div className="flex gap-2 mt-3">
                {!t.is_default && (
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setDefault.mutate(t.id); }}>
                    Imposta Default
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteTemplate.mutate(t.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Steps editor */}
      {selectedTemplate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Steps del Template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {steps.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Titolo</TableHead>
                    <TableHead>Descrizione</TableHead>
                    <TableHead>Auto-check</TableHead>
                    <TableHead>Obbligatorio</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {steps.map((step, i) => (
                    <TableRow key={step.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{step.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{step.description || "—"}</TableCell>
                      <TableCell>
                        {step.auto_check_key ? (
                          <Badge variant="outline" className="text-xs">{step.auto_check_key}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Manuale</span>
                        )}
                      </TableCell>
                      <TableCell>{step.is_required ? "Sì" : "No"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteStep.mutate(step.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Add step form */}
            <div className="grid gap-3 md:grid-cols-4 items-end border-t pt-4">
              <div>
                <Label className="text-xs">Titolo *</Label>
                <Input value={newStepTitle} onChange={(e) => setNewStepTitle(e.target.value)} placeholder="Es: Aggiungi primo cliente" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Descrizione</Label>
                <Input value={newStepDesc} onChange={(e) => setNewStepDesc(e.target.value)} placeholder="Opzionale" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Auto-check key</Label>
                <Input value={newStepAutoKey} onChange={(e) => setNewStepAutoKey(e.target.value)} placeholder="Es: has_customers" className="h-9" />
              </div>
              <Button onClick={() => addStep.mutate()} disabled={!newStepTitle.trim() || addStep.isPending} className="h-9">
                <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
