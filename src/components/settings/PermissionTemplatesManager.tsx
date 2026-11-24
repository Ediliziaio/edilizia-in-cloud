import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
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
import {
  DEFAULT_PERMISSIONS, ALL_PERMISSION_SECTIONS, isBlockedBySolaLettura, SOLA_LETTURA_BLOCKED_NOTE, commutaPermesso,
} from "@/components/users/permissionsDefaults";
import { SolaLetturaToggle } from "@/components/users/SolaLetturaToggle";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { messaggioErrorePersone } from "@/lib/users/erroriPersone";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Template {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  is_system_default: boolean;
  company_id: string | null;
  created_at: string;
}

// I modelli contengono permessi booleani, non i metadati della riga utente.
const DEFAULT_TEMPLATE_PERMISSIONS: Record<string, boolean> = Object.fromEntries(
  Object.entries(DEFAULT_PERMISSIONS).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
);

export function PermissionTemplatesManager() {
  const t = useT();
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
  const [permissions, setPermissions] = useState<Record<string, boolean>>({ ...DEFAULT_TEMPLATE_PERMISSIONS });

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
    queryKey: queryKeys.users.companyUsersList(effectiveCompany?.id),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.users.permissionTemplatesAll });
      toast({ title: editingTemplate ? t("Modello aggiornato") : t("Modello creato") });
      closeDialog();
    },
    onError: (err) => {
      toast({
        title: t("Non sono riuscito a salvare il modello"),
        description: messaggioErrorePersone(err, t("Riprova tra qualche istante.")),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("permission_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.permissionTemplatesAll });
      toast({ title: t("Modello eliminato") });
    },
    onError: (err) => {
      toast({
        title: t("Non sono riuscito a eliminare il modello"),
        description: messaggioErrorePersone(err, t("Riprova tra qualche istante.")),
        variant: "destructive",
      });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!applyingTemplate || !selectedUserId) return;
      const { data, error } = await supabase.functions.invoke("manage-permission-template", {
        body: {
          action: "apply",
          template_id: applyingTemplate.id,
          // La funzione legge target_user_id: con user_id rispondeva sempre 400.
          target_user_id: selectedUserId,
        },
      });
      // Il motivo vero sta nel corpo della risposta, non in error.message.
      if (error) throw new Error(await edgeErrorMessage(error, ""));
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.companyUsers });
      toast({ title: t("Modello applicato"), description: t("I permessi della persona sono stati aggiornati.") });
      setApplyDialogOpen(false);
      setApplyingTemplate(null);
      setSelectedUserId("");
    },
    onError: (err: unknown) => {
      toast({
        title: t("Non sono riuscito ad applicare il modello"),
        description: messaggioErrorePersone(err, t("Riprova tra qualche istante.")),
        variant: "destructive",
      });
    },
  });

  const openCreate = () => {
    setEditingTemplate(null);
    setName("");
    setDescription("");
    setPermissions({ ...DEFAULT_TEMPLATE_PERMISSIONS });
    setDialogOpen(true);
  };

  const openEdit = (template: Template) => {
    if (template.is_system_default) return;
    setEditingTemplate(template);
    setName(template.name);
    setDescription(template.description || "");
    setPermissions({ ...DEFAULT_TEMPLATE_PERMISSIONS, ...template.permissions });
    setDialogOpen(true);
  };

  const duplicateTemplate = (template: Template) => {
    setEditingTemplate(null);
    setName(`${template.name} (copia)`);
    setDescription(template.description || "");
    setPermissions({ ...DEFAULT_TEMPLATE_PERMISSIONS, ...template.permissions });
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
    setPermissions((prev) => commutaPermesso(prev, key));
  };

  // Il template salva i flag; la modifica operativa la ricalcola il trigger
  // quando il template viene applicato. Qui basta non lasciare accese le
  // azioni che la sola lettura spegnerebbe comunque.
  const bloccato = (key: (typeof ALL_PERMISSION_SECTIONS)[number]["viewKey"]) =>
    !!permissions.sola_lettura && isBlockedBySolaLettura(key);

  const toggleSolaLettura = (checked: boolean) => {
    setPermissions((prev) => {
      const next: Record<string, boolean> = { ...prev, sola_lettura: checked };
      if (checked) {
        Object.keys(next).forEach((k) => {
          if (isBlockedBySolaLettura(k as (typeof ALL_PERMISSION_SECTIONS)[number]["viewKey"])) next[k] = false;
        });
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div role="status" className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{t("Caricamento dei modelli…")}</span>
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
            <Shield className="h-5 w-5" aria-hidden="true" /> {t("Modelli di permessi")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Un modello è un gruppo di permessi già pronto: lo applichi a una persona dal pulsante «Applica a una persona».")}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" /> {t("Nuovo modello")}
        </Button>
      </div>

      {templates && templates.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("Nessun modello ancora. Con «Nuovo modello» ne crei uno, per esempio per i venditori nuovi.")}
        </p>
      )}

      <div className="grid gap-3">
        {templates?.map((template) => (
          <Card key={template.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-full p-2 bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{template.name}</p>
                    {template.is_system_default && (
                      <Badge variant="secondary" className="text-xs">{t("Sistema")}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {template.description || t("{permissions} permessi attivi", { permissions: String(enabledCount(template.permissions) ?? "") })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => openApply(template)}
                  aria-label={t("Applica il modello «{name}» a una persona", { name: String(template.name ?? "") })}>
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  <span className="ml-1.5 max-sm:sr-only">{t("Applica a una persona")}</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => duplicateTemplate(template)}
                  aria-label={t("Duplica il modello «{name}»", { name: String(template.name ?? "") })}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  <span className="ml-1.5 max-sm:sr-only">{t("Duplica")}</span>
                </Button>
                {!template.is_system_default && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(template)}
                      aria-label={t("Modifica il modello «{name}»", { name: String(template.name ?? "") })}>
                      {t("Modifica")}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" aria-label={t("Elimina il modello «{name}»", { name: String(template.name ?? "") })}>
                          <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("Eliminare il modello «{name}»?", { name: String(template.name ?? "") })}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("Le persone a cui l'hai già applicato tengono i permessi che hanno. Il modello non si recupera.")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(template.id)}>{t("Elimina")}</AlertDialogAction>
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
            <DialogTitle>{editingTemplate ? t("Modifica il modello") : t("Nuovo modello")}</DialogTitle>
            <DialogDescription>{t("Scegli un nome e i permessi che il modello darà.")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="modello-nome">{t("Nome")}</Label>
              <Input id="modello-nome" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Per esempio: Venditore nuovo")} />
            </div>
            <div>
              <Label htmlFor="modello-descrizione">{t("Descrizione")}</Label>
              <Textarea id="modello-descrizione" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Facoltativa")} rows={2} />
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-semibold">{t("Permessi")}</p>
              <SolaLetturaToggle
                id="template-sola_lettura"
                checked={permissions.sola_lettura || false}
                onCheckedChange={toggleSolaLettura}
              />
              {ALL_PERMISSION_SECTIONS?.map((section) => (
                <div key={section.viewKey} className="flex items-center justify-between py-1">
                  <span className="text-sm">
                    {t(section.label)}
                    {(bloccato(section.viewKey) || (section.editKey && bloccato(section.editKey))) && (
                      <span className="block text-[11px] text-amber-600">{t(SOLA_LETTURA_BLOCKED_NOTE)}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox
                        checked={permissions[section.viewKey] || false}
                        disabled={bloccato(section.viewKey)}
                        onCheckedChange={() => togglePermission(section.viewKey)}
                        aria-label={section.viewKey.startsWith("can_view_") ? t("{label}: vedere", { label: t(section.label) }) : t("{label}: consentire", { label: t(section.label) })}
                      />
                      {section.viewKey.startsWith("can_view_") ? t("Visualizza") : t("Consenti")}
                    </label>
                    {section.editKey && (
                      <label className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={permissions[section.editKey] || false}
                          disabled={bloccato(section.editKey) || !permissions[section.viewKey]}
                          onCheckedChange={() => togglePermission(section.editKey!)}
                          aria-label={t("{label}: modificare", { label: t(section.label) })}
                        />
                        {t("Modifica")}
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>{t("Annulla")}</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
              {editingTemplate ? t("Salva") : t("Crea il modello")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Template to User Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Applica il modello a una persona")}</DialogTitle>
            <DialogDescription>{t("Scegli la persona a cui dare i permessi del modello «{name}». I suoi permessi attuali vengono sostituiti con quelli del modello.", { name: String(applyingTemplate?.name ?? "") })}</DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="modello-persona">{t("Persona")}</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger id="modello-persona" className="w-full mt-1">
                <SelectValue placeholder={t("Scegli una persona…")} />
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
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>{t("Annulla")}</Button>
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={!selectedUserId || applyMutation.isPending}
            >
              {applyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
              {t("Applica il modello")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
