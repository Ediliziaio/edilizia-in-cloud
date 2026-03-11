import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Loader2, Trash2, Shield, Copy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DEFAULT_PERMISSIONS, ALL_PERMISSION_SECTIONS } from "@/components/users/permissionsDefaults";
import type { StaffPermissions } from "@/components/users/PermissionsDialog";

interface Template {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  is_system_default: boolean;
  company_id: string | null;
  created_at: string;
}

export function PermissionTemplatesManager() {
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState<Template | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({ ...DEFAULT_PERMISSIONS });

  const { data: templates, isLoading } = useQuery({
    queryKey: queryKeys.users.permissionTemplates(effectiveCompany?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permission_templates")
        .select("*")
        .or(`company_id.is.null,company_id.eq.${effectiveCompany!.id}`)
        .order("is_system_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as unknown as Template[];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Fetch company users for "Apply to User" dialog
  const { data: companyUsers = [] } = useQuery({
    queryKey: ["company-users-list", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", effectiveCompany!.id)
        .order("first_name");
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id && applyDialogOpen,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingTemplate) {
        const { error } = await supabase
          .from("permission_templates")
          .update({ name, description, permissions: permissions as any, updated_at: new Date().toISOString() })
          .eq("id", editingTemplate.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("permission_templates")
          .insert([{
            name,
            description,
            permissions: permissions as any,
            company_id: effectiveCompany?.id,
            created_by: user?.id,
            is_system_default: false,
          }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permission-templates"] });
      toast({ title: editingTemplate ? "Template aggiornato" : "Template creato" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Errore", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("permission_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permission-templates"] });
      toast({ title: "Template eliminato" });
    },
    onError: () => {
      toast({ title: "Errore", variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!applyingTemplate || !selectedUserId) return;
      const { data, error } = await supabase.functions.invoke("manage-permission-template", {
        body: {
          action: "apply",
          template_id: applyingTemplate.id,
          user_id: selectedUserId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast({ title: "Template applicato", description: `Permessi aggiornati per l'utente selezionato.` });
      setApplyDialogOpen(false);
      setApplyingTemplate(null);
      setSelectedUserId("");
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message || "Impossibile applicare il template.", variant: "destructive" });
    },
  });

  const openCreate = () => {
    setEditingTemplate(null);
    setName("");
    setDescription("");
    setPermissions({ ...DEFAULT_PERMISSIONS });
    setDialogOpen(true);
  };

  const openEdit = (template: Template) => {
    if (template.is_system_default) return;
    setEditingTemplate(template);
    setName(template.name);
    setDescription(template.description || "");
    setPermissions({ ...DEFAULT_PERMISSIONS, ...template.permissions });
    setDialogOpen(true);
  };

  const duplicateTemplate = (template: Template) => {
    setEditingTemplate(null);
    setName(`${template.name} (copia)`);
    setDescription(template.description || "");
    setPermissions({ ...DEFAULT_PERMISSIONS, ...template.permissions });
    setDialogOpen(true);
  };

  const openApply = (template: Template) => {
    setApplyingTemplate(template);
    setSelectedUserId("");
    setApplyDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingTemplate(null);
  };

  const togglePermission = (key: string) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const enabledCount = (perms: Record<string, boolean>) =>
    Object.values(perms).filter(Boolean).length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" /> Template Permessi
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Crea e gestisci template riutilizzabili per assegnare rapidamente i permessi.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo Template
        </Button>
      </div>

      <div className="grid gap-3">
        {templates?.map((template) => (
          <Card key={template.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-full p-2 bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{template.name}</p>
                    {template.is_system_default && (
                      <Badge variant="secondary" className="text-xs">Sistema</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {template.description || `${enabledCount(template.permissions)} permessi attivi`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => openApply(template)} title="Applica a utente">
                  <UserPlus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => duplicateTemplate(template)}>
                  <Copy className="h-4 w-4" />
                </Button>
                {!template.is_system_default && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(template)}>
                      Modifica
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare "{template.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(template.id)}>Elimina</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Modifica Template" : "Nuovo Template"}</DialogTitle>
            <DialogDescription>Configura nome e permessi del template.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome template" />
            </div>
            <div>
              <Label>Descrizione</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrizione opzionale" rows={2} />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Permessi</Label>
              {ALL_PERMISSION_SECTIONS?.map((section) => (
                <div key={section.viewKey} className="flex items-center justify-between py-1">
                  <span className="text-sm">{section.label}</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={permissions[section.viewKey] || false}
                        onCheckedChange={() => togglePermission(section.viewKey)}
                      />
                      Visualizza
                    </label>
                    {section.editKey && (
                      <label className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={permissions[section.editKey] || false}
                          onCheckedChange={() => togglePermission(section.editKey!)}
                        />
                        Modifica
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Annulla</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingTemplate ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Template to User Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Applica Template a Utente</DialogTitle>
            <DialogDescription>
              Seleziona l'utente a cui applicare il template "{applyingTemplate?.name}".
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label>Utente</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue placeholder="Seleziona un utente..." />
              </SelectTrigger>
              <SelectContent>
                {companyUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.first_name} {u.last_name} — {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={!selectedUserId || applyMutation.isPending}
            >
              {applyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Applica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
