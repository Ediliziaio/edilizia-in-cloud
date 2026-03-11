import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCheck, Plus, Pencil, Trash2, Loader2, Percent, DollarSign, Receipt, UserPlus, Check, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { formatCurrency } from "@/lib/formatters";
import { StaffPermissions } from "@/components/users/PermissionsDialog";
import { ALL_PERMISSION_SECTIONS, type PermissionSectionDef } from "@/components/users/permissionsDefaults";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SalespersonDialog } from "@/components/salespeople/SalespersonDialog";

export interface Salesperson {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  commission_type: "fixed" | "percentage_sold" | "percentage_collected";
  commission_value: number;
  is_active: boolean;
  user_id: string | null;
}

const COMMISSION_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  fixed: { label: "Fisso", icon: <DollarSign className="h-3 w-3" /> },
  percentage_sold: { label: "% sul venduto", icon: <Percent className="h-3 w-3" /> },
  percentage_collected: { label: "% sull'incassato", icon: <Receipt className="h-3 w-3" /> },
};

import { DEFAULT_PERMISSIONS } from "@/components/users/permissionsDefaults";

const MARKETING_SECTION_KEYS = [
  "can_view_marketing_dashboard", "can_view_marketing_contacts", "can_view_marketing_opportunities",
  "can_view_marketing_activities", "can_view_marketing_appointments", "can_view_marketing_automations",
  "can_view_marketing_ai_agent", "can_view_marketing_email", "can_view_marketing_whatsapp", "can_view_marketing_reports",
];
const INTERNAL_SECTIONS = ALL_PERMISSION_SECTIONS.filter(s => !MARKETING_SECTION_KEYS.includes(s.viewKey as string));
const MARKETING_SECTIONS = ALL_PERMISSION_SECTIONS.filter(s => MARKETING_SECTION_KEYS.includes(s.viewKey as string));

export function SalespeopleConfig() {
  const { effectiveCompany } = useAuth();
  
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSalesperson, setEditingSalesperson] = useState<Salesperson | null>(null);
  
  const [createAccountDialog, setCreateAccountDialog] = useState<{ open: boolean; salesperson: Salesperson | null }>({
    open: false, salesperson: null,
  });
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPermissions, setAccountPermissions] = useState<StaffPermissions>({ ...DEFAULT_PERMISSIONS });
  const [passwordDialog, setPasswordDialog] = useState<{ open: boolean; password: string; name: string }>({
    open: false, password: "", name: "",
  });

  const { data: salespeople = [], isLoading } = useQuery({
    queryKey: queryKeys.salespeople.active(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople").select("*").eq("company_id", companyId!)
        .order("last_name", { ascending: true });
      if (error) throw error;
      return data as Salesperson[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<Salesperson> & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase.from("salespeople").update({
          first_name: data.first_name, last_name: data.last_name, email: data.email,
          phone: data.phone, commission_type: data.commission_type,
          commission_value: data.commission_value, is_active: data.is_active,
        }).eq("id", data.id).eq("company_id", companyId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("salespeople").insert({
          company_id: companyId!, first_name: data.first_name!, last_name: data.last_name!,
          email: data.email, phone: data.phone,
          commission_type: data.commission_type || "percentage_sold",
          commission_value: data.commission_value || 0, is_active: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salespeople.all });
      toast.success(editingSalesperson ? "Venditore aggiornato" : "Venditore creato");
      setDialogOpen(false); setEditingSalesperson(null);
    },
    onError: () => {
      toast.error("Impossibile salvare il venditore.");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("salespeople").update({ is_active }).eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["salespeople"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("salespeople").delete().eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salespeople"] });
      toast.success("Venditore eliminato");
    },
    onError: (error: Error) => {
      toast.error(error.message?.includes("order_salespeople")
        ? "Impossibile eliminare: il venditore ha ordini associati." : "Impossibile eliminare il venditore.");
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: async ({ salesperson_id, email, password, phone, permissions }: {
      salesperson_id: string; email: string; password?: string; phone?: string; permissions?: StaffPermissions;
    }) => {
      const response = await supabase.functions.invoke("create-salesperson-user", {
        body: { salesperson_id, email, password: password || undefined, phone: phone || undefined, permissions },
      });
      if (response.error) throw new Error(response.error.message || "Errore nella creazione account");
      if (!response.data?.success) throw new Error(response.data?.error || "Errore sconosciuto");
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salespeople.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.staffUsers.all });
      const sp = createAccountDialog.salesperson;
      setCreateAccountDialog({ open: false, salesperson: null });
      resetAccountForm();
      
      if (data.temp_password) {
        setPasswordDialog({ open: true, password: data.temp_password, name: sp ? `${sp.first_name} ${sp.last_name}` : "" });
      } else {
        toast.success(data.message || "Account creato");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetAccountForm = () => {
    setAccountEmail(""); setAccountPhone(""); setAccountPassword("");
    setAccountPermissions({ ...DEFAULT_PERMISSIONS });
  };

  const handleEdit = (salesperson: Salesperson) => { setEditingSalesperson(salesperson); setDialogOpen(true); };
  const handleCreate = () => { setEditingSalesperson(null); setDialogOpen(true); };

  const handleOpenCreateAccount = (salesperson: Salesperson) => {
    setAccountEmail(salesperson.email || "");
    setAccountPhone(salesperson.phone || "");
    setAccountPassword("");
    setAccountPermissions({ ...DEFAULT_PERMISSIONS });
    setCreateAccountDialog({ open: true, salesperson });
  };

  const handleCreateAccount = () => {
    if (!createAccountDialog.salesperson || !accountEmail) return;
    createAccountMutation.mutate({
      salesperson_id: createAccountDialog.salesperson.id,
      email: accountEmail,
      password: accountPassword || undefined,
      phone: accountPhone || undefined,
      permissions: accountPermissions,
    });
  };

  const handleTogglePermission = (key: keyof StaffPermissions, value: boolean) => {
    setAccountPermissions((prev) => {
      const updated = { ...prev, [key]: value };
      const section = ALL_PERMISSION_SECTIONS.find((s) => s.viewKey === key);
      if (section?.editKey && !value) updated[section.editKey] = false;
      return updated;
    });
  };

  const handleSelectAllPerms = () => {
    setAccountPermissions((prev) => ({
      ...DEFAULT_PERMISSIONS,
      can_view_dashboard: true, can_view_orders: true, can_edit_orders: true,
      can_view_warehouse: true, can_edit_warehouse: true, can_view_calendar: true,
      can_view_customers: true, can_edit_customers: true, can_view_employees: true,
      can_view_tickets: true, can_edit_tickets: true, can_view_forecast: true,
      can_view_settings: true, can_view_marketing: true, can_edit_marketing: true,
      only_assigned: prev.only_assigned,
    }));
  };

  const handleDeselectAllPerms = () => {
    setAccountPermissions((prev) => ({ ...DEFAULT_PERMISSIONS, only_assigned: prev.only_assigned }));
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(passwordDialog.password);
    toast.success("Password copiata negli appunti");
  };

  const formatCommissionValue = (type: string, value: number) => {
    return type === "fixed" ? formatCurrency(value) : `${value}%`;
  };

  const renderPermSection = (section: typeof ALL_PERMISSION_SECTIONS[0]) => (
    <div key={section.viewKey} className="space-y-1.5">
      <div className="flex items-center space-x-2">
        <Checkbox id={`sp-${section.viewKey}`} checked={accountPermissions[section.viewKey] as boolean}
          onCheckedChange={(checked) => handleTogglePermission(section.viewKey, checked as boolean)} />
        <Label htmlFor={`sp-${section.viewKey}`} className="font-medium text-sm">{section.label}</Label>
      </div>
      {section.editKey && accountPermissions[section.viewKey] && (
        <div className="ml-6 flex items-center space-x-2">
          <Checkbox id={`sp-${section.editKey}`} checked={accountPermissions[section.editKey] as boolean}
            onCheckedChange={(checked) => handleTogglePermission(section.editKey!, checked as boolean)} />
          <Label htmlFor={`sp-${section.editKey}`} className="text-xs text-muted-foreground">Può modificare</Label>
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5" />Venditori</CardTitle>
            <CardDescription>Gestisci i venditori e le loro provvigioni</CardDescription>
          </div>
          <Button onClick={handleCreate} size="sm"><Plus className="h-4 w-4 mr-2" />Nuovo Venditore</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : salespeople.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground border rounded-lg">
            <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nessun venditore configurato.</p>
            <p className="text-sm">Aggiungi i tuoi venditori per tracciare le provvigioni.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead><TableHead>Contatto</TableHead>
                <TableHead>Tipo Provvigione</TableHead><TableHead>Valore</TableHead>
                <TableHead>Attivo</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salespeople.map((sp) => (
                <TableRow key={sp.id} className={!sp.is_active ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{sp.first_name} {sp.last_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="text-sm">
                      {sp.email && <div>{sp.email}</div>}
                      {sp.phone && <div>{sp.phone}</div>}
                      {!sp.email && !sp.phone && "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      {COMMISSION_TYPE_LABELS[sp.commission_type]?.icon}
                      {COMMISSION_TYPE_LABELS[sp.commission_type]?.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{formatCommissionValue(sp.commission_type, sp.commission_value)}</TableCell>
                  <TableCell>
                    <Switch checked={sp.is_active} onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: sp.id, is_active: checked })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {!sp.user_id && (
                        <Button variant="ghost" size="icon" onClick={() => handleOpenCreateAccount(sp)} disabled={createAccountMutation.isPending} title="Crea Account">
                          <UserPlus className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(sp)} title="Modifica"><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Elimina"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare il venditore?</AlertDialogTitle>
                            <AlertDialogDescription>Il venditore {sp.first_name} {sp.last_name} verrà eliminato. Questa azione è irreversibile.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(sp.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Elimina</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <SalespersonDialog open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingSalesperson(null); }}
        salesperson={editingSalesperson} onSave={(data) => saveMutation.mutate(data)} isLoading={saveMutation.isPending} />

      {/* Create Account Dialog - Extended */}
      <Dialog open={createAccountDialog.open} onOpenChange={(open) => {
        if (!open) { setCreateAccountDialog({ open: false, salesperson: null }); resetAccountForm(); }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crea Account Venditore</DialogTitle>
            <DialogDescription>
              Verrà creato un account per {createAccountDialog.salesperson?.first_name} {createAccountDialog.salesperson?.last_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sp-email">Email *</Label>
              <Input id="sp-email" type="email" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} placeholder="email@esempio.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-phone">Cellulare</Label>
              <Input id="sp-phone" type="tel" value={accountPhone} onChange={(e) => setAccountPhone(e.target.value)} placeholder="+39 333 1234567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-password">Password</Label>
              <Input id="sp-password" type="text" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} placeholder="Lascia vuoto per generarla automaticamente" />
              <p className="text-xs text-muted-foreground">Se lasci vuoto, verrà generata automaticamente e mostrata dopo la creazione</p>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Permessi</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleSelectAllPerms}>Seleziona tutti</Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleDeselectAllPerms}>Deseleziona tutti</Button>
                </div>
              </div>

              <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gestione Interna</p>
                {INTERNAL_SECTIONS.map(renderPermSection)}
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Marketing e Vendita</p>
                {MARKETING_SECTIONS.map(renderPermSection)}
                <Separator />
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="sp-only_assigned" checked={accountPermissions.only_assigned || false}
                      onCheckedChange={(checked) => setAccountPermissions((prev) => ({ ...prev, only_assigned: checked as boolean }))} />
                    <Label htmlFor="sp-only_assigned" className="font-medium text-sm">Solo elementi assegnati</Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">Se attivo, l'utente vedrà solo ordini, attività e appuntamenti assegnati a lui</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateAccountDialog({ open: false, salesperson: null }); resetAccountForm(); }}>Annulla</Button>
            <Button onClick={handleCreateAccount} disabled={!accountEmail || createAccountMutation.isPending}>
              {createAccountMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creazione...</>) : "Crea Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={passwordDialog.open} onOpenChange={(open) => { if (!open) setPasswordDialog({ open: false, password: "", name: "" }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-primary" />Account Creato!</DialogTitle>
            <DialogDescription>L'account per {passwordDialog.name} è stato creato con successo.</DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertDescription className="space-y-3">
              <p className="font-medium">Password temporanea:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-muted rounded-md font-mono text-lg">{passwordDialog.password}</code>
                <Button variant="outline" size="icon" onClick={copyPassword}><Copy className="h-4 w-4" /></Button>
              </div>
              <p className="text-sm text-muted-foreground">Comunica questa password al venditore. Dovrà cambiarla al primo accesso.</p>
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button onClick={() => setPasswordDialog({ open: false, password: "", name: "" })}>Ho capito</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
